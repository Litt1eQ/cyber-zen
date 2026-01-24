use crate::models::InputSource;
use once_cell::sync::Lazy;
#[cfg(not(target_os = "macos"))]
use parking_lot::Mutex;
use parking_lot::RwLock;
#[cfg(not(target_os = "macos"))]
use rdev::{listen, Event, EventType};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
#[cfg(target_os = "macos")]
use std::sync::mpsc;
use std::thread;
use tauri::{AppHandle, Emitter};

use crate::core::key_codes;
use crate::core::keyboard_piano;
use crate::core::click_heatmap;
use crate::core::main_window_bounds;
use crate::core::mouse_distance;
use crate::core::merit_batcher::enqueue_merit_trigger;
use crate::core::MeritStorage;
use crate::models::InputOrigin;
use crate::core::active_app;

static THREAD_STARTED: AtomicBool = AtomicBool::new(false);
static IS_ENABLED: AtomicBool = AtomicBool::new(true);
static SUPPRESS_MOUSE_UNTIL_MS: AtomicU64 = AtomicU64::new(0);

static LAST_ERROR: Lazy<RwLock<Option<InputListenerError>>> = Lazy::new(|| RwLock::new(None));

#[cfg(not(target_os = "macos"))]
#[derive(Debug, Clone, Copy, Default)]
struct ModState {
    shift_left: bool,
    shift_right: bool,
    ctrl_left: bool,
    ctrl_right: bool,
    alt_left: bool,
    alt_right: bool,
    meta_left: bool,
    meta_right: bool,
    caps_lock: bool,
}

#[cfg(not(target_os = "macos"))]
impl ModState {
    fn shift(&self) -> bool {
        self.shift_left || self.shift_right
    }

    fn ctrl(&self) -> bool {
        self.ctrl_left || self.ctrl_right
    }

    fn alt(&self) -> bool {
        self.alt_left || self.alt_right
    }

    fn meta(&self) -> bool {
        self.meta_left || self.meta_right
    }
}

#[cfg(not(target_os = "macos"))]
static MOD_STATE: Lazy<Mutex<ModState>> = Lazy::new(|| Mutex::new(ModState::default()));

#[cfg(not(target_os = "macos"))]
#[derive(Debug, Clone, Copy, Default)]
struct MouseState {
    x: f64,
    y: f64,
    has_position: bool,
}

#[cfg(not(target_os = "macos"))]
static MOUSE_STATE: Lazy<Mutex<MouseState>> = Lazy::new(|| Mutex::new(MouseState::default()));

fn is_letter_code(code: &str) -> bool {
    let bytes = code.as_bytes();
    if bytes.len() != 4 {
        return false;
    }
    if &bytes[0..3] != b"Key" {
        return false;
    }
    bytes[3].is_ascii_uppercase()
}

fn is_modifier_code(code: &str) -> bool {
    matches!(
        code,
        "ShiftLeft"
            | "ShiftRight"
            | "ControlLeft"
            | "ControlRight"
            | "AltLeft"
            | "AltRight"
            | "MetaLeft"
            | "MetaRight"
            | "CapsLock"
    )
}

fn effective_shifted(code: &str, shift_down: bool, caps_lock: bool) -> bool {
    if is_letter_code(code) {
        shift_down ^ caps_lock
    } else {
        shift_down
    }
}

