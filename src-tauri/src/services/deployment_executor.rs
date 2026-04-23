use crate::error::{to_user_error, AppResult};
use crate::models::deployment::{DeploymentStage, DeploymentTask, StartDeploymentPayload};
use crate::repositories::deployment_repo;
use crate::services::{health_check_service, ssh_transport_service};
use chrono::Utc;
use std::path::Path;
use std::thread;
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

const STAGE_UPLOAD: &str = "upload";
const STAGE_STOP: &str = "stop";
const STAGE_REPLACE: &str = "replace";
const STAGE_START: &str = "start";
const STAGE_HEALTH: &str = "health";

pub fn start_deployment(app: AppHandle, payload: StartDeploymentPayload) -> AppResult<String> {
    if payload.local_artifact_path.trim().is_empty() {
        return Err(to_user_error("部署前需要选择本地产物。"));
    }
    let task_id = Uuid::new_v4().to_string();
    let spawned_task_id = task_id.clone();
    let app_handle = app.clone();
    thread::spawn(move || {
        let task = execute_deployment(&app_handle, &spawned_task_id, payload);
        match task {
            Ok(task) => {
                let _ = deployment_repo::save_deployment_task(&app_handle, task.clone());
                let _ = app_handle.emit("deployment-finished", task);
            }
            Err(error) => {
                let _ = app_handle.emit(
                    "deployment-log",
                    crate::models::deployment::DeploymentLogEvent {
                        task_id: spawned_task_id.clone(),
                        stage_key: None,
                        line: error,
                    },
                );
            }
        }
    });
    Ok(task_id)
}

fn execute_deployment(
    app: &AppHandle,
    task_id: &str,
    payload: StartDeploymentPayload,
) -> AppResult<DeploymentTask> {
    let profile = deployment_repo::get_deployment_profile(app, &payload.deployment_profile_id)?;
    let server = deployment_repo::get_server_profile_for_execution(app, &profile.server_id)?;
    let artifact_path = Path::new(&payload.local_artifact_path);
    if !artifact_path.exists() {
        return Err(to_user_error("所选构建产物不存在。"));
    }
    let artifact_name = artifact_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| to_user_error("无法识别产物文件名。"))?
        .to_string();

    let started_at = Utc::now().to_rfc3339();
    let started = Instant::now();
    let mut task = DeploymentTask {
        id: task_id.to_string(),
        build_task_id: payload.build_task_id,
        deployment_profile_id: profile.id.clone(),
        deployment_profile_name: Some(profile.name.clone()),
        server_id: server.id.clone(),
        server_name: Some(server.name.clone()),
        module_id: profile.module_id.clone(),
        artifact_path: payload.local_artifact_path.clone(),
        artifact_name: artifact_name.clone(),
        status: "pending".to_string(),
        log: Vec::new(),
        stages: vec![
            create_stage(STAGE_UPLOAD, "上传产物"),
            create_stage(STAGE_STOP, "停止旧服务"),
            create_stage(STAGE_REPLACE, "替换文件"),
            create_stage(STAGE_START, "启动服务"),
            create_stage(STAGE_HEALTH, "健康检查"),
        ],
        created_at: started_at,
        finished_at: None,
    };

    append_log(app, &mut task, None, format!("开始部署到 {}:{}", server.host, server.port));
    task.status = "uploading".to_string();
    emit_task_update(app, &task);

    let session = ssh_transport_service::connect(&server)?;
    let remote_deploy_path = normalize_remote_dir(&profile.remote_deploy_path);
    let remote_temp_path = format!("{}/.{}.uploading", remote_deploy_path, artifact_name);
    let remote_target_path = format!("{}/{}", remote_deploy_path, artifact_name);

    run_stage(
        app,
        &mut task,
        STAGE_UPLOAD,
        || -> AppResult<String> {
            ssh_transport_service::execute(
                &session,
                &format!("mkdir -p {}", shell_quote(&remote_deploy_path)),
            )?;
            ssh_transport_service::upload_file(&session, artifact_path, &remote_temp_path)?;
            Ok(format!("产物已上传到 {}", remote_temp_path))
        },
    )?;

    task.status = "stopping".to_string();
    emit_task_update(app, &task);
    if let Some(command) = profile.stop_command.as_deref().filter(|value| !value.trim().is_empty()) {
        run_stage(app, &mut task, STAGE_STOP, || {
            let result = ssh_transport_service::execute(&session, command)?;
            Ok(if result.output.is_empty() {
                "停止命令执行完成".to_string()
            } else {
                result.output
            })
        })?;
    } else {
        skip_stage(app, &mut task, STAGE_STOP, "未配置停止命令，跳过。");
    }

    run_stage(app, &mut task, STAGE_REPLACE, || {
        let command = format!(
            "mkdir -p {dir} && mv -f {temp} {target}",
            dir = shell_quote(&remote_deploy_path),
            temp = shell_quote(&remote_temp_path),
            target = shell_quote(&remote_target_path)
        );
        let result = ssh_transport_service::execute(&session, &command)?;
        Ok(if result.output.is_empty() {
            format!("已替换远端文件 {}", remote_target_path)
        } else {
            result.output
        })
    })?;

    task.status = "starting".to_string();
    emit_task_update(app, &task);
    if let Some(command) = profile
        .restart_command
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            profile
                .start_command
                .as_deref()
                .filter(|value| !value.trim().is_empty())
        })
    {
        run_stage(app, &mut task, STAGE_START, || {
            let result = ssh_transport_service::execute(&session, command)?;
            Ok(if result.output.is_empty() {
                "启动命令执行完成".to_string()
            } else {
                result.output
            })
        })?;
    } else {
        skip_stage(app, &mut task, STAGE_START, "未配置启动或重启命令，跳过。");
    }

    task.status = "checking".to_string();
    emit_task_update(app, &task);
    if let Some(url) = profile
        .health_check_url
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        run_stage(app, &mut task, STAGE_HEALTH, || health_check_service::check_health(url))?;
    } else {
        skip_stage(app, &mut task, STAGE_HEALTH, "未配置健康检查地址，跳过。");
    }

    task.status = "success".to_string();
    task.finished_at = Some(Utc::now().to_rfc3339());
    append_log(
        app,
        &mut task,
        None,
        format!("部署完成，总耗时 {} ms", started.elapsed().as_millis()),
    );
    emit_task_update(app, &task);
    Ok(task)
}

