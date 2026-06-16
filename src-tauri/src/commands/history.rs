use crate::error::AppResult;
use crate::models::history::BuildHistoryRecord;
use crate::repositories::history_repo;
use crate::services::{app_logger, blocking};
use tauri::AppHandle;

#[tauri::command]
pub async fn list_build_history(app: AppHandle) -> AppResult<Vec<BuildHistoryRecord>> {
    let task_app = app.clone();
    let result = blocking::run(move || history_repo::list(&task_app)).await;
    match &result {
        Ok(records) => app_logger::log_info(
            &app,
            "history.list.success",
            format!("count={}", records.len()),
        ),
        Err(error) => {
            app_logger::log_error(&app, "history.list.failed", format!("error={}", error));
        }
    }
    result
}

#[tauri::command]
pub async fn save_build_history(app: AppHandle, record: BuildHistoryRecord) -> AppResult<()> {
    app_logger::log_info(
        &app,
        "history.save.start",
        format!(
            "id={}, project_root={}, module_path={}, status={}, duration_ms={}",
            record.id, record.project_root, record.module_path, record.status, record.duration_ms
        ),
    );
    let task_app = app.clone();
    let result = blocking::run(move || history_repo::save(&task_app, record)).await;
    if let Err(error) = &result {
        app_logger::log_error(&app, "history.save.failed", format!("error={}", error));
    }
    result
}

#[tauri::command]
pub async fn delete_build_history(app: AppHandle, history_id: String) -> AppResult<()> {
    app_logger::log_info(&app, "history.delete.start", format!("id={}", history_id));
    let task_app = app.clone();
    let result = blocking::run(move || history_repo::delete(&task_app, &history_id)).await;
    if let Err(error) = &result {
        app_logger::log_error(&app, "history.delete.failed", format!("error={}", error));
    }
    result
}
