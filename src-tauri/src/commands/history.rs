use crate::error::AppResult;
use crate::models::history::BuildHistoryRecord;
use crate::repositories::history_repo;
use tauri::AppHandle;

#[tauri::command]
pub fn list_build_history(app: AppHandle) -> AppResult<Vec<BuildHistoryRecord>> {
    history_repo::list(&app)
}

#[tauri::command]
pub fn save_build_history(app: AppHandle, record: BuildHistoryRecord) -> AppResult<()> {
    history_repo::save(&app, record)
}
