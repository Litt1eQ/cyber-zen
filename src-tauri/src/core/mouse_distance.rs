use once_cell::sync::{Lazy, OnceCell};
use parking_lot::{Mutex, RwLock};
use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

use crate::core::click_heatmap::CoordinateSpace;
use crate::core::MeritStorage;

const MP_PER_PX: u64 = 1000;
const FLUSH_INTERVAL: Duration = Duration::from_millis(650);
const MONITOR_REFRESH_INTERVAL: Duration = Duration::from_secs(30);
const MAX_JUMP_PX: f64 = 2400.0;
const SEND_INTERVAL_MS: u64 = 90;

#[derive(Debug, Clone, Default)]
struct CursorState {
    x: f64,
    y: f64,
    has_position: bool,
    monitor: Option<MonitorSnapshot>,
    monitors_version: u64,
}

#[derive(Debug, Clone)]
struct MonitorSnapshot {
    pos_x: f64,
    pos_y: f64,
    width: f64,
    height: f64,
    scale_factor: f64,
    logical_left: f64,
    logical_top: f64,
    logical_right: f64,
    logical_bottom: f64,
    id: Arc<str>,
}

impl MonitorSnapshot {
    fn contains(&self, space: CoordinateSpace, x: f64, y: f64) -> bool {
        match space {
            CoordinateSpace::Physical => {
                x >= self.pos_x
                    && y >= self.pos_y
                    && x < self.pos_x + self.width
                    && y < self.pos_y + self.height
            }
            CoordinateSpace::Logical => {
                x >= self.logical_left
                    && y >= self.logical_top
                    && x < self.logical_right
                    && y < self.logical_bottom
            }
        }
    }

    fn physical_from_logical(&self, x: f64, y: f64) -> Option<(f64, f64)> {
        let sf = self.scale_factor;
        if !(sf.is_finite() && sf > 0.0) {
            return None;
        }

        let rel_x_logical = x - self.logical_left;
        let rel_y_logical = y - self.logical_top;
        let phys_x = self.pos_x + rel_x_logical * sf;
        let phys_y = self.pos_y + rel_y_logical * sf;
        Some((phys_x, phys_y))
    }
}

static THREAD_STARTED: AtomicBool = AtomicBool::new(false);
static TRACKING_ENABLED: AtomicBool = AtomicBool::new(true);
static FORCE_MONITOR_REFRESH: AtomicBool = AtomicBool::new(false);
static MONITORS: Lazy<RwLock<Vec<MonitorSnapshot>>> = Lazy::new(|| RwLock::new(Vec::new()));
static MONITORS_VERSION: AtomicU64 = AtomicU64::new(1);
static APP_HANDLE: Lazy<Mutex<Option<AppHandle>>> = Lazy::new(|| Mutex::new(None));
static UNKNOWN_DISPLAY_ID: Lazy<Arc<str>> = Lazy::new(|| Arc::from("unknown"));
static MOVE_TX: OnceCell<mpsc::Sender<MoveDelta>> = OnceCell::new();
static CLEAR_PENDING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone)]
struct MoveDelta {
    display_id: Arc<str>,
    mp: u64,
}

#[derive(Debug, Default)]
struct LocalState {
    cursor: CursorState,
    current_display_id: Option<Arc<str>>,
    current_mp: u64,
    last_send_ms: u64,
    had_tracking_enabled: bool,
}

