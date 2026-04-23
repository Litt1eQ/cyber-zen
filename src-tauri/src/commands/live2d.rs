use crate::core::live2d_models;
use crate::core::live2d_models::Live2DModelMeta;
use crate::core::live2d_models::Live2DResourceManifest;
use tauri::AppHandle;

#[tauri::command]
pub async fn import_live2d_model(
    app_handle: AppHandle,
    src_dir: String,
) -> Result<Live2DModelMeta, String> {
    live2d_models::import(&app_handle, &src_dir).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn list_live2d_models(app_handle: AppHandle) -> Result<Vec<Live2DModelMeta>, String> {
    live2d_models::list(&app_handle).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn delete_live2d_model(app_handle: AppHandle, uuid: String) -> Result<(), String> {
    live2d_models::delete(&app_handle, &uuid).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn get_live2d_model_json(app_handle: AppHandle, uuid: String) -> Result<String, String> {
    live2d_models::read_model_json(&app_handle, &uuid).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn get_live2d_model_resources(
    app_handle: AppHandle,
    uuid: String,
) -> Result<Live2DResourceManifest, String> {
    live2d_models::read_model_resources(&app_handle, &uuid).map_err(|e| format!("{e:#}"))
}