fn create_stage(key: &str, label: &str) -> DeploymentStage {
    DeploymentStage {
        key: key.to_string(),
        label: label.to_string(),
        status: "pending".to_string(),
        started_at: None,
        finished_at: None,
        message: None,
    }
}

fn run_stage<F>(
    app: &AppHandle,
    task: &mut DeploymentTask,
    stage_key: &str,
    action: F,
) -> AppResult<()>
where
    F: FnOnce() -> AppResult<String>,
{
    update_stage(task, stage_key, "running", None);
    emit_task_update(app, task);
    match action() {
        Ok(message) => {
            update_stage(task, stage_key, "success", Some(message.clone()));
            append_log(app, task, Some(stage_key.to_string()), message);
            emit_task_update(app, task);
            Ok(())
        }
        Err(error) => {
            update_stage(task, stage_key, "failed", Some(error.clone()));
            task.status = "failed".to_string();
            task.finished_at = Some(Utc::now().to_rfc3339());
            append_log(app, task, Some(stage_key.to_string()), error.clone());
            emit_task_update(app, task);
            Err(error)
        }
    }
}

fn skip_stage(app: &AppHandle, task: &mut DeploymentTask, stage_key: &str, message: &str) {
    update_stage(task, stage_key, "skipped", Some(message.to_string()));
    append_log(app, task, Some(stage_key.to_string()), message.to_string());
    emit_task_update(app, task);
}

fn update_stage(task: &mut DeploymentTask, stage_key: &str, status: &str, message: Option<String>) {
    if let Some(stage) = task.stages.iter_mut().find(|item| item.key == stage_key) {
        if status == "running" {
            stage.started_at = Some(Utc::now().to_rfc3339());
        }
        if matches!(status, "success" | "failed" | "skipped") {
            stage.finished_at = Some(Utc::now().to_rfc3339());
        }
        stage.status = status.to_string();
        stage.message = message;
    }
}

fn append_log(
    app: &AppHandle,
    task: &mut DeploymentTask,
    stage_key: Option<String>,
    line: String,
) {
    task.log.push(line.clone());
    let _ = app.emit(
        "deployment-log",
        crate::models::deployment::DeploymentLogEvent {
            task_id: task.id.clone(),
            stage_key,
            line,
        },
    );
}

fn emit_task_update(app: &AppHandle, task: &DeploymentTask) {
    let _ = app.emit("deployment-updated", task.clone());
}

fn normalize_remote_dir(value: &str) -> String {
    value.trim_end_matches('/').to_string()
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}
