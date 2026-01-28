use anyhow::{anyhow, Context, Result};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use zip::write::{SimpleFileOptions, ZipWriter};
use zip::ZipArchive;

const CUSTOM_SKINS_DIR_NAME: &str = "wooden_fish_skins";
const MANIFEST_FILE_NAME: &str = "manifest.json";
const MUYU_FILE_NAME: &str = "muyu.png";
const HAMMER_FILE_NAME: &str = "hammer.png";
const SPRITE_SHEET_PNG_FILE_NAME: &str = "sprite.png";
const SPRITE_SHEET_JPG_FILE_NAME: &str = "sprite.jpg";
const SPRITE_SHEET_JPEG_FILE_NAME: &str = "sprite.jpeg";
const SPRITE_SHEET_CACHE_DIR_NAME: &str = "_cache";
const SPRITE_SHEET_CACHE_FILE_NAME: &str = "sprite_cached_v1.png";

const EXPECTED_MUYU_DIMENSIONS: (u32, u32) = (500, 350);
const EXPECTED_HAMMER_DIMENSIONS: (u32, u32) = (500, 150);

const EXPECTED_SPRITE_COLUMNS: u32 = 8;
const EXPECTED_SPRITE_ROWS: u32 = 7;
const SPRITE_ASPECT_RATIO_TOLERANCE: f64 = 0.15;
const SPRITE_MIN_FRAME_SIZE_PX: u32 = 32;

