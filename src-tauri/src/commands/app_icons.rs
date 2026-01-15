use crate::core;

#[tauri::command]
pub async fn get_app_icon(app_id: String) -> Result<Option<String>, String> {
    Ok(core::app_icons::get_app_icon_png_base64(&app_id))
}

