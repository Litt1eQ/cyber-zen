#[cfg(target_os = "macos")]
mod imp {
    use std::process::Command;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightListenEventAccess() -> bool;
        fn CGRequestListenEventAccess() -> bool;
    }

    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOHIDCheckAccess(request: u32) -> u32;
    }

    const IOHID_REQUEST_TYPE_LISTEN_EVENT: u32 = 1;

    pub(super) fn has_input_monitoring_permission() -> bool {
        // `CGPreflightListenEventAccess` is the historical API; `IOHIDCheckAccess` is what
        // `tauri-plugin-macos-permissions` uses and tends to match System Settings behavior.
        unsafe {
            if IOHIDCheckAccess(IOHID_REQUEST_TYPE_LISTEN_EVENT) == 0 {
                return true;
            }
            CGPreflightListenEventAccess()
        }
    }

    pub(super) fn request_input_monitoring_permission() -> bool {
        unsafe { CGRequestListenEventAccess() }
    }

    pub(super) fn open_input_monitoring_settings() -> Result<(), String> {
        // System Settings → Privacy & Security → Input Monitoring
        // Note: macOS might not show a system prompt; this pane is the canonical path.
        let url = "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent";
        let status = Command::new("open")
            .arg(url)
            .status()
            .map_err(|e| format!("failed to run `open`: {e}"))?;

        if status.success() {
            Ok(())
        } else {
            Err(format!("`open` exited with status: {status}"))
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    pub(super) fn has_input_monitoring_permission() -> bool {
        true
    }

    pub(super) fn request_input_monitoring_permission() -> bool {
        true
    }

    pub(super) fn open_input_monitoring_settings() -> Result<(), String> {
        Ok(())
    }
}

pub fn has_input_monitoring_permission() -> bool {
    imp::has_input_monitoring_permission()
}

/// Triggers the system prompt (when available) to grant Input Monitoring access.
/// Returns the OS-level API return value; the user may still need to restart the app.
pub fn request_input_monitoring_permission() -> bool {
    imp::request_input_monitoring_permission()
}

pub fn open_input_monitoring_settings() -> Result<(), String> {
    imp::open_input_monitoring_settings()
}
