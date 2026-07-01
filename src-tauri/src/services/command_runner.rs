use crate::error::{to_user_error, AppResult};
use crate::models::command_template::{CommandExecution, CommandStep, CommandTemplate};
use crate::repositories::{command_template_repo, deployment_repo::ExecutionServerProfile};
use crate::services::ssh_transport_service::SshConnection;
use crate::services::token_expansion::expand_template;
use chrono::Utc;
use serde_json::json;
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

/// 命令执行控制状态
pub struct CommandControlState {
    cancel_requests: Mutex<HashMap<String, bool>>,
    background_channels: Mutex<HashMap<String, Arc<Mutex<ssh2::Session>>>>,
    background_executions: Mutex<HashMap<String, bool>>,
}

impl Default for CommandControlState {
    fn default() -> Self {
        Self {
            cancel_requests: Mutex::new(HashMap::new()),
            background_channels: Mutex::new(HashMap::new()),
            background_executions: Mutex::new(HashMap::new()),
        }
    }
}

impl CommandControlState {
    pub fn clear(&self, execution_id: &str) {
        if let Ok(mut map) = self.cancel_requests.lock() {
            map.remove(execution_id);
        }
        // 不清除后台执行状态和通道，由后台线程结束时通过 clear_background 自行清理
        // 如果在这里清除，前端 checkBackgroundExecution 会返回 false，导致断开日志按钮消失
        if !self.has_background_execution(execution_id) {
            if let Ok(mut map) = self.background_channels.lock() {
                map.remove(execution_id);
            }
            if let Ok(mut map) = self.background_executions.lock() {
                map.remove(execution_id);
            }
        }
    }

    pub fn request_cancel(&self, execution_id: &str) -> AppResult<()> {
        if let Ok(mut map) = self.cancel_requests.lock() {
            map.insert(execution_id.to_string(), true);
        }
        Ok(())
    }

    pub fn is_cancelled(&self, execution_id: &str) -> bool {
        if let Ok(map) = self.cancel_requests.lock() {
            map.get(execution_id).copied().unwrap_or(false)
        } else {
            false
        }
    }

    pub fn register_background_channel(&self, execution_id: &str, session: Arc<Mutex<ssh2::Session>>) {
        if let Ok(mut map) = self.background_channels.lock() {
            map.insert(execution_id.to_string(), session);
        }
    }

    pub fn register_background_execution(&self, execution_id: &str) {
        if let Ok(mut map) = self.background_executions.lock() {
            map.insert(execution_id.to_string(), true);
        }
    }

    pub fn has_background_execution(&self, execution_id: &str) -> bool {
        if let Ok(map) = self.background_executions.lock() {
            map.get(execution_id).copied().unwrap_or(false)
        } else {
            false
        }
    }

    pub fn clear_background(&self, execution_id: &str) {
        if let Ok(mut map) = self.background_channels.lock() {
            map.remove(execution_id);
        }
        if let Ok(mut map) = self.background_executions.lock() {
            map.remove(execution_id);
        }
    }

    pub fn force_disconnect_background(&self, execution_id: &str) {
        if let Ok(mut map) = self.cancel_requests.lock() {
            map.insert(execution_id.to_string(), true);
        }
        // 不在此处获取 session 锁并断开连接，因为后台线程可能正持有该锁
        // 同步获取锁会导致死锁或长时间等待，造成 UI 无响应
        // 后台线程会在下一次循环中检测到取消标记，自行关闭 channel 并退出
    }
}

/// 执行模板参数
#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteTemplatePayload {
    pub template_id: String,
    pub server_id: String,
    #[serde(default)]
    pub variables: HashMap<String, String>,
    #[serde(default)]
    pub local_artifact_path: Option<String>,
}

