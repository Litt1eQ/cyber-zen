use crate::core::{history_db, MeritStorage};
use crate::models::click_heatmap::{CLICK_HEATMAP_BASE_COLS, CLICK_HEATMAP_BASE_LEN, CLICK_HEATMAP_BASE_ROWS};
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use serde::Serialize;
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
    pub display_id: String,
}

#[derive(Debug, Clone)]
struct MonitorSnapshot {
    id: String,
    pos_x: f64,
    pos_y: f64,
    width: f64,
    height: f64,
    scale_factor: f64,
    logical_left: f64,
    logical_top: f64,
    logical_right: f64,
    logical_bottom: f64,
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

fn refresh_monitors(app_handle: &AppHandle) {
    let monitors = available_monitors(app_handle);
    let mut out = Vec::with_capacity(monitors.len());
    for m in &monitors {
        let id = monitor_id(m);
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
        });
    }
    *MONITORS.write() = out;
    LAST_MONITOR_REFRESH_MS.store(now_ms(), Ordering::Relaxed);
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
    let monitors = MONITORS.read();
    let monitor = monitor_containing_point(&monitors, preferred_space, x, y)
        .or_else(|| monitor_containing_point(&monitors, opposite_space(preferred_space), x, y));
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

    let display_id = monitor.id.clone();
    let queued = history_db::record_click_heatmap_cell(&display_id, idx);
    if !queued {
        let storage = MeritStorage::instance();
        let mut storage = storage.write();
        storage.record_click_heatmap_cell(&display_id, idx);
    }
    let _ = app_handle.emit(
        "click-heatmap-updated",
        ClickHeatmapUpdatedPayload { display_id },
    );
}
