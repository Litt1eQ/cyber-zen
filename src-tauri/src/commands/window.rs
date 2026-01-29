use crate::core::MeritStorage;
use tauri::{
    AppHandle,
    Manager,
    Monitor,
    PhysicalPosition,
    Position,
    Runtime,
    WebviewUrl,
    WebviewWindow,
    WebviewWindowBuilder,
};

#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;

fn apply_platform_window_chrome<'a, R: Runtime, M: Manager<R>>(
    builder: WebviewWindowBuilder<'a, R, M>,
) -> WebviewWindowBuilder<'a, R, M> {
    #[cfg(target_os = "macos")]
    {
        builder
            .title_bar_style(TitleBarStyle::Overlay)
            .hidden_title(true)
    }

    #[cfg(not(target_os = "macos"))]
    {
        builder
    }
}

fn ensure_settings_window(app_handle: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app_handle.get_webview_window("settings") {
        return Ok(window);
    }

    let builder = WebviewWindowBuilder::new(
        app_handle,
        "settings",
        WebviewUrl::App("settings.html".into()),
    )
    .title("设置 - 赛博木鱼")
    .resizable(true)
    .decorations(true)
    .transparent(false)
    .shadow(true)
    .skip_taskbar(false)
    .always_on_top(false)
    .accept_first_mouse(true)
    .inner_size(760.0, 560.0)
    .min_inner_size(640.0, 520.0);

    let window = apply_platform_window_chrome(builder)
        .build()
        .map_err(|e| format!("Failed to create settings window: {}", e))?;

    crate::core::window_placement::restore_all(app_handle);
    Ok(window)
}

fn ensure_custom_statistics_window(app_handle: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app_handle.get_webview_window("custom_statistics") {
        return Ok(window);
    }

    let builder = WebviewWindowBuilder::new(
        app_handle,
        "custom_statistics",
        WebviewUrl::App("custom-statistics.html".into()),
    )
    .title("自定义统计 - 赛博木鱼")
    .resizable(true)
    .decorations(true)
    .transparent(false)
    .shadow(true)
    .skip_taskbar(false)
    .always_on_top(false)
    .accept_first_mouse(true)
    .inner_size(900.0, 680.0)
    .min_inner_size(720.0, 560.0);

    let window = apply_platform_window_chrome(builder)
        .build()
        .map_err(|e| format!("Failed to create custom statistics window: {}", e))?;

    crate::core::window_placement::restore_all(app_handle);
    Ok(window)
}

fn ensure_logs_window(app_handle: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app_handle.get_webview_window("logs") {
        return Ok(window);
    }

    let builder = WebviewWindowBuilder::new(
        app_handle,
        "logs",
        WebviewUrl::App("logs.html".into()),
    )
        .title("日志 - 赛博木鱼")
        .resizable(true)
        .decorations(true)
        .transparent(false)
        .shadow(true)
        .skip_taskbar(false)
        .always_on_top(false)
        .accept_first_mouse(true)
        .inner_size(900.0, 640.0)
        .min_inner_size(720.0, 520.0);

    let window = apply_platform_window_chrome(builder)
        .build()
        .map_err(|e| format!("Failed to create logs window: {}", e))?;

    crate::core::window_placement::restore_all(app_handle);
    Ok(window)
}

fn ensure_sprite_studio_window(app_handle: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app_handle.get_webview_window("sprite_studio") {
        return Ok(window);
    }

    let builder = WebviewWindowBuilder::new(
        app_handle,
        "sprite_studio",
        WebviewUrl::App("sprite-studio.html".into()),
    )
    .title("精灵图工作台 - 赛博木鱼")
    .resizable(true)
    .decorations(true)
    .transparent(false)
    .shadow(true)
    .skip_taskbar(false)
    .always_on_top(false)
    .accept_first_mouse(true)
    .inner_size(1080.0, 780.0)
    .min_inner_size(860.0, 640.0);

    let window = apply_platform_window_chrome(builder)
        .build()
        .map_err(|e| format!("Failed to create sprite studio window: {}", e))?;

    crate::core::window_placement::restore_all(app_handle);
    Ok(window)
}

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

    crate::core::main_window_bounds::set_visible(true);
    crate::core::main_window_bounds::schedule_refresh(window.clone());

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

    crate::core::main_window_bounds::set_visible(false);

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

        crate::core::main_window_bounds::set_visible(false);

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

    crate::core::main_window_bounds::set_visible(true);
    crate::core::main_window_bounds::schedule_refresh(window.clone());

    let _ = crate::tray_menu::refresh_tray_menu(&app_handle);
    Ok(())
}

#[tauri::command]
pub async fn dock_main_window(app_handle: AppHandle, corner: String) -> Result<(), String> {
    let window = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let settings = {
        let storage = MeritStorage::instance();
        let storage = storage.read();
        storage.get_settings()
    };
    let margin = settings.dock_margin_px as i32;

    let position = window.outer_position().ok();
    let size = window
        .outer_size()
        .map_err(|e| format!("Failed to query window size: {}", e))?;

    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| containing_monitor(&window, position.as_ref(), &size))
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "No monitor available".to_string())?;

    let (x, y) = dock_to_corner(&monitor, size.width, size.height, margin, &corner)?;
    window
        .set_position(Position::Physical(PhysicalPosition { x, y }))
        .map_err(|e| format!("Failed to dock window: {}", e))?;
    Ok(())
}

