use crate::error::{to_user_error, AppResult};
use crate::models::service_ops::{
    ServiceLogConfig, ServiceOperationHistory, ServiceOperationLogEvent, ServiceOperationTask,
    ServiceRuntimeConfig,
};
use crate::models::deployment::DeploymentProfile;
use crate::repositories::{deployment_repo, service_ops_repo};
use crate::services::ssh_transport_service::SshConnection;
use chrono::Utc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

pub fn start_restart(app: AppHandle, config_id: String) -> AppResult<String> {
    start_operation(app, config_id, "restart")
}

pub fn start_health_check(app: AppHandle, config_id: String) -> AppResult<String> {
    start_operation(app, config_id, "health_check")
}

fn start_operation(app: AppHandle, config_id: String, task_type: &str) -> AppResult<String> {
    let task_id = Uuid::new_v4().to_string();
    let spawned_task_id = task_id.clone();
    let operation_type = task_type.to_string();
    thread::spawn(move || {
        let task = execute_operation(&app, &spawned_task_id, &config_id, &operation_type);
        let _ = app.emit("service-operation-finished", task);
    });
    Ok(task_id)
}

fn execute_operation(
    app: &AppHandle,
    task_id: &str,
    config_id: &str,
    operation_type: &str,
) -> ServiceOperationTask {
    let started_at = Utc::now().to_rfc3339();
    let mut task = ServiceOperationTask {
        id: task_id.to_string(),
        service_runtime_config_id: config_id.to_string(),
        task_type: operation_type.to_string(),
        status: "running".to_string(),
        started_at: Some(started_at.clone()),
        finished_at: None,
        command: None,
        output_lines: Vec::new(),
        error_message: None,
    };
    emit_task(app, &task);

    let result = match operation_type {
        "restart" => execute_restart(app, &mut task),
        "health_check" => execute_health_check_task(app, &mut task),
        _ => Err(format!("暂不支持的服务操作：{}", operation_type)),
    };

    let finished_at = Utc::now().to_rfc3339();
    task.finished_at = Some(finished_at.clone());
    match result {
        Ok(()) => {
            task.status = "success".to_string();
            append_log(app, &mut task, "服务操作完成。");
        }
        Err(error) => {
            task.status = "failed".to_string();
            task.error_message = Some(error.clone());
            append_log(app, &mut task, format!("服务操作失败：{}", error));
        }
    }
    emit_task(app, &task);
    save_history(app, &task, &started_at, &finished_at);
    task
}

fn execute_restart(app: &AppHandle, task: &mut ServiceOperationTask) -> Result<(), String> {
    let config = service_ops_repo::get_service_runtime_config(app, &task.service_runtime_config_id)
        .map_err(|error| error.to_string())?;
    validate_restart_config(&config)?;
    let deployment_profile = config
        .deployment_profile_id
        .as_deref()
        .and_then(|profile_id| deployment_repo::get_deployment_profile(app, profile_id).ok());
    let config = render_runtime_config(config, deployment_profile.as_ref());
    append_log(
        app,
        task,
        format!("准备重启服务：{}。", config.service_name),
    );
    let server = deployment_repo::get_server_profile_for_execution(app, &config.server_id)
        .map_err(|error| error.to_string())?;
    append_log(
        app,
        task,
        format!("正在连接服务器 {}@{}:{} ...", server.username, server.host, server.port),
    );
    let mut conn = SshConnection::connect(&server, || false).map_err(|error| error.to_string())?;
    conn.configure_privilege(&server.privilege, server.privilege_password.clone());
    append_log(app, task, "SSH 连接已建立。");
    let log_offset = capture_log_offset(&mut conn, &config);

    if let Some(command) = config.restart_command.as_deref().filter(|value| !value.trim().is_empty())
    {
        append_log(app, task, "执行重启命令...");
        run_command(app, task, &mut conn, command, "重启服务命令")?;
    } else {
        let stop_command = config
            .stop_command
            .as_deref()
            .ok_or_else(|| "当前服务未配置停止命令。".to_string())?;
        let start_command = config
            .start_command
            .as_deref()
            .ok_or_else(|| "当前服务未配置启动命令。".to_string())?;
        append_log(app, task, "停止服务...");
        run_command(app, task, &mut conn, stop_command, "停止服务命令")?;
        append_log(app, task, "等待服务停止完成...");
        thread::sleep(Duration::from_secs(2));
        append_log(app, task, "启动服务...");
        run_command(app, task, &mut conn, start_command, "启动服务命令")?;
    }

    emit_startup_log_excerpt(app, task, &mut conn, &config, 120, log_offset, "应用启动日志片段");
    append_log(app, task, "等待服务进入可检查状态...");
    thread::sleep(Duration::from_secs(2));
    execute_health_check(app, task, &mut conn, true)
}