/// 执行模板
pub fn execute_template(app: AppHandle, payload: ExecuteTemplatePayload) -> AppResult<String> {
    // 获取模板
    let template = command_template_repo::get_template(&app, &payload.template_id)?;

    // 获取服务器配置
    let server = crate::repositories::deployment_repo::get_server_profile_for_execution(&app, &payload.server_id)?;

    let execution_id = Uuid::new_v4().to_string();
    let execution = CommandExecution {
        id: execution_id.clone(),
        template_id: template.id.clone(),
        template_name: template.name.clone(),
        server_id: server.id.clone(),
        server_name: Some(server.name.clone()),
        status: "running".to_string(),
        logs: Vec::new(),
        started_at: Utc::now().to_rfc3339(),
        finished_at: None,
        variables_used: json!(payload.variables),
    };

    // 保存执行记录
    command_template_repo::save_execution(&app, &execution)?;

    // 清除取消状态
    app.state::<CommandControlState>().clear(&execution_id);

    let spawned_id = execution_id.clone();
    let app_handle = app.clone();

    thread::spawn(move || {
        let result = run_template(
            &app_handle,
            &spawned_id,
            &template,
            &server,
            &payload.variables,
            payload.local_artifact_path.as_deref(),
        );

        let mut final_execution = execution.clone();
        final_execution.finished_at = Some(Utc::now().to_rfc3339());

        match result {
            Ok(_) => {
                final_execution.status = "success".to_string();
                final_execution.logs.push("[执行完成] 所有步骤执行成功".to_string());
            }
            Err(error) => {
                final_execution.status = "failed".to_string();
                final_execution.logs.push(format!("[执行失败] {}", error));
            }
        }

        let _ = command_template_repo::save_execution(&app_handle, &final_execution);
        let _ = app_handle.emit("command-execution-finished", &final_execution);
        app_handle.state::<CommandControlState>().clear(&spawned_id);
    });

    Ok(execution_id)
}

/// 取消执行
pub fn cancel_execution(app: AppHandle, execution_id: String) -> AppResult<()> {
    let state = app.state::<CommandControlState>();
    state.request_cancel(&execution_id)?;
    if state.has_background_execution(&execution_id) {
        state.force_disconnect_background(&execution_id);
    }

    let _ = app.emit(
        "command-execution-log",
        json!({
            "executionId": execution_id,
            "line": "[系统] 已请求停止执行，正在等待当前步骤退出..."
        }),
    );

    Ok(())
}

/// 断开日志连接（直接关闭底层 TCP 连接）
pub fn disconnect_log(app: AppHandle, execution_id: String) -> AppResult<()> {
    let state = app.state::<CommandControlState>();

    if !state.has_background_execution(&execution_id) {
        return Err(to_user_error("没有活跃的日志连接"));
    }

    state.force_disconnect_background(&execution_id);

    Ok(())
}

/// 运行模板
fn run_template(
    app: &AppHandle,
    execution_id: &str,
    template: &CommandTemplate,
    server: &ExecutionServerProfile,
    variables: &HashMap<String, String>,
    local_artifact_path: Option<&str>,
) -> AppResult<()> {
    let state = app.state::<CommandControlState>();

    // 检查取消
    if state.is_cancelled(execution_id) {
        return Err(to_user_error("执行已取消"));
    }

    // 构建变量映射
    let mut expanded_vars = variables.clone();

    // 添加内置变量
    if let Some(artifact_path) = local_artifact_path {
        let path = Path::new(artifact_path);
        expanded_vars.insert("artifactPath".to_string(), artifact_path.to_string());
        expanded_vars.insert(
            "artifactName".to_string(),
            path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default(),
        );
    }
    expanded_vars.insert("serverHost".to_string(), server.host.clone());
    expanded_vars.insert("serverPort".to_string(), server.port.to_string());
    expanded_vars.insert("timestamp".to_string(), Utc::now().format("%Y%m%d%H%M%S").to_string());

    // 添加模板变量的默认值
    for var in &template.variables {
        if !expanded_vars.contains_key(&var.key) {
            if let Some(default) = &var.default_value {
                expanded_vars.insert(var.key.clone(), default.clone());
            }
        }
    }

    // 建立 SSH 连接
    emit_log(app, execution_id, "[连接] 正在建立 SSH 连接...");
    let mut connection = SshConnection::connect(server, || state.is_cancelled(execution_id))?;

    // 配置提权
    connection.configure_privilege(&server.privilege, server.privilege_password.clone());
    emit_log(app, execution_id, "[连接] SSH 连接成功");

    // 执行步骤
    run_steps(app, execution_id, &template.steps, &mut connection, &expanded_vars, &state)?;

    Ok(())
}