fn containing_monitor(
    window: &tauri::WebviewWindow,
    position: Option<&tauri::PhysicalPosition<i32>>,
    size: &tauri::PhysicalSize<u32>,
) -> Option<Monitor> {
    let position = position?;
    let monitors = window.available_monitors().ok()?;
    let cx = position.x + (size.width as i32 / 2);
    let cy = position.y + (size.height as i32 / 2);
    monitors.into_iter().find(|m| {
        let pos = m.position();
        let s = m.size();
        cx >= pos.x && cy >= pos.y && cx < pos.x + s.width as i32 && cy < pos.y + s.height as i32
    })
}

fn dock_to_corner(
    monitor: &Monitor,
    width: u32,
    height: u32,
    margin: i32,
    corner: &str,
) -> Result<(i32, i32), String> {
    let pos = monitor.position();
    let size = monitor.size();
    let w = width as i32;
    let h = height as i32;

    let left = pos.x.saturating_add(margin);
    let top = pos.y.saturating_add(margin);
    let right = pos.x + size.width as i32 - w - margin;
    let bottom = pos.y + size.height as i32 - h - margin;

    let right = right.max(left);
    let bottom = bottom.max(top);

    match corner {
        "top_left" => Ok((left, top)),
        "top_right" => Ok((right, top)),
        "bottom_left" => Ok((left, bottom)),
        "bottom_right" => Ok((right, bottom)),
        _ => Err("Invalid corner".to_string()),
    }
}

#[tauri::command]
pub async fn show_settings_window(app_handle: AppHandle) -> Result<(), String> {
    let window = ensure_settings_window(&app_handle)?;

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
    let Some(window) = app_handle.get_webview_window("settings") else {
        return Ok(());
    };

    window
        .hide()
        .map_err(|e| format!("Failed to hide settings: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn toggle_settings_window(app_handle: AppHandle) -> Result<(), String> {
    let window = ensure_settings_window(&app_handle)?;

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
pub async fn show_custom_statistics_window(app_handle: AppHandle) -> Result<(), String> {
    let window = ensure_custom_statistics_window(&app_handle)?;

    window
        .show()
        .map_err(|e| format!("Failed to show custom statistics: {}", e))?;
    window
        .set_focus()
        .map_err(|e| format!("Failed to focus custom statistics: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn hide_custom_statistics_window(app_handle: AppHandle) -> Result<(), String> {
    let Some(window) = app_handle.get_webview_window("custom_statistics") else {
        return Ok(());
    };

    window
        .hide()
        .map_err(|e| format!("Failed to hide custom statistics: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn toggle_custom_statistics_window(app_handle: AppHandle) -> Result<(), String> {
    let window = ensure_custom_statistics_window(&app_handle)?;

    let visible = window
        .is_visible()
        .map_err(|e| format!("Failed to query custom statistics visibility: {}", e))?;

    if visible {
        window
            .hide()
            .map_err(|e| format!("Failed to hide custom statistics: {}", e))?;
        return Ok(());
    }

    window
        .show()
        .map_err(|e| format!("Failed to show custom statistics: {}", e))?;
    window
        .set_focus()
        .map_err(|e| format!("Failed to focus custom statistics: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn show_logs_window(app_handle: AppHandle) -> Result<(), String> {
    let window = ensure_logs_window(&app_handle)?;

    window
        .show()
        .map_err(|e| format!("Failed to show logs: {}", e))?;
    window
        .set_focus()
        .map_err(|e| format!("Failed to focus logs: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn hide_logs_window(app_handle: AppHandle) -> Result<(), String> {
    let Some(window) = app_handle.get_webview_window("logs") else {
        return Ok(());
    };

    window
        .hide()
        .map_err(|e| format!("Failed to hide logs: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn toggle_logs_window(app_handle: AppHandle) -> Result<(), String> {
    let window = ensure_logs_window(&app_handle)?;

    let visible = window
        .is_visible()
        .map_err(|e| format!("Failed to query logs visibility: {}", e))?;

    if visible {
        window
            .hide()
            .map_err(|e| format!("Failed to hide logs: {}", e))?;
        return Ok(());
    }

    window
        .show()
        .map_err(|e| format!("Failed to show logs: {}", e))?;
    window
        .set_focus()
        .map_err(|e| format!("Failed to focus logs: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn show_sprite_studio_window(app_handle: AppHandle) -> Result<(), String> {
    let window = ensure_sprite_studio_window(&app_handle)?;
    window
        .show()
        .map_err(|e| format!("Failed to show window: {}", e))?;
    window
        .set_focus()
        .map_err(|e| format!("Failed to focus window: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn quit_app(app_handle: AppHandle) -> Result<(), String> {
    crate::core::window_placement::capture_all_now(&app_handle);
    crate::core::persistence::flush_now();
    app_handle.exit(0);
    Ok(())
}

// window settings are applied via `update_settings`
