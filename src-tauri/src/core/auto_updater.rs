use crate::core::{activity, app_updater, MeritStorage};
use std::time::Duration;
use tauri::AppHandle;
use tauri::Manager;

const STARTUP_GRACE: Duration = Duration::from_secs(20);
const IDLE_REQUIRED: Duration = Duration::from_secs(60);
const POLL_INTERVAL: Duration = Duration::from_secs(10);
const MAX_FAILURE_RETRIES: u8 = 3;

fn auto_update_enabled() -> bool {
    let storage = MeritStorage::instance();
    let storage = storage.read();
    storage.get_settings().auto_update_enabled
}

fn any_window_focused(app_handle: &AppHandle) -> bool {
    for label in ["main", "settings", "custom_statistics", "logs"] {
        let Some(window) = app_handle.get_webview_window(label) else {
            continue;
        };
        if window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false) {
            return true;
        }
    }
    false
}

fn is_idle_enough(app_handle: &AppHandle) -> bool {
    if activity::idle_for_ms() < IDLE_REQUIRED.as_millis() as u64 {
        return false;
    }
    !any_window_focused(app_handle)
}

pub fn init(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(STARTUP_GRACE).await;

        let mut failures: u8 = 0;
        loop {
            tokio::time::sleep(POLL_INTERVAL).await;

            if failures >= MAX_FAILURE_RETRIES {
                return;
            }

            if app_updater::is_update_in_progress() {
                continue;
            }

            if !auto_update_enabled() {
                continue;
            }

            if !is_idle_enough(&app_handle) {
                continue;
            }

            let update = match app_updater::check_update(&app_handle).await {
                Ok(update) => update,
                Err(_) => {
                    failures = failures.saturating_add(1);
                    tokio::time::sleep(Duration::from_secs(30 * failures as u64)).await;
                    continue;
                }
            };

            if update.is_none() {
                return;
            }

            if let Err(_) = app_updater::download_and_install_update(&app_handle).await {
                failures = failures.saturating_add(1);
                tokio::time::sleep(Duration::from_secs(30 * failures as u64)).await;
                continue;
            }

            return;
        }
    });
}
