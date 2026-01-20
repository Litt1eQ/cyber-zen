use chrono::Utc;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

const LOG_FILE_NAME: &str = "app.log.jsonl";
const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;
const MAX_ROTATIONS: usize = 3;
const DEFAULT_TAIL_BYTES: u64 = 2 * 1024 * 1024;

static LOG_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppLogRecord {
    pub ts_ms: i64,
    pub level: String,
    pub scope: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

fn log_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to resolve log dir: {}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create log dir: {}", e))?;
    Ok(dir)
}

fn log_path(dir: &Path) -> PathBuf {
    dir.join(LOG_FILE_NAME)
}

fn rotated_path(dir: &Path, index: usize) -> PathBuf {
    dir.join(format!("app.log.{}.jsonl", index))
}

fn rotate_if_needed(dir: &Path) -> Result<(), String> {
    let path = log_path(dir);
    let Ok(meta) = fs::metadata(&path) else {
        return Ok(());
    };
    if meta.len() < MAX_LOG_BYTES {
        return Ok(());
    }

    let oldest = rotated_path(dir, MAX_ROTATIONS);
    if oldest.exists() {
        fs::remove_file(&oldest)
            .map_err(|e| format!("Failed to remove old log {}: {}", oldest.display(), e))?;
    }

    for i in (1..MAX_ROTATIONS).rev() {
        let src = rotated_path(dir, i);
        let dst = rotated_path(dir, i + 1);
        if src.exists() {
            fs::rename(&src, &dst)
                .map_err(|e| format!("Failed to rotate log ({} -> {}): {}", src.display(), dst.display(), e))?;
        }
    }

    let first = rotated_path(dir, 1);
    fs::rename(&path, &first)
        .map_err(|e| format!("Failed to rotate log ({} -> {}): {}", path.display(), first.display(), e))?;
    Ok(())
}

pub fn append(app: &AppHandle, record: AppLogRecord) -> Result<(), String> {
    let _guard = LOG_LOCK.lock();
    let dir = log_dir(app)?;
    rotate_if_needed(&dir)?;
    let path = log_path(&dir);

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    let line = serde_json::to_string(&record).map_err(|e| format!("Failed to serialize log record: {}", e))?;
    file.write_all(line.as_bytes())
        .and_then(|_| file.write_all(b"\n"))
        .map_err(|e| format!("Failed to write log record: {}", e))?;
    Ok(())
}

pub fn info(app: &AppHandle, scope: &str, message: &str) -> Result<(), String> {
    append(
        app,
        AppLogRecord {
            ts_ms: Utc::now().timestamp_millis(),
            level: "info".to_string(),
            scope: scope.to_string(),
            message: message.to_string(),
            data: None,
        },
    )
}

fn read_tail(path: &Path, max_bytes: u64) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open log file: {}", e))?;
    let size = file
        .metadata()
        .map_err(|e| format!("Failed to read log metadata: {}", e))?
        .len();

    let start = if size > max_bytes { size - max_bytes } else { 0 };
    file.seek(SeekFrom::Start(start))
        .map_err(|e| format!("Failed to seek log file: {}", e))?;

    let mut buf = String::new();
    file.read_to_string(&mut buf)
        .map_err(|e| format!("Failed to read log file: {}", e))?;

    if start > 0 {
        if let Some(idx) = buf.find('\n') {
            return Ok(buf[idx + 1..].to_string());
        }
        return Ok(String::new());
    }

    Ok(buf)
}

pub fn read(
    app: &AppHandle,
    limit: usize,
    query: Option<String>,
    tail_bytes: Option<u64>,
) -> Result<Vec<AppLogRecord>, String> {
    let _guard = LOG_LOCK.lock();
    let dir = log_dir(app)?;
    let q = query.map(|s| s.to_lowercase()).filter(|s| !s.trim().is_empty());
    let mut records = Vec::new();

    let mut paths: Vec<PathBuf> = (1..=MAX_ROTATIONS).rev().map(|i| rotated_path(&dir, i)).collect();
    paths.push(log_path(&dir));

    for path in paths {
        if !path.exists() {
            continue;
        }
        let content = read_tail(&path, tail_bytes.unwrap_or(DEFAULT_TAIL_BYTES))?;
        for line in content.lines() {
            let Ok(rec) = serde_json::from_str::<AppLogRecord>(line) else {
                continue;
            };
            if let Some(q) = &q {
                let hay = format!("{} {} {}", rec.level, rec.scope, rec.message).to_lowercase();
                if !hay.contains(q) {
                    continue;
                }
            }
            records.push(rec);
        }
    }

    if records.len() > limit {
        records.drain(0..records.len().saturating_sub(limit));
    }
    Ok(records)
}

pub fn clear(app: &AppHandle) -> Result<(), String> {
    let _guard = LOG_LOCK.lock();
    let dir = log_dir(app)?;

    let mut paths = vec![log_path(&dir)];
    for i in 1..=MAX_ROTATIONS {
        paths.push(rotated_path(&dir, i));
    }

    for p in paths {
        if p.exists() {
            fs::remove_file(&p).map_err(|e| format!("Failed to remove log file {}: {}", p.display(), e))?;
        }
    }
    Ok(())
}

pub fn install_panic_hook(app: AppHandle) {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "panic".to_string()
        };
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "unknown".to_string());

        let _ = append(
            &app,
            AppLogRecord {
                ts_ms: Utc::now().timestamp_millis(),
                level: "error".to_string(),
                scope: "panic".to_string(),
                message: format!("{} ({})", payload, location),
                data: None,
            },
        );

        prev(info);
    }));
}
