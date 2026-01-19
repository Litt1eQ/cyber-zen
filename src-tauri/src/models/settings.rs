use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct MouseDistanceDisplaySettings {
    pub diagonal_in: Option<f64>,
    pub ppi_override: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub app_locale: String,
    pub enable_keyboard: bool,
    pub enable_mouse_single: bool,
    pub always_on_top: bool,
    pub window_pass_through: bool,
    pub show_taskbar_icon: bool,
    pub launch_on_startup: bool,
    pub wooden_fish_skin: String,
    pub keyboard_layout: String,
    pub opacity: f64,
    pub wooden_fish_opacity: f64,
    pub animation_speed: f64,
    pub window_scale: u32,
    pub heatmap_levels: u8,
    pub click_heatmap_grid_cols: u32,
    pub click_heatmap_grid_rows: u32,
    pub lock_window_position: bool,
    pub dock_margin_px: u32,
    pub auto_fade_enabled: bool,
    pub auto_fade_idle_opacity: f64,
    pub auto_fade_delay_ms: u32,
    pub auto_fade_duration_ms: u32,
    pub drag_hold_ms: u32,
    pub merit_pop_opacity: f64,
    pub merit_pop_label: String,
    pub custom_statistics_widgets: Vec<String>,
    pub custom_statistics_range: String,
    pub mouse_distance_displays: HashMap<String, MouseDistanceDisplaySettings>,
    pub shortcut_toggle_main: Option<String>,
    pub shortcut_toggle_settings: Option<String>,
    pub shortcut_toggle_listening: Option<String>,
    pub shortcut_toggle_window_pass_through: Option<String>,
    pub shortcut_toggle_always_on_top: Option<String>,
    pub shortcut_open_custom_statistics: Option<String>,
    pub shortcut_close_custom_statistics: Option<String>,
    pub keyboard_heatmap_share_hide_numbers: bool,
    pub keyboard_heatmap_share_hide_keys: bool,
    pub keyboard_heatmap_share_show_merit_value: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            app_locale: "system".to_string(),
            enable_keyboard: true,
            enable_mouse_single: true,
            always_on_top: true,
            window_pass_through: false,
            show_taskbar_icon: false,
            launch_on_startup: false,
            wooden_fish_skin: "rosewood".to_string(),
            keyboard_layout: "tkl_80".to_string(),
            opacity: 0.95,
            wooden_fish_opacity: 1.0,
            animation_speed: 1.0,
            window_scale: 100,
            heatmap_levels: 10,
            click_heatmap_grid_cols: 64,
            click_heatmap_grid_rows: 36,
            lock_window_position: false,
            dock_margin_px: 0,
            auto_fade_enabled: false,
            auto_fade_idle_opacity: 0.35,
            auto_fade_delay_ms: 800,
            auto_fade_duration_ms: 180,
            drag_hold_ms: 0,
            merit_pop_opacity: 0.82,
            merit_pop_label: "功德".to_string(),
            custom_statistics_widgets: vec!["trend".to_string(), "calendar".to_string()],
            custom_statistics_range: "today".to_string(),
            mouse_distance_displays: HashMap::new(),
            shortcut_toggle_main: None,
            shortcut_toggle_settings: None,
            shortcut_toggle_listening: None,
            shortcut_toggle_window_pass_through: None,
            shortcut_toggle_always_on_top: None,
            shortcut_open_custom_statistics: None,
            shortcut_close_custom_statistics: None,
            keyboard_heatmap_share_hide_numbers: true,
            keyboard_heatmap_share_hide_keys: true,
            keyboard_heatmap_share_show_merit_value: false,
        }
    }
}

impl Settings {
    pub fn new() -> Self {
        Self::default()
    }
}