fn execute_health_check_task(
    app: &AppHandle,
    task: &mut ServiceOperationTask,
) -> Result<(), String> {
    let config = service_ops_repo::get_service_runtime_config(app, &task.service_runtime_config_id)
        .map_err(|error| error.to_string())?;
    append_log(
        app,
        task,
        format!("准备检查服务健康状态：{}。", config.service_name),
    );
    let server = deployment_repo::get_server_profile_for_execution(app, &config.server_id)
        .map_err(|error| error.to_string())?;
    let mut conn = SshConnection::connect(&server, || false).map_err(|error| error.to_string())?;
    conn.configure_privilege(&server.privilege, server.privilege_password.clone());
    execute_health_check(app, task, &mut conn, false)
}

fn execute_health_check(
    app: &AppHandle,
    task: &mut ServiceOperationTask,
    conn: &mut SshConnection,
    allow_skip: bool,
) -> Result<(), String> {
    let config = service_ops_repo::get_service_runtime_config(app, &task.service_runtime_config_id)
        .map_err(|error| error.to_string())?;
    if let Some(command) = config.status_command.as_deref().filter(|value| !value.trim().is_empty())
    {
        append_log(app, task, "执行服务状态命令...");
        return run_command(app, task, conn, command, "服务状态命令");
    }

    let Some(url) = config
        .health_check_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        let message = "当前服务未配置健康检查地址，已跳过自动健康检查。";
        append_log(app, task, message);
        return if allow_skip {
            Ok(())
        } else {
            Err(message.to_string())
        };
    };

    append_log(app, task, format!("等待健康检查通过：{}", url));
    let mut last_error = "尚未收到健康响应".to_string();
    for attempt in 1..=20 {
        append_log(app, task, format!("健康检查第 {} 次...", attempt));
        match run_remote_http_check(conn, url) {
            Ok(message) => {
                append_log(app, task, message);
                return Ok(());
            }
            Err(error) => {
                last_error = error;
                append_log(app, task, format!("健康检查未通过：{}", last_error));
                thread::sleep(Duration::from_secs(3));
            }
        }
    }
    emit_startup_log_excerpt(app, task, conn, &config, 160, None, "健康检查失败时的应用日志片段");
    Err(format!("健康检查失败：{}", last_error))
}

fn validate_restart_config(config: &ServiceRuntimeConfig) -> Result<(), String> {
    if config.server_id.trim().is_empty() {
        return Err("当前服务未绑定服务器。".to_string());
    }
    let has_restart = config
        .restart_command
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty());
    let has_stop_start = config
        .stop_command
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty())
        && config
            .start_command
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty());
    if !has_restart && !has_stop_start {
        return Err("当前服务未配置重启命令，请先配置 restartCommand 或 stopCommand + startCommand。".to_string());
    }
    if !has_restart {
        let stop = config.stop_command.as_deref().map(str::trim).unwrap_or_default();
        let start = config.start_command.as_deref().map(str::trim).unwrap_or_default();
        if !stop.is_empty() && stop == start {
            return Err("启动命令与停止命令相同，请重新保存服务运行配置。".to_string());
        }
    }
    Ok(())
}

