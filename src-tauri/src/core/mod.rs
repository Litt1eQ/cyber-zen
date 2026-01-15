pub mod active_app;
pub mod app_icons;
pub mod input_listener;
pub mod key_codes;
pub mod macos_event_tap;
pub mod macos_permissions;
pub mod merit_batcher;
pub mod merit_storage;
pub mod persistence;
pub mod window_placement;
pub mod wooden_fish_skins;

#[cfg(target_os = "macos")]
pub mod window_manager;

pub use input_listener::{
    init_input_listener, is_listening_enabled, last_error, set_ignore_mouse_when_app_focused,
    set_listening_enabled, suppress_mouse_for,
};
pub use merit_storage::MeritStorage;
