use anyhow::{anyhow, Context, Result};
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const LIVE2D_MODELS_DIR_NAME: &str = "live2d";
const META_FILE_NAME: &str = "meta.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Live2DModelMeta {
    pub uuid: String,
    pub name: String,
    pub model_path: String,
    pub model_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Live2DOverlayImage {
    pub key: String,
    pub group: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Live2DResourceManifest {
    pub background_path: Option<String>,
    pub overlay_images: Vec<Live2DOverlayImage>,
}

pub fn models_dir(app_handle: &AppHandle) -> Result<PathBuf> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| anyhow!("{e}"))?
        .join(LIVE2D_MODELS_DIR_NAME);
    fs::create_dir_all(&dir)
        .with_context(|| format!("Failed to create Live2D models dir: {}", dir.display()))?;
    Ok(dir)
}

pub fn import(app_handle: &AppHandle, src_dir: &str) -> Result<Live2DModelMeta> {
    let root = models_dir(app_handle)?;
    import_model_into_root(&root, Path::new(src_dir))
}

pub fn list(app_handle: &AppHandle) -> Result<Vec<Live2DModelMeta>> {
    let root = models_dir(app_handle)?;
    list_models_from_root(&root)
}

pub fn delete(app_handle: &AppHandle, uuid: &str) -> Result<()> {
    let root = models_dir(app_handle)?;
    delete_model_from_root(&root, uuid)
}

pub fn read_model_json(app_handle: &AppHandle, uuid: &str) -> Result<String> {
    let root = models_dir(app_handle)?;
    read_model_json_from_root(&root, uuid)
}

pub fn read_model_resources(app_handle: &AppHandle, uuid: &str) -> Result<Live2DResourceManifest> {
    let root = models_dir(app_handle)?;
    read_model_resources_from_root(&root, uuid)
}

fn import_model_into_root(root: &Path, src_dir: &Path) -> Result<Live2DModelMeta> {
    if !src_dir.is_dir() {
        return Err(anyhow!(
            "Live2D source directory does not exist: {}",
            src_dir.display()
        ));
    }

    fs::create_dir_all(root)
        .with_context(|| format!("Failed to create Live2D root dir: {}", root.display()))?;

    let model_file = find_model_file_relative(src_dir)?
        .ok_or_else(|| anyhow!("No .model3.json found in directory: {}", src_dir.display()))?;
    let uuid = generate_model_id();
    let name = src_dir
        .file_name()
        .and_then(|name| name.to_str())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| uuid.clone());
    let dest_dir = root.join(&uuid);

    copy_dir_all(src_dir, &dest_dir).with_context(|| {
        format!(
            "Failed to copy Live2D model from {} to {}",
            src_dir.display(),
            dest_dir.display()
        )
    })?;

    let meta = Live2DModelMeta {
        uuid,
        name,
        model_path: dest_dir.to_string_lossy().to_string(),
        model_file: model_file.to_string_lossy().to_string(),
    };
    write_meta(&dest_dir, &meta)?;
    Ok(meta)
}

fn list_models_from_root(root: &Path) -> Result<Vec<Live2DModelMeta>> {
    fs::create_dir_all(root)
        .with_context(|| format!("Failed to create Live2D root dir: {}", root.display()))?;

    let mut models = Vec::new();
    for entry in
        fs::read_dir(root).with_context(|| format!("Failed to read Live2D dir: {}", root.display()))?
    {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let meta = match read_meta(&path) {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        if !path.join(&meta.model_file).is_file() {
            continue;
        }
        models.push(meta);
    }

    models.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.uuid.cmp(&b.uuid)));
    Ok(models)
}

fn delete_model_from_root(root: &Path, uuid: &str) -> Result<()> {
    if !is_safe_model_id(uuid) {
        return Err(anyhow!("Invalid Live2D model id: {uuid}"));
    }

    let dir = root.join(uuid);
    if dir.exists() {
        fs::remove_dir_all(&dir)
            .with_context(|| format!("Failed to delete Live2D model dir: {}", dir.display()))?;
    }
    Ok(())
}

