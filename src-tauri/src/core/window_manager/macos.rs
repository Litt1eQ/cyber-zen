#![allow(deprecated)]

use tauri::{AppHandle, WebviewWindow};
use tauri_nspanel::{cocoa::appkit::NSWindowCollectionBehavior, panel_delegate, WebviewWindowExt};

const NS_WINDOW_STYLE_MASK_NON_ACTIVATING_PANEL: i32 = 1 << 7;
const NS_RESIZABLE_WINDOW_MASK: i32 = 1 << 3;

pub fn setup_panel(app_handle: &AppHandle, main_window: WebviewWindow) -> Result<(), String> {
    let panel = main_window
        .to_panel()
        .map_err(|e| format!("Failed to convert to panel: {}", e))?;

    panel.set_style_mask(NS_WINDOW_STYLE_MASK_NON_ACTIVATING_PANEL | NS_RESIZABLE_WINDOW_MASK);

    panel.set_collection_behaviour(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary,
    );

    let _ = app_handle.set_dock_visibility(false);

    let capture_window = main_window.clone();
    let delegate = panel_delegate!(CyberZenPanelDelegate {
        window_did_resize,
        window_did_move
    });
    delegate.set_listener(Box::new(move |name: String| match name.as_str() {
        "window_did_resize" | "window_did_move" => {
            crate::core::main_window_bounds::schedule_refresh(capture_window.clone());
            crate::core::window_placement::schedule_capture(capture_window.clone());
        }
        _ => {}
    }));
    panel.set_delegate(delegate);

    Ok(())
}

pub fn show_window(window: &WebviewWindow) -> Result<(), String> {
    window
        .show()
        .map_err(|e| format!("Failed to show window: {}", e))?;
    Ok(())
}

pub fn hide_window(window: &WebviewWindow) -> Result<(), String> {
    window
        .hide()
        .map_err(|e| format!("Failed to hide window: {}", e))?;
    Ok(())
}