/// 执行步骤列表
fn run_steps(
    app: &AppHandle,
    execution_id: &str,
    steps: &[CommandStep],
    connection: &mut SshConnection,
    variables: &HashMap<String, String>,
    state: &CommandControlState,
) -> AppResult<()> {
    let total_steps = steps.len();
    
    for (index, step) in steps.iter().enumerate() {
        // 检查取消
        if state.is_cancelled(execution_id) {
            return Err(to_user_error("执行已取消"));
        }

        let step_num = index + 1;
        let step_name = step.name.as_deref().unwrap_or("未命名步骤");
        let is_last_step = step_num == total_steps;
        let is_non_blocking = !step.affects_status;

        emit_log(
            app,
            execution_id,
            &format!("[步骤 {}/{}] 开始执行: {}", step_num, total_steps, step_name),
        );

        // 对于最后一步且不影响状态的步骤，在后台运行
        if is_last_step && is_non_blocking && step.step_type == "command" {
            emit_log(
                app,
                execution_id,
                &format!("[步骤 {}/{}] 后台运行（不影响状态）: {}", step_num, total_steps, step_name),
            );
            if let Some(cmd_session) = &connection.command_session {
                let cmd_session_clone = cmd_session.clone();
                let app_clone = app.clone();
                let eid = execution_id.to_string();
                let cmd = step.command.clone().unwrap_or_default();
                let expanded_cmd = expand_template(&cmd, variables);
                
                app.state::<CommandControlState>().register_background_channel(&eid, cmd_session_clone.clone());
                app.state::<CommandControlState>().register_background_execution(&eid);
                
                std::thread::spawn(move || {
                    if let Ok(guard) = cmd_session_clone.lock() {
                        if let Ok(mut channel) = guard.channel_session() {
                            if channel.exec(&expanded_cmd).is_ok() {
                                guard.set_blocking(false);
                                let mut buf = [0u8; 4096];
                                let mut pending = Vec::<u8>::new();
                                let mut batch = Vec::<String>::new();
                                let mut last_flush = std::time::Instant::now();
                                let flush_interval = std::time::Duration::from_millis(30);
                                loop {
                                    if app_clone.state::<CommandControlState>().is_cancelled(&eid) {
                                        let _ = channel.close();
                                        flush_batch(&app_clone, &eid, &mut batch);
                                        let _ = app_clone.emit("command-execution-log", json!({
                                            "executionId": eid,
                                            "line": "[系统] 日志连接已断开",
                                            "disconnected": true
                                        }));
                                        break;
                                    }
                                    match channel.read(&mut buf) {
                                        Ok(0) => {
                                            if channel.eof() {
                                                if !pending.is_empty() {
                                                    drain_pending(&mut pending, &mut batch);
                                                }
                                                flush_batch(&app_clone, &eid, &mut batch);
                                                let _ = app_clone.emit("command-execution-log", json!({
                                                    "executionId": eid,
                                                    "line": "[系统] 日志连接已断开",
                                                    "disconnected": true
                                                }));
                                                break;
                                            }
                                            if last_flush.elapsed() >= flush_interval {
                                                flush_batch(&app_clone, &eid, &mut batch);
                                                last_flush = std::time::Instant::now();
                                            }
                                            std::thread::sleep(std::time::Duration::from_millis(10));
                                        }
                                        Ok(n) => {
                                            pending.extend_from_slice(&buf[..n]);
                                            drain_pending(&mut pending, &mut batch);
                                            if batch.len() >= 20 || last_flush.elapsed() >= flush_interval {
                                                flush_batch(&app_clone, &eid, &mut batch);
                                                last_flush = std::time::Instant::now();
                                            }
                                        }
                                        Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                                            if !batch.is_empty() {
                                                flush_batch(&app_clone, &eid, &mut batch);
                                                last_flush = std::time::Instant::now();
                                            }
                                            std::thread::sleep(std::time::Duration::from_millis(10));
                                        }
                                        Err(_) => {
                                            flush_batch(&app_clone, &eid, &mut batch);
                                            let _ = app_clone.emit("command-execution-log", json!({
                                                "executionId": eid,
                                                "line": "[系统] 日志连接已断开",
                                                "disconnected": true
                                            }));
                                            break;
                                        }
                                    }
                                }
                                guard.set_blocking(true);
                            }
                        }
                    }
                    app_clone.state::<CommandControlState>().clear_background(&eid);
                });
            }
            continue;
        }

        let result = match step.step_type.as_str() {
            "upload" => execute_upload_step(app, execution_id, step, connection, variables, state),
            "command" => execute_command_step(app, execution_id, step, connection, variables, state),
            "wait" => {
                let wait_seconds = step.wait_seconds.unwrap_or(5);
                emit_log(app, execution_id, &format!("[等待] 等待 {} 秒...", wait_seconds));
                thread::sleep(std::time::Duration::from_secs(wait_seconds));
                emit_log(app, execution_id, "[等待] 等待完成");
                Ok(())
            },
            _ => Err(to_user_error(&format!("未知的步骤类型: {}", step.step_type))),
        };

        match result {
            Ok(_) => {
                emit_log(
                    app,
                    execution_id,
                    &format!("[步骤 {}/{}] 执行成功: {}", step_num, total_steps, step_name),
                );
            }
            Err(error) => {
                if step.ignore_error || !step.affects_status {
                    let tag = if !step.affects_status { "不影响状态" } else { "已忽略" };
                    emit_log(
                        app,
                        execution_id,
                        &format!(
                            "[步骤 {}/{}] 执行失败（{}）: {}",
                            step_num, total_steps, tag, error
                        ),
                    );
                } else {
                    return Err(error);
                }
            }
        }
    }

    Ok(())
}

