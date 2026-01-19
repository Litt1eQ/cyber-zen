use crate::core::MeritStorage;
use crate::models::click_heatmap::{CLICK_HEATMAP_BASE_COLS, CLICK_HEATMAP_BASE_LEN, CLICK_HEATMAP_BASE_ROWS};
use serde::Serialize;
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

fn monitor_contains_point_physical(monitor: &Monitor, x: f64, y: f64) -> bool {
    let pos = monitor.position();
    let size = monitor.size();
    if size.width == 0 || size.height == 0 {
        return false;
    }
    let left = pos.x as f64;
    let top = pos.y as f64;
    let right = left + size.width as f64;
    let bottom = top + size.height as f64;
    x >= left && y >= top && x < right && y < bottom
}

fn monitor_contains_point_logical(monitor: &Monitor, x: f64, y: f64) -> bool {
    let sf = monitor.scale_factor();
    if !(sf.is_finite() && sf > 0.0) {
        return false;
    }

    let pos = monitor.position();
    let size = monitor.size();
    if size.width == 0 || size.height == 0 {
        return false;
    }

    let left = (pos.x as f64) / sf;
    let top = (pos.y as f64) / sf;
    let right = left + (size.width as f64) / sf;
    let bottom = top + (size.height as f64) / sf;
    x >= left && y >= top && x < right && y < bottom
}

fn monitor_containing_point<'a>(
    monitors: &'a [Monitor],
    space: CoordinateSpace,
    x: f64,
    y: f64,
) -> Option<&'a Monitor> {
    monitors.iter().find(|m| match space {
        CoordinateSpace::Physical => monitor_contains_point_physical(m, x, y),
        CoordinateSpace::Logical => monitor_contains_point_logical(m, x, y),
    })
}

fn rel_physical_from_point(monitor: &Monitor, space: CoordinateSpace, x: f64, y: f64) -> Option<(f64, f64)> {
    let pos = monitor.position();
    let size = monitor.size();
    if size.width == 0 || size.height == 0 {
        return None;
    }

    match space {
        CoordinateSpace::Physical => Some((x - pos.x as f64, y - pos.y as f64)),
        CoordinateSpace::Logical => {
            let sf = monitor.scale_factor();
            if !(sf.is_finite() && sf > 0.0) {
                return None;
            }
            let pos_x_logical = (pos.x as f64) / sf;
            let pos_y_logical = (pos.y as f64) / sf;
            let rel_x_logical = x - pos_x_logical;
            let rel_y_logical = y - pos_y_logical;
            Some((rel_x_logical * sf, rel_y_logical * sf))
        }
    }
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
        storage.click_heatmap_recording_enabled()
    };

    if !enabled {
        return;
    }

    let cols = CLICK_HEATMAP_BASE_COLS;
    let rows = CLICK_HEATMAP_BASE_ROWS;

    let monitors = available_monitors(app_handle);
    let monitor = monitor_containing_point(&monitors, preferred_space, x, y)
        .or_else(|| monitor_containing_point(&monitors, opposite_space(preferred_space), x, y));
    let Some(monitor) = monitor else {
        return;
    };

    let size = monitor.size();
    if size.width == 0 || size.height == 0 {
        return;
    }

    let rel = rel_physical_from_point(monitor, preferred_space, x, y).or_else(|| {
        rel_physical_from_point(monitor, opposite_space(preferred_space), x, y)
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
    let w = size.width as u64;
    let h = size.height as u64;

    let cell_x = ((rel_x.saturating_mul(cols as u64)) / w) as usize;
    let cell_y = ((rel_y.saturating_mul(rows as u64)) / h) as usize;

    let cx = cell_x.min(cols - 1);
    let cy = cell_y.min(rows - 1);
    let idx = cy.saturating_mul(cols) + cx;
    if idx >= CLICK_HEATMAP_BASE_LEN {
        return;
    }

    let display_id = monitor_id(monitor);
    let storage = MeritStorage::instance();
    let mut storage = storage.write();
    storage.record_click_heatmap_cell(&display_id, idx);
    let _ = app_handle.emit(
        "click-heatmap-updated",
        ClickHeatmapUpdatedPayload { display_id },
    );
}
