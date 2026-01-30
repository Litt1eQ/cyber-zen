use chrono::{Local, NaiveDate, Timelike, Utc};
use serde::de;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashMap;

fn default_hourly_stats() -> Vec<HourlyStats> {
    vec![HourlyStats::default(); 24]
}

const MAX_APP_ENTRIES_PER_DAY: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HourlyStats {
    #[serde(default)]
    pub total: u64,
    #[serde(default)]
    pub keyboard: u64,
    #[serde(default)]
    pub mouse_single: u64,
}

impl HourlyStats {
    pub fn add_merit(&mut self, source: InputSource, count: u64) {
        if count == 0 {
            return;
        }

        self.total = self.total.saturating_add(count);
        match source {
            InputSource::Keyboard => self.keyboard = self.keyboard.saturating_add(count),
            InputSource::MouseSingle => self.mouse_single = self.mouse_single.saturating_add(count),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum InputOrigin {
    Global,
    App,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum InputSource {
    Keyboard,
    MouseSingle,
}

impl<'de> Deserialize<'de> for InputSource {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let raw = String::deserialize(deserializer)?;
        match raw.as_str() {
            "keyboard" => Ok(Self::Keyboard),
            "mouse_single" => Ok(Self::MouseSingle),
            "mouse_double" => Ok(Self::MouseSingle),
            _ => Err(de::Error::custom(format!("invalid input source: {}", raw))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InputEvent {
    pub origin: InputOrigin,
    pub source: InputSource,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyStats {
    pub date: NaiveDate,
    #[serde(default)]
    pub total: u64,
    #[serde(default)]
    pub keyboard: u64,
    #[serde(default)]
    pub mouse_single: u64,
    #[serde(default)]
    pub first_event_at_ms: Option<u64>,
    #[serde(default)]
    pub last_event_at_ms: Option<u64>,
    #[serde(default)]
    pub mouse_move_distance_px: u64,
    #[serde(default)]
    pub mouse_move_distance_px_by_display: HashMap<String, u64>,
    #[serde(default = "default_hourly_stats")]
    pub hourly: Vec<HourlyStats>,
    #[serde(default)]
    pub key_counts: HashMap<String, u64>,
    #[serde(default)]
    pub key_counts_unshifted: HashMap<String, u64>,
    #[serde(default)]
    pub key_counts_shifted: HashMap<String, u64>,
    #[serde(default)]
    pub shortcut_counts: HashMap<String, u64>,
    #[serde(default)]
    pub mouse_button_counts: HashMap<String, u64>,
    #[serde(default)]
    pub app_input_counts: HashMap<String, AppInputStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DailyStatsLite {
    pub date: NaiveDate,
    #[serde(default)]
    pub total: u64,
    #[serde(default)]
    pub keyboard: u64,
    #[serde(default)]
    pub mouse_single: u64,
    #[serde(default)]
    pub first_event_at_ms: Option<u64>,
    #[serde(default)]
    pub last_event_at_ms: Option<u64>,
    #[serde(default)]
    pub mouse_move_distance_px: u64,
    #[serde(default)]
    pub mouse_move_distance_px_by_display: HashMap<String, u64>,
    #[serde(default = "default_hourly_stats")]
    pub hourly: Vec<HourlyStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppInputStats {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub total: u64,
    #[serde(default)]
    pub keyboard: u64,
    #[serde(default)]
    pub mouse_single: u64,
}

impl AppInputStats {
    pub fn add(&mut self, name: Option<&str>, source: InputSource, count: u64) {
        if count == 0 {
            return;
        }

        if self.name.is_none() {
            self.name = name.map(|v| v.to_string());
        }

        self.total = self.total.saturating_add(count);
        match source {
            InputSource::Keyboard => self.keyboard = self.keyboard.saturating_add(count),
            InputSource::MouseSingle => self.mouse_single = self.mouse_single.saturating_add(count),
        }
    }
}

impl DailyStats {
    pub fn new(date: NaiveDate) -> Self {
        Self {
            date,
            total: 0,
            keyboard: 0,
            mouse_single: 0,
            first_event_at_ms: None,
            last_event_at_ms: None,
            mouse_move_distance_px: 0,
            mouse_move_distance_px_by_display: HashMap::new(),
            hourly: default_hourly_stats(),
            key_counts: HashMap::new(),
            key_counts_unshifted: HashMap::new(),
            key_counts_shifted: HashMap::new(),
            shortcut_counts: HashMap::new(),
            mouse_button_counts: HashMap::new(),
            app_input_counts: HashMap::new(),
        }
    }

    pub fn normalize_hourly(&mut self) {
        if self.hourly.len() == 24 {
            return;
        }
        if self.hourly.is_empty() {
            self.hourly = default_hourly_stats();
            return;
        }

        let mut next = default_hourly_stats();
        for (idx, value) in self.hourly.iter().take(24).enumerate() {
            next[idx] = value.clone();
        }
        self.hourly = next;
    }

    pub fn lite(&self) -> DailyStatsLite {
        DailyStatsLite {
            date: self.date,
            total: self.total,
            keyboard: self.keyboard,
            mouse_single: self.mouse_single,
            first_event_at_ms: self.first_event_at_ms,
            last_event_at_ms: self.last_event_at_ms,
            mouse_move_distance_px: self.mouse_move_distance_px,
            mouse_move_distance_px_by_display: self.mouse_move_distance_px_by_display.clone(),
            hourly: self.hourly.clone(),
        }
    }

    fn record_event_at_ms(&mut self, event_at_ms: u64) {
        if event_at_ms == 0 {
            return;
        }

        self.first_event_at_ms = Some(match self.first_event_at_ms {
            Some(existing) => existing.min(event_at_ms),
            None => event_at_ms,
        });
        self.last_event_at_ms = Some(match self.last_event_at_ms {
            Some(existing) => existing.max(event_at_ms),
            None => event_at_ms,
        });
    }

    pub fn add_merit(&mut self, source: InputSource, count: u64, event_at_ms: u64) {
        if count == 0 {
            return;
        }

        self.record_event_at_ms(event_at_ms);

        self.total = self.total.saturating_add(count);
        match source {
            InputSource::Keyboard => {
                self.keyboard = self.keyboard.saturating_add(count);
            }
            InputSource::MouseSingle => {
                self.mouse_single = self.mouse_single.saturating_add(count);
            }
        }
    }

    pub fn add_mouse_move_distance_px(&mut self, px: u64) {
        if px == 0 {
            return;
        }
        self.mouse_move_distance_px = self.mouse_move_distance_px.saturating_add(px);
    }

    pub fn add_mouse_move_distance_px_for_display(&mut self, display_id: Option<&str>, px: u64) {
        if px == 0 {
            return;
        }
        self.record_event_at_ms(u64::try_from(Utc::now().timestamp_millis()).unwrap_or(0));
        self.add_mouse_move_distance_px(px);
        let Some(id) = display_id else {
            return;
        };
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return;
        }
        self.mouse_move_distance_px_by_display
            .entry(trimmed.to_string())
            .and_modify(|v| *v = v.saturating_add(px))
            .or_insert(px);
    }

    pub fn add_hourly_merit(&mut self, hour: usize, source: InputSource, count: u64) {
        if count == 0 {
            return;
        }
        if hour >= 24 {
            return;
        }
        self.normalize_hourly();
        if let Some(bucket) = self.hourly.get_mut(hour) {
            bucket.add_merit(source, count);
        }
    }

    pub fn recompute_counters(&mut self) {
        // Older versions persisted per-event records and recomputed totals from them.
        // Current best practice is to persist only aggregated counters to keep state compact.
        self.normalize_hourly();
        self.total = self.keyboard.saturating_add(self.mouse_single);

        for v in self.app_input_counts.values_mut() {
            v.total = v.keyboard.saturating_add(v.mouse_single);
        }
    }

    pub fn add_app_merit(&mut self, app_id: &str, app_name: Option<&str>, source: InputSource, count: u64) {
        if count == 0 {
            return;
        }

        let entry = self
            .app_input_counts
            .entry(app_id.to_string())
            .or_default();
        entry.add(app_name, source, count);

        if self.app_input_counts.len() > MAX_APP_ENTRIES_PER_DAY {
            self.prune_app_input_counts(app_id);
        }
    }

    fn prune_app_input_counts(&mut self, keep_id: &str) {
        if self.app_input_counts.len() <= MAX_APP_ENTRIES_PER_DAY {
            return;
        }

        let mut entries: Vec<(String, u64)> = self
            .app_input_counts
            .iter()
            .map(|(k, v)| (k.clone(), v.total))
            .collect();
        entries.sort_by(|a, b| b.1.cmp(&a.1));

        let mut keep: std::collections::HashSet<String> =
            entries.into_iter().take(MAX_APP_ENTRIES_PER_DAY).map(|(k, _)| k).collect();
        keep.insert(keep_id.to_string());

        self.app_input_counts.retain(|k, _| keep.contains(k));
    }

    pub fn add_key_counts(&mut self, counts: &HashMap<String, u64>) {
        if counts.is_empty() {
            return;
        }

        for (key, count) in counts {
            if *count == 0 {
                continue;
            }
            self.key_counts
                .entry(key.clone())
                .and_modify(|v| *v = v.saturating_add(*count))
                .or_insert(*count);
        }
    }

    pub fn add_key_unshifted_counts(&mut self, counts: &HashMap<String, u64>) {
        if counts.is_empty() {
            return;
        }

        for (key, count) in counts {
            if *count == 0 {
                continue;
            }
            self.key_counts_unshifted
                .entry(key.clone())
                .and_modify(|v| *v = v.saturating_add(*count))
                .or_insert(*count);
        }
    }

    pub fn add_key_shifted_counts(&mut self, counts: &HashMap<String, u64>) {
        if counts.is_empty() {
            return;
        }

        for (key, count) in counts {
            if *count == 0 {
                continue;
            }
            self.key_counts_shifted
                .entry(key.clone())
                .and_modify(|v| *v = v.saturating_add(*count))
                .or_insert(*count);
        }
    }

    pub fn add_shortcut_counts(&mut self, counts: &HashMap<String, u64>) {
        if counts.is_empty() {
            return;
        }

        for (key, count) in counts {
            if *count == 0 {
                continue;
            }
            self.shortcut_counts
                .entry(key.clone())
                .and_modify(|v| *v = v.saturating_add(*count))
                .or_insert(*count);
        }
    }

    pub fn add_mouse_button_counts(&mut self, counts: &HashMap<String, u64>) {
        if counts.is_empty() {
            return;
        }

        for (key, count) in counts {
            if *count == 0 {
                continue;
            }
            self.mouse_button_counts
                .entry(key.clone())
                .and_modify(|v| *v = v.saturating_add(*count))
                .or_insert(*count);
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeritStats {
    pub total_merit: u64,
    pub today: DailyStats,
    pub history: Vec<DailyStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeritStatsLite {
    pub total_merit: u64,
    pub today: DailyStatsLite,
}

impl Default for MeritStats {
    fn default() -> Self {
        Self {
            total_merit: 0,
            today: DailyStats::new(Local::now().date_naive()),
            history: Vec::new(),
        }
    }
}

impl MeritStats {
    const MAX_HISTORY_DAYS: usize = 400;

    pub fn new() -> Self {
        Self::default()
    }

    pub fn lite(&self) -> MeritStatsLite {
        MeritStatsLite {
            total_merit: self.total_merit,
            today: self.today.lite(),
        }
    }

    pub fn normalize_today(&mut self) {
        let today = Local::now().date_naive();
        if self.today.date != today {
            self.archive_today();
            self.today = DailyStats::new(today);
        }
    }

    pub fn add_merit(&mut self, source: InputSource, count: u64) {
        let today = Local::now().date_naive();

        if self.today.date != today {
            self.archive_today();
            self.today = DailyStats::new(today);
        }

        let hour = Local::now().hour() as usize;
        let now_ms = Utc::now().timestamp_millis();
        let event_at_ms = u64::try_from(now_ms).unwrap_or(0);
        self.total_merit = self.total_merit.saturating_add(count);
        self.today.add_merit(source, count, event_at_ms);
        self.today.add_hourly_merit(hour, source, count);
    }

    pub fn add_mouse_move_distance_px_for_display(&mut self, display_id: Option<&str>, px: u64) {
        if px == 0 {
            return;
        }
        self.normalize_today();
        self.today
            .add_mouse_move_distance_px_for_display(display_id, px);
    }

    pub fn add_app_merit(
        &mut self,
        app_id: &str,
        app_name: Option<&str>,
        source: InputSource,
        count: u64,
    ) {
        if count == 0 {
            return;
        }
        self.normalize_today();
        self.today.add_app_merit(app_id, app_name, source, count);
    }

    pub fn add_keyboard_key_counts(&mut self, counts: &HashMap<String, u64>) {
        if counts.is_empty() {
            return;
        }
        self.normalize_today();
        self.today.add_key_counts(counts);
    }

    pub fn add_keyboard_key_unshifted_counts(&mut self, counts: &HashMap<String, u64>) {
        if counts.is_empty() {
            return;
        }
        self.normalize_today();
        self.today.add_key_unshifted_counts(counts);
    }

    pub fn add_keyboard_key_shifted_counts(&mut self, counts: &HashMap<String, u64>) {
        if counts.is_empty() {
            return;
        }
        self.normalize_today();
        self.today.add_key_shifted_counts(counts);
    }

    pub fn add_shortcut_counts(&mut self, counts: &HashMap<String, u64>) {
        if counts.is_empty() {
            return;
        }
        self.normalize_today();
        self.today.add_shortcut_counts(counts);
    }

    pub fn add_mouse_button_counts(&mut self, counts: &HashMap<String, u64>) {
        if counts.is_empty() {
            return;
        }
        self.normalize_today();
        self.today.add_mouse_button_counts(counts);
    }

    pub fn recompute_counters(&mut self) {
        self.today.recompute_counters();
        for day in &mut self.history {
            day.recompute_counters();
        }

        self.total_merit = self
            .history
            .iter()
            .map(|d| d.total)
            .chain(std::iter::once(self.today.total))
            .fold(0u64, |acc, v| acc.saturating_add(v));
    }

    fn archive_today(&mut self) {
        if self.today.total > 0 {
            self.history.push(self.today.clone());
            self.history.sort_by(|a, b| b.date.cmp(&a.date));

            if self.history.len() > Self::MAX_HISTORY_DAYS {
                self.history.truncate(Self::MAX_HISTORY_DAYS);
            }
        }
    }

    pub fn clear_history(&mut self) {
        self.history.clear();
        self.recompute_counters();
    }

    pub fn reset_all(&mut self) {
        self.total_merit = 0;
        self.today = DailyStats::new(Local::now().date_naive());
        self.history.clear();
    }
}