/// 执行上传步骤
fn execute_upload_step(
    app: &AppHandle,
    execution_id: &str,
    step: &CommandStep,
    connection: &mut SshConnection,
    variables: &HashMap<String, String>,
    state: &CommandControlState,
) -> AppResult<()> {
    eprintln!("[上传] execute_upload_step 开始执行");
    
    let local_path = step
        .local_path
        .as_deref()
        .ok_or_else(|| to_user_error("上传步骤缺少本地路径"))?;
    let remote_path = step
        .remote_path
        .as_deref()
        .ok_or_else(|| to_user_error("上传步骤缺少远程路径"))?;

    eprintln!("[上传] 本地路径: {}", local_path);
    eprintln!("[上传] 远程路径: {}", remote_path);

    // 展开变量
    let expanded_local = expand_template(local_path, variables).trim().to_string();
    let expanded_remote = expand_template(remote_path, variables).trim().to_string();

    eprintln!("[上传] 展开后本地路径: {}", expanded_local);
    eprintln!("[上传] 展开后远程路径: {}", expanded_remote);

    // 检查本地文件是否存在
    if !Path::new(&expanded_local).exists() {
        let error_msg = format!("本地文件不存在: {}", expanded_local);
        eprintln!("[上传] 错误: {}", error_msg);
        emit_log(app, execution_id, &format!("[上传] ❌ 错误: {}", error_msg));
        return Err(to_user_error(&error_msg));
    }

    // 获取文件大小
    let file_size = std::fs::metadata(&expanded_local)
        .map(|m| m.len())
        .unwrap_or(0);
    let file_size_mb = file_size as f64 / 1024.0 / 1024.0;

    eprintln!("[上传] 文件大小: {:.1} MB", file_size_mb);

    emit_log(
        app,
        execution_id,
        &format!("[上传] {} -> {} ({:.1} MB)", expanded_local, expanded_remote, file_size_mb),
    );
    emit_log(app, execution_id, "[上传] 开始上传...");

    eprintln!("[上传] 调用 upload_file_with_progress...");

    // 上传文件
    let app_handle = app.clone();
    let eid = execution_id.to_string();

    connection.upload_file_with_progress(
        Path::new(&expanded_local),
        &expanded_remote,
        || state.is_cancelled(execution_id),
        move |uploaded, total, speed| {
            let percent = if total > 0 {
                (uploaded as f64 / total as f64 * 100.0).round()
            } else {
                0.0
            };
            let speed_str = speed
                .map(|s| format!("{:.1} MB/s", s / 1024.0 / 1024.0))
                .unwrap_or_default();
            let _ = app_handle.emit(
                "command-execution-upload-progress",
                json!({
                    "executionId": eid,
                    "percent": percent,
                    "uploaded": uploaded,
                    "total": total,
                    "speed": speed_str,
                }),
            );
        },
    )?;

    emit_log(app, execution_id, &format!("[上传] 文件上传完成 ({:.1} MB)", file_size_mb));

    Ok(())
}

