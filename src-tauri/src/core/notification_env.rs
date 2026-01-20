use tauri::AppHandle;

#[derive(Clone)]
pub struct NotificationEnv {
    pub app_id: String,
    pub is_dev: bool,
    pub in_app_bundle: bool,
}

fn is_running_in_macos_app_bundle() -> bool {
    #[cfg(target_os = "macos")]
    {
        let Ok(exe) = std::env::current_exe() else {
            return false;
        };
        let s = exe.to_string_lossy();
        s.contains(".app/Contents/MacOS/")
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

pub fn detect(app: &AppHandle) -> NotificationEnv {
    let is_dev = tauri::is_dev();
    let in_app_bundle = is_running_in_macos_app_bundle();
    let identifier = app.config().identifier.clone();

    #[cfg(target_os = "macos")]
    let app_id = if !in_app_bundle {
        // When not running from an .app bundle (e.g. `tauri dev` or directly executing the binary),
        // macOS cannot correctly attribute notifications to our bundle identifier.
        // Use Terminal for local testing as a best-effort fallback.
        "com.apple.Terminal".to_string()
    } else {
        identifier
    };

    #[cfg(not(target_os = "macos"))]
    let app_id = identifier;

    NotificationEnv {
        app_id,
        is_dev,
        in_app_bundle,
    }
}

pub fn configure_once(_env: &NotificationEnv) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        notify_rust::set_application(&_env.app_id).map_err(|e| {
            format!(
                "Failed to set notification app id ({}): {}",
                _env.app_id, e
            )
        })?;
    }
    Ok(())
}
