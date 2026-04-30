use crate::error::AppResult;
use crate::models::service_ops::{
    RemoteLogSession, ServiceOperationHistory, ServiceRuntimeConfig,
    StartRemoteLogSessionPayload, StartServiceOperationPayload,
};
use crate::repositories::service_ops_repo;
use crate::services::{blocking, remote_log_session_service, service_operation_executor};
use tauri::AppHandle;

#[tauri::command]
pub async fn list_service_runtime_configs(
    app: AppHandle,
) -> AppResult<Vec<ServiceRuntimeConfig>> {
    let task_app = app.clone();
    blocking::run(move || service_ops_repo::list_service_runtime_configs(&task_app)).await
}

#[tauri::command]
pub async fn save_service_runtime_config(
    app: AppHandle,
    config: ServiceRuntimeConfig,
) -> AppResult<ServiceRuntimeConfig> {
    let task_app = app.clone();
    blocking::run(move || service_ops_repo::save_service_runtime_config(&task_app, config)).await
}

#[tauri::command]
pub async fn delete_service_runtime_config(app: AppHandle, config_id: String) -> AppResult<()> {
    let task_app = app.clone();
    blocking::run(move || service_ops_repo::delete_service_runtime_config(&task_app, &config_id))
        .await
}

#[tauri::command]
pub async fn list_service_operation_histories(
    app: AppHandle,
) -> AppResult<Vec<ServiceOperationHistory>> {
    let task_app = app.clone();
    blocking::run(move || service_ops_repo::list_service_operation_histories(&task_app)).await
}

#[tauri::command]
pub fn start_service_restart(
    app: AppHandle,
    payload: StartServiceOperationPayload,
) -> AppResult<String> {
    service_operation_executor::start_restart(app, payload.service_runtime_config_id)
}

#[tauri::command]
pub fn start_service_health_check(
    app: AppHandle,
    payload: StartServiceOperationPayload,
) -> AppResult<String> {
    service_operation_executor::start_health_check(app, payload.service_runtime_config_id)
}

#[tauri::command]
pub fn start_remote_log_session(
    app: AppHandle,
    payload: StartRemoteLogSessionPayload,
) -> AppResult<RemoteLogSession> {
    remote_log_session_service::start_remote_log_session(app, payload)
}

#[tauri::command]
pub fn stop_remote_log_session(app: AppHandle, session_id: String) -> AppResult<()> {
    remote_log_session_service::stop_remote_log_session(app, session_id)
}
