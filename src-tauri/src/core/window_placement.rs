use crate::{core::MeritStorage, models::WindowPlacement};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::time::Duration;
use tauri::{
    AppHandle, LogicalSize, LogicalUnit, Manager, Monitor, PhysicalPosition, PhysicalSize,
    PixelUnit, Position, Size, WebviewWindow, WindowSizeConstraints,
};

static CAPTURE_TOKENS: Lazy<Mutex<HashMap<String, u64>>> = Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Clone, Copy)]
struct WindowSizeBounds {
    min_width: u32,
    min_height: u32,
    max_width: Option<u32>,
    max_height: Option<u32>,
}

pub const SETTINGS_WINDOW_MAX_WIDTH: u32 = 1180;

fn window_size_bounds(label: &str) -> Option<WindowSizeBounds> {
    match label {
        "settings" => Some(WindowSizeBounds {
            min_width: 640,
            min_height: 520,
            max_width: Some(SETTINGS_WINDOW_MAX_WIDTH),
            max_height: None,
        }),
        "custom_statistics" => Some(WindowSizeBounds {
            min_width: 720,
            min_height: 560,
            max_width: None,
            max_height: None,
        }),
        "logs" => Some(WindowSizeBounds {
            min_width: 720,
            min_height: 520,
            max_width: None,
            max_height: None,
        }),
        "sprite_studio" => Some(WindowSizeBounds {
            min_width: 860,
            min_height: 640,
            max_width: None,
            max_height: None,
        }),
        _ => None,
    }
}

pub fn window_size_constraints(label: &str) -> Option<WindowSizeConstraints> {
    let bounds = window_size_bounds(label)?;
    Some(WindowSizeConstraints {
        min_width: Some(PixelUnit::new(LogicalUnit::new(bounds.min_width as f64))),
        min_height: Some(PixelUnit::new(LogicalUnit::new(bounds.min_height as f64))),
        max_width: bounds
            .max_width
            .map(|v| PixelUnit::new(LogicalUnit::new(v as f64))),
        max_height: bounds
            .max_height
            .map(|v| PixelUnit::new(LogicalUnit::new(v as f64))),
    })
}

pub fn clamp_window_size(label: &str, width: u32, height: u32) -> (u32, u32) {
    let Some(bounds) = window_size_bounds(label) else {
        return (width, height);
    };

    let width = bounds
        .max_width
        .map_or(width, |max_width| width.min(max_width))
        .max(bounds.min_width);
    let height = bounds
        .max_height
        .map_or(height, |max_height| height.min(max_height))
        .max(bounds.min_height);

    (width, height)
}

fn next_token(label: &str) -> u64 {
    let mut guard = CAPTURE_TOKENS.lock();
    let entry = guard.entry(label.to_string()).or_insert(0);
    *entry = entry.wrapping_add(1);
    *entry
}

fn token_matches(label: &str, token: u64) -> bool {
    CAPTURE_TOKENS
        .lock()
        .get(label)
        .copied()
        .is_some_and(|current| current == token)
}

pub fn schedule_capture(window: WebviewWindow) {
    let label = window.label().to_string();
    let token = next_token(&label);

    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(450)).await;
        if !token_matches(&label, token) {
            return;
        }
        capture_immediately(&window);
    });
}

pub fn capture_immediately(window: &WebviewWindow) {
    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.inner_size() else {
        return;
    };

    let monitor = window.current_monitor().ok().flatten();
    let (display_name, display_width, display_height, display_scale, rel_x, rel_y) =
        match monitor.as_ref() {
            Some(m) => {
                let origin = m.position();
                let size = m.size();
                (
                    m.name().cloned(),
                    size.width,
                    size.height,
                    m.scale_factor(),
                    position.x - origin.x,
                    position.y - origin.y,
                )
            }
            None => (None, 0, 0, 0.0, 0, 0),
        };

    let placement = WindowPlacement {
        display_name,
        display_width,
        display_height,
        display_scale,
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        rel_x,
        rel_y,
    };

    let storage = MeritStorage::instance();
    let mut storage = storage.write();
    storage.update_window_placement(window.label().to_string(), placement);
}

pub fn capture_all_now(app_handle: &AppHandle) {
    let windows = app_handle.webview_windows();
    for window in windows.values() {
        capture_immediately(window);
    }
}