fn read_model_json_from_root(root: &Path, uuid: &str) -> Result<String> {
    if !is_safe_model_id(uuid) {
        return Err(anyhow!("Invalid Live2D model id: {uuid}"));
    }

    let dir = root.join(uuid);
    let meta = read_meta(&dir)?;
    let model_path = dir.join(&meta.model_file);
    fs::read_to_string(&model_path)
        .with_context(|| format!("Failed to read Live2D model json: {}", model_path.display()))
}

fn read_model_resources_from_root(root: &Path, uuid: &str) -> Result<Live2DResourceManifest> {
    if !is_safe_model_id(uuid) {
        return Err(anyhow!("Invalid Live2D model id: {uuid}"));
    }

    let dir = root.join(uuid);
    let _meta = read_meta(&dir)?;
    let resources_dir = dir.join("resources");
    let background_path = resources_dir
        .join("background.png")
        .is_file()
        .then(|| resources_dir.join("background.png").to_string_lossy().to_string());

    let mut overlay_images = Vec::new();
    for group in ["left-keys", "right-keys"] {
        let group_dir = resources_dir.join(group);
        if !group_dir.is_dir() {
            continue;
        }

        let mut entries = fs::read_dir(&group_dir)
            .with_context(|| format!("Failed to read Live2D resources dir: {}", group_dir.display()))?
            .collect::<std::result::Result<Vec<_>, _>>()
            .with_context(|| format!("Failed to iterate Live2D resources dir: {}", group_dir.display()))?;
        entries.sort_by_key(|entry| entry.path());

        for entry in entries {
            let path = entry.path();
            if !path.is_file() || !is_supported_resource_image(&path) {
                continue;
            }

            let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
                continue;
            };

            overlay_images.push(Live2DOverlayImage {
                key: stem.to_string(),
                group: group.to_string(),
                path: path.to_string_lossy().to_string(),
            });
        }
    }

    Ok(Live2DResourceManifest {
        background_path,
        overlay_images,
    })
}

fn read_meta(dir: &Path) -> Result<Live2DModelMeta> {
    let meta_path = dir.join(META_FILE_NAME);
    let content = fs::read_to_string(&meta_path)
        .with_context(|| format!("Failed to read Live2D meta file: {}", meta_path.display()))?;
    serde_json::from_str::<Live2DModelMeta>(&content)
        .with_context(|| format!("Failed to parse Live2D meta file: {}", meta_path.display()))
}

fn write_meta(dir: &Path, meta: &Live2DModelMeta) -> Result<()> {
    let meta_path = dir.join(META_FILE_NAME);
    let content = serde_json::to_string_pretty(meta).context("Failed to serialize Live2D meta")?;
    fs::write(&meta_path, content)
        .with_context(|| format!("Failed to write Live2D meta file: {}", meta_path.display()))
}

fn find_model_file_relative(root: &Path) -> Result<Option<PathBuf>> {
    fn walk(base: &Path, current: &Path) -> Result<Option<PathBuf>> {
        let mut entries = fs::read_dir(current)
            .with_context(|| format!("Failed to read Live2D source dir: {}", current.display()))?
            .collect::<std::result::Result<Vec<_>, _>>()
            .with_context(|| format!("Failed to iterate Live2D source dir: {}", current.display()))?;
        entries.sort_by_key(|entry| entry.path());

        for entry in entries {
            let path = entry.path();
            if path.is_dir() {
                if let Some(found) = walk(base, &path)? {
                    return Ok(Some(found));
                }
                continue;
            }
            if path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.ends_with(".model3.json"))
            {
                return Ok(Some(
                    path.strip_prefix(base)
                        .with_context(|| {
                            format!(
                                "Failed to compute relative model path for {}",
                                path.display()
                            )
                        })?
                        .to_path_buf(),
                ));
            }
        }
        Ok(None)
    }

    walk(root, root)
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<()> {
    fs::create_dir_all(dst)
        .with_context(|| format!("Failed to create Live2D destination dir: {}", dst.display()))?;
    for entry in
        fs::read_dir(src).with_context(|| format!("Failed to read source dir: {}", src.display()))?
    {
        let entry = entry.with_context(|| format!("Failed to read entry under {}", src.display()))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if entry
            .file_type()
            .with_context(|| format!("Failed to read file type for {}", src_path.display()))?
            .is_dir()
        {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path).with_context(|| {
                format!(
                    "Failed to copy Live2D asset from {} to {}",
                    src_path.display(),
                    dst_path.display()
                )
            })?;
        }
    }
    Ok(())
}

