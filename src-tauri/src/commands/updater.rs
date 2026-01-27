use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub body: Option<String>,
    pub date: Option<String>,
}

#[tauri::command]
pub async fn check_update(app_handle: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let update = crate::core::app_updater::check_update(&app_handle).await?;
    Ok(update.map(|u| UpdateInfo {
        version: u.version,
        body: u.body,
        date: u.date,
    }))
}

#[tauri::command]
pub async fn download_and_install_update(app_handle: AppHandle) -> Result<(), String> {
    crate::core::app_updater::download_and_install_update(&app_handle).await
}
