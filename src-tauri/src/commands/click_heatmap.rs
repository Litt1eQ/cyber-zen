use crate::core::{self, MeritStorage};
use crate::models::click_heatmap::{CLICK_HEATMAP_BASE_COLS, CLICK_HEATMAP_BASE_ROWS};
use serde::Serialize;
use tauri::{AppHandle, Manager, Monitor};

#[derive(Debug, Clone, Serialize)]
pub struct MonitorInfo {
    pub id: String,
    pub name: Option<String>,
    pub position: (i32, i32),
    pub size: (u32, u32),
    pub scale_factor: f64,
    pub is_primary: bool,
}

fn any_window(app_handle: &AppHandle) -> Option<tauri::WebviewWindow> {
    app_handle
        .get_webview_window("main")
        .or_else(|| app_handle.get_webview_window("settings"))
        .or_else(|| app_handle.get_webview_window("custom_statistics"))
        .or_else(|| app_handle.webview_windows().into_values().next())
}

fn primary_monitor(app_handle: &AppHandle) -> Option<Monitor> {
    let window = any_window(app_handle)?;
    window.primary_monitor().ok().flatten()
}

#[tauri::command]
pub async fn get_display_monitors(app_handle: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let primary = primary_monitor(&app_handle);
    let monitors = core::click_heatmap::available_monitors(&app_handle);

    let primary_id = primary.as_ref().map(core::click_heatmap::monitor_id);

    Ok(monitors
        .iter()
        .map(|m| {
            let id = core::click_heatmap::monitor_id(m);
            let pos = m.position();
            let size = m.size();
            MonitorInfo {
                id: id.clone(),
                name: m.name().cloned(),
                position: (pos.x, pos.y),
                size: (size.width, size.height),
                scale_factor: m.scale_factor(),
                is_primary: primary_id.as_ref().is_some_and(|pid| pid == &id),
            }
        })
        .collect())
}

#[derive(Debug, Clone, Serialize)]
pub struct ClickHeatmapGrid {
    pub monitor_id: String,
    pub cols: u32,
    pub rows: u32,
    pub counts: Vec<u64>,
    pub max: u64,
    pub total_clicks: u64,
}

fn clamp_grid_dim(v: u32, min: u32, max: u32, fallback: u32) -> u32 {
    if v == 0 {
        return fallback;
    }
    v.clamp(min, max)
}

#[tauri::command]
pub async fn get_click_heatmap_grid(
    monitor_id: String,
    cols: u32,
    rows: u32,
    date_key: Option<String>,
) -> Result<ClickHeatmapGrid, String> {
    let cols = clamp_grid_dim(cols, 8, 240, 64) as usize;
    let rows = clamp_grid_dim(rows, 6, 180, 36) as usize;

    let mut out = vec![0u64; cols.saturating_mul(rows)];
    let mut max = 0u64;

    let total_clicks = {
        let storage = MeritStorage::instance();
        let storage = storage.read();
        let display = match date_key.as_deref() {
            Some(key) => storage.click_heatmap_display_for_date(&monitor_id, key),
            None => storage.click_heatmap_display(&monitor_id),
        };
        let total = display.map(|d| d.total_clicks).unwrap_or(0);

        if let Some(display) = display {
            for y in 0..CLICK_HEATMAP_BASE_ROWS {
                for x in 0..CLICK_HEATMAP_BASE_COLS {
                    let idx = y * CLICK_HEATMAP_BASE_COLS + x;
                    let count = display.grid.get(idx).copied().unwrap_or(0) as u64;
                    if count == 0 {
                        continue;
                    }

                    let tx = (x * cols) / CLICK_HEATMAP_BASE_COLS;
                    let ty = (y * rows) / CLICK_HEATMAP_BASE_ROWS;
                    let t_idx = ty * cols + tx;
                    if let Some(slot) = out.get_mut(t_idx) {
                        *slot = slot.saturating_add(count);
                        max = max.max(*slot);
                    }
                }
            }
        }

        total
    };

    Ok(ClickHeatmapGrid {
        monitor_id,
        cols: cols as u32,
        rows: rows as u32,
        counts: out,
        max,
        total_clicks,
    })
}

#[tauri::command]
pub async fn clear_click_heatmap(display_id: Option<String>, date_key: Option<String>) -> Result<(), String> {
    let storage = MeritStorage::instance();
    let mut storage = storage.write();
    storage.clear_click_heatmap(display_id.as_deref(), date_key.as_deref());
    Ok(())
}
