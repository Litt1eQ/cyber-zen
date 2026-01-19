use crate::core::wooden_fish_skins;
use crate::core::MeritStorage;
use crate::models::{MouseDistanceDisplaySettings, Settings};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, Size};

const BASE_WINDOW_SIZE: f64 = 320.0;
const DEFAULT_MERIT_POP_LABEL: &str = "功德";
const DEFAULT_CUSTOM_STATISTICS_WIDGETS: [&str; 2] = ["trend", "calendar"];
const MAX_CUSTOM_STATISTICS_WIDGETS: usize = 24;

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

fn normalize_app_locale(locale: String) -> String {
    let trimmed = locale.trim();
    if trimmed.is_empty() || trimmed == "system" {
        return "system".to_string();
    }
    let normalized = trimmed.replace('_', "-");
    let lower = normalized.to_lowercase();
    match lower.as_str() {
        "en" => "en".to_string(),
        "zh-cn" | "zh-hans" | "zh-sg" => "zh-CN".to_string(),
        "zh-tw" | "zh-hant" | "zh-hk" | "zh-mo" => "zh-TW".to_string(),
        _ => {
            // If it starts with `zh`, default to Simplified.
            if lower.starts_with("zh") {
                "zh-CN".to_string()
            } else {
                "system".to_string()
            }
        }
    }
}

fn normalize_keyboard_layout(id: String) -> String {
    match id.as_str() {
        "full_100" | "full_104" => "full_104".to_string(),
        "full_108" | "compact_98" | "compact_96" | "tkl_80" | "compact_75" | "compact_65"
        | "compact_60" | "hhkb" | "macbook_pro" => id,
        _ => "tkl_80".to_string(),
    }
}

fn normalize_heatmap_levels(levels: u8) -> u8 {
    levels.clamp(5, 15)
}

fn normalize_dock_margin_px(px: u32) -> u32 {
    px.clamp(0, 64)
}

fn normalize_opacity(opacity: f64) -> f64 {
    opacity.clamp(0.30, 1.0)
}

fn normalize_wooden_fish_opacity(opacity: f64) -> f64 {
    opacity.clamp(0.0, 1.0)
}

fn normalize_merit_pop_opacity(opacity: f64) -> f64 {
    opacity.clamp(0.0, 1.0)
}

fn normalize_merit_pop_label(label: String) -> String {
    let trimmed = label.trim();
    let out: String = trimmed.chars().take(4).collect();
    if out.is_empty() {
        DEFAULT_MERIT_POP_LABEL.to_string()
    } else {
        out
    }
}

fn normalize_custom_statistics_widgets(widgets: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for raw in widgets {
        if out.len() >= MAX_CUSTOM_STATISTICS_WIDGETS {
            break;
        }
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        if out.iter().any(|s| s == trimmed) {
            continue;
        }
        out.push(trimmed.to_string());
    }

    if out.is_empty() {
        DEFAULT_CUSTOM_STATISTICS_WIDGETS
            .iter()
            .map(|s| s.to_string())
            .collect()
    } else {
        out
    }
}

fn normalize_custom_statistics_range(range: String) -> String {
    match range.as_str() {
        "today" | "all" => range,
        _ => "today".to_string(),
    }
}

fn normalize_shortcut(value: Option<String>) -> Option<String> {
    value.and_then(|s| {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_auto_fade_idle_opacity(idle: f64, active: f64) -> f64 {
    idle.clamp(0.05, 1.0).min(active)
}

fn normalize_auto_fade_delay_ms(ms: u32) -> u32 {
    ms.min(10_000)
}

fn normalize_auto_fade_duration_ms(ms: u32) -> u32 {
    ms.min(5_000)
}

fn normalize_drag_hold_ms(ms: u32) -> u32 {
    ms.min(2_000)
}

fn normalize_mouse_distance_ppi(ppi: u32) -> u32 {
    ppi.clamp(50, 400)
}

fn normalize_mouse_distance_displays(
    displays: std::collections::HashMap<String, MouseDistanceDisplaySettings>,
) -> std::collections::HashMap<String, MouseDistanceDisplaySettings> {
    let mut out = std::collections::HashMap::new();
    for (id, mut cfg) in displays {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            continue;
        }

        cfg.diagonal_in = cfg
            .diagonal_in
            .and_then(|v| (v.is_finite() && v > 0.0).then_some(v))
            .map(|v| v.clamp(5.0, 80.0));
        cfg.ppi_override = cfg.ppi_override.map(normalize_mouse_distance_ppi);

        if cfg.diagonal_in.is_none() && cfg.ppi_override.is_none() {
            continue;
        }

        out.insert(trimmed.to_string(), cfg);
    }
    out
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
    settings.app_locale = normalize_app_locale(settings.app_locale);
    settings.window_scale = normalize_scale(settings.window_scale);
    settings.wooden_fish_skin = normalize_skin_id(&app_handle, settings.wooden_fish_skin);
    settings.keyboard_layout = normalize_keyboard_layout(settings.keyboard_layout);
    settings.heatmap_levels = normalize_heatmap_levels(settings.heatmap_levels);
    settings.opacity = normalize_opacity(settings.opacity);
    settings.wooden_fish_opacity = normalize_wooden_fish_opacity(settings.wooden_fish_opacity);
    settings.dock_margin_px = normalize_dock_margin_px(settings.dock_margin_px);
    settings.auto_fade_delay_ms = normalize_auto_fade_delay_ms(settings.auto_fade_delay_ms);
    settings.auto_fade_duration_ms =
        normalize_auto_fade_duration_ms(settings.auto_fade_duration_ms);
    settings.drag_hold_ms = normalize_drag_hold_ms(settings.drag_hold_ms);
    settings.auto_fade_idle_opacity =
        normalize_auto_fade_idle_opacity(settings.auto_fade_idle_opacity, settings.opacity);
    settings.merit_pop_opacity = normalize_merit_pop_opacity(settings.merit_pop_opacity);
    settings.merit_pop_label = normalize_merit_pop_label(settings.merit_pop_label);
    settings.custom_statistics_widgets =
        normalize_custom_statistics_widgets(settings.custom_statistics_widgets);
    settings.custom_statistics_range =
        normalize_custom_statistics_range(settings.custom_statistics_range);
    settings.mouse_distance_displays =
        normalize_mouse_distance_displays(settings.mouse_distance_displays);
    settings.shortcut_toggle_main = normalize_shortcut(settings.shortcut_toggle_main);
    settings.shortcut_toggle_settings = normalize_shortcut(settings.shortcut_toggle_settings);
    settings.shortcut_toggle_listening = normalize_shortcut(settings.shortcut_toggle_listening);
    settings.shortcut_toggle_window_pass_through =
        normalize_shortcut(settings.shortcut_toggle_window_pass_through);
    settings.shortcut_toggle_always_on_top =
        normalize_shortcut(settings.shortcut_toggle_always_on_top);
    settings.shortcut_open_custom_statistics =
        normalize_shortcut(settings.shortcut_open_custom_statistics);
    settings.shortcut_close_custom_statistics =
        normalize_shortcut(settings.shortcut_close_custom_statistics);

    let storage = MeritStorage::instance();
    let mut storage = storage.write();
    storage.update_settings(settings.clone());
    drop(storage);

    crate::core::mouse_distance::set_tracking_enabled(settings.enable_mouse_single);

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
