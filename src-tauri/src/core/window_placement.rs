use crate::{core::MeritStorage, models::WindowPlacement};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::time::Duration;
use tauri::{
    AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, Position, Size, WebviewWindow,
};

static CAPTURE_TOKENS: Lazy<Mutex<HashMap<String, u64>>> = Lazy::new(|| Mutex::new(HashMap::new()));

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
    let Ok(size) = window.outer_size() else {
        return;
    };

    let monitor = window.current_monitor().ok().flatten();
    let (display_name, rel_x, rel_y) = match monitor.as_ref() {
        Some(m) => {
            let origin = m.position();
            (
                m.name().cloned(),
                position.x - origin.x,
                position.y - origin.y,
            )
        }
        None => (None, 0, 0),
    };

    let placement = WindowPlacement {
        display_name,
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
    label == "settings" || label == "custom_statistics" || label == "logs"
}

async fn restore_window(window: WebviewWindow, placement: WindowPlacement) {
    let label = window.label().to_string();
    let target_size = should_restore_size(&label)
        .then_some((placement.width, placement.height))
        .filter(|(w, h)| *w > 0 && *h > 0);

    if let Some((width, height)) = target_size {
        let _ = window.set_size(Size::Physical(PhysicalSize { width, height }));
    }

    let (mut x, mut y) = (placement.x, placement.y);
    let clamp_size = target_size.or_else(|| window.outer_size().ok().map(|s| (s.width, s.height)));

    let monitors = window.available_monitors().ok();
    if let Some(monitors) = monitors.as_ref() {
        if let Some(name) = placement.display_name.as_ref() {
            if let Some(monitor) = monitors
                .iter()
                .find(|m| m.name().map(String::as_str) == Some(name.as_str()))
            {
                let origin = monitor.position();
                x = origin.x + placement.rel_x;
                y = origin.y + placement.rel_y;
                let (cx, cy) = clamp_to_monitor(
                    monitor,
                    x,
                    y,
                    clamp_size,
                    Some((placement.width, placement.height)),
                );
                x = cx;
                y = cy;
            }
        }

        if let Some(monitor) = monitor_containing_point(monitors, x, y) {
            let (cx, cy) = clamp_to_monitor(
                monitor,
                x,
                y,
                clamp_size,
                Some((placement.width, placement.height)),
            );
            x = cx;
            y = cy;
        }
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
