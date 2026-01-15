use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub body: Option<String>,
    pub date: Option<String>,
}

#[tauri::command]
pub async fn check_update(app_handle: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app_handle
        .updater()
        .map_err(|e| format!("Failed to init updater: {e}"))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Failed to check update: {e}"))?;

    Ok(update.map(|update| UpdateInfo {
        version: update.version,
        body: update.body,
        date: update.date.map(|d| d.to_string()),
    }))
}

#[tauri::command]
pub async fn download_and_install_update(app_handle: AppHandle) -> Result<(), String> {
    let updater = app_handle
        .updater()
        .map_err(|e| format!("Failed to init updater: {e}"))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Failed to check update: {e}"))?;

    let Some(update) = update else {
        return Err("No update available".to_string());
    };

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| format!("Failed to download/install update: {e}"))?;

    app_handle.request_restart();
    Ok(())
}