fn render_runtime_config(
    mut config: ServiceRuntimeConfig,
    profile: Option<&DeploymentProfile>,
) -> ServiceRuntimeConfig {
    config.restart_command = config
        .restart_command
        .map(|command| render_command_template(&command, profile));
    config.stop_command = config
        .stop_command
        .map(|command| render_command_template(&command, profile));
    config.start_command = config
        .start_command
        .map(|command| render_command_template(&command, profile));
    config.status_command = config
        .status_command
        .map(|command| render_command_template(&command, profile));
    config.health_check_url = config
        .health_check_url
        .map(|url| render_command_template(&url, profile));
    config.work_dir = config
        .work_dir
        .map(|dir| render_command_template(&dir, profile));
    if let Some(log_source) = config.log_source.as_mut() {
        log_source.log_path = log_source
            .log_path
            .take()
            .map(|path| render_command_template(&path, profile));
        log_source.custom_command = log_source
            .custom_command
            .take()
            .map(|command| render_command_template(&command, profile));
    }
    config
}

fn render_command_template(command: &str, profile: Option<&DeploymentProfile>) -> String {
    let Some(profile) = profile else {
        return command.to_string();
    };
    let remote_artifact_name = profile
        .remote_artifact_name
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(&profile.local_artifact_pattern);
    let artifact_base = remote_artifact_name
        .rsplit_once('.')
        .map(|(base, _)| base)
        .unwrap_or(remote_artifact_name);
    let pid_file = profile
        .startup_probe
        .as_ref()
        .and_then(|probe| probe.process_probe.as_ref())
        .and_then(|probe| probe.pid_file.as_deref())
        .filter(|value| !value.trim().is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("{}.pid", artifact_base));
    let log_name = profile
        .log_name
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(artifact_base);
    let working_dir = non_empty_option(profile.working_dir.as_deref()).unwrap_or(&profile.remote_deploy_path);
    let java_bin = non_empty_option(profile.java_bin_path.as_deref()).unwrap_or("java");
    let jvm_options = non_empty_option(profile.jvm_options.as_deref()).unwrap_or("");
    let spring_profile = non_empty_option(profile.spring_profile.as_deref()).unwrap_or("");
    let extra_args = non_empty_option(profile.extra_args.as_deref()).unwrap_or("");
    let log_file = profile
        .log_path
        .as_deref()
        .and_then(non_empty_str)
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("{}/logs/{}.log", profile.remote_deploy_path, log_name));
    let log_dir = log_file
        .rsplit_once('/')
        .map(|(dir, _)| dir)
        .unwrap_or(".");
    let port_probe_port = profile
        .startup_probe
        .as_ref()
        .and_then(|probe| probe.port_probe.as_ref())
        .filter(|probe| probe.enabled)
        .map(|probe| probe.port.to_string())
        .unwrap_or_default();

    let rendered = command
        .replace("${remoteDeployPath}", &profile.remote_deploy_path)
        .replace("${remoteArtifactName}", remote_artifact_name)
        .replace("${artifactName}", remote_artifact_name)
        .replace("${serviceDir}", working_dir)
        .replace("${workingDir}", working_dir)
        .replace("${pidFile}", &pid_file)
        .replace("${logFile}", &log_file)
        .replace("${logDir}", log_dir)
        .replace("${logPathFile}", &format!("{}/.{}.log.path", profile.remote_deploy_path, artifact_base))
        .replace("${portProbePort}", &port_probe_port)
        .replace("${javaBin}", java_bin)
        .replace("${jvmOptions}", jvm_options)
        .replace("${springProfile}", spring_profile)
        .replace("${extraArgs}", extra_args);
    patch_wildcard_artifact_references(&rendered, &profile.remote_deploy_path, remote_artifact_name)
}

fn non_empty_option(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|item| !item.is_empty())
}

