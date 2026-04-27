use crate::error::{to_user_error, AppResult};
use crate::models::build::{BuildFinishedEvent, BuildLogEvent, StartBuildPayload};
use crate::services::app_logger;
use encoding_rs::GBK;
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::mem::{size_of, zeroed};
use std::os::windows::io::AsRawHandle;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;
use tauri::{Emitter, Manager, Window};
use uuid::Uuid;
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Default)]
pub struct BuildProcessState {
    processes: Arc<Mutex<HashMap<String, u32>>>,
    job_handles: Arc<Mutex<HashMap<String, isize>>>,
    log_paths: Arc<Mutex<HashMap<String, PathBuf>>>,
    cancelled_builds: Arc<Mutex<HashSet<String>>>,
}

pub fn start_build(
    window: Window,
    state: tauri::State<'_, BuildProcessState>,
    payload: StartBuildPayload,
) -> AppResult<String> {
    if payload.command.trim().is_empty() {
        return Err(to_user_error("构建命令不能为空。"));
    }

    let app = window.app_handle().clone();
    let build_id = Uuid::new_v4().to_string();
    let build_log_path = app_logger::build_log_path(&app, &build_id)?;
    app_logger::log_info(
        &app,
        "build.start",
        format!(
            "build_id={}, project_root={}, module_path={}, module_artifact_id={}, java_home={}, maven_home={}, use_maven_wrapper={}, command={}, build_log={}",
            build_id,
            payload.project_root,
            if payload.module_path.is_empty() {
                "<all>"
            } else {
                payload.module_path.as_str()
            },
            payload.module_artifact_id.as_deref().unwrap_or("<empty>"),
            payload.java_home.as_deref().unwrap_or("<empty>"),
            payload.maven_home.as_deref().unwrap_or("<empty>"),
            payload.use_maven_wrapper,
            payload.command,
            build_log_path.to_string_lossy()
        ),
    );
    app_logger::append_build_line(&build_log_path, "system", format!("build_id={}", build_id));
    app_logger::append_build_line(
        &build_log_path,
        "system",
        format!("project_root={}", payload.project_root),
    );
    app_logger::append_build_line(
        &build_log_path,
        "system",
        format!("module_path={}", payload.module_path),
    );
    app_logger::append_build_line(
        &build_log_path,
        "system",
        format!(
            "java_home={}",
            payload.java_home.as_deref().unwrap_or("<empty>")
        ),
    );
    app_logger::append_build_line(
        &build_log_path,
        "system",
        format!(
            "maven_home={}",
            payload.maven_home.as_deref().unwrap_or("<empty>")
        ),
    );
    app_logger::append_build_line(
        &build_log_path,
        "system",
        format!("command={}", payload.command),
    );

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

    let mut child = command.spawn().map_err(|error| {
        app_logger::log_error(
            &app,
            "build.spawn.failed",
            format!("build_id={}, error={}", build_id, error),
        );
        app_logger::append_build_line(
            &build_log_path,
            "system",
            format!("无法启动构建进程：{}", error),
        );
        to_user_error(format!("无法启动构建进程：{}", error))
    })?;
    let pid = child.id();
    let job_handle = match create_kill_on_close_job().and_then(|handle| {
        assign_process_to_job(handle, child.as_raw_handle() as HANDLE).map(|_| handle)
    }) {
        Ok(handle) => Some(handle),
        Err(error) => {
            app_logger::log_warn(
                &app,
                "build.job.assign.failed",
                format!("build_id={}, pid={}, error={}", build_id, pid, error),
            );
            app_logger::append_build_line(
                &build_log_path,
                "system",
                format!(
                    "构建进程 Job 管理启用失败，停止操作将使用备用方式：{}",
                    error
                ),
            );
            None
        }
    };
    app_logger::log_info(
        &app,
        "build.spawn.success",
        format!(
            "build_id={}, pid={}, job={}",
            build_id,
            pid,
            if job_handle.is_some() {
                "enabled"
            } else {
                "disabled"
            }
        ),
    );
    app_logger::append_build_line(&build_log_path, "system", format!("pid={}", pid));

    state
        .processes
        .lock()
        .map_err(|_| to_user_error("构建进程状态被占用，请稍后重试。"))?
        .insert(build_id.clone(), pid);
    if let Some(job_handle) = job_handle {
        state
            .job_handles
            .lock()
            .map_err(|_| to_user_error("构建进程状态被占用，请稍后重试。"))?
            .insert(build_id.clone(), job_handle as isize);
    }
    state
        .log_paths
        .lock()
        .map_err(|_| to_user_error("构建日志状态被占用，请稍后重试。"))?
        .insert(build_id.clone(), build_log_path.clone());

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let window_for_stdout = window.clone();
    let stdout_build_id = build_id.clone();
    let stdout_log_path = build_log_path.clone();
    if let Some(stdout) = stdout {
        thread::spawn(move || {
            emit_reader(
                window_for_stdout,
                stdout_build_id,
                "stdout",
                stdout,
                stdout_log_path,
            )
        });
    }

    let window_for_stderr = window.clone();
    let stderr_build_id = build_id.clone();
    let stderr_log_path = build_log_path.clone();
    if let Some(stderr) = stderr {
        thread::spawn(move || {
            emit_reader(
                window_for_stderr,
                stderr_build_id,
                "stderr",
                stderr,
                stderr_log_path,
            )
        });
    }

    let window_for_wait = window.clone();
    let wait_build_id = build_id.clone();
    let wait_app = app.clone();
    let wait_log_path = build_log_path.clone();
    let wait_processes = state.processes.clone();
    let wait_job_handles = state.job_handles.clone();
    let wait_log_paths = state.log_paths.clone();
    let wait_cancelled_builds = state.cancelled_builds.clone();
    let started_at = Instant::now();
    thread::spawn(move || {
        let wait_result = child.wait();
        let was_cancelled = wait_cancelled_builds
            .lock()
            .map(|mut cancelled_builds| cancelled_builds.remove(&wait_build_id))
            .unwrap_or(false);
        let status = if was_cancelled {
            "CANCELLED"
        } else {
            match wait_result {
                Ok(exit_status) if exit_status.success() => "SUCCESS",
                Ok(exit_status) => {
                    app_logger::append_build_line(
                        &wait_log_path,
                        "system",
                        format!("进程退出码：{}", exit_status),
                    );
                    "FAILED"
                }
                Err(error) => {
                    app_logger::append_build_line(
                        &wait_log_path,
                        "system",
                        format!("等待构建进程失败：{}", error),
                    );
                    "FAILED"
                }
            }
        };
        let duration_ms = started_at.elapsed().as_millis();
        app_logger::append_build_line(
            &wait_log_path,
            "system",
            format!("构建结束：status={}, duration_ms={}", status, duration_ms),
        );
        app_logger::log_info(
            &wait_app,
            "build.finished",
            format!(
                "build_id={}, status={}, duration_ms={}, build_log={}",
                wait_build_id,
                status,
                duration_ms,
                wait_log_path.to_string_lossy()
            ),
        );
        if let Ok(mut processes) = wait_processes.lock() {
            processes.remove(&wait_build_id);
        }
        if let Ok(mut job_handles) = wait_job_handles.lock() {
            if let Some(job_handle) = job_handles.remove(&wait_build_id) {
                close_handle(job_handle as HANDLE);
            }
        }
        if let Ok(mut log_paths) = wait_log_paths.lock() {
            log_paths.remove(&wait_build_id);
        }
        let _ = window_for_wait.emit(
            "build-finished",
            BuildFinishedEvent {
                build_id: wait_build_id,
                status: status.to_string(),
                duration_ms,
            },
        );
    });

    let _ = window.emit(
        "build-log",
        BuildLogEvent {
            build_id: build_id.clone(),
            stream: "system".to_string(),
            line: format!(
                "启动构建：{}（日志文件：{}）",
                payload.command,
                build_log_path.to_string_lossy()
            ),
        },
    );

    Ok(build_id)
}

