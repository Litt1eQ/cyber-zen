use crate::core::{history_db, MeritStorage};
use crate::models::click_heatmap::{CLICK_HEATMAP_BASE_COLS, CLICK_HEATMAP_BASE_LEN, CLICK_HEATMAP_BASE_ROWS};
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use serde::Serialize;
use std::cell::RefCell;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Monitor};
use tauri::Emitter;

#[derive(Debug, Clone, Copy)]
pub enum CoordinateSpace {
    Physical,
    Logical,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClickHeatmapUpdatedPayload {
    pub display_id: Arc<str>,
}

#[derive(Debug, Clone)]
struct MonitorSnapshot {
    id: Arc<str>,
    pos_x: f64,
    pos_y: f64,
    width: f64,
    height: f64,
    scale_factor: f64,
    logical_left: f64,
    logical_top: f64,
    logical_right: f64,
    logical_bottom: f64,
    last_emit_ms: Arc<AtomicU64>,
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

    fn rel_physical_from_point(
        &self,
        space: CoordinateSpace,
        x: f64,
        y: f64,
    ) -> Option<(f64, f64)> {
        if self.width <= 0.0 || self.height <= 0.0 {
            return None;
        }
        match space {
            CoordinateSpace::Physical => Some((x - self.pos_x, y - self.pos_y)),
            CoordinateSpace::Logical => {
                let sf = self.scale_factor;
                if !(sf.is_finite() && sf > 0.0) {
                    return None;
                }
                let rel_x_logical = x - self.logical_left;
                let rel_y_logical = y - self.logical_top;
                Some((rel_x_logical * sf, rel_y_logical * sf))
            }
        }
    }
}

static MONITORS: Lazy<RwLock<Vec<MonitorSnapshot>>> = Lazy::new(|| RwLock::new(Vec::new()));
static LAST_MONITOR_REFRESH_MS: AtomicU64 = AtomicU64::new(0);
static MONITORS_VERSION: AtomicU64 = AtomicU64::new(1);

const EMIT_MIN_INTERVAL_MS: u64 = 120;

thread_local! {
    static LAST_MONITOR: RefCell<(u64, Option<MonitorSnapshot>)> = RefCell::new((0, None));
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn any_window(app_handle: &AppHandle) -> Option<tauri::WebviewWindow> {
    app_handle
        .get_webview_window("main")
        .or_else(|| app_handle.get_webview_window("settings"))
        .or_else(|| app_handle.get_webview_window("custom_statistics"))
        .or_else(|| app_handle.webview_windows().into_values().next())
}

pub fn available_monitors(app_handle: &AppHandle) -> Vec<Monitor> {
    let Some(window) = any_window(app_handle) else {
        return Vec::new();
    };

    window.available_monitors().unwrap_or_default()
}

pub fn monitor_id(monitor: &Monitor) -> String {
    if let Some(name) = monitor.name() {
        let trimmed = name.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    let pos = monitor.position();
    format!("display@{},{}", pos.x, pos.y)
}

fn monitor_containing_point<'a>(
    monitors: &'a [MonitorSnapshot],
    space: CoordinateSpace,
    x: f64,
    y: f64,
) -> Option<&'a MonitorSnapshot> {
    monitors.iter().find(|m| m.contains(space, x, y))
}

fn cached_monitor_for_point(
    monitors_version: u64,
    space: CoordinateSpace,
    x: f64,
    y: f64,
) -> Option<MonitorSnapshot> {
    // Fast path: most clicks happen within the same monitor.
    let hit = LAST_MONITOR.with(|cache| {
        let cache = cache.borrow();
        if cache.0 == monitors_version {
            cache
                .1
                .as_ref()
                .filter(|m| m.contains(space, x, y))
                .cloned()
        } else {
            None
        }
    });
    if hit.is_some() {
        return hit;
    }

    let found = {
        let monitors = MONITORS.read();
        monitor_containing_point(&monitors, space, x, y).cloned()
    };

    if let Some(m) = found.as_ref() {
        LAST_MONITOR.with(|cache| {
            *cache.borrow_mut() = (monitors_version, Some(m.clone()));
        });
    }
    found
}

fn refresh_monitors(app_handle: &AppHandle) {
    let monitors = available_monitors(app_handle);
    let mut out = Vec::with_capacity(monitors.len());
    for m in &monitors {
        let id = Arc::<str>::from(monitor_id(m));
        let pos = m.position();
        let size = m.size();
        if size.width == 0 || size.height == 0 {
            continue;
        }
        let sf = m.scale_factor();
        if !(sf.is_finite() && sf > 0.0) {
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
            id,
            pos_x,
            pos_y,
            width,
            height,
            scale_factor: sf,
            logical_left,
            logical_top,
            logical_right,
            logical_bottom,
            last_emit_ms: Arc::new(AtomicU64::new(0)),
        });
    }
    *MONITORS.write() = out;
    LAST_MONITOR_REFRESH_MS.store(now_ms(), Ordering::Relaxed);
    MONITORS_VERSION.fetch_add(1, Ordering::Relaxed);
}

