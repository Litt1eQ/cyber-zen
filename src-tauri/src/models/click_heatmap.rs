use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const CLICK_HEATMAP_BASE_COLS: usize = 256;
pub const CLICK_HEATMAP_BASE_ROWS: usize = 256;
pub const CLICK_HEATMAP_BASE_LEN: usize = CLICK_HEATMAP_BASE_COLS * CLICK_HEATMAP_BASE_ROWS;

const CURRENT_VERSION: u32 = 2;

fn default_version() -> u32 {
    CURRENT_VERSION
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ClickHeatmapState {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub displays: BTreeMap<String, DisplayClickHeatmap>,
    #[serde(default)]
    pub daily: BTreeMap<String, DailyClickHeatmapState>,
}

impl Default for ClickHeatmapState {
    fn default() -> Self {
        Self {
            version: CURRENT_VERSION,
            displays: BTreeMap::new(),
            daily: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DailyClickHeatmapState {
    #[serde(default)]
    pub displays: BTreeMap<String, DisplayClickHeatmap>,
}

impl Default for DailyClickHeatmapState {
    fn default() -> Self {
        Self {
            displays: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DisplayClickHeatmap {
    #[serde(with = "sparse_grid")]
    pub grid: Vec<u32>,
    #[serde(default)]
    pub total_clicks: u64,
}

impl Default for DisplayClickHeatmap {
    fn default() -> Self {
        Self {
            grid: vec![0; CLICK_HEATMAP_BASE_LEN],
            total_clicks: 0,
        }
    }
}

mod sparse_grid {
    use super::{CLICK_HEATMAP_BASE_LEN};
    use serde::de::Error;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    #[derive(Debug, Clone, Copy, Serialize, Deserialize)]
    struct SparseCell {
        idx: u32,
        count: u32,
    }

    pub fn serialize<S>(grid: &Vec<u32>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut out: Vec<SparseCell> = Vec::new();
        for (idx, &count) in grid.iter().enumerate() {
            if count == 0 {
                continue;
            }
            out.push(SparseCell {
                idx: idx as u32,
                count,
            });
        }
        out.serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vec<u32>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let sparse = Vec::<SparseCell>::deserialize(deserializer)?;
        let mut grid = vec![0u32; CLICK_HEATMAP_BASE_LEN];
        for cell in sparse {
            let idx = cell.idx as usize;
            if idx >= grid.len() {
                return Err(D::Error::custom("click heatmap cell index out of bounds"));
            }
            grid[idx] = cell.count;
        }
        Ok(grid)
    }
}
