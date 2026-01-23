use serde::{Deserialize, Serialize};
use serde_json::Value;

fn default_template_version() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct CustomStatisticsTemplate {
    pub id: String,
    pub name: String,
    pub html: String,
    pub css: String,
    pub js: String,
    pub params: Value,
    pub height_px: Option<u32>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    #[serde(default = "default_template_version")]
    pub version: u32,
}

impl Default for CustomStatisticsTemplate {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            html: String::new(),
            css: String::new(),
            js: String::new(),
            params: Value::Object(serde_json::Map::new()),
            height_px: None,
            created_at_ms: 0,
            updated_at_ms: 0,
            version: default_template_version(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct CustomStatisticsTemplateUpsert {
    pub id: Option<String>,
    pub name: String,
    pub html: String,
    pub css: String,
    pub js: String,
    pub params: Value,
    pub height_px: Option<u32>,
}

impl Default for CustomStatisticsTemplateUpsert {
    fn default() -> Self {
        Self {
            id: None,
            name: String::new(),
            html: String::new(),
            css: String::new(),
            js: String::new(),
            params: Value::Object(serde_json::Map::new()),
            height_px: None,
        }
    }
}
