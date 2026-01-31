use crate::core;

#[tauri::command]
pub async fn get_perf_snapshot() -> Result<serde_json::Value, String> {
    // Use Value to keep this command stable even if we add fields later.
    let snap = core::perf::snapshot();
    serde_json::to_value(snap).map_err(|e| format!("Failed to serialize perf snapshot: {}", e))
}

#[tauri::command]
pub async fn set_perf_enabled(enabled: bool) -> Result<(), String> {
    core::perf::set_enabled(enabled)
}