fn non_empty_str(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn patch_wildcard_artifact_references(command: &str, remote_dir: &str, artifact_name: &str) -> String {
    if !artifact_name.contains('*') && !artifact_name.contains('?') {
        return command.to_string();
    }
    let normalized_dir = remote_dir.trim_end_matches('/');
    let literal_path = format!("{}/{}", normalized_dir, artifact_name);
    let dynamic_path = format!(
        "$(ls -t {}/{} 2>/dev/null | head -n 1)",
        shell_quote(normalized_dir),
        artifact_name
    );
    command
        .replace(&format!("\"{}\"", literal_path), &dynamic_path)
        .replace(&format!("'{}'", literal_path), &dynamic_path)
        .replace(&literal_path, &dynamic_path)
}

fn run_command(
    app: &AppHandle,
    task: &mut ServiceOperationTask,
    conn: &mut SshConnection,
    command: &str,
    label: &str,
) -> Result<(), String> {
    let command = command.trim();
    if command.is_empty() {
        return Err("远程命令为空。".to_string());
    }
    if command.contains("sudo") {
        append_log(app, task, "检测到 sudo 命令，请确认当前服务器提权配置可用。");
    }
    let summary = command_summary(command, label);
    task.command = Some(summary.clone());
    append_log(app, task, format!("执行{}。", summary));
    emit_task(app, task);
    let task_id = task.id.clone();
    let streamed_lines = Arc::new(Mutex::new(Vec::<String>::new()));
    let streamed_lines_ref = streamed_lines.clone();
    let status = conn
        .stream_privileged_with_cancel(command, || false, |line| {
            if let Ok(mut guard) = streamed_lines_ref.lock() {
                guard.push(line.clone());
            }
            let _ = app.emit(
                "service-operation-log",
                ServiceOperationLogEvent {
                    task_id: task_id.clone(),
                    line,
                },
            );
        })
        .map_err(|error| error.to_string())?;
    if let Ok(guard) = streamed_lines.lock() {
        task.output_lines.extend(guard.iter().cloned());
    }
    if status != 0 {
        return Err(format!("远程命令退出码 {}", status));
    }
    append_log(app, task, "命令执行完成。");
    Ok(())
}

fn command_summary(command: &str, fallback: &str) -> String {
    let lower = command.to_lowercase();
    if lower.contains("nohup") || lower.contains("java -jar") || lower.contains("java\"") {
        return "标准启动命令".to_string();
    }
    if lower.contains("kill")
        || lower.contains("pkill")
        || lower.contains("端口 java 进程清理")
    {
        return "标准停止命令".to_string();
    }
    if lower.contains("curl") && lower.contains("__http_status__") {
        return "HTTP 健康检查命令".to_string();
    }
    let compact = command.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.chars().count() > 80 {
        format!("{}（自定义命令）", fallback)
    } else {
        compact
    }
}

fn run_remote_http_check(conn: &mut SshConnection, url: &str) -> Result<String, String> {
    let command = format!(
        "curl -sS -L -X GET -w '\\n__HTTP_STATUS__:%{{http_code}}' --max-time 15 {}",
        shell_quote(url)
    );
    let result = conn
        .execute_privileged_with_cancel(&command, || false)
        .map_err(|error| error.to_string())?;
    let marker = "__HTTP_STATUS__:";
    let marker_index = result
        .output
        .rfind(marker)
        .ok_or_else(|| "HTTP 检查未返回状态码，请确认远端已安装 curl。".to_string())?;
    let status_text = result.output[marker_index + marker.len()..].trim();
    let status = status_text
        .parse::<u16>()
        .map_err(|_| format!("HTTP 检查状态码异常：{}", status_text))?;
    if !(200..=299).contains(&status) {
        return Err(format!("HTTP {}", status));
    }
    Ok(format!("健康检查通过：HTTP {}", status))
}

fn emit_startup_log_excerpt(
    app: &AppHandle,
    task: &mut ServiceOperationTask,
    conn: &mut SshConnection,
    config: &ServiceRuntimeConfig,
    tail_lines: u32,
    offset: Option<u64>,
    title: &str,
) {
    let Some(command) = log_excerpt_command(config.log_source.as_ref(), config.work_dir.as_deref(), tail_lines, offset) else {
        append_log(app, task, "未配置可采样的应用日志来源，跳过启动日志片段。");
        return;
    };
    append_log(app, task, format!("读取{}...", title));
    match conn.execute_privileged_with_cancel(&command, || false) {
        Ok(result) => {
            let lines: Vec<&str> = result
                .output
                .lines()
                .filter(|line| !line.trim().is_empty())
                .collect();
            if lines.is_empty() {
                append_log(app, task, "应用日志暂时为空。");
                return;
            }
            append_log(app, task, format!("--- {}开始 ---", title));
            for line in lines {
                append_log(app, task, line.to_string());
            }
            append_log(app, task, format!("--- {}结束 ---", title));
        }
        Err(error) => append_log(app, task, format!("读取应用日志失败：{}", error)),
    }
}

fn log_excerpt_command(
    source: Option<&ServiceLogConfig>,
    work_dir: Option<&str>,
    tail_lines: u32,
    offset: Option<u64>,
) -> Option<String> {
    let tail_lines = tail_lines.clamp(20, 500);
    let source = source?;
    match source.source_type.as_str() {
        "file" => source
            .log_path
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|path| {
                let path_arg = if path.contains('*') {
                    path.to_string()
                } else {
                    shell_quote(path)
                };
                if path.contains('*') {
                    format!("tail -n {} {} 2>/dev/null || true", tail_lines, path_arg)
                } else if let Some(offset) = offset {
                    format!(
                        "TOTAL=$(wc -l < {path} 2>/dev/null || echo 0); if [ \"$TOTAL\" -gt {offset} ]; then tail -n +{start} {path} 2>/dev/null || true; else tail -n {tail_lines} {path} 2>/dev/null || true; fi",
                        path = path_arg,
                        offset = offset,
                        start = offset + 1,
                        tail_lines = tail_lines,
                    )
                } else {
                    format!("tail -n {} {} 2>/dev/null || true", tail_lines, path_arg)
                }
            }),
        "systemd" => source
            .systemd_unit
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|unit| {
                format!(
                    "journalctl -u {} -n {} --no-pager 2>/dev/null || true",
                    shell_quote(unit),
                    tail_lines
                )
            }),
        "docker" => source
            .docker_container_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|container| {
                format!(
                    "docker logs --tail {} {} 2>&1 || true",
                    tail_lines,
                    shell_quote(container)
                )
            }),
        "custom" => source
            .custom_command
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|command| format!("timeout 8s sh -lc {} 2>&1 || true", shell_quote(command))),
        _ => work_dir
            .filter(|value| !value.trim().is_empty())
            .map(|dir| {
                format!(
                    "cd {} && tail -n {} logs/*.log 2>/dev/null || true",
                    shell_quote(dir.trim()),
                    tail_lines
                )
            }),
    }
}

