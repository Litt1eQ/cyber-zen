use crate::core::MeritStorage;
use crate::models::{CustomStatisticsTemplate, CustomStatisticsTemplateUpsert};
use rand::Rng;
use tauri::{AppHandle, Emitter};

const MAX_TEMPLATES: usize = 48;
const MAX_NAME_CHARS: usize = 64;
const MAX_HTML_CHARS: usize = 20_000;
const MAX_CSS_CHARS: usize = 20_000;
const MAX_JS_CHARS: usize = 50_000;
const MAX_PARAMS_CHARS: usize = 20_000;
const MIN_HEIGHT_PX: u32 = 24;
const MAX_HEIGHT_PX: u32 = 6_000;

fn normalize_name(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("name_required".to_string());
    }
    let out: String = trimmed.chars().take(MAX_NAME_CHARS).collect();
    if out.is_empty() {
        return Err("name_required".to_string());
    }
    Ok(out)
}

fn validate_size(label: &str, value: &str, max: usize) -> Result<(), String> {
    if value.chars().count() > max {
        return Err(format!("{}_too_large", label));
    }
    Ok(())
}

fn normalize_height_px(raw: Option<u32>) -> Result<Option<u32>, String> {
    let Some(h) = raw else { return Ok(None) };
    if h < MIN_HEIGHT_PX || h > MAX_HEIGHT_PX {
        return Err("height_invalid".to_string());
    }
    Ok(Some(h))
}

fn normalize_id(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("id_required".to_string());
    }
    if trimmed.len() > 64 {
        return Err("id_invalid".to_string());
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("id_invalid".to_string());
    }
    Ok(trimmed.to_string())
}

fn generate_id() -> String {
    let now = chrono::Utc::now().timestamp_millis();
    let mut rng = rand::thread_rng();
    let rand_part: u32 = rng.gen();
    format!("cw_{}_{}", now, format!("{:08x}", rand_part))
}

#[tauri::command]
pub async fn get_custom_statistics_templates() -> Result<Vec<CustomStatisticsTemplate>, String> {
    let storage = MeritStorage::instance();
    let storage = storage.read();
    Ok(storage.get_custom_statistics_templates())
}

#[tauri::command]
pub async fn upsert_custom_statistics_template(
    app_handle: AppHandle,
    template: CustomStatisticsTemplateUpsert,
) -> Result<CustomStatisticsTemplate, String> {
    let name = normalize_name(&template.name)?;
    validate_size("html", &template.html, MAX_HTML_CHARS)?;
    validate_size("css", &template.css, MAX_CSS_CHARS)?;
    validate_size("js", &template.js, MAX_JS_CHARS)?;
    let params_str = serde_json::to_string(&template.params).map_err(|_| "params_invalid".to_string())?;
    validate_size("params", &params_str, MAX_PARAMS_CHARS)?;
    let height_px = normalize_height_px(template.height_px)?;

    let now = chrono::Utc::now().timestamp_millis();
    let storage = MeritStorage::instance();
    let mut storage = storage.write();
    let mut templates = storage.get_custom_statistics_templates();

    let id = match template.id.as_deref() {
        Some(id) => normalize_id(id)?,
        None => generate_id(),
    };

    let mut saved: Option<CustomStatisticsTemplate> = None;
    for existing in templates.iter_mut() {
        if existing.id != id {
            continue;
        }
        existing.name = name.clone();
        existing.html = template.html.clone();
        existing.css = template.css.clone();
        existing.js = template.js.clone();
        existing.params = template.params.clone();
        existing.height_px = height_px;
        existing.updated_at_ms = now;
        saved = Some(existing.clone());
        break;
    }

    if saved.is_none() {
        if templates.len() >= MAX_TEMPLATES {
            return Err("templates_limit_reached".to_string());
        }
        let created = CustomStatisticsTemplate {
            id: id.clone(),
            name,
            html: template.html,
            css: template.css,
            js: template.js,
            params: template.params,
            height_px,
            created_at_ms: now,
            updated_at_ms: now,
            version: 1,
        };
        saved = Some(created.clone());
        templates.push(created);
    }

    storage.set_custom_statistics_templates(templates);
    crate::core::persistence::request_save();

    let _ = app_handle.emit(
        "custom-statistics-templates-updated",
        storage.get_custom_statistics_templates(),
    );

    Ok(saved.unwrap())
}

#[tauri::command]
pub async fn delete_custom_statistics_template(app_handle: AppHandle, id: String) -> Result<(), String> {
    let id = normalize_id(&id)?;
    let widget_id = format!("custom:{}", id);

    let storage = MeritStorage::instance();
    let mut storage = storage.write();

    let mut templates = storage.get_custom_statistics_templates();
    let before = templates.len();
    templates.retain(|t| t.id != id);

    if templates.len() == before {
        return Ok(());
    }

    storage.set_custom_statistics_templates(templates);

    let mut settings = storage.get_settings();
    settings
        .custom_statistics_widgets
        .retain(|w| w.trim() != widget_id);
    storage.set_settings(settings);

    let _ = app_handle.emit("settings-updated", storage.get_settings());
    let _ = app_handle.emit(
        "custom-statistics-templates-updated",
        storage.get_custom_statistics_templates(),
    );

    crate::core::persistence::request_save();
    Ok(())
}
