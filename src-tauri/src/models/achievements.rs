use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AchievementCadence {
    Daily,
    Weekly,
    Monthly,
    Yearly,
    Total,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(default)]
pub struct AchievementUnlockRecord {
    pub achievement_id: String,
    pub cadence: AchievementCadence,
    pub period_key: String,
    pub unlocked_at_ms: u64,
}

impl Default for AchievementUnlockRecord {
    fn default() -> Self {
        Self {
            achievement_id: String::new(),
            cadence: AchievementCadence::Daily,
            period_key: String::new(),
            unlocked_at_ms: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct AchievementState {
    /// A dedupe index of (achievement_id, cadence, period_key) to prevent re-unlocking
    /// even if the visible history is cleared or truncated.
    #[serde(default)]
    pub unlock_index: Vec<AchievementUnlockRecord>,
    pub unlock_history: Vec<AchievementUnlockRecord>,
}
