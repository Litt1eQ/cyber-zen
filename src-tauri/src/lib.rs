mod commands;
mod core;
mod models;
mod tray_menu;

use core::MeritStorage;
use tauri::{LogicalSize, Manager, Size, WindowEvent};

#[cfg(target_os = "macos")]
use core::window_manager::setup_panel;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_menu_event(|app, event| {
            tray_menu::handle_menu_event(app, event);
        })
        .setup(|app| {
            let app_handle = app.handle().clone();
            core::app_log::install_panic_hook(app_handle.clone());
            let _ = core::app_log::info(&app_handle, "app", "startup");
            let notification_env = core::notification_env::detect(&app_handle);
            if let Err(e) = core::notification_env::configure_once(&notification_env) {
                let _ = core::app_log::append(
                    &app_handle,
                    core::app_log::AppLogRecord {
                        ts_ms: chrono::Utc::now().timestamp_millis(),
                        level: "error".to_string(),
                        scope: "notifications/native".to_string(),
                        message: "configure_failed".to_string(),
                        data: Some(serde_json::json!({ "error": e, "app_id": notification_env.app_id })),
                    },
                );
            } else {
                let _ = core::app_log::append(
                    &app_handle,
                    core::app_log::AppLogRecord {
                        ts_ms: chrono::Utc::now().timestamp_millis(),
                        level: "info".to_string(),
                        scope: "notifications/native".to_string(),
                        message: "configured".to_string(),
                        data: Some(serde_json::json!({
                            "app_id": notification_env.app_id,
                            "is_dev": notification_env.is_dev,
                            "in_app_bundle": notification_env.in_app_bundle
                        })),
                    },
                );
            }
            app.manage(notification_env);

            #[cfg(target_os = "macos")]
            {
                app.handle()
                    .plugin(tauri_nspanel::init())
                    .map_err(|e| format!("Failed to init nspanel: {}", e))?;

                if let Some(main_window) = app.get_webview_window("main") {
                    setup_panel(&app_handle, main_window)
                        .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e)))?;
                }
            }

            tray_menu::create_tray(&app_handle)?;

            let state_path = app_handle
                .path()
                .app_data_dir()
                .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e)))?
                .join("state.json");

            if let Ok(Some((stats, settings, achievements, window_placements, click_heatmap))) =
                core::persistence::load(&state_path)
            {
                let storage = MeritStorage::instance();
                let mut storage = storage.write();
                storage.set_stats(stats);
                storage.set_settings(settings.clone());
                storage.set_achievements(achievements);
                storage.set_window_placements(window_placements);
                storage.set_click_heatmap(click_heatmap);

                if let Some(main_window) = app_handle.get_webview_window("main") {
                    let size = 320.0 * (settings.window_scale as f64 / 100.0);
                    let _ = main_window.set_size(Size::Logical(LogicalSize {
                        width: size,
                        height: size,
                    }));
                    let _ = main_window.set_always_on_top(settings.always_on_top);
                    let _ = main_window.set_ignore_cursor_events(settings.window_pass_through);
                    let _ = main_window.set_skip_taskbar(!settings.show_taskbar_icon);
                    #[cfg(target_os = "macos")]
                    {
                        let _ = app_handle.set_dock_visibility(settings.show_taskbar_icon);
                    }
                }
            }

            core::persistence::init(MeritStorage::instance(), state_path);
            core::window_placement::restore_all(&app_handle);
            core::init_input_listener(app_handle.clone())
                .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e)))?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::achievements::get_achievement_state,
            commands::achievements::append_achievement_unlocks,
            commands::achievements::clear_achievement_history,
            commands::merit::get_merit_stats,
            commands::merit::get_recent_days,
            commands::merit::add_merit,
            commands::merit::clear_history,
            commands::merit::reset_all_merit,
            commands::input::start_input_listening,
            commands::input::stop_input_listening,
            commands::input::is_input_listening,
            commands::input::update_input_settings,
            commands::input::get_input_listener_error,
            commands::input::toggle_input_listening,
            commands::permissions::check_input_monitoring_permission,
            commands::permissions::request_input_monitoring_permission,
            commands::permissions::open_input_monitoring_settings,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::toggle_window_pass_through,
            commands::settings::toggle_always_on_top,
            commands::autostart::autostart_is_enabled,
            commands::autostart::autostart_enable,
            commands::autostart::autostart_disable,
            commands::window::show_main_window,
            commands::window::hide_main_window,
            commands::window::toggle_main_window,
            commands::window::dock_main_window,
            commands::window::show_settings_window,
            commands::window::hide_settings_window,
            commands::window::toggle_settings_window,
            commands::window::show_custom_statistics_window,
            commands::window::hide_custom_statistics_window,
            commands::window::toggle_custom_statistics_window,
            commands::window::show_logs_window,
            commands::window::hide_logs_window,
            commands::window::toggle_logs_window,
            commands::window::quit_app,
            commands::updater::check_update,
            commands::updater::download_and_install_update,
            commands::skins::get_custom_wooden_fish_skins,
            commands::skins::import_custom_wooden_fish_skin_zip,
            commands::skins::delete_custom_wooden_fish_skin,
            commands::skins::export_wooden_fish_skin_zip,
            commands::app_icons::get_app_icon,
            commands::click_heatmap::get_display_monitors,
            commands::click_heatmap::get_click_heatmap_grid,
            commands::click_heatmap::clear_click_heatmap,
            commands::notifications::open_notification_settings,
            commands::notifications::send_system_notification,
            commands::logs::append_log,
            commands::logs::read_logs,
            commands::logs::clear_logs,
            commands::logs::open_logs_directory,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::Focused(focused) = event {
                core::set_ignore_mouse_when_app_focused(*focused);
            }
            if matches!(event, WindowEvent::Moved(_) | WindowEvent::Resized(_)) {
                let label = window.label();
                if label == "main"
                    || label == "settings"
                    || label == "custom_statistics"
                    || label == "logs"
                {
                    if let Some(webview_window) = window.app_handle().get_webview_window(label) {
                        core::window_placement::schedule_capture(webview_window);
                    }
                }
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                if let Some(webview_window) = window.app_handle().get_webview_window(window.label())
                {
                    core::window_placement::capture_immediately(&webview_window);
                }

                // Keep the main window as a tray-style app; auxiliary windows should close to
                // release their WebView processes and CPU usage.
                if window.label() == "main" {
                    let _ = window.hide();
                    let _ = tray_menu::refresh_tray_menu(window.app_handle());
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