const MAX_ZIP_BYTES: usize = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;
// Spritesheets are typically much larger than the two single-frame PNG assets, and are still
// bounded by `MAX_ZIP_BYTES` when importing/exporting skin packages.
const MAX_SPRITE_SHEET_BYTES: usize = 9 * 1024 * 1024;
// A processed cached spritesheet PNG can be larger than the original (e.g. JPEG → PNG).
const MAX_SPRITE_SHEET_CACHE_BYTES: usize = 24 * 1024 * 1024;
const MAX_MANIFEST_BYTES: usize = 128 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomWoodenFishSkin {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub muyu_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hammer_path: Option<String>,
    pub sprite_sheet_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sprite_sheet: Option<SpriteSheetConfigV2>,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SkinManifestV1 {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChromaKeyOptionsV2 {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub similarity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub smoothness: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spill: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetConfigV2 {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hit_moods: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idle_variants: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idle_variant_every_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idle_variant_duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sleep_after_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snore_after_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpriteSheetConfigV2 {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub columns: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rows: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chroma_key: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chroma_key_algorithm: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chroma_key_options: Option<ChromaKeyOptionsV2>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remove_grid_lines: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_smoothing_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idle_breathe: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub behavior: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idle_mood: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hit_mood: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pet: Option<PetConfigV2>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SkinManifestV2 {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub created_at_ms: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sprite_sheet: Option<SpriteSheetConfigV2>,
}

pub fn custom_skin_settings_id(id: &str) -> String {
    format!("custom:{id}")
}

pub fn parse_custom_skin_settings_id(id: &str) -> Option<&str> {
    id.strip_prefix("custom:")
}

pub fn custom_skin_exists(app: &AppHandle, id: &str) -> bool {
    if !is_safe_id(id) {
        return false;
    }
    let Ok(root) = skins_root(app) else {
        return false;
    };
    let dir = root.join(id);
    let has_composite = dir.join(MUYU_FILE_NAME).is_file() && dir.join(HAMMER_FILE_NAME).is_file();
    let has_sprite = dir.join(SPRITE_SHEET_PNG_FILE_NAME).is_file()
        || dir.join(SPRITE_SHEET_JPG_FILE_NAME).is_file()
        || dir.join(SPRITE_SHEET_JPEG_FILE_NAME).is_file();
    has_composite || has_sprite
}

fn read_manifest_v2(path: &Path, dir_id: &str) -> Option<SkinManifestV2> {
    let s = fs::read_to_string(path).ok()?;
    // Prefer V2; fall back to V1.
    if let Ok(m2) = serde_json::from_str::<SkinManifestV2>(&s) {
        if m2.schema_version == 2 && m2.id == dir_id {
            return Some(m2);
        }
    }
    let m1 = serde_json::from_str::<SkinManifestV1>(&s).ok()?;
    if m1.schema_version != 1 || m1.id != dir_id {
        return None;
    }
    Some(SkinManifestV2 {
        schema_version: 2,
        id: m1.id,
        name: m1.name,
        created_at_ms: m1.created_at_ms,
        sprite_sheet: None,
    })
}

pub fn list_custom_skins(app: &AppHandle) -> Result<Vec<CustomWoodenFishSkin>> {
    let root = skins_root(app)?;
    fs::create_dir_all(&root)
        .with_context(|| format!("Failed to create skins dir: {}", root.display()))?;

    let mut skins = Vec::new();
    for entry in fs::read_dir(&root)
        .with_context(|| format!("Failed to read skins dir: {}", root.display()))?
    {
        let entry = match entry {
            Ok(v) => v,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let id = match path.file_name().and_then(|v| v.to_str()) {
            Some(v) => v.to_string(),
            None => continue,
        };
        if !is_safe_id(&id) {
            continue;
        }

        let manifest_path = path.join(MANIFEST_FILE_NAME);
        let Some(mut manifest) = read_manifest_v2(&manifest_path, &id) else {
            continue;
        };

        let cached_sprite_sheet_path = sprite_sheet_cache_file_path(&path);
        let has_cached_sprite_sheet = cached_sprite_sheet_path.is_file();

        let sprite_sheet_path = if has_cached_sprite_sheet {
            Some(cached_sprite_sheet_path.to_string_lossy().to_string())
        } else {
            let candidates = [
                path.join(SPRITE_SHEET_PNG_FILE_NAME),
                path.join(SPRITE_SHEET_JPG_FILE_NAME),
                path.join(SPRITE_SHEET_JPEG_FILE_NAME),
            ];
            candidates
                .into_iter()
                .find(|p| p.is_file())
                .map(|p| p.to_string_lossy().to_string())
        };

        if manifest.sprite_sheet.is_some() && sprite_sheet_path.is_none() {
            // Manifest claims spritesheet, but file is missing; keep as composite for safety.
            manifest.sprite_sheet = None;
        }
        if sprite_sheet_path.is_some() && manifest.sprite_sheet.is_none() {
            // Directory contains sprite.* but no config; keep it usable with safe defaults.
            manifest.sprite_sheet = Some(SpriteSheetConfigV2 {
                file: None,
                mode: Some("replace".to_string()),
                columns: Some(EXPECTED_SPRITE_COLUMNS),
                rows: Some(EXPECTED_SPRITE_ROWS),
                chroma_key: Some(true),
                chroma_key_algorithm: Some("yuv".to_string()),
                chroma_key_options: None,
                remove_grid_lines: Some(true),
                image_smoothing_enabled: Some(true),
                idle_breathe: Some(true),
                behavior: Some("pet".to_string()),
                idle_mood: Some("idle".to_string()),
                hit_mood: Some("excited".to_string()),
                pet: None,
            });
        }

        // If we are using a cached pre-processed spritesheet, disable pixel-processing in the
        // renderer layer for this session (no manifest rewrite; export keeps original behavior).
        if has_cached_sprite_sheet {
            if let Some(ref mut cfg) = manifest.sprite_sheet {
                cfg.chroma_key = Some(false);
                cfg.remove_grid_lines = Some(false);
                // Keep the rest of the config (columns/rows/behavior/etc.) intact.
            }
        }

        let muyu_path = path.join(MUYU_FILE_NAME);
        let hammer_path = path.join(HAMMER_FILE_NAME);
        let muyu_path = if muyu_path.is_file() {
            Some(muyu_path.to_string_lossy().to_string())
        } else {
            None
        };
        let hammer_path = if hammer_path.is_file() {
            Some(hammer_path.to_string_lossy().to_string())
        } else {
            None
        };

        // Require at least one rendering mode to be available.
        if sprite_sheet_path.is_none() && (muyu_path.is_none() || hammer_path.is_none()) {
            continue;
        }

        skins.push(CustomWoodenFishSkin {
            id: custom_skin_settings_id(&id),
            name: manifest.name,
            muyu_path,
            hammer_path,
            sprite_sheet_path,
            sprite_sheet: manifest.sprite_sheet,
            created_at_ms: manifest.created_at_ms,
        });
    }

    skins.sort_by(|a, b| b.created_at_ms.cmp(&a.created_at_ms));
    Ok(skins)
}

pub fn write_custom_skin_sprite_sheet_cache_png(
    app: &AppHandle,
    settings_id: &str,
    png_base64: &str,
) -> Result<()> {
    let Some(raw_id) = parse_custom_skin_settings_id(settings_id) else {
        return Err(anyhow!("非法皮肤 ID"));
    };
    if !is_safe_id(raw_id) {
        return Err(anyhow!("非法皮肤 ID"));
    }

    let png_base64 = png_base64.trim();
    if png_base64.is_empty() {
        return Err(anyhow!("PNG 内容为空"));
    }

    let png_bytes = BASE64_STANDARD
        .decode(png_base64.as_bytes())
        .context("PNG base64 解码失败")?;
    if png_bytes.is_empty() {
        return Err(anyhow!("PNG 内容为空"));
    }
    if png_bytes.len() > MAX_SPRITE_SHEET_CACHE_BYTES {
        return Err(anyhow!(
            "处理后的 spritesheet PNG 过大（最大 {}MB）",
            MAX_SPRITE_SHEET_CACHE_BYTES / 1024 / 1024
        ));
    }

    // Validate as PNG and validate grid/aspect (same checks as import).
    let (w, h) = png_dimensions(&png_bytes).context("处理后的 spritesheet 不是有效的 PNG")?;

    let root = skins_root(app)?;
    let dir = root.join(raw_id);
    if !dir.is_dir() {
        return Err(anyhow!("皮肤不存在"));
    }

    let manifest_path = dir.join(MANIFEST_FILE_NAME);
    let Some(manifest) = read_manifest_v2(&manifest_path, raw_id) else {
        return Err(anyhow!("manifest.json 无效或缺失"));
    };

    let cols = manifest
        .sprite_sheet
        .as_ref()
        .and_then(|c| c.columns)
        .filter(|v| *v >= 1)
        .unwrap_or(EXPECTED_SPRITE_COLUMNS);
    let rows = manifest
        .sprite_sheet
        .as_ref()
        .and_then(|c| c.rows)
        .filter(|v| *v >= 1)
        .unwrap_or(EXPECTED_SPRITE_ROWS);

    // Reuse the same validation semantics, but we already parsed dimensions above.
    validate_sprite_sheet_dimensions(w, h, cols, rows)?;

    let cache_dir = dir.join(SPRITE_SHEET_CACHE_DIR_NAME);
    fs::create_dir_all(&cache_dir)
        .with_context(|| format!("创建 spritesheet 缓存目录失败：{}", cache_dir.display()))?;

    let target = cache_dir.join(SPRITE_SHEET_CACHE_FILE_NAME);
    let tmp = cache_dir.join(format!("{}.tmp", SPRITE_SHEET_CACHE_FILE_NAME));
    fs::write(&tmp, &png_bytes)
        .with_context(|| format!("写入 spritesheet 缓存失败：{}", tmp.display()))?;
    if target.exists() {
        let _ = fs::remove_file(&target);
    }
    fs::rename(&tmp, &target)
        .with_context(|| format!("保存 spritesheet 缓存失败：{}", target.display()))?;

    Ok(())
}

pub fn import_custom_skin_zip_base64(
    app: &AppHandle,
    zip_base64: &str,
    name: Option<String>,
) -> Result<CustomWoodenFishSkin> {
    let zip_base64 = zip_base64.trim();
    if zip_base64.is_empty() {
        return Err(anyhow!("Zip 内容为空"));
    }
    let zip_bytes = BASE64_STANDARD
        .decode(zip_base64.as_bytes())
        .context("Zip base64 解码失败")?;
    import_custom_skin_zip_bytes(app, &zip_bytes, name)
}

pub fn import_custom_skin_zip_bytes(
    app: &AppHandle,
    zip_bytes: &[u8],
    name: Option<String>,
) -> Result<CustomWoodenFishSkin> {
    if zip_bytes.is_empty() {
        return Err(anyhow!("Zip 内容为空"));
    }
    if zip_bytes.len() > MAX_ZIP_BYTES {
        return Err(anyhow!(
            "Zip 过大（最大 {}MB）",
            MAX_ZIP_BYTES / 1024 / 1024
        ));
    }

    let (muyu_png, hammer_png, sprite_sheet, package_manifest_bytes) = extract_skin_assets(zip_bytes)?;

    #[derive(Debug, Deserialize)]
    struct PackageManifestV2 {
        pub schema_version: u32,
        pub name: Option<String>,
        #[serde(default)]
        pub sprite_sheet: Option<SpriteSheetConfigV2>,
    }

    let package_manifest = match package_manifest_bytes {
        Some(bytes) => {
            let m = serde_json::from_slice::<PackageManifestV2>(&bytes)
                .context("manifest.json 解析失败")?;
            if m.schema_version != 2 {
                return Err(anyhow!("manifest.json schema_version 不支持：{}", m.schema_version));
            }
            Some(m)
        }
        None => None,
    };

    if let (Some(ref muyu_png), Some(ref hammer_png)) = (&muyu_png, &hammer_png) {
        let (muyu_w, muyu_h) = png_dimensions(muyu_png).context("muyu.png 不是有效的 PNG")?;
        let (hammer_w, hammer_h) = png_dimensions(hammer_png).context("hammer.png 不是有效的 PNG")?;

        if (muyu_w, muyu_h) != EXPECTED_MUYU_DIMENSIONS {
            return Err(anyhow!(
                "muyu.png 尺寸不匹配：期望 {}x{}，实际 {}x{}",
                EXPECTED_MUYU_DIMENSIONS.0,
                EXPECTED_MUYU_DIMENSIONS.1,
                muyu_w,
                muyu_h
            ));
        }
        if (hammer_w, hammer_h) != EXPECTED_HAMMER_DIMENSIONS {
            return Err(anyhow!(
                "hammer.png 尺寸不匹配：期望 {}x{}，实际 {}x{}",
                EXPECTED_HAMMER_DIMENSIONS.0,
                EXPECTED_HAMMER_DIMENSIONS.1,
                hammer_w,
                hammer_h
            ));
        }
    } else if sprite_sheet.is_none() {
        return Err(anyhow!("Zip 内缺少必需文件（需要 muyu.png + hammer.png，或提供 sprite.* 精灵图）"));
    }

    let mut sprite_sheet_config: Option<SpriteSheetConfigV2> =
        package_manifest.as_ref().and_then(|m| m.sprite_sheet.clone());
    if let Some(ref sprite_sheet) = sprite_sheet {
        let cols = sprite_sheet_config
            .as_ref()
            .and_then(|c| c.columns)
            .filter(|v| *v >= 1)
            .unwrap_or(EXPECTED_SPRITE_COLUMNS);
        let rows = sprite_sheet_config
            .as_ref()
            .and_then(|c| c.rows)
            .filter(|v| *v >= 1)
            .unwrap_or(EXPECTED_SPRITE_ROWS);
        validate_sprite_sheet_image(&sprite_sheet.bytes, cols, rows)?;

        // Ensure config points to the actual stored filename (and defaults to a safe "pet" behavior).
        let config = sprite_sheet_config.get_or_insert_with(|| SpriteSheetConfigV2 {
            file: None,
            mode: Some("replace".to_string()),
            columns: Some(cols),
            rows: Some(rows),
            chroma_key: Some(true),
            chroma_key_algorithm: Some("yuv".to_string()),
            chroma_key_options: Some(ChromaKeyOptionsV2 {
                similarity: Some(0.42),
                smoothness: Some(0.1),
                spill: Some(0.28),
            }),
            remove_grid_lines: Some(true),
            image_smoothing_enabled: Some(true),
            idle_breathe: Some(true),
            behavior: Some("pet".to_string()),
            idle_mood: Some("idle".to_string()),
            hit_mood: Some("excited".to_string()),
            pet: None,
        });
        config.file = Some(sprite_sheet.file_name.clone());
        if config.columns.is_none() { config.columns = Some(cols); }
        if config.rows.is_none() { config.rows = Some(rows); }
        if config.behavior.is_none() { config.behavior = Some("pet".to_string()); }
        // Currently the app only supports "replace" rendering for spritesheets; normalize for safety.
        if config.mode.as_deref() != Some("replace") {
            config.mode = Some("replace".to_string());
        }
    } else {
        sprite_sheet_config = None;
    }

    let root = skins_root(app)?;
    fs::create_dir_all(&root)
        .with_context(|| format!("Failed to create skins dir: {}", root.display()))?;

    let raw_id = generate_id();
    let id_dir = root.join(&raw_id);
    let tmp_dir = root.join(format!("_tmp_{raw_id}"));
    if tmp_dir.exists() {
        let _ = fs::remove_dir_all(&tmp_dir);
    }

    fs::create_dir_all(&tmp_dir)
        .with_context(|| format!("Failed to create temp dir: {}", tmp_dir.display()))?;

    let created_at_ms = chrono::Utc::now().timestamp_millis();
    let name = package_manifest
        .as_ref()
        .and_then(|m| normalize_name(m.name.clone()))
        .or_else(|| normalize_name(name))
        .unwrap_or_else(|| "自定义皮肤".to_string());

    if let Some(ref bytes) = muyu_png {
        fs::write(tmp_dir.join(MUYU_FILE_NAME), bytes).context("写入 muyu.png 失败")?;
    }
    if let Some(ref bytes) = hammer_png {
        fs::write(tmp_dir.join(HAMMER_FILE_NAME), bytes).context("写入 hammer.png 失败")?;
    }
    if let Some(ref sprite_sheet) = sprite_sheet {
        fs::write(tmp_dir.join(&sprite_sheet.file_name), &sprite_sheet.bytes)
            .with_context(|| format!("写入 {} 失败", sprite_sheet.file_name))?;
    }

    let manifest = SkinManifestV2 {
        schema_version: 2,
        id: raw_id.clone(),
        name: name.clone(),
        created_at_ms,
        sprite_sheet: sprite_sheet_config.clone(),
    };
    fs::write(
        tmp_dir.join(MANIFEST_FILE_NAME),
        serde_json::to_vec_pretty(&manifest).context("序列化 manifest 失败")?,
    )
    .context("写入 manifest.json 失败")?;

    if id_dir.exists() {
        return Err(anyhow!("皮肤 ID 冲突，请重试"));
    }
    fs::rename(&tmp_dir, &id_dir).context("保存皮肤失败（重命名临时目录失败）")?;

    Ok(CustomWoodenFishSkin {
        id: custom_skin_settings_id(&raw_id),
        name,
        muyu_path: {
            let path = id_dir.join(MUYU_FILE_NAME);
            path.is_file().then(|| path.to_string_lossy().to_string())
        },
        hammer_path: {
            let path = id_dir.join(HAMMER_FILE_NAME);
            path.is_file().then(|| path.to_string_lossy().to_string())
        },
        sprite_sheet_path: {
            let candidates = [
                id_dir.join(SPRITE_SHEET_PNG_FILE_NAME),
                id_dir.join(SPRITE_SHEET_JPG_FILE_NAME),
                id_dir.join(SPRITE_SHEET_JPEG_FILE_NAME),
            ];
            candidates
                .into_iter()
                .find(|p| p.is_file())
                .map(|p| p.to_string_lossy().to_string())
        },
        sprite_sheet: sprite_sheet_config,
        created_at_ms,
    })
}

pub fn delete_custom_skin(app: &AppHandle, settings_id: &str) -> Result<()> {
    let Some(id) = parse_custom_skin_settings_id(settings_id) else {
        return Err(anyhow!("非法皮肤 ID"));
    };
    if !is_safe_id(id) {
        return Err(anyhow!("非法皮肤 ID"));
    }
    let root = skins_root(app)?;
    let dir = root.join(id);
    if !dir.exists() {
        return Ok(());
    }
    fs::remove_dir_all(&dir).with_context(|| format!("删除皮肤失败：{}", dir.display()))?;
    Ok(())
}

pub fn export_skin_zip_to_app_data(
    app: &AppHandle,
    settings_id: &str,
    file_name: &str,
) -> Result<String> {
    let file_name = sanitize_zip_file_name(file_name);
    let zip_bytes = export_skin_zip_bytes(app, settings_id)?;

    let export_dir = app
        .path()
        .app_data_dir()
        .context("获取 App 数据目录失败")?
        .join("exports");
    fs::create_dir_all(&export_dir)
        .with_context(|| format!("创建导出目录失败：{}", export_dir.display()))?;

    let path = export_dir.join(file_name);
    fs::write(&path, &zip_bytes)
        .with_context(|| format!("写入导出文件失败：{}", path.display()))?;
    Ok(path.to_string_lossy().to_string())
}

fn skins_root(app: &AppHandle) -> Result<PathBuf> {
    let dir = app.path().app_data_dir().context("获取 App 数据目录失败")?;
    Ok(dir.join(CUSTOM_SKINS_DIR_NAME))
}

fn generate_id() -> String {
    let random: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(8)
        .map(char::from)
        .collect();
    format!(
        "skin_{}_{}",
        chrono::Utc::now().timestamp_millis(),
        random.to_lowercase()
    )
}

fn normalize_name(name: Option<String>) -> Option<String> {
    let name = name?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return None;
    }
    let normalized = trimmed
        .strip_suffix(".czs")
        .or_else(|| trimmed.strip_suffix(".CZS"))
        .or_else(|| trimmed.strip_suffix(".zip"))
        .or_else(|| trimmed.strip_suffix(".ZIP"))
        .unwrap_or(trimmed);
    let clipped: String = normalized.chars().take(32).collect();
    Some(clipped)
}

fn is_safe_id(id: &str) -> bool {
    if id.is_empty() || id.len() > 64 {
        return false;
    }
    id.chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
}

#[derive(Debug, Clone)]
struct SpriteSheetAsset {
    file_name: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Clone, Copy)]
enum SpriteImageKind {
    Png,
    Jpeg,
}

fn detect_sprite_image_kind(bytes: &[u8]) -> Result<SpriteImageKind> {
    if bytes.len() >= 8 && bytes[..8] == [137, 80, 78, 71, 13, 10, 26, 10] {
        return Ok(SpriteImageKind::Png);
    }
    if bytes.len() >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
        return Ok(SpriteImageKind::Jpeg);
    }
    Err(anyhow!(
        "sprite.* 不是有效图片格式（仅支持 PNG/JPEG，请不要仅修改扩展名）"
    ))
}

fn canonical_sprite_file_name(kind: SpriteImageKind) -> &'static str {
    match kind {
        SpriteImageKind::Png => SPRITE_SHEET_PNG_FILE_NAME,
        SpriteImageKind::Jpeg => SPRITE_SHEET_JPG_FILE_NAME,
    }
}

fn extract_skin_assets(
    zip_bytes: &[u8],
) -> Result<(Option<Vec<u8>>, Option<Vec<u8>>, Option<SpriteSheetAsset>, Option<Vec<u8>>)> {
    let mut archive = ZipArchive::new(Cursor::new(zip_bytes))
        .context("Zip 解析失败（可能不是有效的 zip 文件）")?;

    let mut muyu: Option<Vec<u8>> = None;
    let mut hammer: Option<Vec<u8>> = None;
    let mut sprite_sheet: Option<SpriteSheetAsset> = None;
    let mut manifest: Option<Vec<u8>> = None;

    for i in 0..archive.len() {
        let file = archive.by_index(i).context("读取 zip 条目失败")?;
        if file.is_dir() {
            continue;
        }
        let name = file.name().to_string();
        let Some(filename) = Path::new(&name).file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        let filename = filename.to_ascii_lowercase();

        if filename != MUYU_FILE_NAME
            && filename != HAMMER_FILE_NAME
            && filename != SPRITE_SHEET_PNG_FILE_NAME
            && filename != SPRITE_SHEET_JPG_FILE_NAME
            && filename != SPRITE_SHEET_JPEG_FILE_NAME
            && filename != MANIFEST_FILE_NAME
        {
            continue;
        }

        if filename == MANIFEST_FILE_NAME {
            if manifest.is_some() {
                return Err(anyhow!("Zip 内包含多个 manifest.json"));
            }
            let mut buf = Vec::new();
            let mut limited = file.take((MAX_MANIFEST_BYTES + 1) as u64);
            limited
                .read_to_end(&mut buf)
                .context("读取 zip 文件内容失败")?;
            if buf.len() > MAX_MANIFEST_BYTES {
                return Err(anyhow!("manifest.json 过大"));
            }
            manifest = Some(buf);
            continue;
        }

        let max_bytes = if filename == SPRITE_SHEET_PNG_FILE_NAME
            || filename == SPRITE_SHEET_JPG_FILE_NAME
            || filename == SPRITE_SHEET_JPEG_FILE_NAME
        {
            MAX_SPRITE_SHEET_BYTES
        } else {
            MAX_IMAGE_BYTES
        };

        let mut buf = Vec::new();
        let mut limited = file.take((max_bytes + 1) as u64);
        limited
            .read_to_end(&mut buf)
            .context("读取 zip 文件内容失败")?;
        if buf.len() > max_bytes {
            let label = if filename == MUYU_FILE_NAME {
                MUYU_FILE_NAME
            } else if filename == HAMMER_FILE_NAME {
                HAMMER_FILE_NAME
            } else {
                "sprite.*"
            };
            return Err(anyhow!("{} 图片过大（最大 {}MB）", label, max_bytes / 1024 / 1024));
        }

        if filename == MUYU_FILE_NAME {
            if muyu.is_some() {
                return Err(anyhow!("Zip 内包含多个 muyu.png"));
            }
            muyu = Some(buf);
        } else if filename == HAMMER_FILE_NAME {
            if hammer.is_some() {
                return Err(anyhow!("Zip 内包含多个 hammer.png"));
            }
            hammer = Some(buf);
        } else {
            if sprite_sheet.is_some() {
                return Err(anyhow!("Zip 内包含多个 sprite.*（sprite.png / sprite.jpg / sprite.jpeg）"));
            }
            // Normalize by bytes, so a mislabeled `sprite.png` (actually JPEG) still works.
            let kind = detect_sprite_image_kind(&buf)?;
            sprite_sheet = Some(SpriteSheetAsset {
                file_name: canonical_sprite_file_name(kind).to_string(),
                bytes: buf,
            });
        }
    }

    if sprite_sheet.is_none() && (muyu.is_none() || hammer.is_none()) {
        if muyu.is_none() {
            return Err(anyhow!("Zip 内缺少 muyu.png（需要与项目默认文件名一致）"));
        }
        return Err(anyhow!("Zip 内缺少 hammer.png（需要与项目默认文件名一致）"));
    }

    Ok((muyu, hammer, sprite_sheet, manifest))
}

fn build_skin_zip(
    manifest_json: &[u8],
    muyu_png: Option<&[u8]>,
    hammer_png: Option<&[u8]>,
    sprite_sheet: Option<(&str, &[u8])>,
) -> Result<Vec<u8>> {
    let mut out = Cursor::new(Vec::<u8>::new());
    let mut writer = ZipWriter::new(&mut out);

    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);

    writer
        .start_file(MANIFEST_FILE_NAME, options)
        .context("创建 zip 条目 manifest.json 失败")?;
    std::io::Write::write_all(&mut writer, manifest_json).context("写入 zip 条目 manifest.json 失败")?;

    if let Some(muyu_png) = muyu_png {
        writer
            .start_file(MUYU_FILE_NAME, options)
            .context("创建 zip 条目 muyu.png 失败")?;
        std::io::Write::write_all(&mut writer, muyu_png).context("写入 zip 条目 muyu.png 失败")?;
    }

    if let Some(hammer_png) = hammer_png {
        writer
            .start_file(HAMMER_FILE_NAME, options)
            .context("创建 zip 条目 hammer.png 失败")?;
        std::io::Write::write_all(&mut writer, hammer_png).context("写入 zip 条目 hammer.png 失败")?;
    }

    if let Some((sprite_file_name, sprite_bytes)) = sprite_sheet {
        writer
            .start_file(sprite_file_name, options)
            .with_context(|| format!("创建 zip 条目 {} 失败", sprite_file_name))?;
        std::io::Write::write_all(&mut writer, sprite_bytes)
            .with_context(|| format!("写入 zip 条目 {} 失败", sprite_file_name))?;
    }

    writer.finish().context("完成 zip 写入失败")?;
    let bytes = out.into_inner();
    if bytes.len() > MAX_ZIP_BYTES {
        return Err(anyhow!(
            "Zip 过大（最大 {}MB）",
            MAX_ZIP_BYTES / 1024 / 1024
        ));
    }
    Ok(bytes)
}

fn export_skin_zip_bytes(app: &AppHandle, settings_id: &str) -> Result<Vec<u8>> {
    let (mut manifest, muyu_png, hammer_png, sprite_sheet) = load_skin_assets(app, settings_id)?;

    if let (Some(ref muyu_png), Some(ref hammer_png)) = (&muyu_png, &hammer_png) {
        let (muyu_w, muyu_h) = png_dimensions(muyu_png).context("muyu.png 不是有效的 PNG")?;
        let (hammer_w, hammer_h) = png_dimensions(hammer_png).context("hammer.png 不是有效的 PNG")?;
        if (muyu_w, muyu_h) != EXPECTED_MUYU_DIMENSIONS {
            return Err(anyhow!(
                "muyu.png 尺寸不匹配：期望 {}x{}，实际 {}x{}",
                EXPECTED_MUYU_DIMENSIONS.0,
                EXPECTED_MUYU_DIMENSIONS.1,
                muyu_w,
                muyu_h
            ));
        }
        if (hammer_w, hammer_h) != EXPECTED_HAMMER_DIMENSIONS {
            return Err(anyhow!(
                "hammer.png 尺寸不匹配：期望 {}x{}，实际 {}x{}",
                EXPECTED_HAMMER_DIMENSIONS.0,
                EXPECTED_HAMMER_DIMENSIONS.1,
                hammer_w,
                hammer_h
            ));
        }
    } else if sprite_sheet.is_none() {
        return Err(anyhow!("当前皮肤缺少可导出的资源（需要 muyu.png+hammer.png 或 sprite.*）"));
    }

    if let Some((ref sprite_sheet_name, ref sprite_sheet_bytes)) = sprite_sheet {
        let cols = manifest
            .sprite_sheet
            .as_ref()
            .and_then(|c| c.columns)
            .filter(|v| *v >= 1)
            .unwrap_or(EXPECTED_SPRITE_COLUMNS);
        let rows = manifest
            .sprite_sheet
            .as_ref()
            .and_then(|c| c.rows)
            .filter(|v| *v >= 1)
            .unwrap_or(EXPECTED_SPRITE_ROWS);
        validate_sprite_sheet_image(sprite_sheet_bytes, cols, rows)?;
        if let Some(ref mut cfg) = manifest.sprite_sheet {
            cfg.file = Some(sprite_sheet_name.clone());
        }
    }

    let manifest_json = serde_json::to_vec_pretty(&manifest).context("序列化 manifest 失败")?;

    build_skin_zip(
        &manifest_json,
        muyu_png.as_deref(),
        hammer_png.as_deref(),
        sprite_sheet
            .as_ref()
            .map(|(name, bytes)| (name.as_str(), bytes.as_slice())),
    )
}

fn load_skin_assets(
    app: &AppHandle,
    settings_id: &str,
) -> Result<(SkinManifestV2, Option<Vec<u8>>, Option<Vec<u8>>, Option<(String, Vec<u8>)>)> {
    match settings_id {
        "rosewood" => Ok((
            SkinManifestV2 {
                schema_version: 2,
                id: "rosewood".to_string(),
                name: "rosewood".to_string(),
                created_at_ms: 0,
                sprite_sheet: None,
            },
            Some(include_bytes!("../../../src/assets/rosewood/muyu.png").to_vec()),
            Some(include_bytes!("../../../src/assets/rosewood/hammer.png").to_vec()),
            None,
        )),
        "wood" => Ok((
            SkinManifestV2 {
                schema_version: 2,
                id: "wood".to_string(),
                name: "wood".to_string(),
                created_at_ms: 0,
                sprite_sheet: None,
            },
            Some(include_bytes!("../../../src/assets/wood/muyu.png").to_vec()),
            Some(include_bytes!("../../../src/assets/wood/hammer.png").to_vec()),
            None,
        )),
        _ => {
            let Some(raw_id) = parse_custom_skin_settings_id(settings_id) else {
                return Err(anyhow!("未知皮肤 ID"));
            };
            if !is_safe_id(raw_id) {
                return Err(anyhow!("非法皮肤 ID"));
            }
            let root = skins_root(app)?;
            let dir = root.join(raw_id);
            let manifest_path = dir.join(MANIFEST_FILE_NAME);
            let Some(mut manifest) = read_manifest_v2(&manifest_path, raw_id) else {
                return Err(anyhow!("manifest.json 无效或缺失"));
            };
            let muyu_png = fs::read(dir.join(MUYU_FILE_NAME)).ok();
            let hammer_png = fs::read(dir.join(HAMMER_FILE_NAME)).ok();
            let sprite_sheet = {
                let candidates = [
                    dir.join(SPRITE_SHEET_PNG_FILE_NAME),
                    dir.join(SPRITE_SHEET_JPG_FILE_NAME),
                    dir.join(SPRITE_SHEET_JPEG_FILE_NAME),
                ];
                if let Some(path) = candidates.into_iter().find(|p| p.is_file()) {
                    let file_name = path
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or(SPRITE_SHEET_PNG_FILE_NAME)
                        .to_string();
                    let bytes =
                        fs::read(&path).with_context(|| format!("读取 {} 失败", file_name))?;
                    Some((file_name, bytes))
                } else {
                    None
                }
            };

            if let Some(ref bytes) = muyu_png {
                if bytes.len() > MAX_IMAGE_BYTES {
                    return Err(anyhow!(
                        "muyu.png 图片过大（最大 {}MB）",
                        MAX_IMAGE_BYTES / 1024 / 1024
                    ));
                }
            }
            if let Some(ref bytes) = hammer_png {
                if bytes.len() > MAX_IMAGE_BYTES {
                    return Err(anyhow!(
                        "hammer.png 图片过大（最大 {}MB）",
                        MAX_IMAGE_BYTES / 1024 / 1024
                    ));
                }
            }

            if let Some((_, ref bytes)) = sprite_sheet {
                if bytes.len() > MAX_SPRITE_SHEET_BYTES {
                    return Err(anyhow!(
                        "sprite.* 图片过大（最大 {}MB）",
                        MAX_SPRITE_SHEET_BYTES / 1024 / 1024
                    ));
                }
            }

            if sprite_sheet.is_none() && (muyu_png.is_none() || hammer_png.is_none()) {
                return Err(anyhow!("皮肤资源不完整（需要 muyu.png+hammer.png 或 sprite.*）"));
            }

            // Make sure we keep spritesheet config consistent with the actual file present.
            if sprite_sheet.is_some() && manifest.sprite_sheet.is_none() {
                manifest.sprite_sheet = Some(SpriteSheetConfigV2 {
                    file: None,
                    mode: Some("replace".to_string()),
                    columns: Some(EXPECTED_SPRITE_COLUMNS),
                    rows: Some(EXPECTED_SPRITE_ROWS),
                    chroma_key: Some(true),
                    chroma_key_algorithm: Some("yuv".to_string()),
                    chroma_key_options: None,
                    remove_grid_lines: Some(true),
                    image_smoothing_enabled: Some(true),
                    idle_breathe: Some(true),
                    behavior: Some("pet".to_string()),
                    idle_mood: Some("idle".to_string()),
                    hit_mood: Some("excited".to_string()),
                    pet: None,
                });
            }

            if sprite_sheet.is_none() && manifest.sprite_sheet.is_some() {
                manifest.sprite_sheet = None;
            }

            Ok((manifest, muyu_png, hammer_png, sprite_sheet))
        }
    }
}

fn validate_sprite_sheet_image(bytes: &[u8], columns: u32, rows: u32) -> Result<()> {
    if columns < 1 || rows < 1 {
        return Err(anyhow!("sprite.* 网格非法：{}x{}", columns, rows));
    }
    let (w, h) = image_dimensions(bytes).context("sprite.* 不是有效图片（仅支持 PNG/JPEG）")?;
    validate_sprite_sheet_dimensions(w, h, columns, rows)
}

fn validate_sprite_sheet_dimensions(w: u32, h: u32, columns: u32, rows: u32) -> Result<()> {
    let min_w = columns * SPRITE_MIN_FRAME_SIZE_PX;
    let min_h = rows * SPRITE_MIN_FRAME_SIZE_PX;
    if w < min_w || h < min_h {
        return Err(anyhow!(
            "sprite.* 尺寸过小：最小 {}x{}（每帧至少 {}px），实际 {}x{}",
            min_w,
            min_h,
            SPRITE_MIN_FRAME_SIZE_PX,
            w,
            h
        ));
    }

    let aspect = w as f64 / h as f64;
    let expected = columns as f64 / rows as f64;
    let ratio_diff = (aspect / expected - 1.0).abs();
    if ratio_diff > SPRITE_ASPECT_RATIO_TOLERANCE {
        return Err(anyhow!(
            "sprite.* 宽高比不匹配：期望 {}:{}（≈{:.4}），实际 {:.4}（{}x{}）",
            columns,
            rows,
            expected,
            aspect,
            w,
            h
        ));
    }

    Ok(())
}

fn sprite_sheet_cache_file_path(skin_dir: &Path) -> PathBuf {
    skin_dir
        .join(SPRITE_SHEET_CACHE_DIR_NAME)
        .join(SPRITE_SHEET_CACHE_FILE_NAME)
}

fn sanitize_zip_file_name(file_name: &str) -> String {
    let name = file_name.trim();
    let name = Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("wooden-fish-skin.czs");
    let mut out: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    out = out.trim().to_string();
    if out.is_empty() {
        out = "wooden-fish-skin.czs".to_string();
    }
    let lower = out.to_ascii_lowercase();
    if !lower.ends_with(".zip") && !lower.ends_with(".czs") {
        out.push_str(".czs");
    }
    if out.len() > 80 {
        out.truncate(80);
        let lower = out.to_ascii_lowercase();
        if !lower.ends_with(".zip") && !lower.ends_with(".czs") {
            out.push_str(".czs");
        }
    }
    out
}

fn png_dimensions(bytes: &[u8]) -> Result<(u32, u32)> {
    // PNG signature (8 bytes)
    const SIG: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];
    if bytes.len() < 24 {
        return Err(anyhow!("PNG 文件过小"));
    }
    if bytes[..8] != SIG {
        let hint = if bytes.len() >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
            "（检测到 JPEG/JFIF，可能是把 .jpg 重命名成了 .png）"
        } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
            "（检测到 WebP，可能是把 .webp 重命名成了 .png）"
        } else if bytes.len() >= 6 && (&bytes[0..6] == b"GIF87a" || &bytes[0..6] == b"GIF89a") {
            "（检测到 GIF，可能是把 .gif 重命名成了 .png）"
        } else {
            ""
        };
        return Err(anyhow!("PNG 签名不匹配{hint}"));
    }

    // IHDR: length(4) + type(4) + data(13) + crc(4)
    // width/height are first 8 bytes in IHDR data.
    let chunk_type = &bytes[12..16];
    if chunk_type != b"IHDR" {
        return Err(anyhow!("PNG 缺少 IHDR"));
    }
    let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
    if width == 0 || height == 0 {
        return Err(anyhow!("PNG 尺寸非法"));
    }
    Ok((width, height))
}

