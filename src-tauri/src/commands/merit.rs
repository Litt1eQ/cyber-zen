use crate::core::merit_batcher::enqueue_merit_trigger;
use crate::core::suppress_mouse_for;
use crate::core::MeritStorage;
use crate::models::{DailyStats, DailyStatsLite, InputOrigin, InputSource, MeritStatsLite, StatisticsAggregates};
use tauri::AppHandle;

#[tauri::command]
pub async fn get_merit_stats() -> Result<MeritStatsLite, String> {
    let storage = MeritStorage::instance();
    let storage = storage.read();
    Ok(storage.get_stats().lite())
}

#[tauri::command]
pub async fn get_recent_days(days: usize) -> Result<Vec<DailyStats>, String> {
    let days = days.clamp(0, 4000);
    if days == 0 {
        return Ok(Vec::new());
    }

    let today = {
        let storage = MeritStorage::instance();
        let storage = storage.read();
        storage.get_stats().today
    };

    let mut out = Vec::with_capacity(days.min(1 + 4000));
    out.push(today.clone());

    let mut history = crate::core::history_db::load_recent_days(days.saturating_sub(1))?;
    history.retain(|d| d.date != today.date);
    out.extend(history.into_iter().take(days.saturating_sub(1)));
    Ok(out)
}

#[tauri::command]
pub async fn get_recent_days_lite(days: usize) -> Result<Vec<DailyStatsLite>, String> {
    let days = days.clamp(0, 4000);
    if days == 0 {
        return Ok(Vec::new());
    }

    let today = {
        let storage = MeritStorage::instance();
        let storage = storage.read();
        storage.get_stats().today.lite()
    };

    let mut out = Vec::with_capacity(days.min(1 + 4000));
    out.push(today.clone());

    let mut history = crate::core::history_db::load_recent_days_lite(days.saturating_sub(1))?;
    history.retain(|d| d.date != today.date);
    out.extend(history.into_iter().take(days.saturating_sub(1)));
    Ok(out)
}

#[tauri::command]
pub async fn get_history_aggregates(
    start_key: Option<String>,
    end_key: Option<String>,
) -> Result<StatisticsAggregates, String> {
    let start_key = start_key.and_then(|v| {
        let t = v.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    });
    let end_key = end_key.and_then(|v| {
        let t = v.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    });

    if let (Some(a), Some(b)) = (start_key.as_deref(), end_key.as_deref()) {
        if a > b {
            return Err("invalid date range: start_key > end_key".to_string());
        }
    }

    crate::core::history_db::load_statistics_aggregates(start_key.as_deref(), end_key.as_deref())
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
    crate::core::history_db::clear_daily_stats();
    let storage = MeritStorage::instance();
    let mut storage = storage.write();
    storage.clear_history(&app_handle);
    Ok(())
}

#[tauri::command]
pub async fn reset_all_merit(app_handle: AppHandle) -> Result<(), String> {
    crate::core::history_db::clear_daily_stats();
    let storage = MeritStorage::instance();
    let mut storage = storage.write();
    storage.reset_all(&app_handle);
    Ok(())
}