fn generate_model_id() -> String {
    let random = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(8)
        .map(char::from)
        .collect::<String>()
        .to_lowercase();
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("l2d_{ts}_{random}")
}

fn is_safe_model_id(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn is_supported_resource_image(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| matches!(ext.to_ascii_lowercase().as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn import_copies_model_and_writes_meta() {
        let root = unique_temp_dir("live2d-root");
        let src = unique_temp_dir("live2d-src");
        fs::create_dir_all(src.join("textures")).expect("create textures dir");
        fs::write(src.join("hero.model3.json"), r#"{"FileReferences":{"Textures":["textures/tex_00.png"]}}"#)
            .expect("write model json");
        fs::write(src.join("textures").join("tex_00.png"), b"png").expect("write texture");

        let meta = import_model_into_root(&root, &src).expect("import model");

        assert!(root.join(&meta.uuid).join("hero.model3.json").is_file());
        assert!(root.join(&meta.uuid).join("textures").join("tex_00.png").is_file());
        assert_eq!(meta.name, src.file_name().unwrap().to_string_lossy());
        assert_eq!(meta.model_file, "hero.model3.json");

        let listed = list_models_from_root(&root).expect("list models");
        assert_eq!(listed, vec![meta.clone()]);

        let stored_json = read_model_json_from_root(&root, &meta.uuid).expect("read model json");
        assert!(stored_json.contains("\"Textures\""));
    }

    #[test]
    fn import_supports_nested_model_file_paths() {
        let root = unique_temp_dir("live2d-root");
        let src = unique_temp_dir("live2d-src");
        fs::create_dir_all(src.join("model")).expect("create model dir");
        fs::write(
            src.join("model").join("nested.model3.json"),
            r#"{"FileReferences":{"Moc":"nested.moc3"}}"#,
        )
        .expect("write nested model json");

        let meta = import_model_into_root(&root, &src).expect("import nested model");

        assert_eq!(meta.model_file, format!("model{}nested.model3.json", std::path::MAIN_SEPARATOR));
        let json = read_model_json_from_root(&root, &meta.uuid).expect("read nested model json");
        assert!(json.contains("nested.moc3"));
    }

    #[test]
    fn import_rejects_directories_without_model3_json() {
        let root = unique_temp_dir("live2d-root");
        let src = unique_temp_dir("live2d-src");
        fs::write(src.join("readme.txt"), "no model here").expect("write readme");

        let err = import_model_into_root(&root, &src).expect_err("missing model3 should fail");
        assert!(err.to_string().contains(".model3.json"));
    }

    #[test]
    fn delete_removes_imported_model_directory() {
        let root = unique_temp_dir("live2d-root");
        let src = unique_temp_dir("live2d-src");
        fs::write(src.join("hero.model3.json"), "{}").expect("write model json");

        let meta = import_model_into_root(&root, &src).expect("import model");
        delete_model_from_root(&root, &meta.uuid).expect("delete model");

        assert!(!root.join(&meta.uuid).exists());
        assert!(list_models_from_root(&root).expect("list after delete").is_empty());
    }

    fn unique_temp_dir(prefix: &str) -> PathBuf {
        let salt = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let random = rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(6)
            .map(char::from)
            .collect::<String>()
            .to_lowercase();
        let dir = std::env::temp_dir().join(format!("{prefix}-{salt}-{random}"));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }
}
