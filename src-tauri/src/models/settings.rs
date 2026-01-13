use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub enable_keyboard: bool,
    pub enable_mouse_single: bool,
    pub always_on_top: bool,
    pub window_pass_through: bool,
    pub show_taskbar_icon: bool,
    pub launch_on_startup: bool,
    pub wooden_fish_skin: String,
    pub keyboard_layout: String,
    pub opacity: f64,
    pub animation_speed: f64,
    pub window_scale: u32,
    pub heatmap_levels: u8,
    pub shortcut_toggle_main: Option<String>,
    pub shortcut_toggle_settings: Option<String>,
    pub shortcut_toggle_listening: Option<String>,
    pub shortcut_toggle_window_pass_through: Option<String>,
    pub shortcut_toggle_always_on_top: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            enable_keyboard: true,
            enable_mouse_single: true,
            always_on_top: true,
            window_pass_through: false,
            show_taskbar_icon: false,
            launch_on_startup: false,
            wooden_fish_skin: "rosewood".to_string(),
            keyboard_layout: "tkl_80".to_string(),
            opacity: 0.95,
            animation_speed: 1.0,
            window_scale: 100,
            heatmap_levels: 10,
            shortcut_toggle_main: None,
            shortcut_toggle_settings: None,
            shortcut_toggle_listening: None,
            shortcut_toggle_window_pass_through: None,
            shortcut_toggle_always_on_top: None,
        }
    }
}

impl Settings {
    pub fn new() -> Self {
        Self::default()
    }
}
