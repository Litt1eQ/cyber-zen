use crate::core;

#[tauri::command]
pub async fn check_input_monitoring_permission() -> Result<bool, String> {
    Ok(core::macos_permissions::has_input_monitoring_permission())
}

#[tauri::command]
pub async fn request_input_monitoring_permission() -> Result<bool, String> {
    core::macos_permissions::open_input_monitoring_settings()?;
    Ok(core::macos_permissions::request_input_monitoring_permission())
}

#[tauri::command]
pub async fn open_input_monitoring_settings() -> Result<(), String> {
    core::macos_permissions::open_input_monitoring_settings()
}
