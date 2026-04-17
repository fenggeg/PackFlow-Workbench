use crate::error::{to_user_error, AppResult};
use crate::models::build::{BuildFinishedEvent, BuildLogEvent, StartBuildPayload};
use encoding_rs::GBK;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Instant;
use tauri::{Emitter, Window};
use uuid::Uuid;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Default)]
pub struct BuildProcessState {
    processes: Mutex<HashMap<String, u32>>,
}

pub fn start_build(
    window: Window,
    state: tauri::State<'_, BuildProcessState>,
    payload: StartBuildPayload,
) -> AppResult<String> {
    if payload.command.trim().is_empty() {
        return Err(to_user_error("构建命令不能为空。"));
    }

    let build_id = Uuid::new_v4().to_string();
    let mut command = Command::new("cmd");
    command
        .args(["/C", payload.command.as_str()])
        .current_dir(&payload.project_root)
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(java_home) = payload.java_home.as_deref() {
        command.env("JAVA_HOME", java_home);
    }

    let mut child = command
        .spawn()
        .map_err(|error| to_user_error(format!("无法启动构建进程：{}", error)))?;
    let pid = child.id();

    state
        .processes
        .lock()
        .map_err(|_| to_user_error("构建进程状态被占用，请稍后重试。"))?
        .insert(build_id.clone(), pid);

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let window_for_stdout = window.clone();
    let stdout_build_id = build_id.clone();
    if let Some(stdout) = stdout {
        thread::spawn(move || emit_reader(window_for_stdout, stdout_build_id, "stdout", stdout));
    }

    let window_for_stderr = window.clone();
    let stderr_build_id = build_id.clone();
    if let Some(stderr) = stderr {
        thread::spawn(move || emit_reader(window_for_stderr, stderr_build_id, "stderr", stderr));
    }

    let window_for_wait = window.clone();
    let wait_build_id = build_id.clone();
    thread::spawn(move || {
        let started_at = Instant::now();
        let status = match child.wait() {
            Ok(exit_status) if exit_status.success() => "SUCCESS",
            Ok(_) => "FAILED",
            Err(_) => "FAILED",
        };
        let _ = window_for_wait.emit(
            "build-finished",
            BuildFinishedEvent {
                build_id: wait_build_id,
                status: status.to_string(),
                duration_ms: started_at.elapsed().as_millis(),
            },
        );
    });

    let _ = window.emit(
        "build-log",
        BuildLogEvent {
            build_id: build_id.clone(),
            stream: "system".to_string(),
            line: format!("启动构建：{}", payload.command),
        },
    );

    Ok(build_id)
}

pub fn cancel_build(
    window: Window,
    state: tauri::State<'_, BuildProcessState>,
    build_id: &str,
) -> AppResult<()> {
    let pid = state
        .processes
        .lock()
        .map_err(|_| to_user_error("构建进程状态被占用，请稍后重试。"))?
        .remove(build_id);

    if let Some(pid) = pid {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        let _ = window.emit(
            "build-finished",
            BuildFinishedEvent {
                build_id: build_id.to_string(),
                status: "CANCELLED".to_string(),
                duration_ms: 0,
            },
        );
    }

    Ok(())
}

fn emit_reader<R: std::io::Read + Send + 'static>(
    window: Window,
    build_id: String,
    stream: &str,
    reader: R,
) {
    let stream = stream.to_string();
    let mut reader = BufReader::new(reader);
    let mut buffer = Vec::new();

    loop {
        buffer.clear();
        match reader.read_until(b'\n', &mut buffer) {
            Ok(0) => break,
            Ok(_) => {
                let line = decode_log_line(&buffer);
                let _ = window.emit(
                    "build-log",
                    BuildLogEvent {
                        build_id: build_id.clone(),
                        stream: stream.clone(),
                        line,
                    },
                );
            }
            Err(error) => {
                let _ = window.emit(
                    "build-log",
                    BuildLogEvent {
                        build_id: build_id.clone(),
                        stream: "system".to_string(),
                        line: format!("读取日志失败：{}", error),
                    },
                );
                break;
            }
        }
    }
}

fn decode_log_line(bytes: &[u8]) -> String {
    let mut line = bytes;
    while line.last().is_some_and(|byte| *byte == b'\n' || *byte == b'\r') {
        line = &line[..line.len() - 1];
    }

    match String::from_utf8(line.to_vec()) {
        Ok(value) => value,
        Err(_) => {
            let (decoded, _, _) = GBK.decode(line);
            decoded.into_owned()
        }
    }
}