pub fn restore_all(app_handle: &AppHandle) {
    let placements = {
        let storage = MeritStorage::instance();
        let storage = storage.read();
        storage.get_window_placements()
    };

    for (label, placement) in placements {
        let Some(window) = app_handle.get_webview_window(&label) else {
            continue;
        };
        tauri::async_runtime::spawn(async move {
            restore_window(window, placement).await;
        });
    }
}

fn should_restore_size(label: &str) -> bool {
    // The main window size is controlled by app settings (window scale).
    // Resizable windows (like settings) should restore their last user size.
    label == "settings"
        || label == "custom_statistics"
        || label == "logs"
        || label == "sprite_studio"
}

async fn restore_window(window: WebviewWindow, placement: WindowPlacement) {
    apply_placement(&window, &placement);
}

pub fn restore_single(app_handle: &AppHandle, label: &str) {
    let placement = {
        let storage = MeritStorage::instance();
        let storage = storage.read();
        storage.get_window_placements().get(label).cloned()
    };
    let Some(placement) = placement else {
        return;
    };
    let Some(window) = app_handle.get_webview_window(label) else {
        return;
    };

    apply_placement(&window, &placement);
}

pub fn verify_and_restore_if_offscreen(window: &WebviewWindow) {
    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(monitors) = window.available_monitors() else {
        return;
    };

    if monitor_containing_point(&monitors, position.x, position.y).is_some() {
        return;
    }

    let placement = {
        let storage = MeritStorage::instance();
        let storage = storage.read();
        storage.get_window_placements().get(window.label()).cloned()
    };
    let Some(placement) = placement else {
        return;
    };

    apply_placement(window, &placement);
}

fn apply_placement(window: &WebviewWindow, placement: &WindowPlacement) {
    let label = window.label();
    let scale = if placement.display_scale > 0.0 {
        placement.display_scale
    } else {
        window.scale_factor().ok().unwrap_or(1.0)
    };
    let stored_logical_size = physical_to_logical_size(placement.width, placement.height, scale);
    let target_size = should_restore_size(label)
        .then_some(clamp_window_size(
            label,
            stored_logical_size.0,
            stored_logical_size.1,
        ))
        .filter(|(w, h)| *w > 0 && *h > 0);

    if let Some((width, height)) = target_size {
        let _ = window.set_size(Size::Logical(LogicalSize {
            width: width as f64,
            height: height as f64,
        }));
    }

    let monitors = window.available_monitors().ok().unwrap_or_default();
    let clamp_size = window.outer_size().ok().map(|s| (s.width, s.height));

    let (monitor_opt, use_relative) = find_monitor_for_placement(&monitors, placement);
    let (mut x, mut y) = (placement.x, placement.y);

    if let Some(monitor) = monitor_opt {
        if use_relative {
            let origin = monitor.position();
            x = origin.x + placement.rel_x;
            y = origin.y + placement.rel_y;
        }

        let (clamped_x, clamped_y) = clamp_to_monitor(monitor, x, y, clamp_size, target_size);
        x = clamped_x;
        y = clamped_y;
    }

    let _ = window.set_position(Position::Physical(PhysicalPosition { x, y }));
}

fn monitor_containing_point(monitors: &[Monitor], x: i32, y: i32) -> Option<&Monitor> {
    monitors.iter().find(|m| {
        let pos = m.position();
        let size = m.size();
        x >= pos.x && y >= pos.y && x < pos.x + size.width as i32 && y < pos.y + size.height as i32
    })
}

fn clamp_to_monitor(
    monitor: &Monitor,
    x: i32,
    y: i32,
    current_size: Option<(u32, u32)>,
    fallback_size: Option<(u32, u32)>,
) -> (i32, i32) {
    let pos = monitor.position();
    let size = monitor.size();
    let (w, h) = current_size.or(fallback_size).unwrap_or((0, 0));
    let w = w as i32;
    let h = h as i32;

    let min_x = pos.x;
    let min_y = pos.y;
    let max_x = pos.x + size.width as i32 - w;
    let max_y = pos.y + size.height as i32 - h;

    let clamped_x = if max_x < min_x {
        min_x
    } else {
        x.clamp(min_x, max_x)
    };
    let clamped_y = if max_y < min_y {
        min_y
    } else {
        y.clamp(min_y, max_y)
    };

    (clamped_x, clamped_y)
}

