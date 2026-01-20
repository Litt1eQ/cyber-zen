use crate::core::notification_env::NotificationEnv;
use tauri::State;

#[tauri::command]
pub async fn open_notification_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        fn try_open(target: &str) -> Result<(), String> {
            let status = Command::new("open")
                .arg(target)
                .status()
                .map_err(|e| format!("Failed to open notification settings: {}", e))?;
            if status.success() {
                Ok(())
            } else {
                Err(format!("Failed to open notification settings: open exited with {}", status))
            }
        }

        // macOS Ventura+ moved System Preferences to System Settings; keep a best-effort fallback
        // for older versions.
        try_open("x-apple.systempreferences:com.apple.Notifications-Settings.extension")
            .or_else(|_| try_open("x-apple.systempreferences:com.apple.preference.notifications"))?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("cmd")
            .args(["/C", "start", "", "ms-settings:notifications"])
            .spawn()
            .map_err(|e| format!("Failed to open notification settings: {}", e))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("Opening notification settings is not supported on this platform.".to_string())
    }
}

#[derive(serde::Serialize)]
pub struct NotificationSendMeta {
    pub target_app_id: String,
    pub is_dev: bool,
    pub in_app_bundle: bool,
}

#[tauri::command]
pub async fn send_system_notification(
    app_handle: tauri::AppHandle,
    env: State<'_, NotificationEnv>,
    title: String,
    body: Option<String>,
) -> Result<NotificationSendMeta, String> {
    let mut n = notify_rust::Notification::new();
    n.summary(&title);
    if let Some(body) = body.as_deref() {
        n.body(body);
    }
    n.show()
        .map_err(|e| format!("Failed to show notification: {}", e))?;

    let _ = crate::core::app_log::append(
        &app_handle,
        crate::core::app_log::AppLogRecord {
            ts_ms: chrono::Utc::now().timestamp_millis(),
            level: "info".to_string(),
            scope: "notifications/native".to_string(),
            message: "sent".to_string(),
            data: Some(serde_json::json!({ "target_app_id": env.app_id, "title": title })),
        },
    );

    Ok(NotificationSendMeta {
        target_app_id: env.app_id.clone(),
        is_dev: env.is_dev,
        in_app_bundle: env.in_app_bundle,
    })
}
