use crate::core::merit_batcher::enqueue_merit_trigger;
use crate::core::suppress_mouse_for;
use crate::core::MeritStorage;
use crate::models::{DailyStats, InputOrigin, InputSource, MeritStats};
use tauri::AppHandle;

#[tauri::command]
pub async fn get_merit_stats() -> Result<MeritStats, String> {
    let storage = MeritStorage::instance();
    let storage = storage.read();
    Ok(storage.get_stats())
}

#[tauri::command]
pub async fn get_recent_days(days: usize) -> Result<Vec<DailyStats>, String> {
    let storage = MeritStorage::instance();
    let storage = storage.read();
    let stats = storage.get_stats();
    Ok(stats.get_recent_days(days).into_iter().cloned().collect())
}

#[tauri::command]
pub async fn add_merit(
    app_handle: AppHandle,
    source: InputSource,
    count: u64,
) -> Result<(), String> {
    // Avoid double counting when the user clicks inside the app while global mouse listening is on.
    if matches!(source, InputSource::MouseSingle) {
        suppress_mouse_for(180);
    }

    let app = crate::core::active_app::AppContext::for_self(&app_handle);
    enqueue_merit_trigger(
        app_handle,
        InputOrigin::App,
        source,
        count,
        None,
        None,
        None,
        Some(app),
    );
    Ok(())
}

#[tauri::command]
pub async fn clear_history(app_handle: AppHandle) -> Result<(), String> {
    let storage = MeritStorage::instance();
    let mut storage = storage.write();
    storage.clear_history(&app_handle);
    Ok(())
}

#[tauri::command]
pub async fn reset_all_merit(app_handle: AppHandle) -> Result<(), String> {
    let storage = MeritStorage::instance();
    let mut storage = storage.write();
    storage.reset_all(&app_handle);
    Ok(())
}
