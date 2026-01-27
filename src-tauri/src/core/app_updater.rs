use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

pub const APP_UPDATE_DOWNLOAD_EVENT: &str = "app-update-download";

#[derive(Debug, Clone, Serialize)]
pub struct UpdateMetadata {
    pub version: String,
    pub body: Option<String>,
    pub date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum UpdateDownloadEventPayload {
    Started { downloaded: u64, total: Option<u64> },
    Progress { downloaded: u64, total: Option<u64> },
    Finished { downloaded: u64, total: Option<u64> },
}

static UPDATE_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

struct UpdateGuard;

impl UpdateGuard {
    fn try_acquire() -> Result<Self, String> {
        UPDATE_IN_PROGRESS
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "Update already in progress".to_string())?;
        Ok(Self)
    }
}

impl Drop for UpdateGuard {
    fn drop(&mut self) {
        UPDATE_IN_PROGRESS.store(false, Ordering::SeqCst);
    }
}

pub fn is_update_in_progress() -> bool {
    UPDATE_IN_PROGRESS.load(Ordering::SeqCst)
}

pub async fn check_update(app_handle: &AppHandle) -> Result<Option<UpdateMetadata>, String> {
    let updater = app_handle
        .updater()
        .map_err(|e| format!("Failed to init updater: {e}"))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Failed to check update: {e}"))?;

    Ok(update.map(|update| UpdateMetadata {
        version: update.version,
        body: update.body,
        date: update.date.map(|d| d.to_string()),
    }))
}

pub async fn download_and_install_update(app_handle: &AppHandle) -> Result<(), String> {
    let _guard = UpdateGuard::try_acquire()?;

    let updater = app_handle
        .updater()
        .map_err(|e| format!("Failed to init updater: {e}"))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Failed to check update: {e}"))?;

    let Some(update) = update else {
        return Err("No update available".to_string());
    };

    #[derive(Debug)]
    struct ProgressState {
        downloaded: u64,
        total: Option<u64>,
        first_chunk: bool,
        last_emit: Instant,
    }

    let progress = Arc::new(Mutex::new(ProgressState {
        downloaded: 0,
        total: None,
        first_chunk: true,
        last_emit: Instant::now()
            .checked_sub(Duration::from_millis(250))
            .unwrap_or_else(Instant::now),
    }));
    let progress_chunk = Arc::clone(&progress);
    let progress_finish = Arc::clone(&progress);

    update
        .download_and_install(
            move |chunk_length, content_length| {
                let (emit_started, emit_progress) = {
                    let mut st = progress_chunk.lock().unwrap_or_else(|e| e.into_inner());
                    st.downloaded = st.downloaded.saturating_add(chunk_length as u64);
                    if st.total.is_none() {
                        st.total = content_length;
                    }

                    let emit_started = if st.first_chunk {
                        st.first_chunk = false;
                        Some((0u64, st.total))
                    } else {
                        None
                    };

                    let should_emit = st.last_emit.elapsed() >= Duration::from_millis(150)
                        || st.total.is_some_and(|t| st.downloaded >= t);
                    let emit_progress = should_emit.then(|| (st.downloaded, st.total));
                    if should_emit {
                        st.last_emit = Instant::now();
                    }

                    (emit_started, emit_progress)
                };

                if let Some((downloaded, total)) = emit_started {
                    let _ = app_handle.emit(
                        APP_UPDATE_DOWNLOAD_EVENT,
                        UpdateDownloadEventPayload::Started {
                            downloaded,
                            total,
                        },
                    );
                }

                if let Some((downloaded, total)) = emit_progress {
                    let _ = app_handle.emit(
                        APP_UPDATE_DOWNLOAD_EVENT,
                        UpdateDownloadEventPayload::Progress {
                            downloaded,
                            total,
                        },
                    );
                }
            },
            move || {
                let (downloaded, total) = {
                    let st = progress_finish.lock().unwrap_or_else(|e| e.into_inner());
                    (st.downloaded, st.total)
                };
                let _ = app_handle.emit(
                    APP_UPDATE_DOWNLOAD_EVENT,
                    UpdateDownloadEventPayload::Finished { downloaded, total },
                );
            },
        )
        .await
        .map_err(|e| format!("Failed to download/install update: {e}"))?;

    app_handle.request_restart();
    Ok(())
}
