use crate::core::{self, MeritStorage};
use crate::models::Settings;
use tauri::AppHandle;

#[tauri::command]
pub async fn start_input_listening(app_handle: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if !core::macos_permissions::has_input_monitoring_permission() {
            return Err("需要开启 macOS「输入监控」权限后才能监听全局键盘/鼠标事件。".to_string());
        }
    }

    core::init_input_listener(app_handle.clone())?;
    core::set_listening_enabled(true);
    let _ = crate::tray_menu::refresh_tray_menu(&app_handle);
    Ok(())
}

#[tauri::command]
pub async fn stop_input_listening(app_handle: AppHandle) -> Result<(), String> {
    core::set_listening_enabled(false);
    let _ = crate::tray_menu::refresh_tray_menu(&app_handle);
    Ok(())
}

#[tauri::command]
pub async fn is_input_listening() -> Result<bool, String> {
    Ok(core::is_listening_enabled())
}

#[tauri::command]
pub async fn update_input_settings(settings: Settings) -> Result<(), String> {
    let storage = MeritStorage::instance();
    let mut storage = storage.write();
    storage.update_settings(settings);

    Ok(())
}

#[tauri::command]
pub async fn get_input_listener_error(
) -> Result<Option<crate::core::input_listener::InputListenerError>, String> {
    Ok(core::last_error())
}

#[tauri::command]
pub async fn toggle_input_listening(app_handle: AppHandle) -> Result<(), String> {
    if core::is_listening_enabled() {
        stop_input_listening(app_handle).await
    } else {
        start_input_listening(app_handle).await
    }
}
