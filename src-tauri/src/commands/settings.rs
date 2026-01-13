use crate::core::MeritStorage;
use crate::core::wooden_fish_skins;
use crate::models::Settings;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, Size};

const BASE_WINDOW_SIZE: f64 = 320.0;

fn current_settings() -> Settings {
    let storage = MeritStorage::instance();
    let storage = storage.read();
    storage.get_settings()
}

fn normalize_scale(scale: u32) -> u32 {
    match scale {
        50 | 75 | 100 | 125 | 150 => scale,
        _ => {
            // snap to nearest supported option
            let options = [50u32, 75u32, 100u32, 125u32, 150u32];
            let mut best = 100u32;
            let mut best_delta = u32::MAX;
            for &opt in &options {
                let delta = opt.abs_diff(scale);
                if delta < best_delta {
                    best = opt;
                    best_delta = delta;
                }
            }
            best
        }
    }
}

fn normalize_skin_id(app_handle: &AppHandle, id: String) -> String {
    match id.as_str() {
        "rosewood" | "wood" => id,
        _ => {
            if let Some(raw_id) = wooden_fish_skins::parse_custom_skin_settings_id(&id) {
                if wooden_fish_skins::custom_skin_exists(app_handle, raw_id) {
                    return id;
                }
            }
            "rosewood".to_string()
        }
    }
}

fn normalize_keyboard_layout(id: String) -> String {
    match id.as_str() {
        "full_100" | "full_104" => "full_104".to_string(),
        "full_108"
        | "compact_98"
        | "compact_96"
        | "tkl_80"
        | "compact_75"
        | "compact_65"
        | "compact_60"
        | "hhkb"
        | "macbook_pro" => id,
        _ => "tkl_80".to_string(),
    }
}

fn normalize_heatmap_levels(levels: u8) -> u8 {
    levels.clamp(5, 15)
}

#[tauri::command]
pub async fn get_settings() -> Result<Settings, String> {
    let storage = MeritStorage::instance();
    let storage = storage.read();
    Ok(storage.get_settings())
}

#[tauri::command]
pub async fn update_settings(app_handle: AppHandle, settings: Settings) -> Result<(), String> {
    let mut settings = settings;
    settings.window_scale = normalize_scale(settings.window_scale);
    settings.wooden_fish_skin = normalize_skin_id(&app_handle, settings.wooden_fish_skin);
    settings.keyboard_layout = normalize_keyboard_layout(settings.keyboard_layout);
    settings.heatmap_levels = normalize_heatmap_levels(settings.heatmap_levels);

    let storage = MeritStorage::instance();
    let mut storage = storage.write();
    storage.update_settings(settings.clone());
    drop(storage);

    let window = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    window
        .set_always_on_top(settings.always_on_top)
        .map_err(|e| format!("Failed to set always on top: {}", e))?;

    window
        .set_ignore_cursor_events(settings.window_pass_through)
        .map_err(|e| format!("Failed to set ignore cursor events: {}", e))?;

    let _ = window.set_skip_taskbar(!settings.show_taskbar_icon);
    #[cfg(target_os = "macos")]
    {
        let _ = app_handle.set_dock_visibility(settings.show_taskbar_icon);
    }

    let size = BASE_WINDOW_SIZE * (settings.window_scale as f64 / 100.0);
    let _ = window.set_size(Size::Logical(LogicalSize {
        width: size,
        height: size,
    }));

    let _ = app_handle.emit("settings-updated", settings.clone());
    let _ = crate::tray_menu::refresh_tray_menu(&app_handle);

    Ok(())
}

#[tauri::command]
pub async fn toggle_window_pass_through(app_handle: AppHandle) -> Result<(), String> {
    let mut settings = current_settings();
    settings.window_pass_through = !settings.window_pass_through;
    update_settings(app_handle, settings).await
}

#[tauri::command]
pub async fn toggle_always_on_top(app_handle: AppHandle) -> Result<(), String> {
    let mut settings = current_settings();
    settings.always_on_top = !settings.always_on_top;
    update_settings(app_handle, settings).await
}