fn capture_log_offset(conn: &mut SshConnection, config: &ServiceRuntimeConfig) -> Option<u64> {
    let path = config
        .log_source
        .as_ref()
        .filter(|source| source.source_type == "file")
        .and_then(|source| source.log_path.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty() && !value.contains('*'))?;
    let command = format!("wc -l < {} 2>/dev/null || echo 0", shell_quote(path));
    conn.execute_privileged_with_cancel(&command, || false)
        .ok()
        .and_then(|result| result.output.trim().parse::<u64>().ok())
}

fn append_log(app: &AppHandle, task: &mut ServiceOperationTask, line: impl Into<String>) {
    let line = line.into();
    task.output_lines.push(line.clone());
    let _ = app.emit(
        "service-operation-log",
        ServiceOperationLogEvent {
            task_id: task.id.clone(),
            line,
        },
    );
}

fn emit_task(app: &AppHandle, task: &ServiceOperationTask) {
    let _ = app.emit("service-operation-updated", task.clone());
}

fn save_history(
    app: &AppHandle,
    task: &ServiceOperationTask,
    started_at: &str,
    finished_at: &str,
) {
    let Ok(config) = service_ops_repo::get_service_runtime_config(app, &task.service_runtime_config_id) else {
        return;
    };
    let server = deployment_repo::get_server_profile_for_execution(app, &config.server_id).ok();
    let server_host = server
        .as_ref()
        .map(|item| format!("{}@{}:{}", item.username, item.host, item.port))
        .unwrap_or_else(|| config.server_id.clone());
    let history = ServiceOperationHistory {
        id: Uuid::new_v4().to_string(),
        operation_type: task.task_type.clone(),
        service_name: config.service_name,
        environment_name: config.environment_id,
        server_host,
        command: task.command.clone(),
        result: if task.status == "success" {
            "success".to_string()
        } else {
            "failed".to_string()
        },
        started_at: started_at.to_string(),
        finished_at: Some(finished_at.to_string()),
        operator: None,
        error_message: task.error_message.clone(),
    };
    let _ = service_ops_repo::save_service_operation_history(app, history);
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

#[allow(dead_code)]
fn map_error(error: impl ToString) -> String {
    to_user_error(error.to_string())
}
