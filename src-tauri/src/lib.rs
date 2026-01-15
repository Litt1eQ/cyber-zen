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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_menu_event(|app, event| {
            tray_menu::handle_menu_event(app, event);
        })
        .setup(|app| {
            let app_handle = app.handle().clone();

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

            if let Ok(Some((stats, settings, window_placements))) =
                core::persistence::load(&state_path)
            {
                let storage = MeritStorage::instance();
                let mut storage = storage.write();
                storage.set_stats(stats);
                storage.set_settings(settings.clone());
                storage.set_window_placements(window_placements);

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
            commands::window::quit_app,
            commands::updater::check_update,
            commands::updater::download_and_install_update,
            commands::skins::get_custom_wooden_fish_skins,
            commands::skins::import_custom_wooden_fish_skin_zip,
            commands::skins::delete_custom_wooden_fish_skin,
            commands::skins::export_wooden_fish_skin_zip,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::Focused(focused) = event {
                core::set_ignore_mouse_when_app_focused(*focused);
            }
            if matches!(event, WindowEvent::Moved(_) | WindowEvent::Resized(_)) {
                let label = window.label();
                if label == "main" || label == "settings" {
                    if let Some(webview_window) = window.app_handle().get_webview_window(label) {
                        core::window_placement::schedule_capture(webview_window);
                    }
                }
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" || window.label() == "settings" {
                    if let Some(webview_window) =
                        window.app_handle().get_webview_window(window.label())
                    {
                        core::window_placement::capture_immediately(&webview_window);
                    }
                    let _ = window.hide();
                    let _ = tray_menu::refresh_tray_menu(window.app_handle());
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
