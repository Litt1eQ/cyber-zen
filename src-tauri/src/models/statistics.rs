use super::merit::{AppInputStats, HourlyStats};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StatisticsAggregates {
    #[serde(default)]
    pub key_counts_all: HashMap<Arc<str>, u64>,
    #[serde(default)]
    pub key_counts_unshifted: HashMap<Arc<str>, u64>,
    #[serde(default)]
    pub key_counts_shifted: HashMap<Arc<str>, u64>,
    #[serde(default)]
    pub shortcut_counts: HashMap<Arc<str>, u64>,
    #[serde(default)]
    pub mouse_button_counts: HashMap<Arc<str>, u64>,
    #[serde(default)]
    pub hourly: Vec<HourlyStats>,
    #[serde(default)]
    pub app_input_counts: HashMap<Arc<str>, AppInputStats>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_roundtrip_preserves_arc_keyed_maps() {
        let mut agg = StatisticsAggregates::default();
        agg.key_counts_all.insert(Arc::from("KeyA"), 3);
        agg.shortcut_counts
            .insert(Arc::from("ControlLeft+KeyA"), 1);
        agg.app_input_counts.insert(
            Arc::from("/usr/bin/example"),
            AppInputStats {
                name: Some(Arc::from("Example")),
                total: 10,
                keyboard: 6,
                mouse_single: 4,
            },
        );

        let json = serde_json::to_string(&agg).expect("serialize");
        assert!(json.contains("\"KeyA\""));
        assert!(json.contains("\"ControlLeft+KeyA\""));
        assert!(json.contains("\"/usr/bin/example\""));

        let de: StatisticsAggregates = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(de.key_counts_all.get("KeyA").copied(), Some(3));
        assert_eq!(de.shortcut_counts.get("ControlLeft+KeyA").copied(), Some(1));
        assert_eq!(de.app_input_counts.get("/usr/bin/example").map(|s| s.total), Some(10));
        assert_eq!(
            de.app_input_counts
                .get("/usr/bin/example")
                .and_then(|s| s.name.as_deref()),
            Some("Example")
        );
    }
}
