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

const EXPECTED_MUYU_DIMENSIONS: (u32, u32) = (500, 350);
const EXPECTED_HAMMER_DIMENSIONS: (u32, u32) = (500, 150);

const MAX_ZIP_BYTES: usize = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomWoodenFishSkin {
    pub id: String,
    pub name: String,
    pub muyu_path: String,
    pub hammer_path: String,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SkinManifestV1 {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub created_at_ms: i64,
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
    dir.join(MUYU_FILE_NAME).is_file() && dir.join(HAMMER_FILE_NAME).is_file()
}

pub fn list_custom_skins(app: &AppHandle) -> Result<Vec<CustomWoodenFishSkin>> {
    let root = skins_root(app)?;
    fs::create_dir_all(&root).with_context(|| format!("Failed to create skins dir: {}", root.display()))?;

    let mut skins = Vec::new();
    for entry in fs::read_dir(&root).with_context(|| format!("Failed to read skins dir: {}", root.display()))? {
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
        let manifest: SkinManifestV1 = match fs::read_to_string(&manifest_path)
            .ok()
            .and_then(|s| serde_json::from_str::<SkinManifestV1>(&s).ok())
        {
            Some(m) if m.schema_version == 1 && m.id == id => m,
            _ => continue,
        };

        let muyu_path = path.join(MUYU_FILE_NAME);
        let hammer_path = path.join(HAMMER_FILE_NAME);
        if !muyu_path.is_file() || !hammer_path.is_file() {
            continue;
        }

        skins.push(CustomWoodenFishSkin {
            id: custom_skin_settings_id(&id),
            name: manifest.name,
            muyu_path: muyu_path.to_string_lossy().to_string(),
            hammer_path: hammer_path.to_string_lossy().to_string(),
            created_at_ms: manifest.created_at_ms,
        });
    }

    skins.sort_by(|a, b| b.created_at_ms.cmp(&a.created_at_ms));
    Ok(skins)
}

pub fn import_custom_skin_zip_base64(app: &AppHandle, zip_base64: &str, name: Option<String>) -> Result<CustomWoodenFishSkin> {
    let zip_base64 = zip_base64.trim();
    if zip_base64.is_empty() {
        return Err(anyhow!("Zip 内容为空"));
    }
    let zip_bytes = BASE64_STANDARD
        .decode(zip_base64.as_bytes())
        .context("Zip base64 解码失败")?;
    import_custom_skin_zip_bytes(app, &zip_bytes, name)
}

pub fn import_custom_skin_zip_bytes(app: &AppHandle, zip_bytes: &[u8], name: Option<String>) -> Result<CustomWoodenFishSkin> {
    if zip_bytes.is_empty() {
        return Err(anyhow!("Zip 内容为空"));
    }
    if zip_bytes.len() > MAX_ZIP_BYTES {
        return Err(anyhow!("Zip 过大（最大 {}MB）", MAX_ZIP_BYTES / 1024 / 1024));
    }

    let (muyu_png, hammer_png) = extract_required_pngs(zip_bytes)?;

    let (muyu_w, muyu_h) = png_dimensions(&muyu_png).context("muyu.png 不是有效的 PNG")?;
    let (hammer_w, hammer_h) = png_dimensions(&hammer_png).context("hammer.png 不是有效的 PNG")?;

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

    let root = skins_root(app)?;
    fs::create_dir_all(&root).with_context(|| format!("Failed to create skins dir: {}", root.display()))?;

    let raw_id = generate_id();
    let id_dir = root.join(&raw_id);
    let tmp_dir = root.join(format!("_tmp_{raw_id}"));
    if tmp_dir.exists() {
        let _ = fs::remove_dir_all(&tmp_dir);
    }

    fs::create_dir_all(&tmp_dir).with_context(|| format!("Failed to create temp dir: {}", tmp_dir.display()))?;

    let created_at_ms = chrono::Utc::now().timestamp_millis();
    let name = normalize_name(name).unwrap_or_else(|| "自定义皮肤".to_string());

    fs::write(tmp_dir.join(MUYU_FILE_NAME), &muyu_png).context("写入 muyu.png 失败")?;
    fs::write(tmp_dir.join(HAMMER_FILE_NAME), &hammer_png).context("写入 hammer.png 失败")?;

    let manifest = SkinManifestV1 {
        schema_version: 1,
        id: raw_id.clone(),
        name: name.clone(),
        created_at_ms,
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
        muyu_path: id_dir.join(MUYU_FILE_NAME).to_string_lossy().to_string(),
        hammer_path: id_dir.join(HAMMER_FILE_NAME).to_string_lossy().to_string(),
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

pub fn export_skin_zip_to_app_data(app: &AppHandle, settings_id: &str, file_name: &str) -> Result<String> {
    let file_name = sanitize_zip_file_name(file_name);
    let zip_bytes = export_skin_zip_bytes(app, settings_id)?;

    let export_dir = app
        .path()
        .app_data_dir()
        .context("获取 App 数据目录失败")?
        .join("exports");
    fs::create_dir_all(&export_dir).with_context(|| format!("创建导出目录失败：{}", export_dir.display()))?;

    let path = export_dir.join(file_name);
    fs::write(&path, &zip_bytes).with_context(|| format!("写入导出文件失败：{}", path.display()))?;
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
    format!("skin_{}_{}", chrono::Utc::now().timestamp_millis(), random.to_lowercase())
}

fn normalize_name(name: Option<String>) -> Option<String> {
    let name = name?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return None;
    }
    let normalized = trimmed.strip_suffix(".zip").or_else(|| trimmed.strip_suffix(".ZIP")).unwrap_or(trimmed);
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

fn extract_required_pngs(zip_bytes: &[u8]) -> Result<(Vec<u8>, Vec<u8>)> {
    let mut archive =
        ZipArchive::new(Cursor::new(zip_bytes)).context("Zip 解析失败（可能不是有效的 zip 文件）")?;

    let mut muyu: Option<Vec<u8>> = None;
    let mut hammer: Option<Vec<u8>> = None;

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

        if filename != MUYU_FILE_NAME && filename != HAMMER_FILE_NAME {
            continue;
        }

        let mut buf = Vec::new();
        let mut limited = file.take((MAX_IMAGE_BYTES + 1) as u64);
        limited.read_to_end(&mut buf).context("读取 zip 文件内容失败")?;
        if buf.len() > MAX_IMAGE_BYTES {
            return Err(anyhow!("图片过大（最大 {}MB）", MAX_IMAGE_BYTES / 1024 / 1024));
        }

        if filename == MUYU_FILE_NAME {
            if muyu.is_some() {
                return Err(anyhow!("Zip 内包含多个 muyu.png"));
            }
            muyu = Some(buf);
        } else {
            if hammer.is_some() {
                return Err(anyhow!("Zip 内包含多个 hammer.png"));
            }
            hammer = Some(buf);
        }
    }

    match (muyu, hammer) {
        (Some(muyu), Some(hammer)) => Ok((muyu, hammer)),
        (None, _) => Err(anyhow!("Zip 内缺少 muyu.png（需要与项目默认文件名一致）")),
        (_, None) => Err(anyhow!("Zip 内缺少 hammer.png（需要与项目默认文件名一致）")),
    }
}

fn build_skin_zip(muyu_png: &[u8], hammer_png: &[u8]) -> Result<Vec<u8>> {
    let mut out = Cursor::new(Vec::<u8>::new());
    let mut writer = ZipWriter::new(&mut out);

    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);

    writer
        .start_file(MUYU_FILE_NAME, options)
        .context("创建 zip 条目 muyu.png 失败")?;
    std::io::Write::write_all(&mut writer, muyu_png).context("写入 zip 条目 muyu.png 失败")?;

    writer
        .start_file(HAMMER_FILE_NAME, options)
        .context("创建 zip 条目 hammer.png 失败")?;
    std::io::Write::write_all(&mut writer, hammer_png).context("写入 zip 条目 hammer.png 失败")?;

    writer.finish().context("完成 zip 写入失败")?;
    let bytes = out.into_inner();
    if bytes.len() > MAX_ZIP_BYTES {
        return Err(anyhow!("Zip 过大（最大 {}MB）", MAX_ZIP_BYTES / 1024 / 1024));
    }
    Ok(bytes)
}

fn export_skin_zip_bytes(app: &AppHandle, settings_id: &str) -> Result<Vec<u8>> {
    let (muyu_png, hammer_png) = load_skin_pngs(app, settings_id)?;

    let (muyu_w, muyu_h) = png_dimensions(&muyu_png).context("muyu.png 不是有效的 PNG")?;
    let (hammer_w, hammer_h) = png_dimensions(&hammer_png).context("hammer.png 不是有效的 PNG")?;
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

    build_skin_zip(&muyu_png, &hammer_png)
}

fn load_skin_pngs(app: &AppHandle, settings_id: &str) -> Result<(Vec<u8>, Vec<u8>)> {
    match settings_id {
        "rosewood" => Ok((
            include_bytes!("../../../src/assets/rosewood/muyu.png").to_vec(),
            include_bytes!("../../../src/assets/rosewood/hammer.png").to_vec(),
        )),
        "wood" => Ok((
            include_bytes!("../../../src/assets/wood/muyu.png").to_vec(),
            include_bytes!("../../../src/assets/wood/hammer.png").to_vec(),
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
            let muyu_png = fs::read(dir.join(MUYU_FILE_NAME)).context("读取 muyu.png 失败")?;
            let hammer_png = fs::read(dir.join(HAMMER_FILE_NAME)).context("读取 hammer.png 失败")?;
            if muyu_png.len() > MAX_IMAGE_BYTES || hammer_png.len() > MAX_IMAGE_BYTES {
                return Err(anyhow!("图片过大（最大 {}MB）", MAX_IMAGE_BYTES / 1024 / 1024));
            }
            Ok((muyu_png, hammer_png))
        }
    }
}

fn sanitize_zip_file_name(file_name: &str) -> String {
    let name = file_name.trim();
    let name = Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("wooden-fish-skin.zip");
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
        out = "wooden-fish-skin.zip".to_string();
    }
    if !out.to_ascii_lowercase().ends_with(".zip") {
        out.push_str(".zip");
    }
    if out.len() > 80 {
        out.truncate(80);
        if !out.to_ascii_lowercase().ends_with(".zip") {
            out.push_str(".zip");
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
        return Err(anyhow!("PNG 签名不匹配"));
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
