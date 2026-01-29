use crate::core::wooden_fish_skins;
use crate::core::wooden_fish_skins::CustomWoodenFishSkin;
use crate::core::wooden_fish_skins::SpriteSheetConfigV2;
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
    export_dir: Option<String>,
    export_path: Option<String>,
) -> Result<String, String> {
    wooden_fish_skins::export_skin_zip_to_app_data(
        &app_handle,
        &id,
        &file_name,
        export_dir.as_deref(),
        export_path.as_deref(),
    )
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

#[tauri::command]
pub async fn export_sprite_skin_package_zip(
    app_handle: AppHandle,
    file_name: String,
    export_dir: Option<String>,
    export_path: Option<String>,
    name: Option<String>,
    author: Option<String>,
    sprite_base64: String,
    cover_png_base64: Option<String>,
    sprite_sheet: Option<SpriteSheetConfigV2>,
) -> Result<String, String> {
    wooden_fish_skins::export_sprite_skin_package_zip_base64_to_app_data(
        &app_handle,
        &file_name,
        export_dir.as_deref(),
        export_path.as_deref(),
        name,
        author,
        &sprite_base64,
        cover_png_base64.as_deref(),
        sprite_sheet,
    )
    .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn export_png_to_app_data(
    app_handle: AppHandle,
    file_name: String,
    export_dir: Option<String>,
    export_path: Option<String>,
    png_base64: String,
) -> Result<String, String> {
    wooden_fish_skins::export_png_base64_to_app_data(
        &app_handle,
        &file_name,
        export_dir.as_deref(),
        export_path.as_deref(),
        &png_base64,
    )
        .map_err(|e| format!("{e:#}"))
}