thread_local! {
    static LOCAL: RefCell<LocalState> = RefCell::new(LocalState::default());
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn init(app_handle: AppHandle) {
    if THREAD_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    *APP_HANDLE.lock() = Some(app_handle.clone());

    let enabled = {
        let storage = MeritStorage::instance();
        let storage = storage.read();
        storage.get_settings().enable_mouse_single
    };
    TRACKING_ENABLED.store(enabled, Ordering::SeqCst);

    refresh_monitors(&app_handle);

    let (tx, rx) = mpsc::channel::<MoveDelta>();
    let _ = MOVE_TX.set(tx);

    std::thread::spawn(move || {
        let mut last_monitor_refresh = Instant::now()
            .checked_sub(MONITOR_REFRESH_INTERVAL)
            .unwrap_or_else(Instant::now);

        let mut pending_distance_mp_by_display: HashMap<Arc<str>, u64> = HashMap::new();
        let mut last_flush = Instant::now()
            .checked_sub(FLUSH_INTERVAL)
            .unwrap_or_else(Instant::now);

        loop {
            let enabled = TRACKING_ENABLED.load(Ordering::SeqCst);
            let timeout = if enabled {
                Duration::from_millis(120)
            } else {
                Duration::from_secs(2)
            };

            match rx.recv_timeout(timeout) {
                Ok(delta) => {
                    if enabled && delta.mp > 0 {
                        pending_distance_mp_by_display
                            .entry(delta.display_id)
                            .and_modify(|v| *v = v.saturating_add(delta.mp))
                            .or_insert(delta.mp);
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => return,
            }

            if CLEAR_PENDING.swap(false, Ordering::SeqCst) || !enabled {
                pending_distance_mp_by_display.clear();
                // Drain any queued deltas while disabled to avoid unbounded growth.
                while rx.try_recv().is_ok() {}
                continue;
            }

            if FORCE_MONITOR_REFRESH.swap(false, Ordering::SeqCst)
                || last_monitor_refresh.elapsed() >= MONITOR_REFRESH_INTERVAL
            {
                refresh_monitors(&app_handle);
                last_monitor_refresh = Instant::now();
            }

            if last_flush.elapsed() < FLUSH_INTERVAL {
                continue;
            }

            let drained = std::mem::take(&mut pending_distance_mp_by_display);
            if drained.is_empty() {
                last_flush = Instant::now();
                continue;
            }

            let (stats, carry) = crate::core::perf::time(
                crate::core::perf::TimerKind::MouseDistanceFlush,
                || {
                    let mut carry: HashMap<Arc<str>, u64> = HashMap::new();
                    let storage = MeritStorage::instance();
                    let mut storage = storage.write();
                    let mut changed = false;

                    for (display_id, mp) in drained {
                        if mp == 0 {
                            continue;
                        }
                        let px = mp / MP_PER_PX;
                        let remainder = mp % MP_PER_PX;
                        if remainder > 0 {
                            carry
                                .entry(Arc::clone(&display_id))
                                .and_modify(|v| *v = v.saturating_add(remainder))
                                .or_insert(remainder);
                        }
                        if px == 0 {
                            continue;
                        }

                        if storage.add_mouse_move_distance_px_for_display_silent(
                            Some(display_id.as_ref()),
                            px,
                        ) {
                            changed = true;
                        }
                    }

                    let stats = changed.then(|| storage.get_stats().lite());
                    (stats, carry)
                },
            );

            let Some(stats) = stats else {
                // No effective change (e.g. tracking disabled while flushing).
                last_flush = Instant::now();
                continue;
            };

            for (id, mp) in carry {
                if mp == 0 {
                    continue;
                }
                pending_distance_mp_by_display
                    .entry(Arc::clone(&id))
                    .and_modify(|v| *v = v.saturating_add(mp))
                    .or_insert(mp);
            }

            if crate::core::main_window_bounds::is_visible() {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.emit("merit-updated", &stats);
                }
            }
            crate::core::ui_emit::emit_to_any_visible_windows(
                &app_handle,
                &["settings", "custom_statistics"],
                "merit-updated",
                &stats,
            );
            crate::core::persistence::request_save();
            last_flush = Instant::now();
        }
    });
}

pub fn set_tracking_enabled(enabled: bool) {
    TRACKING_ENABLED.store(enabled, Ordering::SeqCst);
    if !enabled {
        CLEAR_PENDING.store(true, Ordering::SeqCst);
        return;
    }

    FORCE_MONITOR_REFRESH.store(true, Ordering::SeqCst);
    if let Some(app_handle) = APP_HANDLE.lock().clone() {
        refresh_monitors(&app_handle);
    }
}

pub fn record_mouse_move(space: CoordinateSpace, x: f64, y: f64) {
    crate::core::perf::time(crate::core::perf::TimerKind::MouseDistanceMove, || {
        if !(x.is_finite() && y.is_finite()) {
            return;
        }

        let enabled = TRACKING_ENABLED.load(Ordering::Relaxed);
        let now = now_ms();
        LOCAL.with(|local| {
            let mut local = local.borrow_mut();

            if !enabled {
                if local.had_tracking_enabled {
                    local.cursor = CursorState::default();
                    local.current_display_id = None;
                    local.current_mp = 0;
                    local.last_send_ms = 0;
                    local.had_tracking_enabled = false;
                }
                return;
            }
            local.had_tracking_enabled = true;

            let monitors_version = MONITORS_VERSION.load(Ordering::Relaxed);
            if local.cursor.monitors_version != monitors_version {
                local.cursor.monitor = None;
                local.cursor.monitors_version = monitors_version;
            }

            let mut monitor = local.cursor.monitor.take();
            let (display_id, px, py) = match space {
                CoordinateSpace::Physical => {
                    if let Some(m) = monitor
                        .as_ref()
                        .filter(|m| m.contains(CoordinateSpace::Physical, x, y))
                    {
                        (Some(Arc::clone(&m.id)), x, y)
                    } else {
                        monitor = monitor_for_point(CoordinateSpace::Physical, x, y);
                        monitor
                            .as_ref()
                            .map(|m| (Some(Arc::clone(&m.id)), x, y))
                            .unwrap_or((None, x, y))
                    }
                }
                CoordinateSpace::Logical => {
                    if let Some(m) = monitor
                        .as_ref()
                        .filter(|m| m.contains(CoordinateSpace::Logical, x, y))
                    {
                        let Some((px, py)) = m.physical_from_logical(x, y) else {
                            local.cursor = CursorState::default();
                            local.cursor.monitors_version = monitors_version;
                            return;
                        };
                        (Some(Arc::clone(&m.id)), px, py)
                    } else {
                        monitor = monitor_for_point(CoordinateSpace::Logical, x, y);
                        let Some(m) = monitor.as_ref() else {
                            local.cursor = CursorState::default();
                            local.cursor.monitors_version = monitors_version;
                            return;
                        };
                        let Some((px, py)) = m.physical_from_logical(x, y) else {
                            local.cursor = CursorState::default();
                            local.cursor.monitors_version = monitors_version;
                            return;
                        };
                        (Some(Arc::clone(&m.id)), px, py)
                    }
                }
            };

            let display_id = display_id.unwrap_or_else(|| Arc::clone(&UNKNOWN_DISPLAY_ID));

            if local.cursor.has_position {
                let dx = px - local.cursor.x;
                let dy = py - local.cursor.y;
                if dx.is_finite() && dy.is_finite() && dx.abs() <= MAX_JUMP_PX && dy.abs() <= MAX_JUMP_PX {
                    let dist = (dx * dx + dy * dy).sqrt();
                    if dist.is_finite() && dist > 0.0 {
                        let mp = (dist * MP_PER_PX as f64).round();
                        if mp.is_finite() && mp > 0.0 {
                            let mp_u64 = mp as u64;
                            let cur_id = local.current_display_id.as_ref();
                            if cur_id.is_none()
                                || cur_id.is_some_and(|id| id.as_ref() != display_id.as_ref())
                            {
                                flush_local(&mut local);
                                local.current_display_id = Some(Arc::clone(&display_id));
                            }
                            local.current_mp = local.current_mp.saturating_add(mp_u64);
                        }
                    }
                }
            }

            local.cursor.x = px;
            local.cursor.y = py;
            local.cursor.has_position = true;
            local.cursor.monitor = monitor;

            if local.current_mp > 0 && now.saturating_sub(local.last_send_ms) >= SEND_INTERVAL_MS {
                flush_local(&mut local);
                local.last_send_ms = now;
            }
        });
    })
}

fn monitor_for_point(space: CoordinateSpace, x: f64, y: f64) -> Option<MonitorSnapshot> {
    let monitors = MONITORS.read();
    let monitor = monitors.iter().find(|m| m.contains(space, x, y));
    monitor.cloned()
}

fn refresh_monitors(app_handle: &AppHandle) {
    let monitors = crate::core::click_heatmap::available_monitors(app_handle);
    let mut out = Vec::with_capacity(monitors.len());
    for m in monitors {
        let sf = m.scale_factor();
        if !(sf.is_finite() && sf > 0.0) {
            continue;
        }

        let pos = m.position();
        let size = m.size();
        if size.width == 0 || size.height == 0 {
            continue;
        }

        let pos_x = pos.x as f64;
        let pos_y = pos.y as f64;
        let width = size.width as f64;
        let height = size.height as f64;
        let logical_left = pos_x / sf;
        let logical_top = pos_y / sf;
        let logical_right = logical_left + width / sf;
        let logical_bottom = logical_top + height / sf;

        out.push(MonitorSnapshot {
            pos_x,
            pos_y,
            width,
            height,
            scale_factor: sf,
            logical_left,
            logical_top,
            logical_right,
            logical_bottom,
            id: Arc::from(crate::core::click_heatmap::monitor_id(&m)),
        });
    }

    *MONITORS.write() = out;
    MONITORS_VERSION.fetch_add(1, Ordering::SeqCst);
}

fn flush_local(local: &mut LocalState) {
    let Some(display_id) = local.current_display_id.as_ref() else {
        local.current_mp = 0;
        return;
    };
    let mp = std::mem::take(&mut local.current_mp);
    if mp == 0 {
        return;
    }
    let Some(tx) = MOVE_TX.get() else {
        return;
    };
    let _ = tx.send(MoveDelta {
        display_id: Arc::clone(display_id),
        mp,
    });
}