fn point_to_rect_distance(px: i32, py: i32, rx: i32, ry: i32, rw: u32, rh: u32) -> f64 {
    let rx2 = rx + rw as i32;
    let ry2 = ry + rh as i32;
    let nearest_x = px.clamp(rx, rx2);
    let nearest_y = py.clamp(ry, ry2);
    let dx = (px - nearest_x) as f64;
    let dy = (py - nearest_y) as f64;
    (dx * dx + dy * dy).sqrt()
}

fn physical_to_logical_size(width: u32, height: u32, scale: f64) -> (u32, u32) {
    let scale = if scale > 0.0 { scale } else { 1.0 };
    let logical = PhysicalSize::new(width, height).to_logical::<u32>(scale);
    (logical.width, logical.height)
}

#[cfg(test)]
fn logical_to_physical_size(width: u32, height: u32, scale: f64) -> (u32, u32) {
    let scale = if scale > 0.0 { scale } else { 1.0 };
    let physical = LogicalSize::new(width, height).to_physical::<u32>(scale);
    (physical.width, physical.height)
}

fn find_monitor_for_placement<'a>(
    monitors: &'a [Monitor],
    placement: &WindowPlacement,
) -> (Option<&'a Monitor>, bool) {
    if monitors.is_empty() {
        return (None, false);
    }

    let has_fingerprint = placement.display_width > 0
        && placement.display_height > 0
        && placement.display_scale > 0.0;

    if has_fingerprint {
        if let Some(name) = placement.display_name.as_deref() {
            if let Some(monitor) = monitors.iter().find(|monitor| {
                monitor.name().map(|value| value.as_str()) == Some(name)
                    && monitor.size().width == placement.display_width
                    && monitor.size().height == placement.display_height
                    && (monitor.scale_factor() - placement.display_scale).abs() < 0.01
            }) {
                return (Some(monitor), true);
            }
        }

        if let Some(monitor) = monitors.iter().find(|monitor| {
            monitor.size().width == placement.display_width
                && monitor.size().height == placement.display_height
                && (monitor.scale_factor() - placement.display_scale).abs() < 0.01
        }) {
            return (Some(monitor), true);
        }
    }

    let nearest = monitors.iter().min_by(|left, right| {
        let left_pos = left.position();
        let left_size = left.size();
        let right_pos = right.position();
        let right_size = right.size();
        let left_distance = point_to_rect_distance(
            placement.x,
            placement.y,
            left_pos.x,
            left_pos.y,
            left_size.width,
            left_size.height,
        );
        let right_distance = point_to_rect_distance(
            placement.x,
            placement.y,
            right_pos.x,
            right_pos.y,
            right_size.width,
            right_size.height,
        );

        left_distance
            .partial_cmp(&right_distance)
            .unwrap_or(Ordering::Equal)
    });

    (nearest, false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn physical_size_converts_to_logical_on_high_dpi_display() {
        let logical = physical_to_logical_size(1520, 1120, 2.0);
        assert_eq!(logical, (760, 560));
    }

    #[test]
    fn logical_size_restores_back_to_same_physical_size_for_scale() {
        let physical = logical_to_physical_size(760, 560, 2.0);
        assert_eq!(physical, (1520, 1120));
    }

    #[test]
    fn distance_inside_rect_is_zero() {
        assert_eq!(point_to_rect_distance(50, 50, 0, 0, 100, 100), 0.0);
    }

    #[test]
    fn distance_left_of_rect() {
        let d = point_to_rect_distance(-10, 50, 0, 0, 100, 100);
        assert!((d - 10.0).abs() < 1e-9, "expected 10.0, got {d}");
    }

    #[test]
    fn distance_above_rect() {
        let d = point_to_rect_distance(50, -20, 0, 0, 100, 100);
        assert!((d - 20.0).abs() < 1e-9, "expected 20.0, got {d}");
    }

    #[test]
    fn distance_corner_345_triangle() {
        let d = point_to_rect_distance(-3, -4, 0, 0, 100, 100);
        assert!((d - 5.0).abs() < 1e-9, "expected 5.0, got {d}");
    }
}
