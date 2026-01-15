use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct WindowPlacement {
    pub display_name: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    /// Position relative to the display's origin (when `display_name` is available).
    pub rel_x: i32,
    pub rel_y: i32,
}
