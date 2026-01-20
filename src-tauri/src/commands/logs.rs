use crate::core::app_log::{self, AppLogRecord};
use serde_json::Value;
use std::process::Command;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn append_log(
    app_handle: AppHandle,
    level: String,
    scope: String,
    message: String,
    data: Option<Value>,
) -> Result<(), String> {
    app_log::append(
        &app_handle,
        AppLogRecord {
            ts_ms: chrono::Utc::now().timestamp_millis(),
            level,
            scope,
            message,
            data,
        },
    )
}

#[tauri::command]
pub async fn read_logs(
    app_handle: AppHandle,
    limit: Option<u32>,
    query: Option<String>,
    tail_bytes: Option<u64>,
) -> Result<Vec<AppLogRecord>, String> {
    let limit = limit.unwrap_or(500).clamp(1, 5000) as usize;
    app_log::read(&app_handle, limit, query, tail_bytes)
}

#[tauri::command]
pub async fn clear_logs(app_handle: AppHandle) -> Result<(), String> {
    app_log::clear(&app_handle)
}

#[tauri::command]
pub async fn open_logs_directory(app_handle: AppHandle) -> Result<(), String> {
    let dir = app_handle
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to resolve log dir: {}", e))?;

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open log dir: {}", e))?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", dir.to_string_lossy().as_ref()])
            .spawn()
            .map_err(|e| format!("Failed to open log dir: {}", e))?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open log dir: {}", e))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err("Opening log directory is not supported on this platform.".to_string())
    }
}
