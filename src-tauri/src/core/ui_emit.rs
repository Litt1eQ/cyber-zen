use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub fn emit_to_window_if_visible<T: Serialize>(
    app_handle: &AppHandle,
    label: &str,
    event: &str,
    payload: &T,
) -> bool {
    let Some(window) = app_handle.get_webview_window(label) else {
        return false;
    };

    // Prefer emitting (no suppression) if visibility can't be determined.
    if !window.is_visible().unwrap_or(true) {
        return false;
    }

    let _ = window.emit(event, payload);
    true
}

pub fn emit_to_any_visible_windows<T: Serialize>(
    app_handle: &AppHandle,
    labels: &[&str],
    event: &str,
    payload: &T,
) -> usize {
    let mut emitted = 0;
    for label in labels {
        if emit_to_window_if_visible(app_handle, label, event, payload) {
            emitted += 1;
        }
    }
    emitted
}