fn image_dimensions(bytes: &[u8]) -> Result<(u32, u32)> {
    // PNG signature (8 bytes)
    if bytes.len() >= 8 && bytes[..8] == [137, 80, 78, 71, 13, 10, 26, 10] {
        return png_dimensions(bytes);
    }
    // JPEG SOI
    if bytes.len() >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
        return jpeg_dimensions(bytes);
    }
    Err(anyhow!("不支持的图片格式（仅支持 PNG/JPEG）"))
}

fn jpeg_dimensions(bytes: &[u8]) -> Result<(u32, u32)> {
    if bytes.len() < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 {
        return Err(anyhow!("JPEG 签名不匹配"));
    }

    let mut i: usize = 2;
    while i + 1 < bytes.len() {
        // Find marker prefix.
        if bytes[i] != 0xFF {
            i += 1;
            continue;
        }

        // Skip padding FFs.
        while i < bytes.len() && bytes[i] == 0xFF {
            i += 1;
        }
        if i >= bytes.len() {
            break;
        }

        let marker = bytes[i];
        i += 1;

        // Markers without length.
        if marker == 0xD9 || marker == 0xDA {
            break;
        }
        if marker == 0x01 || (0xD0..=0xD7).contains(&marker) {
            continue;
        }

        if i + 1 >= bytes.len() {
            break;
        }
        let seg_len = u16::from_be_bytes([bytes[i], bytes[i + 1]]) as usize;
        if seg_len < 2 {
            return Err(anyhow!("JPEG 分段长度非法"));
        }
        let seg_start = i;
        let seg_end = seg_start + seg_len;
        if seg_end > bytes.len() {
            return Err(anyhow!("JPEG 分段超出文件长度"));
        }

        let is_sof = matches!(
            marker,
            0xC0..=0xC3 | 0xC5..=0xC7 | 0xC9..=0xCB | 0xCD..=0xCF
        );
        if is_sof {
            if seg_len < 8 {
                return Err(anyhow!("JPEG SOF 分段过短"));
            }
            // seg_start points to the 2-byte length; layout:
            // [len_hi, len_lo, precision, h_hi, h_lo, w_hi, w_lo, components...]
            let height =
                u16::from_be_bytes([bytes[seg_start + 3], bytes[seg_start + 4]]) as u32;
            let width = u16::from_be_bytes([bytes[seg_start + 5], bytes[seg_start + 6]]) as u32;
            if width == 0 || height == 0 {
                return Err(anyhow!("JPEG 尺寸非法"));
            }
            return Ok((width, height));
        }

        i = seg_end;
    }

    Err(anyhow!("JPEG 缺少尺寸信息"))
}
