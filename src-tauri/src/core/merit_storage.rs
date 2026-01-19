use crate::models::{ClickHeatmapState, InputOrigin, InputSource, MeritStats, Settings, WindowPlacement};
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use std::collections::BTreeMap;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use super::active_app::AppContext;

static STORAGE: Lazy<Arc<RwLock<MeritStorage>>> =
    Lazy::new(|| Arc::new(RwLock::new(MeritStorage::new())));

pub struct KeyboardCounts<'a> {
    pub key_counts: Option<&'a HashMap<String, u64>>,
    pub key_counts_unshifted: Option<&'a HashMap<String, u64>>,
    pub key_counts_shifted: Option<&'a HashMap<String, u64>>,
    pub shortcut_counts: Option<&'a HashMap<String, u64>>,
}

pub struct MouseCounts<'a> {
    pub mouse_button_counts: Option<&'a HashMap<String, u64>>,
}

pub struct MeritStorage {
    stats: MeritStats,
    settings: Settings,
    window_placements: BTreeMap<String, WindowPlacement>,
    click_heatmap: ClickHeatmapState,
}

impl MeritStorage {
    fn new() -> Self {
        Self {
            stats: MeritStats::new(),
            settings: Settings::new(),
            window_placements: BTreeMap::new(),
            click_heatmap: ClickHeatmapState::default(),
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

    pub fn get_click_heatmap(&self) -> ClickHeatmapState {
        self.click_heatmap.clone()
    }

    pub fn click_heatmap_recording_enabled(&self) -> bool {
        true
    }

    pub fn click_heatmap_display(
        &self,
        display_id: &str,
    ) -> Option<&crate::models::click_heatmap::DisplayClickHeatmap> {
        self.click_heatmap.displays.get(display_id)
    }

    pub fn set_click_heatmap(&mut self, heatmap: ClickHeatmapState) {
        self.click_heatmap = heatmap;
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
        keyboard: Option<KeyboardCounts<'_>>,
        mouse: Option<MouseCounts<'_>>,
    ) -> bool {
        if !self.should_count(origin, source) || count == 0 {
            return false;
        }

        self.stats.add_merit(source, count);
        match source {
            InputSource::Keyboard => {
                if let Some(k) = keyboard {
                    if let Some(counts) = k.key_counts {
                        self.stats.add_keyboard_key_counts(counts);
                    }
                    if let Some(counts) = k.key_counts_unshifted {
                        self.stats.add_keyboard_key_unshifted_counts(counts);
                    }
                    if let Some(counts) = k.key_counts_shifted {
                        self.stats.add_keyboard_key_shifted_counts(counts);
                    }
                    if let Some(counts) = k.shortcut_counts {
                        self.stats.add_shortcut_counts(counts);
                    }
                }
            }
            InputSource::MouseSingle => {
                if let Some(m) = mouse {
                    if let Some(counts) = m.mouse_button_counts {
                        self.stats.add_mouse_button_counts(counts);
                    }
                }
            }
        }
        true
    }

    pub fn add_app_merit_silent(
        &mut self,
        origin: InputOrigin,
        source: InputSource,
        count: u64,
        app: Option<&AppContext>,
    ) -> bool {
        if !self.should_count(origin, source) || count == 0 {
            return false;
        }

        let Some(app) = app else {
            return false;
        };

        self.stats
            .add_app_merit(&app.id, app.name.as_deref(), source, count);
        true
    }

    pub fn add_mouse_move_distance_px_for_display_silent(
        &mut self,
        display_id: Option<&str>,
        px: u64,
    ) -> bool {
        if px == 0 {
            return false;
        }

        if !self.settings.enable_mouse_single {
            return false;
        }

        self.stats.add_mouse_move_distance_px_for_display(display_id, px);
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

    pub fn record_click_heatmap_cell(&mut self, display_id: &str, idx: usize) {
        if idx >= crate::models::click_heatmap::CLICK_HEATMAP_BASE_LEN {
            return;
        }

        let entry = self
            .click_heatmap
            .displays
            .entry(display_id.to_string())
            .or_default();
        if let Some(cell) = entry.grid.get_mut(idx) {
            *cell = cell.saturating_add(1);
        }
        entry.total_clicks = entry.total_clicks.saturating_add(1);
        crate::core::persistence::request_save();
    }

    pub fn clear_click_heatmap(&mut self, display_id: Option<&str>) {
        match display_id {
            Some(id) => {
                self.click_heatmap.displays.remove(id);
            }
            None => {
                self.click_heatmap.displays.clear();
            }
        }
        crate::core::persistence::request_save();
    }

    fn should_count(&self, origin: InputOrigin, source: InputSource) -> bool {
        match origin {
            // Explicit in-app action should always count, independent of global input listening toggles.
            InputOrigin::App => true,
            InputOrigin::Global => match source {
                InputSource::Keyboard => self.settings.enable_keyboard,
                InputSource::MouseSingle => self.settings.enable_mouse_single,
            },
        }
    }
}
