use crate::error::AppResult;
use crate::models::release::{ReleaseRecord, ReleaseTemplate};
use crate::repositories::release_repo;
use crate::services::{app_logger, blocking};
use tauri::AppHandle;

#[tauri::command]
pub async fn list_release_templates(app: AppHandle) -> AppResult<Vec<ReleaseTemplate>> {
    let task_app = app.clone();
    let result = blocking::run(move || release_repo::list_templates(&task_app)).await;
    match &result {
        Ok(items) => app_logger::log_info(
            &app,
            "release.template.list.success",
            format!("count={}", items.len()),
        ),
        Err(error) => app_logger::log_error(
            &app,
            "release.template.list.failed",
            format!("error={}", error),
        ),
    }
    result
}

#[tauri::command]
pub async fn save_release_template(
    app: AppHandle,
    template: ReleaseTemplate,
) -> AppResult<ReleaseTemplate> {
    let task_app = app.clone();
    let result = blocking::run(move || release_repo::save_template(&task_app, template)).await;
    if let Err(error) = &result {
        app_logger::log_error(
            &app,
            "release.template.save.failed",
            format!("error={}", error),
        );
    }
    result
}

#[tauri::command]
pub async fn delete_release_template(app: AppHandle, template_id: String) -> AppResult<()> {
    let task_app = app.clone();
    let result =
        blocking::run(move || release_repo::delete_template(&task_app, &template_id)).await;
    if let Err(error) = &result {
        app_logger::log_error(
            &app,
            "release.template.delete.failed",
            format!("error={}", error),
        );
    }
    result
}

#[tauri::command]
pub async fn list_release_records(app: AppHandle) -> AppResult<Vec<ReleaseRecord>> {
    let task_app = app.clone();
    let result = blocking::run(move || release_repo::list_records(&task_app)).await;
    match &result {
        Ok(items) => app_logger::log_info(
            &app,
            "release.record.list.success",
            format!("count={}", items.len()),
        ),
        Err(error) => app_logger::log_error(
            &app,
            "release.record.list.failed",
            format!("error={}", error),
        ),
    }
    result
}

#[tauri::command]
pub async fn save_release_record(app: AppHandle, record: ReleaseRecord) -> AppResult<()> {
    let task_app = app.clone();
    let result = blocking::run(move || release_repo::save_record(&task_app, record)).await;
    if let Err(error) = &result {
        app_logger::log_error(
            &app,
            "release.record.save.failed",
            format!("error={}", error),
        );
    }
    result
}

#[tauri::command]
pub async fn delete_release_record(app: AppHandle, record_id: String) -> AppResult<()> {
    let task_app = app.clone();
    let result = blocking::run(move || release_repo::delete_record(&task_app, &record_id)).await;
    if let Err(error) = &result {
        app_logger::log_error(
            &app,
            "release.record.delete.failed",
            format!("error={}", error),
        );
    }
    result
}
