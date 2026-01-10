use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn show_main_window(app_handle: AppHandle) -> Result<(), String> {
    let window = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    #[cfg(target_os = "macos")]
    {
        crate::core::window_manager::show_window(&window)?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        window
            .show()
            .map_err(|e| format!("Failed to show window: {}", e))?;
    }

    window
        .set_focus()
        .map_err(|e| format!("Failed to focus window: {}", e))?;

    let _ = crate::tray_menu::refresh_tray_menu(&app_handle);
    Ok(())
}

#[tauri::command]
pub async fn hide_main_window(app_handle: AppHandle) -> Result<(), String> {
    let window = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    #[cfg(target_os = "macos")]
    {
        crate::core::window_manager::hide_window(&window)?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        window
            .hide()
            .map_err(|e| format!("Failed to hide window: {}", e))?;
    }

    let _ = crate::tray_menu::refresh_tray_menu(&app_handle);
    Ok(())
}

#[tauri::command]
pub async fn toggle_main_window(app_handle: AppHandle) -> Result<(), String> {
    let window = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let visible = window
        .is_visible()
        .map_err(|e| format!("Failed to query window visibility: {}", e))?;

    if visible {
        #[cfg(target_os = "macos")]
        {
            crate::core::window_manager::hide_window(&window)?;
        }

        #[cfg(not(target_os = "macos"))]
        {
            window
                .hide()
                .map_err(|e| format!("Failed to hide window: {}", e))?;
        }

        let _ = crate::tray_menu::refresh_tray_menu(&app_handle);
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        crate::core::window_manager::show_window(&window)?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        window
            .show()
            .map_err(|e| format!("Failed to show window: {}", e))?;
    }

    window
        .set_focus()
        .map_err(|e| format!("Failed to focus window: {}", e))?;

    let _ = crate::tray_menu::refresh_tray_menu(&app_handle);
    Ok(())
}

#[tauri::command]
pub async fn show_settings_window(app_handle: AppHandle) -> Result<(), String> {
    let window = app_handle
        .get_webview_window("settings")
        .ok_or_else(|| "Settings window not found".to_string())?;

    window
        .show()
        .map_err(|e| format!("Failed to show settings: {}", e))?;
    window
        .set_focus()
        .map_err(|e| format!("Failed to focus settings: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn hide_settings_window(app_handle: AppHandle) -> Result<(), String> {
    let window = app_handle
        .get_webview_window("settings")
        .ok_or_else(|| "Settings window not found".to_string())?;

    window
        .hide()
        .map_err(|e| format!("Failed to hide settings: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn toggle_settings_window(app_handle: AppHandle) -> Result<(), String> {
    let window = app_handle
        .get_webview_window("settings")
        .ok_or_else(|| "Settings window not found".to_string())?;

    let visible = window
        .is_visible()
        .map_err(|e| format!("Failed to query settings visibility: {}", e))?;

    if visible {
        window
            .hide()
            .map_err(|e| format!("Failed to hide settings: {}", e))?;
        return Ok(());
    }

    window
        .show()
        .map_err(|e| format!("Failed to show settings: {}", e))?;
    window
        .set_focus()
        .map_err(|e| format!("Failed to focus settings: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn quit_app(app_handle: AppHandle) -> Result<(), String> {
    app_handle.exit(0);
    Ok(())
}

// window settings are applied via `update_settings`
