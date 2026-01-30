use super::merit::{AppInputStats, HourlyStats};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StatisticsAggregates {
    #[serde(default)]
    pub key_counts_all: HashMap<String, u64>,
    #[serde(default)]
    pub key_counts_unshifted: HashMap<String, u64>,
    #[serde(default)]
    pub key_counts_shifted: HashMap<String, u64>,
    #[serde(default)]
    pub shortcut_counts: HashMap<String, u64>,
    #[serde(default)]
    pub mouse_button_counts: HashMap<String, u64>,
    #[serde(default)]
    pub hourly: Vec<HourlyStats>,
    #[serde(default)]
    pub app_input_counts: HashMap<String, AppInputStats>,
}

