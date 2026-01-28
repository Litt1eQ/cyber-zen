use crate::core::wooden_fish_skins;
use crate::core::wooden_fish_skins::CustomWoodenFishSkin;
use tauri::{AppHandle, Emitter};

const EVENT_WOODEN_FISH_SKINS_UPDATED: &str = "wooden-fish-skins-updated";

#[tauri::command]
pub async fn get_custom_wooden_fish_skins(
    app_handle: AppHandle,
) -> Result<Vec<CustomWoodenFishSkin>, String> {
    wooden_fish_skins::list_custom_skins(&app_handle)
        .map_err(|e| format!("Failed to list custom skins: {e:#}"))
}

#[tauri::command]
pub async fn import_custom_wooden_fish_skin_zip(
    app_handle: AppHandle,
    zip_base64: String,
    name: Option<String>,
) -> Result<CustomWoodenFishSkin, String> {
    let skin = wooden_fish_skins::import_custom_skin_zip_base64(&app_handle, &zip_base64, name)
        .map_err(|e| format!("{e:#}"))?;
    let _ = app_handle.emit(EVENT_WOODEN_FISH_SKINS_UPDATED, ());
    Ok(skin)
}

#[tauri::command]
pub async fn delete_custom_wooden_fish_skin(
    app_handle: AppHandle,
    id: String,
) -> Result<(), String> {
    wooden_fish_skins::delete_custom_skin(&app_handle, &id).map_err(|e| format!("{e:#}"))?;
    let _ = app_handle.emit(EVENT_WOODEN_FISH_SKINS_UPDATED, ());
    Ok(())
}

#[tauri::command]
pub async fn export_wooden_fish_skin_zip(
    app_handle: AppHandle,
    id: String,
    file_name: String,
) -> Result<String, String> {
    wooden_fish_skins::export_skin_zip_to_app_data(&app_handle, &id, &file_name)
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn cache_custom_wooden_fish_sprite_sheet_png(
    app_handle: AppHandle,
    id: String,
    png_base64: String,
) -> Result<(), String> {
    wooden_fish_skins::write_custom_skin_sprite_sheet_cache_png(&app_handle, &id, &png_base64)
        .map_err(|e| format!("{e:#}"))?;
    let _ = app_handle.emit(EVENT_WOODEN_FISH_SKINS_UPDATED, ());
    Ok(())
}