pub fn cancel_build(
    window: Window,
    state: tauri::State<'_, BuildProcessState>,
    build_id: &str,
) -> AppResult<()> {
    cancel_build_by_id(&window, &state, build_id)
}

fn cancel_build_by_id(
    window: &Window,
    state: &tauri::State<'_, BuildProcessState>,
    build_id: &str,
) -> AppResult<()> {
    let app = window.app_handle().clone();
    app_logger::log_info(&app, "build.cancel.start", format!("build_id={}", build_id));
    let pid = state
        .processes
        .lock()
        .map_err(|_| to_user_error("构建进程状态被占用，请稍后重试。"))?
        .get(build_id)
        .copied();
    let job_handle = state
        .job_handles
        .lock()
        .map_err(|_| to_user_error("构建进程状态被占用，请稍后重试。"))?
        .get(build_id)
        .copied();
    let log_path = state
        .log_paths
        .lock()
        .map_err(|_| to_user_error("构建日志状态被占用，请稍后重试。"))?
        .get(build_id)
        .cloned();

    if let Some(pid) = pid {
        if let Some(log_path) = log_path.as_deref() {
            app_logger::append_build_line(log_path, "system", "用户取消构建");
        }
        let _ = window.emit(
            "build-log",
            BuildLogEvent {
                build_id: build_id.to_string(),
                stream: "system".to_string(),
                line: format!("后端收到停止请求，pid={}", pid),
            },
        );
        if let Ok(mut cancelled_builds) = state.cancelled_builds.lock() {
            cancelled_builds.insert(build_id.to_string());
        }
        let kill_build_id = build_id.to_string();
        let kill_window = window.clone();
        let kill_app = app.clone();
        let kill_processes = state.processes.clone();
        let kill_job_handles = state.job_handles.clone();
        let kill_log_paths = state.log_paths.clone();
        let kill_cancelled_builds = state.cancelled_builds.clone();
        thread::spawn(move || {
            let job_handle = job_handle.map(|handle| handle as HANDLE);
            let kill_output = kill_build_process(pid, job_handle);
            match kill_output {
                Ok(output) if is_process_gone(pid) => {
                    let message = "构建进程已停止。";
                    if let Some(log_path) = log_path.as_deref() {
                        app_logger::append_build_line(log_path, "system", message);
                    }
                    let _ = kill_window.emit(
                        "build-log",
                        BuildLogEvent {
                            build_id: kill_build_id.clone(),
                            stream: "system".to_string(),
                            line: message.to_string(),
                        },
                    );
                    if let Ok(mut processes) = kill_processes.lock() {
                        processes.remove(&kill_build_id);
                    }
                    if let Ok(mut job_handles) = kill_job_handles.lock() {
                        if let Some(job_handle) = job_handles.remove(&kill_build_id) {
                            close_handle(job_handle as HANDLE);
                        }
                    }
                    if let Ok(mut log_paths) = kill_log_paths.lock() {
                        log_paths.remove(&kill_build_id);
                    }
                    app_logger::log_warn(
                        &kill_app,
                        "build.cancelled",
                        format!(
                            "build_id={}, pid={}, output={}",
                            kill_build_id,
                            pid,
                            output.trim()
                        ),
                    );
                    let _ = kill_window.emit(
                        "build-finished",
                        BuildFinishedEvent {
                            build_id: kill_build_id,
                            status: "CANCELLED".to_string(),
                            duration_ms: 0,
                        },
                    );
                }
                Ok(output) => {
                    if let Ok(mut cancelled_builds) = kill_cancelled_builds.lock() {
                        cancelled_builds.remove(&kill_build_id);
                    }
                    let message =
                        "停止构建失败：进程仍在运行，请稍后重试或手动结束 Maven/Java 进程。";
                    if let Some(log_path) = log_path.as_deref() {
                        app_logger::append_build_line(log_path, "system", message);
                    }
                    let _ = kill_window.emit(
                        "build-log",
                        BuildLogEvent {
                            build_id: kill_build_id.clone(),
                            stream: "system".to_string(),
                            line: message.to_string(),
                        },
                    );
                    app_logger::log_error(
                        &kill_app,
                        "build.cancel.still.running",
                        format!(
                            "build_id={}, pid={}, output={}",
                            kill_build_id,
                            pid,
                            output.trim()
                        ),
                    );
                }
                Err(error) => {
                    if let Ok(mut cancelled_builds) = kill_cancelled_builds.lock() {
                        cancelled_builds.remove(&kill_build_id);
                    }
                    let message = "停止构建失败，请稍后重试或手动结束 Maven/Java 进程。";
                    if let Some(log_path) = log_path.as_deref() {
                        app_logger::append_build_line(log_path, "system", message);
                    }
                    let _ = kill_window.emit(
                        "build-log",
                        BuildLogEvent {
                            build_id: kill_build_id.clone(),
                            stream: "system".to_string(),
                            line: message.to_string(),
                        },
                    );
                    app_logger::log_error(
                        &kill_app,
                        "build.cancel.kill.failed",
                        format!("build_id={}, pid={}, error={}", kill_build_id, pid, error),
                    );
                }
            }
        });
    } else {
        app_logger::log_warn(
            &app,
            "build.cancel.not_found",
            format!("build_id={}", build_id),
        );
        let _ = window.emit(
            "build-log",
            BuildLogEvent {
                build_id: build_id.to_string(),
                stream: "system".to_string(),
                line: "停止构建失败：未找到运行中的构建进程。".to_string(),
            },
        );
    }

    Ok(())
}

