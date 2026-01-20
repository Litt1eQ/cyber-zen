use crate::core::MeritStorage;
use crate::models::{AchievementState, AchievementUnlockRecord};
use tauri::AppHandle;

#[tauri::command]
pub async fn get_achievement_state() -> Result<AchievementState, String> {
    let storage = MeritStorage::instance();
    let storage = storage.read();
    Ok(storage.get_achievements())
}

#[tauri::command]
pub async fn append_achievement_unlocks(
    app_handle: AppHandle,
    records: Vec<AchievementUnlockRecord>,
) -> Result<Vec<AchievementUnlockRecord>, String> {
    let storage = MeritStorage::instance();
    let mut storage = storage.write();
    Ok(storage.append_achievement_unlocks(records, &app_handle))
}

#[tauri::command]
pub async fn clear_achievement_history(app_handle: AppHandle) -> Result<(), String> {
    let storage = MeritStorage::instance();
    let mut storage = storage.write();
    storage.clear_achievement_history(&app_handle);
    Ok(())
}

