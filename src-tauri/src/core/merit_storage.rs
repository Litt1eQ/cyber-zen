use crate::models::{InputOrigin, InputSource, MeritStats, Settings, WindowPlacement};
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use std::collections::BTreeMap;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

static STORAGE: Lazy<Arc<RwLock<MeritStorage>>> =
    Lazy::new(|| Arc::new(RwLock::new(MeritStorage::new())));

pub struct MeritStorage {
    stats: MeritStats,
    settings: Settings,
    window_placements: BTreeMap<String, WindowPlacement>,
}

impl MeritStorage {
    fn new() -> Self {
        Self {
            stats: MeritStats::new(),
            settings: Settings::new(),
            window_placements: BTreeMap::new(),
        }
    }

    pub fn instance() -> Arc<RwLock<Self>> {
        Arc::clone(&STORAGE)
    }

    pub fn get_stats(&self) -> MeritStats {
        self.stats.clone()
    }

    pub fn set_stats(&mut self, stats: MeritStats) {
        self.stats = stats;
    }

    pub fn get_settings(&self) -> Settings {
        self.settings.clone()
    }

    pub fn set_settings(&mut self, settings: Settings) {
        self.settings = settings;
    }

    pub fn get_window_placements(&self) -> BTreeMap<String, WindowPlacement> {
        self.window_placements.clone()
    }

    pub fn set_window_placements(&mut self, placements: BTreeMap<String, WindowPlacement>) {
        self.window_placements = placements;
    }

    pub fn update_window_placement(&mut self, label: String, placement: WindowPlacement) {
        self.window_placements.insert(label, placement);
        crate::core::persistence::request_save();
    }

    pub fn add_merit_silent(
        &mut self,
        origin: InputOrigin,
        source: InputSource,
        count: u64,
        key_counts: Option<&HashMap<String, u64>>,
    ) -> bool {
        let should_count = match origin {
            // Explicit in-app action should always count, independent of global input listening toggles.
            InputOrigin::App => true,
            InputOrigin::Global => match source {
                InputSource::Keyboard => self.settings.enable_keyboard,
                InputSource::MouseSingle => self.settings.enable_mouse_single,
            },
        };

        if !should_count || count == 0 {
            return false;
        }

        self.stats.add_merit(source, count);
        match source {
            InputSource::Keyboard => {
                if let Some(counts) = key_counts {
                    self.stats.add_keyboard_key_counts(counts);
                }
            }
            InputSource::MouseSingle => {
                if let Some(counts) = key_counts {
                    self.stats.add_mouse_button_counts(counts);
                }
            }
        }
        true
    }

    pub fn clear_history(&mut self, app_handle: &AppHandle) {
        self.stats.clear_history();
        let _ = app_handle.emit("merit-updated", self.stats.clone());
        crate::core::persistence::request_save();
    }

    pub fn reset_all(&mut self, app_handle: &AppHandle) {
        self.stats.reset_all();
        let _ = app_handle.emit("merit-updated", self.stats.clone());
        crate::core::persistence::request_save();
    }

    pub fn update_settings(&mut self, settings: Settings) {
        self.settings = settings;
        crate::core::persistence::request_save();
    }
}