/// 执行命令步骤
fn execute_command_step(
    app: &AppHandle,
    execution_id: &str,
    step: &CommandStep,
    connection: &mut SshConnection,
    variables: &HashMap<String, String>,
    state: &CommandControlState,
) -> AppResult<()> {
    let command = step
        .command
        .as_deref()
        .ok_or_else(|| to_user_error("命令步骤缺少命令内容"))?;

    // 展开变量
    let expanded_command = expand_template(command, variables);

    let full_command = if let Some(working_dir) = &step.working_dir {
        let expanded_dir = expand_template(working_dir, variables).trim().to_string();
        format!("cd {} && {}", shell_quote(&expanded_dir), expanded_command)
    } else {
        expanded_command.clone()
    };

    // 如果有超时，包装命令
    let final_command = if let Some(timeout) = step.timeout_seconds {
        if timeout > 0 {
            format!("timeout {}s {}", timeout, full_command)
        } else {
            full_command
        }
    } else {
        full_command
    };

    emit_log(
        app,
        execution_id,
        &format!("[命令] {}", expanded_command),
    );
    if let Some(timeout) = step.timeout_seconds {
        if timeout > 0 {
            emit_log(app, execution_id, &format!("[命令] 超时设置: {} 秒", timeout));
        }
    }

    // 执行命令并流式输出
    let app_handle = app.clone();
    let eid = execution_id.to_string();

    let exit_code = if step.privileged {
        connection.stream_privileged_with_cancel(
            &final_command,
            || state.is_cancelled(execution_id),
            move |line| {
                let _ = app_handle.emit(
                    "command-execution-log",
                    json!({
                        "executionId": eid,
                        "line": line
                    }),
                );
            },
        )?
    } else {
        connection.stream_with_cancel(
            &final_command,
            || state.is_cancelled(execution_id),
            move |line| {
                let _ = app_handle.emit(
                    "command-execution-log",
                    json!({
                        "executionId": eid,
                        "line": line
                    }),
                );
            },
        )?
    };

    if exit_code != 0 {
        return Err(to_user_error(&format!(
            "命令执行失败，退出码: {}",
            exit_code
        )));
    }

    Ok(())
}

/// 发送日志
fn emit_log(app: &AppHandle, execution_id: &str, line: &str) {
    let _ = app.emit(
        "command-execution-log",
        json!({
            "executionId": execution_id,
            "line": line
        }),
    );
}

/// Shell 引用
fn shell_quote(s: &str) -> String {
    if s.is_empty() {
        return "''".to_string();
    }

    let needs_quote = s.chars().any(|c| {
        c.is_whitespace()
            || c == '\''
            || c == '"'
            || c == '\\'
            || c == '('
            || c == ')'
            || c == '['
            || c == ']'
            || c == '{'
            || c == '}'
            || c == '$'
            || c == '`'
            || c == '!'
            || c == '#'
            || c == '&'
            || c == '|'
            || c == ';'
            || c == '<'
            || c == '>'
            || c == '?'
            || c == '*'
            || c == '~'
    });

    if !needs_quote {
        return s.to_string();
    }

    let escaped = s.replace('\'', "'\\''");
    format!("'{}'", escaped)
}

fn drain_pending(pending: &mut Vec<u8>, batch: &mut Vec<String>) {
    while let Some(idx) = pending.iter().position(|b| *b == b'\n') {
        let mut line = pending.drain(..=idx).collect::<Vec<u8>>();
        if line.ends_with(&[b'\n']) {
            line.pop();
        }
        if line.ends_with(&[b'\r']) {
            line.pop();
        }
        let s = match String::from_utf8(line) {
            Ok(s) => s,
            Err(e) => String::from_utf8_lossy(e.as_bytes()).into_owned(),
        };
        batch.push(s);
    }
}

fn flush_batch(app: &AppHandle, execution_id: &str, batch: &mut Vec<String>) {
    if batch.is_empty() {
        return;
    }
    let lines: Vec<&str> = batch.iter().map(|s| s.as_str()).collect();
    let _ = app.emit(
        "command-execution-log",
        json!({
            "executionId": execution_id,
            "lines": lines
        }),
    );
    batch.clear();
}
