use crate::error::{to_user_error, AppResult};
use crate::models::deployment::{DeployStep, DeploymentStage, DeploymentTask, StartDeploymentPayload};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};

use super::deployment_common::DeploymentControlState;

pub fn create_stage_from_step(step: &DeployStep) -> DeploymentStage {
    DeploymentStage {
        key: step.id.clone(),
        label: step.name.clone(),
        step_type: Some(step.step_type.clone()),
        status: if step.enabled { "pending" } else { "skipped" }.to_string(),
        started_at: None,
        finished_at: None,
        message: if step.enabled {
            None
        } else {
            Some("步骤已禁用，跳过。".to_string())
        },
        retry_count: step.retry_count,
        current_retry: Some(0),
        duration_ms: None,
        logs: Vec::new(),
        probe_statuses: Vec::new(),
    }
}

pub fn create_failed_start_task(
    task_id: &str,
    payload: &StartDeploymentPayload,
    error: String,
) -> DeploymentTask {
    let artifact_name = Path::new(&payload.local_artifact_path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(&payload.local_artifact_path)
        .to_string();
    let now = Utc::now().to_rfc3339();
    DeploymentTask {
        id: task_id.to_string(),
        build_task_id: payload.build_task_id.clone(),
        project_root: String::new(),
        deployment_profile_id: payload.deployment_profile_id.clone(),
        deployment_profile_name: None,
        server_id: payload.server_id.clone(),
        server_name: None,
        module_id: String::new(),
        artifact_path: payload.local_artifact_path.clone(),
        artifact_name: artifact_name.clone(),
        status: "failed".to_string(),
        log: vec![error.clone()],
        stages: vec![DeploymentStage {
            key: "startup".to_string(),
            label: "启动部署".to_string(),
            step_type: None,
            status: "failed".to_string(),
            started_at: Some(now.clone()),
            finished_at: Some(now.clone()),
            message: Some(error),
            retry_count: Some(0),
            current_retry: Some(0),
            duration_ms: Some(0),
            logs: Vec::new(),
            probe_statuses: Vec::new(),
        }],
        created_at: now.clone(),
        finished_at: Some(now),
        startup_pid: None,
        startup_log_path: None,
        probe_result: None,
        backup_path: None,
        log_offset_before_start: None,
        rollback_result: None,
    }
}

pub fn fail_first_stage(app: &AppHandle, task: &mut DeploymentTask, error: String) {
    let stage_key = task
        .stages
        .first()
        .map(|stage| stage.key.clone())
        .unwrap_or_else(|| "startup".to_string());
    update_stage(task, &stage_key, "failed", Some(error.clone()));
    task.status = "failed".to_string();
    task.finished_at = Some(Utc::now().to_rfc3339());
    append_log(app, task, Some(stage_key), error);
    emit_task_update(app, task);
}

pub fn mark_cancelled(app: &AppHandle, task: &mut DeploymentTask, stage_key: &str, message: &str) {
    update_stage(task, stage_key, "cancelled", Some(message.to_string()));
    mark_pending_stages_skipped(task, "部署已停止，跳过。");
    task.status = "cancelled".to_string();
    task.finished_at = Some(Utc::now().to_rfc3339());
    append_log(app, task, Some(stage_key.to_string()), message.to_string());
    emit_task_update(app, task);
}

pub fn finish_if_cancelled(app: &AppHandle, task: &mut DeploymentTask, stage_key: &str) -> bool {
    if is_cancel_requested(app, &task.id) {
        mark_cancelled(app, task, stage_key, "部署已停止。");
        true
    } else {
        false
    }
}

pub fn is_cancel_requested(app: &AppHandle, task_id: &str) -> bool {
    app.state::<DeploymentControlState>().is_cancelled(task_id)
}

pub fn mark_pending_stages_skipped(task: &mut DeploymentTask, message: &str) {
    for stage in &mut task.stages {
        if stage.status == "pending" {
            stage.status = "skipped".to_string();
            stage.message = Some(message.to_string());
            stage.finished_at = Some(Utc::now().to_rfc3339());
        }
    }
}

pub fn update_stage(task: &mut DeploymentTask, stage_key: &str, status: &str, message: Option<String>) {
    if let Some(stage) = task.stages.iter_mut().find(|item| item.key == stage_key) {
        let now = Utc::now();
        if matches!(status, "running" | "checking" | "waiting") && stage.started_at.is_none() {
            stage.started_at = Some(now.to_rfc3339());
        }
        if matches!(
            status,
            "success" | "failed" | "skipped" | "cancelled" | "timeout"
        ) {
            stage.finished_at = Some(now.to_rfc3339());
            stage.duration_ms = stage
                .started_at
                .as_deref()
                .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
                .and_then(|started_at| {
                    now.signed_duration_since(started_at.with_timezone(&Utc))
                        .num_milliseconds()
                        .try_into()
                        .ok()
                });
        }
        stage.status = status.to_string();
        stage.message = message;
    }
}

pub fn update_stage_retry(
    task: &mut DeploymentTask,
    stage_key: &str,
    current_retry: u32,
    retry_count: u32,
) {
    if let Some(stage) = task.stages.iter_mut().find(|item| item.key == stage_key) {
        stage.current_retry = Some(current_retry);
        stage.retry_count = Some(retry_count);
    }
}

pub fn append_log(app: &AppHandle, task: &mut DeploymentTask, stage_key: Option<String>, line: String) {
    task.log.push(line.clone());
    if let Some(key) = stage_key.as_deref() {
        if let Some(stage) = task.stages.iter_mut().find(|item| item.key == key) {
            stage.logs.push(line.clone());
        }
    }
    let _ = app.emit(
        "deployment-log",
        crate::models::deployment::DeploymentLogEvent {
            task_id: task.id.clone(),
            stage_key,
            line,
        },
    );
}

pub fn emit_task_update(app: &AppHandle, task: &DeploymentTask) {
    let _ = app.emit("deployment-updated", task.clone());
}

pub fn parse_config<T>(step: &DeployStep) -> AppResult<T>
where
    T: for<'de> Deserialize<'de>,
{
    serde_json::from_value::<T>(step.config.clone())
        .map_err(|error| to_user_error(format!("步骤「{}」配置格式错误：{}", step.name, error)))
}
