use crate::error::AppResult;
use crate::models::service_ops::{
    RemoteLogLineEvent, RemoteLogSession, ServiceLogConfig, StartRemoteLogSessionPayload,
};
use crate::repositories::{deployment_repo, service_ops_repo};
use crate::services::ssh_transport_service::SshConnection;
use chrono::Utc;
use std::collections::HashSet;
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

#[derive(Default)]
pub struct RemoteLogSessionState {
    stopped: Mutex<HashSet<String>>,
}

impl RemoteLogSessionState {
    pub fn clear(&self, session_id: &str) {
        if let Ok(mut guard) = self.stopped.lock() {
            guard.remove(session_id);
        }
    }

    pub fn stop(&self, session_id: &str) {
        if let Ok(mut guard) = self.stopped.lock() {
            guard.insert(session_id.to_string());
        }
    }

    pub fn is_stopped(&self, session_id: &str) -> bool {
        self.stopped
            .lock()
            .map(|guard| guard.contains(session_id))
            .unwrap_or(true)
    }
}

pub fn start_remote_log_session(
    app: AppHandle,
    payload: StartRemoteLogSessionPayload,
) -> AppResult<RemoteLogSession> {
    let config = service_ops_repo::get_service_runtime_config(
        &app,
        &payload.service_runtime_config_id,
    )?;
    let command = build_log_command(
        config.log_source.as_ref(),
        config.work_dir.as_deref(),
        payload.tail_lines,
    )?;
    let session = RemoteLogSession {
        id: Uuid::new_v4().to_string(),
        service_runtime_config_id: config.id.clone(),
        server_id: config.server_id.clone(),
        command,
        status: "connecting".to_string(),
        started_at: Utc::now().to_rfc3339(),
        stopped_at: None,
        keyword: payload.keyword,
        auto_scroll: true,
    };
    app.state::<RemoteLogSessionState>().clear(&session.id);
    let spawned_session = session.clone();
    thread::spawn(move || {
        run_session(app, spawned_session);
    });
    Ok(session)
}

pub fn stop_remote_log_session(app: AppHandle, session_id: String) -> AppResult<()> {
    app.state::<RemoteLogSessionState>().stop(&session_id);
    Ok(())
}

fn run_session(app: AppHandle, mut session: RemoteLogSession) {
    let _ = app.emit("remote-log-session-updated", session.clone());
    let result = stream_remote_logs(&app, &session);
    session.stopped_at = Some(Utc::now().to_rfc3339());
    session.status = match result {
        Ok(()) => "stopped".to_string(),
        Err(error) => {
            let _ = app.emit(
                "remote-log-line",
                RemoteLogLineEvent {
                    session_id: session.id.clone(),
                    line: format!("日志会话失败：{}", error),
                },
            );
            "failed".to_string()
        }
    };
    let _ = app.emit("remote-log-session-updated", session.clone());
    app.state::<RemoteLogSessionState>().clear(&session.id);
}

fn stream_remote_logs(app: &AppHandle, session: &RemoteLogSession) -> Result<(), String> {
    let server = deployment_repo::get_server_profile_for_execution(app, &session.server_id)
        .map_err(|error| error.to_string())?;
    let mut conn = SshConnection::connect(&server, || {
        app.state::<RemoteLogSessionState>().is_stopped(&session.id)
    })
    .map_err(|error| error.to_string())?;
    conn.configure_privilege(&server.privilege, server.privilege_password.clone());
    let mut streaming_session = session.clone();
    streaming_session.status = "streaming".to_string();
    let _ = app.emit("remote-log-session-updated", streaming_session);
    let session_id = session.id.clone();
    conn.stream_privileged_with_cancel(
        &session.command,
        || app.state::<RemoteLogSessionState>().is_stopped(&session.id),
        |line| {
            let _ = app.emit(
                "remote-log-line",
                RemoteLogLineEvent {
                    session_id: session_id.clone(),
                    line,
                },
            );
        },
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn build_log_command(
    source: Option<&ServiceLogConfig>,
    work_dir: Option<&str>,
    tail_lines: Option<u32>,
) -> AppResult<String> {
    let default_tail = source.map(|item| item.tail_lines).unwrap_or(300);
    let tail_lines = tail_lines.unwrap_or(default_tail).clamp(50, 5000);
    let Some(source) = source else {
        return work_dir
            .filter(|value| !value.trim().is_empty())
            .map(|dir| {
                format!(
                    "cd {} && tail -n {} -F logs/*.log",
                    shell_quote(dir.trim()),
                    tail_lines
                )
            })
            .ok_or_else(|| "当前服务未配置日志来源，请先配置日志路径、systemd、Docker 或自定义命令。".to_string());
    };

    match source.source_type.as_str() {
        "custom" => source
            .custom_command
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .ok_or_else(|| "当前服务未配置自定义日志命令。".to_string()),
        "file" => {
            let path = source
                .log_path
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "当前服务未配置日志文件路径。".to_string())?;
            let path_arg = if path.contains('*') {
                path.to_string()
            } else {
                shell_quote(path)
            };
            Ok(format!("tail -n {} -F {}", tail_lines, path_arg))
        }
        "systemd" => source
            .systemd_unit
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|unit| format!("journalctl -u {} -f -n {}", shell_quote(unit), tail_lines))
            .ok_or_else(|| "当前服务未配置 systemd Unit。".to_string()),
        "docker" => source
            .docker_container_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|container| {
                format!(
                    "docker logs -f --tail {} {}",
                    tail_lines,
                    shell_quote(container)
                )
            })
            .ok_or_else(|| "当前服务未配置 Docker 容器名称。".to_string()),
        _ => Err("暂不支持的日志来源类型。".to_string()),
    }
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}