fn create_kill_on_close_job() -> Result<HANDLE, String> {
    unsafe {
        let job_handle = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
        if job_handle.is_null() {
            return Err(format!(
                "CreateJobObjectW failed: {}",
                std::io::Error::last_os_error()
            ));
        }

        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let success = SetInformationJobObject(
            job_handle,
            JobObjectExtendedLimitInformation,
            &mut info as *mut _ as *mut _,
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if success == 0 {
            let error = std::io::Error::last_os_error();
            CloseHandle(job_handle);
            return Err(format!("SetInformationJobObject failed: {}", error));
        }

        Ok(job_handle)
    }
}

fn assign_process_to_job(job_handle: HANDLE, process_handle: HANDLE) -> Result<(), String> {
    unsafe {
        let success = AssignProcessToJobObject(job_handle, process_handle);
        if success == 0 {
            let error = std::io::Error::last_os_error();
            CloseHandle(job_handle);
            return Err(format!("AssignProcessToJobObject failed: {}", error));
        }
    }
    Ok(())
}

fn terminate_job(job_handle: HANDLE) -> Result<String, String> {
    unsafe {
        let success = TerminateJobObject(job_handle, 1);
        if success == 0 {
            return Err(format!(
                "TerminateJobObject failed: {}",
                std::io::Error::last_os_error()
            ));
        }
    }
    Ok("JobObject 已终止构建进程树。".to_string())
}

fn close_handle(handle: HANDLE) {
    unsafe {
        CloseHandle(handle);
    }
}

fn kill_build_process(pid: u32, job_handle: Option<HANDLE>) -> Result<String, String> {
    let mut messages = Vec::new();
    if let Some(job_handle) = job_handle {
        messages.push(terminate_job(job_handle)?);
    }
    messages.push(kill_process_tree(pid)?);
    Ok(messages.join(" "))
}

fn kill_process_tree(pid: u32) -> Result<String, String> {
    let script = format!(
        r#"
$ErrorActionPreference = 'SilentlyContinue'
$root = {pid}
$ids = New-Object 'System.Collections.Generic.List[int]'
function Add-Child([int]$parent) {{
  Get-CimInstance Win32_Process -Filter "ParentProcessId=$parent" | ForEach-Object {{
    $ids.Add([int]$_.ProcessId)
    Add-Child ([int]$_.ProcessId)
  }}
}}
Add-Child $root
$kill = @($ids.ToArray()) + $root | Select-Object -Unique
foreach ($id in $kill) {{
  Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
}}
$remaining = @()
foreach ($id in $kill) {{
  if (Get-Process -Id $id -ErrorAction SilentlyContinue) {{
    $remaining += $id
  }}
}}
'powershell killed=' + (($kill) -join ',') + '; remaining=' + (($remaining) -join ',')
if ($remaining.Count -gt 0) {{ exit 1 }}
"#
    );
    let powershell_output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    let taskkill_output = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("无法执行 taskkill：{}", error))?;
    let taskkill_text = command_output_text(&taskkill_output);

    match powershell_output {
        Ok(output) => {
            let powershell_text = command_output_text(&output);
            if is_process_gone(pid) || is_process_not_found(&taskkill_text) {
                Ok(format!(
                    "{} {}",
                    powershell_text.trim(),
                    taskkill_text.trim()
                ))
            } else {
                Err(format!(
                    "{} {}",
                    powershell_text.trim(),
                    taskkill_text.trim()
                ))
            }
        }
        Err(error) => {
            if is_process_gone(pid) || is_process_not_found(&taskkill_text) {
                Ok(format!(
                    "PowerShell 不可用：{}；{}",
                    error,
                    taskkill_text.trim()
                ))
            } else {
                Err(format!(
                    "PowerShell 不可用：{}；{}",
                    error,
                    taskkill_text.trim()
                ))
            }
        }
    }
}

