use once_cell::sync::Lazy;
use parking_lot::{Mutex, RwLock};
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use crate::core::click_heatmap::CoordinateSpace;
use crate::core::MeritStorage;

const MP_PER_PX: u64 = 1000;
const FLUSH_INTERVAL: Duration = Duration::from_millis(650);
const MONITOR_REFRESH_INTERVAL: Duration = Duration::from_secs(30);
const MAX_JUMP_PX: f64 = 2400.0;

#[derive(Debug, Clone, Default)]
struct CursorState {
    x: f64,
    y: f64,
    has_position: bool,
    monitor: Option<MonitorSnapshot>,
    monitors_version: u64,
}

#[derive(Debug, Default)]
struct TrackingState {
    cursor: CursorState,
    pending_distance_mp_by_display: HashMap<Arc<str>, u64>,
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
static STATE: Lazy<Mutex<TrackingState>> = Lazy::new(|| Mutex::new(TrackingState::default()));
static MONITORS: Lazy<RwLock<Vec<MonitorSnapshot>>> = Lazy::new(|| RwLock::new(Vec::new()));
static MONITORS_VERSION: AtomicU64 = AtomicU64::new(1);
static APP_HANDLE: Lazy<Mutex<Option<AppHandle>>> = Lazy::new(|| Mutex::new(None));
static UNKNOWN_DISPLAY_ID: Lazy<Arc<str>> = Lazy::new(|| Arc::from("unknown"));

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

    std::thread::spawn(move || {
        let mut last_monitor_refresh = Instant::now()
            .checked_sub(MONITOR_REFRESH_INTERVAL)
            .unwrap_or_else(Instant::now);

        loop {
            let enabled = TRACKING_ENABLED.load(Ordering::SeqCst);
            let sleep_for = if enabled {
                FLUSH_INTERVAL
            } else {
                Duration::from_secs(2)
            };
            std::thread::sleep(sleep_for);

            if !enabled {
                continue;
            }

            if FORCE_MONITOR_REFRESH.swap(false, Ordering::SeqCst)
                || last_monitor_refresh.elapsed() >= MONITOR_REFRESH_INTERVAL
            {
                refresh_monitors(&app_handle);
                last_monitor_refresh = Instant::now();
            }

            let drained = {
                let mut st = STATE.lock();
                std::mem::take(&mut st.pending_distance_mp_by_display)
            };
            if drained.is_empty() {
                continue;
            }

            let (stats, carry) = {
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

                let stats = changed.then(|| storage.get_stats());
                (stats, carry)
            };

            let Some(stats) = stats else {
                // No effective change (e.g. tracking disabled while flushing).
                continue;
            };

            if !carry.is_empty() && TRACKING_ENABLED.load(Ordering::SeqCst) {
                let mut st = STATE.lock();
                for (id, mp) in carry {
                    if mp == 0 {
                        continue;
                    }
                    st.pending_distance_mp_by_display
                        .entry(Arc::clone(&id))
                        .and_modify(|v| *v = v.saturating_add(mp))
                        .or_insert(mp);
                }
            }

            let _ = app_handle.emit("merit-updated", stats);
            crate::core::persistence::request_save();
        }
    });
}

pub fn set_tracking_enabled(enabled: bool) {
    TRACKING_ENABLED.store(enabled, Ordering::SeqCst);
    if !enabled {
        *STATE.lock() = TrackingState::default();
        return;
    }

    FORCE_MONITOR_REFRESH.store(true, Ordering::SeqCst);
    if let Some(app_handle) = APP_HANDLE.lock().clone() {
        refresh_monitors(&app_handle);
    }
}

pub fn record_mouse_move(space: CoordinateSpace, x: f64, y: f64) {
    if !(x.is_finite() && y.is_finite()) {
        return;
    }

    if !TRACKING_ENABLED.load(Ordering::Relaxed) {
        return;
    }

    let monitors_version = MONITORS_VERSION.load(Ordering::Relaxed);
    let mut st = STATE.lock();
    if st.cursor.monitors_version != monitors_version {
        st.cursor.monitor = None;
        st.cursor.monitors_version = monitors_version;
    }

    let mut monitor = st.cursor.monitor.take();
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
                if let Some((px, py)) = m.physical_from_logical(x, y) {
                    (Some(Arc::clone(&m.id)), px, py)
                } else {
                    st.cursor = CursorState::default();
                    st.cursor.monitors_version = monitors_version;
                    return;
                }
            } else {
                monitor = monitor_for_point(CoordinateSpace::Logical, x, y);
                let Some(m) = monitor.as_ref() else {
                    st.cursor = CursorState::default();
                    st.cursor.monitors_version = monitors_version;
                    return;
                };

                let Some((px, py)) = m.physical_from_logical(x, y) else {
                    st.cursor = CursorState::default();
                    st.cursor.monitors_version = monitors_version;
                    return;
                };
                (Some(Arc::clone(&m.id)), px, py)
            }
        }
    };

    if st.cursor.has_position {
        let dx = px - st.cursor.x;
        let dy = py - st.cursor.y;
        if dx.is_finite() && dy.is_finite() {
            if dx.abs() <= MAX_JUMP_PX && dy.abs() <= MAX_JUMP_PX {
                let dist = (dx * dx + dy * dy).sqrt();
                if dist.is_finite() && dist > 0.0 {
                    let mp = (dist * MP_PER_PX as f64).round();
                    if mp.is_finite() && mp > 0.0 {
                        let key = display_id.unwrap_or_else(|| Arc::clone(&UNKNOWN_DISPLAY_ID));
                        st.pending_distance_mp_by_display
                            .entry(key)
                            .and_modify(|v| *v = v.saturating_add(mp as u64))
                            .or_insert(mp as u64);
                    }
                }
            }
        }
    }

    st.cursor.x = px;
    st.cursor.y = py;
    st.cursor.has_position = true;
    st.cursor.monitor = monitor;
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
