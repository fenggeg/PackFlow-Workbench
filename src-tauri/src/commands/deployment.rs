use crate::error::AppResult;
use crate::models::command_template::{CommandExecution, CommandTemplate, SaveCommandTemplatePayload};
use crate::models::deployment::{SaveServerProfilePayload, ServerProfile};
use crate::repositories::{command_template_repo, deployment_repo};
use crate::services::{app_logger, blocking, command_runner, ssh_transport_service};
use tauri::{AppHandle, Manager};

// ==================== 服务器管理命令 ====================

#[tauri::command]
pub async fn list_server_profiles(app: AppHandle) -> AppResult<Vec<ServerProfile>> {
    let task_app = app.clone();
    let result = blocking::run(move || deployment_repo::list_server_profiles(&task_app)).await;
    match &result {
        Ok(items) => app_logger::log_info(
            &app,
            "deployment.server.list.success",
            format!("count={}", items.len()),
        ),
        Err(error) => app_logger::log_error(
            &app,
            "deployment.server.list.failed",
            format!("error={}", error),
        ),
    }
    result
}

#[tauri::command]
pub async fn save_server_profile(
    app: AppHandle,
    payload: SaveServerProfilePayload,
) -> AppResult<ServerProfile> {
    let task_app = app.clone();
    let result =
        blocking::run(move || deployment_repo::save_server_profile(&task_app, payload)).await;
    if let Err(error) = &result {
        app_logger::log_error(
            &app,
            "deployment.server.save.failed",
            format!("error={}", error),
        );
    }
    result
}

#[tauri::command]
pub async fn delete_server_profile(app: AppHandle, server_id: String) -> AppResult<()> {
    let task_app = app.clone();
    let result =
        blocking::run(move || deployment_repo::delete_server_profile(&task_app, &server_id)).await;
    if let Err(error) = &result {
        app_logger::log_error(
            &app,
            "deployment.server.delete.failed",
            format!("error={}", error),
        );
    }
    result
}

#[tauri::command]
pub async fn test_server_connection(app: AppHandle, server_id: String) -> AppResult<String> {
    app_logger::log_info(
        &app,
        "deployment.server.test.start",
        format!("server_id={}", server_id),
    );
    let task_app = app.clone();
    let result = blocking::run(move || {
        let profile = deployment_repo::get_server_profile_for_execution(&task_app, &server_id)?;
        let test_result = ssh_transport_service::test_server_connection(&profile)?;
        deployment_repo::update_server_last_connected(&task_app, &server_id)?;
        Ok(test_result)
    })
    .await;
    match &result {
        Ok(message) => {
            app_logger::log_info(&app, "deployment.server.test.success", message.clone())
        }
        Err(error) => app_logger::log_error(
            &app,
            "deployment.server.test.failed",
            format!("error={}", error),
        ),
    }
    result
}

// ==================== 命令模板管理命令 ====================

#[tauri::command]
pub async fn list_command_templates(app: AppHandle) -> AppResult<Vec<CommandTemplate>> {
    let task_app = app.clone();
    let result = blocking::run(move || command_template_repo::list_templates(&task_app)).await;
    match &result {
        Ok(items) => app_logger::log_info(
            &app,
            "command.template.list.success",
            format!("count={}", items.len()),
        ),
        Err(error) => app_logger::log_error(
            &app,
            "command.template.list.failed",
            format!("error={}", error),
        ),
    }
    result
}

#[tauri::command]
pub async fn save_command_template(
    app: AppHandle,
    payload: SaveCommandTemplatePayload,
) -> AppResult<CommandTemplate> {
    let task_app = app.clone();
    let result =
        blocking::run(move || command_template_repo::save_template(&task_app, &payload)).await;
    if let Err(error) = &result {
        app_logger::log_error(
            &app,
            "command.template.save.failed",
            format!("error={}", error),
        );
    }
    result
}

#[tauri::command]
pub async fn delete_command_template(app: AppHandle, template_id: String) -> AppResult<()> {
    let task_app = app.clone();
    let result =
        blocking::run(move || command_template_repo::delete_template(&task_app, &template_id))
            .await;
    if let Err(error) = &result {
        app_logger::log_error(
            &app,
            "command.template.delete.failed",
            format!("error={}", error),
        );
    }
    result
}

// ==================== 命令执行命令 ====================

#[tauri::command]
pub fn start_command_execution(
    app: AppHandle,
    payload: command_runner::ExecuteTemplatePayload,
) -> AppResult<String> {
    app_logger::log_info(
        &app,
        "command.execution.start",
        format!("template_id={}", payload.template_id),
    );
    command_runner::execute_template(app, payload)
}

#[tauri::command]
pub fn cancel_command_execution(app: AppHandle, execution_id: String) -> AppResult<()> {
    app_logger::log_info(
        &app,
        "command.execution.cancel",
        format!("execution_id={}", execution_id),
    );
    command_runner::cancel_execution(app, execution_id)
}

#[tauri::command]
pub fn disconnect_command_log(app: AppHandle, execution_id: String) -> AppResult<()> {
    app_logger::log_info(
        &app,
        "command.execution.disconnect_log",
        format!("execution_id={}", execution_id),
    );
    command_runner::disconnect_log(app, execution_id)
}

#[tauri::command]
pub fn has_command_background_execution(app: AppHandle, execution_id: String) -> AppResult<bool> {
    let state = app.state::<command_runner::CommandControlState>();
    Ok(state.has_background_execution(&execution_id))
}

#[tauri::command]
pub async fn list_command_executions(app: AppHandle) -> AppResult<Vec<CommandExecution>> {
    let task_app = app.clone();
    let result = blocking::run(move || command_template_repo::list_executions(&task_app)).await;
    match &result {
        Ok(items) => app_logger::log_info(
            &app,
            "command.execution.list.success",
            format!("count={}", items.len()),
        ),
        Err(error) => app_logger::log_error(
            &app,
            "command.execution.list.failed",
            format!("error={}", error),
        ),
    }
    result
}

#[tauri::command]
pub async fn delete_command_execution(app: AppHandle, execution_id: String) -> AppResult<()> {
    let task_app = app.clone();
    let result =
        blocking::run(move || command_template_repo::delete_execution(&task_app, &execution_id))
            .await;
    if let Err(error) = &result {
        app_logger::log_error(
            &app,
            "command.execution.delete.failed",
            format!("error={}", error),
        );
    }
    result
}
