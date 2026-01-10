use crate::models::InputSource;
use once_cell::sync::Lazy;
use parking_lot::RwLock;
#[cfg(not(target_os = "macos"))]
use rdev::{listen, Event, EventType};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
#[cfg(target_os = "macos")]
use std::sync::mpsc;
use std::thread;
use tauri::{AppHandle, Emitter};

use crate::core::merit_batcher::enqueue_merit_trigger;
use crate::core::key_codes;
use crate::models::InputOrigin;

static THREAD_STARTED: AtomicBool = AtomicBool::new(false);
static IS_ENABLED: AtomicBool = AtomicBool::new(true);
// Default to true to avoid double counting before the first focus event arrives.
static IGNORE_MOUSE_WHEN_APP_FOCUSED: AtomicBool = AtomicBool::new(true);
static SUPPRESS_MOUSE_UNTIL_MS: AtomicU64 = AtomicU64::new(0);

static LAST_ERROR: Lazy<RwLock<Option<InputListenerError>>> = Lazy::new(|| RwLock::new(None));

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

        #[cfg(target_os = "macos")]
        {
            let (tx, rx) = mpsc::channel::<crate::core::macos_event_tap::RawInputEvent>();
            let worker_handle = app_handle.clone();

            thread::spawn(move || {
                for raw in rx {
                    if !IS_ENABLED.load(Ordering::SeqCst) {
                        continue;
                    }

                    let (source, count, detail_code) = match raw {
                        crate::core::macos_event_tap::RawInputEvent::KeyDown(keycode) => {
                            let code = key_codes::from_macos_virtual_keycode(keycode)
                                .map(|v| v.to_string());
                            (InputSource::Keyboard, 1u64, code)
                        }
                        crate::core::macos_event_tap::RawInputEvent::MouseDown(button) => {
                            if should_suppress_mouse_press() {
                                continue;
                            }
                            if IGNORE_MOUSE_WHEN_APP_FOCUSED.load(Ordering::SeqCst) {
                                continue;
                            }

                            let code = match button {
                                crate::core::macos_event_tap::RawMouseButton::Left => Some("MouseLeft".to_string()),
                                crate::core::macos_event_tap::RawMouseButton::Right => Some("MouseRight".to_string()),
                                crate::core::macos_event_tap::RawMouseButton::Other => None,
                            };

                            (
                                InputSource::MouseSingle,
                                1u64,
                                code,
                            )
                        }
                    };

                    enqueue_merit_trigger(
                        worker_handle.clone(),
                        InputOrigin::Global,
                        source,
                        count,
                        detail_code,
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
            let callback = move |event: Event| {
                if !IS_ENABLED.load(Ordering::SeqCst) {
                    return;
                }

                let (source, count, detail_code) = match event.event_type {
                    EventType::KeyPress(key) => (InputSource::Keyboard, 1u64, key_codes::from_rdev_key(key)),
                    EventType::ButtonPress(button) => {
                        if should_suppress_mouse_press() {
                            return;
                        }
                        if IGNORE_MOUSE_WHEN_APP_FOCUSED.load(Ordering::SeqCst) {
                            return;
                        }

                        let code = match button {
                            rdev::Button::Left => Some("MouseLeft".to_string()),
                            rdev::Button::Right => Some("MouseRight".to_string()),
                            _ => None,
                        };

                        (
                            InputSource::MouseSingle,
                            1u64,
                            code,
                        )
                    }
                    _ => return,
                };

                enqueue_merit_trigger(
                    callback_handle.clone(),
                    InputOrigin::Global,
                    source,
                    count,
                    detail_code,
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

pub fn set_ignore_mouse_when_app_focused(ignore: bool) {
    IGNORE_MOUSE_WHEN_APP_FOCUSED.store(ignore, Ordering::SeqCst);
}

pub fn suppress_mouse_for(ms: u64) {
    let until = now_ms().saturating_add(ms);
    SUPPRESS_MOUSE_UNTIL_MS.store(until, Ordering::SeqCst);
}

pub fn last_error() -> Option<InputListenerError> {
    LAST_ERROR.read().clone()
}
