use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};

static ENABLED: AtomicBool = AtomicBool::new(false);

static IGNORED_CODES: Lazy<std::collections::HashSet<&'static str>> = Lazy::new(|| {
    [
        "ShiftLeft",
        "ShiftRight",
        "ControlLeft",
        "ControlRight",
        "AltLeft",
        "AltRight",
        "MetaLeft",
        "MetaRight",
        "CapsLock",
        "Fn",
    ]
    .into_iter()
    .collect()
});

pub const EVENT_KEY: &str = "keyboard-piano-key";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyboardPianoKeyEvent {
    pub code: String,
}

pub fn apply_settings(settings: &crate::models::Settings) {
    ENABLED.store(settings.keyboard_piano_enabled, Ordering::SeqCst);
}

pub fn is_enabled() -> bool {
    ENABLED.load(Ordering::SeqCst)
}

pub fn emit_key(app_handle: &AppHandle, code: String) {
    if !is_enabled() {
        return;
    }
    if code.is_empty() {
        return;
    }
    if IGNORED_CODES.contains(code.as_str()) {
        return;
    }

    // Avoid broadcasting to all windows to prevent duplicate audio when multiple windows are open.
    let Some(window) = app_handle.get_webview_window("main") else {
        return;
    };

    let _ = window.emit(EVENT_KEY, KeyboardPianoKeyEvent { code });
}