fn refresh_monitors_if_stale(app_handle: &AppHandle, min_interval: Duration) {
    let last = LAST_MONITOR_REFRESH_MS.load(Ordering::Relaxed);
    if now_ms().saturating_sub(last) < min_interval.as_millis() as u64 && !MONITORS.read().is_empty()
    {
        return;
    }
    refresh_monitors(app_handle);
}

fn opposite_space(space: CoordinateSpace) -> CoordinateSpace {
    match space {
        CoordinateSpace::Physical => CoordinateSpace::Logical,
        CoordinateSpace::Logical => CoordinateSpace::Physical,
    }
}

pub fn record_global_click(app_handle: &AppHandle, preferred_space: CoordinateSpace, x: f64, y: f64) {
    crate::core::perf::time(crate::core::perf::TimerKind::ClickHeatmap, || {
    let enabled = {
        let storage = MeritStorage::instance();
        let storage = storage.read();
        storage.get_settings().enable_mouse_single && storage.click_heatmap_recording_enabled()
    };

    if !enabled {
        return;
    }

    let cols = CLICK_HEATMAP_BASE_COLS;
    let rows = CLICK_HEATMAP_BASE_ROWS;

    refresh_monitors_if_stale(app_handle, Duration::from_secs(2));
    let monitors_version = MONITORS_VERSION.load(Ordering::Relaxed);
    let monitor = cached_monitor_for_point(monitors_version, preferred_space, x, y)
        .or_else(|| cached_monitor_for_point(monitors_version, opposite_space(preferred_space), x, y));
    let Some(monitor) = monitor else {
        return;
    };

    if monitor.width <= 0.0 || monitor.height <= 0.0 {
        return;
    }

    let rel = monitor.rel_physical_from_point(preferred_space, x, y).or_else(|| {
        monitor.rel_physical_from_point(opposite_space(preferred_space), x, y)
    });
    let Some((rel_x, rel_y)) = rel else {
        return;
    };

    if !(rel_x.is_finite() && rel_y.is_finite()) {
        return;
    }

    if rel_x < 0.0 || rel_y < 0.0 {
        return;
    }

    let rel_x = rel_x.floor() as u64;
    let rel_y = rel_y.floor() as u64;
    let w = monitor.width as u64;
    let h = monitor.height as u64;

    let cell_x = ((rel_x.saturating_mul(cols as u64)) / w) as usize;
    let cell_y = ((rel_y.saturating_mul(rows as u64)) / h) as usize;

    let cx = cell_x.min(cols - 1);
    let cy = cell_y.min(rows - 1);
    let idx = cy.saturating_mul(cols) + cx;
    if idx >= CLICK_HEATMAP_BASE_LEN {
        return;
    }

    let display_id = Arc::clone(&monitor.id);
    let queued = history_db::record_click_heatmap_cell(Arc::clone(&display_id), idx);
    if !queued {
        let storage = MeritStorage::instance();
        let mut storage = storage.write();
        storage.record_click_heatmap_cell(display_id.as_ref(), idx);
    }
    crate::core::perf::inc_heatmap_click_recorded();

    let now = now_ms();
    let should_emit = {
        // Per-monitor atomic throttle; avoids a hot-path mutex + hash lookup.
        let atom = monitor.last_emit_ms.as_ref();
        loop {
            let last = atom.load(Ordering::Relaxed);
            if now.saturating_sub(last) < EMIT_MIN_INTERVAL_MS {
                break false;
            }
            if atom
                .compare_exchange(last, now, Ordering::Relaxed, Ordering::Relaxed)
                .is_ok()
            {
                break true;
            }
        }
    };

    if should_emit {
        crate::core::perf::inc_heatmap_emit();
        let payload = ClickHeatmapUpdatedPayload {
            display_id: Arc::clone(&display_id),
        };

        // Target windows that may render the heatmap; avoid unnecessary broadcasts.
        let mut emitted_any = false;
        if let Some(w) = app_handle.get_webview_window("settings") {
            emitted_any = true;
            let _ = w.emit("click-heatmap-updated", payload.clone());
        }
        if let Some(w) = app_handle.get_webview_window("custom_statistics") {
            emitted_any = true;
            let _ = w.emit("click-heatmap-updated", payload.clone());
        }
        if !emitted_any {
            let _ = app_handle.emit("click-heatmap-updated", payload);
        }
    }
    })
}