fn command_output_text(output: &std::process::Output) -> String {
    format!(
        "{}{}",
        decode_command_bytes(&output.stdout),
        decode_command_bytes(&output.stderr)
    )
}

fn decode_command_bytes(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }

    let decoded = std::str::from_utf8(bytes)
        .map(|text| text.to_string())
        .unwrap_or_else(|_| {
            let (text, _, _) = GBK.decode(bytes);
            text.into_owned()
        });

    decoded
        .chars()
        .filter(|character| !character.is_control() || matches!(character, '\r' | '\n' | '\t'))
        .collect()
}

fn is_process_gone(pid: u32) -> bool {
    Command::new("tasklist")
        .args(["/FI", &format!("PID eq {}", pid)])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|output| {
            let text = command_output_text(&output);
            !text.contains(&pid.to_string())
        })
        .unwrap_or(false)
}

fn is_process_not_found(output: &str) -> bool {
    let normalized = output.to_ascii_lowercase();
    normalized.contains("not found")
        || normalized.contains("not running")
        || output.contains("没有找到")
        || output.contains("找不到")
}

fn emit_reader<R: std::io::Read + Send + 'static>(
    window: Window,
    build_id: String,
    stream: &str,
    reader: R,
    log_path: PathBuf,
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
                app_logger::append_build_line(&log_path, &stream, &line);
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
                app_logger::append_build_line(
                    &log_path,
                    "system",
                    format!("读取日志失败：{}", error),
                );
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
    while line
        .last()
        .is_some_and(|byte| *byte == b'\n' || *byte == b'\r')
    {
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