fn shortcut_id(meta: bool, ctrl: bool, alt: bool, shift: bool, code: &str) -> String {
    let mut parts: Vec<&str> = Vec::with_capacity(5);
    if meta {
        parts.push("Meta");
    }
    if ctrl {
        parts.push("Ctrl");
    }
    if alt {
        parts.push("Alt");
    }
    if shift {
        parts.push("Shift");
    }
    parts.push(code);
    parts.join("+")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InputListenerErrorCode {
    PermissionRequired,
    ListenFailed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InputListenerError {
    pub code: InputListenerErrorCode,
    pub message: String,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn should_suppress_mouse_press() -> bool {
    now_ms() < SUPPRESS_MOUSE_UNTIL_MS.load(Ordering::SeqCst)
}

fn should_ignore_global_mouse_click(
    app_handle: &AppHandle,
    space: click_heatmap::CoordinateSpace,
    x: f64,
    y: f64,
) -> bool {
    let settings = {
        let storage = MeritStorage::instance();
        let storage = storage.read();
        storage.get_settings()
    };

    if settings.window_pass_through {
        return false;
    }

    // Avoid calling into window APIs on every click; keep a short refresh interval and fall back
    // to counting if bounds are unavailable.
    main_window_bounds::refresh_if_stale(app_handle, std::time::Duration::from_secs(2));

    main_window_bounds::contains_point(space, x, y)
}

pub fn init_input_listener(app_handle: AppHandle) -> Result<(), String> {
    if THREAD_STARTED.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    thread::spawn(move || {
        #[cfg(target_os = "macos")]
        {
            if !crate::core::macos_permissions::has_input_monitoring_permission() {
                let err = InputListenerError {
                    code: InputListenerErrorCode::PermissionRequired,
                    message: "需要开启 macOS「输入监控」权限：系统设置 → 隐私与安全性 → 输入监控。授权后可在设置页点击“启动”重新初始化。若已授权仍无效，请先移除本应用再重新添加并重启应用。".to_string(),
                };
                *LAST_ERROR.write() = Some(err.clone());
                let _ = app_handle.emit("input-listener-error", err);
                THREAD_STARTED.store(false, Ordering::SeqCst);
                return;
            }
        }

        mouse_distance::init(app_handle.clone());

        #[cfg(target_os = "macos")]
        {
            let (tx, rx) = mpsc::channel::<crate::core::macos_event_tap::RawInputEvent>();
            let worker_handle = app_handle.clone();

            thread::spawn(move || {
                let _self_app = active_app::AppContext::for_self(&worker_handle);
                for raw in rx {
                    if !IS_ENABLED.load(Ordering::SeqCst) {
                        continue;
                    }

                    let (source, count, detail_code) = match raw {
                        crate::core::macos_event_tap::RawInputEvent::KeyDown { keycode, flags } => {
                            let code = key_codes::from_macos_virtual_keycode(keycode)
                                .map(|v| key_codes::normalize_macos_key_code(v).to_string());
                            if let Some(code) = code.clone() {
                                keyboard_piano::emit_key(&worker_handle, code);
                            }
                            let (is_shifted, shortcut) = if let Some(code) = code.as_deref() {
                                const MASK_ALPHA_SHIFT: u64 = 1 << 16;
                                const MASK_SHIFT: u64 = 1 << 17;
                                const MASK_CTRL: u64 = 1 << 18;
                                const MASK_ALT: u64 = 1 << 19;
                                const MASK_META: u64 = 1 << 20;

                                let shift_down = (flags & MASK_SHIFT) != 0;
                                let caps_lock = (flags & MASK_ALPHA_SHIFT) != 0;
                                let is_shifted = effective_shifted(code, shift_down, caps_lock);

                                let ctrl = (flags & MASK_CTRL) != 0;
                                let alt = (flags & MASK_ALT) != 0;
                                let meta = (flags & MASK_META) != 0;
                                let shortcut = if (ctrl || alt || meta) && !is_modifier_code(code) {
                                    Some(shortcut_id(meta, ctrl, alt, shift_down, code))
                                } else {
                                    None
                                };

                                (Some(is_shifted), shortcut)
                            } else {
                                (None, None)
                            };

                            enqueue_merit_trigger(
                                worker_handle.clone(),
                                InputOrigin::Global,
                                InputSource::Keyboard,
                                1u64,
                                code,
                                is_shifted,
                                shortcut,
                                Some(active_app::current_or_unknown()),
                            );
                            continue;
                        }
                        crate::core::macos_event_tap::RawInputEvent::MouseDown { button, x, y } => {
                            // Record click positions even if we suppress counting for merit to avoid
                            // double-counting in-app clicks (App-origin merit uses suppression).
                            click_heatmap::record_global_click(
                                &worker_handle,
                                click_heatmap::CoordinateSpace::Logical,
                                x,
                                y,
                            );

                            if should_suppress_mouse_press() {
                                continue;
                            }
                            if should_ignore_global_mouse_click(
                                &worker_handle,
                                click_heatmap::CoordinateSpace::Logical,
                                x,
                                y,
                            ) {
                                continue;
                            }

                            let code = match button {
                                crate::core::macos_event_tap::RawMouseButton::Left => {
                                    Some("MouseLeft".to_string())
                                }
                                crate::core::macos_event_tap::RawMouseButton::Right => {
                                    Some("MouseRight".to_string())
                                }
                                crate::core::macos_event_tap::RawMouseButton::Other => None,
                            };

                            (InputSource::MouseSingle, 1u64, code)
                        }
                        crate::core::macos_event_tap::RawInputEvent::MouseMove { x, y } => {
                            mouse_distance::record_mouse_move(
                                click_heatmap::CoordinateSpace::Logical,
                                x,
                                y,
                            );
                            continue;
                        }
                    };

                    enqueue_merit_trigger(
                        worker_handle.clone(),
                        InputOrigin::Global,
                        source,
                        count,
                        detail_code,
                        None,
                        None,
                        Some(active_app::current_or_unknown()),
                    );
                }
            });

            if let Err(e) = crate::core::macos_event_tap::run(tx) {
                let err = InputListenerError {
                    code: InputListenerErrorCode::ListenFailed,
                    message: e,
                };
                *LAST_ERROR.write() = Some(err.clone());
                let _ = app_handle.emit("input-listener-error", err);
                THREAD_STARTED.store(false, Ordering::SeqCst);
            }
        }

        #[cfg(not(target_os = "macos"))]
        {
            let callback_handle = app_handle.clone();
            let _self_app = active_app::AppContext::for_self(&callback_handle);
            let callback = move |event: Event| {
                if !IS_ENABLED.load(Ordering::SeqCst) {
                    return;
                }

                let (source, count, detail_code, is_shifted, shortcut) = match event.event_type {
                    EventType::KeyPress(key) => {
                        let raw = format!("{:?}", key);
                        let (snapshot, code) = {
                            let mut state = MOD_STATE.lock();
                            match raw.as_str() {
                                "ShiftLeft" => state.shift_left = true,
                                "ShiftRight" => state.shift_right = true,
                                "ControlLeft" => state.ctrl_left = true,
                                "ControlRight" => state.ctrl_right = true,
                                "Alt" | "AltLeft" => state.alt_left = true,
                                "AltGr" | "AltRight" => state.alt_right = true,
                                "MetaLeft" | "Super" => state.meta_left = true,
                                "MetaRight" => state.meta_right = true,
                                "CapsLock" => state.caps_lock = !state.caps_lock,
                                _ => {}
                            }
                            (*state, key_codes::from_rdev_key(key))
                        };
                        if let Some(code) = code.clone() {
                            keyboard_piano::emit_key(&callback_handle, code);
                        }

                        let (is_shifted, shortcut) = if let Some(code) = code.as_deref() {
                            let shift_down = snapshot.shift();
                            let is_shifted =
                                effective_shifted(code, shift_down, snapshot.caps_lock);
                            let shortcut = if (snapshot.ctrl() || snapshot.alt() || snapshot.meta())
                                && !is_modifier_code(code)
                            {
                                Some(shortcut_id(
                                    snapshot.meta(),
                                    snapshot.ctrl(),
                                    snapshot.alt(),
                                    shift_down,
                                    code,
                                ))
                            } else {
                                None
                            };
                            (Some(is_shifted), shortcut)
                        } else {
                            (None, None)
                        };

                        (InputSource::Keyboard, 1u64, code, is_shifted, shortcut)
                    }
                    EventType::KeyRelease(key) => {
                        let raw = format!("{:?}", key);
                        let mut state = MOD_STATE.lock();
                        match raw.as_str() {
                            "ShiftLeft" => state.shift_left = false,
                            "ShiftRight" => state.shift_right = false,
                            "ControlLeft" => state.ctrl_left = false,
                            "ControlRight" => state.ctrl_right = false,
                            "Alt" | "AltLeft" => state.alt_left = false,
                            "AltGr" | "AltRight" => state.alt_right = false,
                            "MetaLeft" | "Super" => state.meta_left = false,
                            "MetaRight" => state.meta_right = false,
                            _ => {}
                        }
                        return;
                    }
                    EventType::ButtonPress(button) => {
                        let pos = {
                            let st = MOUSE_STATE.lock();
                            st.has_position.then_some((st.x, st.y))
                        };
                        if let Some((x, y)) = pos {
                            click_heatmap::record_global_click(
                                &callback_handle,
                                click_heatmap::CoordinateSpace::Physical,
                                x,
                                y,
                            );
                        }

                        if should_suppress_mouse_press() {
                            return;
                        }
                        if let Some((x, y)) = pos {
                            if should_ignore_global_mouse_click(
                                &callback_handle,
                                click_heatmap::CoordinateSpace::Physical,
                                x,
                                y,
                            ) {
                                return;
                            }
                        }

                        let code = match button {
                            rdev::Button::Left => Some("MouseLeft".to_string()),
                            rdev::Button::Right => Some("MouseRight".to_string()),
                            _ => None,
                        };

                        (InputSource::MouseSingle, 1u64, code, None, None)
                    }
                    EventType::MouseMove { x, y } => {
                        mouse_distance::record_mouse_move(
                            click_heatmap::CoordinateSpace::Physical,
                            x,
                            y,
                        );
                        let mut st = MOUSE_STATE.lock();
                        st.x = x;
                        st.y = y;
                        st.has_position = true;
                        return;
                    }
                    _ => return,
                };

                enqueue_merit_trigger(
                    callback_handle.clone(),
                    InputOrigin::Global,
                    source,
                    count,
                    detail_code,
                    is_shifted,
                    shortcut,
                    Some(active_app::current_or_unknown()),
                );
            };

            if let Err(e) = listen(callback) {
                let err = InputListenerError {
                    code: InputListenerErrorCode::ListenFailed,
                    message: format!("{:?}", e),
                };
                *LAST_ERROR.write() = Some(err.clone());
                let _ = app_handle.emit("input-listener-error", err);
                THREAD_STARTED.store(false, Ordering::SeqCst);
            }
        }
    });

    Ok(())
}

pub fn set_listening_enabled(enabled: bool) {
    IS_ENABLED.store(enabled, Ordering::SeqCst);
    if enabled {
        *LAST_ERROR.write() = None;
    }
}

pub fn is_listening_enabled() -> bool {
    IS_ENABLED.load(Ordering::SeqCst)
}

pub fn suppress_mouse_for(ms: u64) {
    let until = now_ms().saturating_add(ms);
    SUPPRESS_MOUSE_UNTIL_MS.store(until, Ordering::SeqCst);
}

pub fn last_error() -> Option<InputListenerError> {
    LAST_ERROR.read().clone()
}
