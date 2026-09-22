use crate::error::AppResult;
use crate::models::build::{BuildCommandPayload, StartBuildPayload};
use crate::services::app_logger;
use crate::services::command_builder;
use crate::services::process_runner::{self, BuildProcessState};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, State, Window};

/// 构建前预检入参：只包含判断「这次构建有没有明显拦路问题」所需的信息
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightPayload {
    pub project_root: String,
    pub module_path: String,
    pub java_home: Option<String>,
    pub maven_home: Option<String>,
    pub maven_path: Option<String>,
    pub use_maven_wrapper: bool,
    pub settings_xml_path: Option<String>,
    pub local_repo_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightCheck {
    pub key: String,
    pub label: String,
    /// pass | warn | fail
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightResult {
    pub ok: bool,
    pub checks: Vec<PreflightCheck>,
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|item| !item.is_empty())
}

fn push_check(
    checks: &mut Vec<PreflightCheck>,
    key: &str,
    label: &str,
    status: &str,
    message: impl Into<String>,
) {
    checks.push(PreflightCheck {
        key: key.to_string(),
        label: label.to_string(),
        status: status.to_string(),
        message: message.into(),
    });
}

/// 纯本地检查（只读文件系统，不跑子进程），开销极小，可在每次构建前调用。
fn run_preflight(payload: &PreflightPayload) -> PreflightResult {
    let mut checks: Vec<PreflightCheck> = Vec::new();
    let root = PathBuf::from(payload.project_root.trim());

    // 1. 项目目录与根 pom
    let project_ready = match non_empty(Some(payload.project_root.as_str())) {
        None => {
            push_check(&mut checks, "project", "项目目录", "fail", "尚未选择项目。");
            false
        }
        Some(_) if !root.is_dir() => {
            push_check(
                &mut checks,
                "project",
                "项目目录",
                "fail",
                format!("项目目录不存在：{}", payload.project_root),
            );
            false
        }
        Some(_) => {
            let pom = root.join("pom.xml");
            if pom.is_file() {
                push_check(&mut checks, "project", "项目目录", "pass", "项目目录与 pom.xml 可访问。");
                true
            } else {
                push_check(
                    &mut checks,
                    "project",
                    "项目目录",
                    "fail",
                    "项目根目录下未找到 pom.xml。",
                );
                false
            }
        }
    };

    // 2. 构建范围
    let modules: Vec<&str> = payload
        .module_path
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .collect();
    if project_ready {
        if modules.is_empty() {
            push_check(&mut checks, "module", "构建范围", "pass", "将构建整个项目。");
        } else {
            let missing: Vec<&str> = modules
                .iter()
                .filter(|module| !root.join(module).is_dir())
                .copied()
                .collect();
            if missing.is_empty() {
                push_check(
                    &mut checks,
                    "module",
                    "构建范围",
                    "pass",
                    format!("已选 {} 个模块，目录均存在。", modules.len()),
                );
            } else {
                push_check(
                    &mut checks,
                    "module",
                    "构建范围",
                    "fail",
                    format!("以下模块目录不存在：{}", missing.join("、")),
                );
            }
        }
    }

    // 3. JDK：必须同时有 java 与 javac，否则编译阶段必然失败
    match non_empty(payload.java_home.as_deref()) {
        Some(home) => {
            let home_path = PathBuf::from(home);
            if !home_path.join("bin").join("java.exe").is_file() {
                push_check(
                    &mut checks,
                    "jdk",
                    "JDK",
                    "fail",
                    "JDK 目录下缺少 bin/java.exe。",
                );
            } else if !crate::services::jdk_scanner::has_javac(&home_path) {
                push_check(
                    &mut checks,
                    "jdk",
                    "JDK",
                    "fail",
                    "该目录缺少 bin/javac.exe，是 JRE 而不是 JDK，无法编译源码。",
                );
            } else {
                push_check(&mut checks, "jdk", "JDK", "pass", "JDK 具备编译器。");
            }
        }
        None => push_check(
            &mut checks,
            "jdk",
            "JDK",
            "fail",
            "未解析到 JDK 目录，构建很可能因找不到 java 而失败。",
        ),
    }

    // 4. Maven 或 Wrapper
    if payload.use_maven_wrapper {
        if root.join("mvnw.cmd").is_file() {
            push_check(&mut checks, "maven", "Maven", "pass", "Maven Wrapper 可用。");
        } else {
            push_check(
                &mut checks,
                "maven",
                "Maven",
                "fail",
                "已启用 Maven Wrapper，但项目根目录缺少 mvnw.cmd。",
            );
        }
    } else {
        let configured = non_empty(payload.maven_path.as_deref())
            .map(PathBuf::from)
            .filter(|path| path.is_file())
            .or_else(|| {
                non_empty(payload.maven_home.as_deref())
                    .map(|home| PathBuf::from(home).join("bin").join("mvn.cmd"))
                    .filter(|path| path.is_file())
            });
        match configured {
            Some(_) => push_check(&mut checks, "maven", "Maven", "pass", "Maven 可执行文件已定位。"),
            None => push_check(
                &mut checks,
                "maven",
                "Maven",
                "warn",
                "未定位到本机 Maven 可执行文件，将依赖 PATH 中的 mvn.cmd。",
            ),
        }
    }

    // 5. settings.xml（仅手动指定时校验）
    if let Some(path) = non_empty(payload.settings_xml_path.as_deref()) {
        if PathBuf::from(path).is_file() {
            push_check(&mut checks, "settings", "settings.xml", "pass", "settings.xml 存在。");
        } else {
            push_check(
                &mut checks,
                "settings",
                "settings.xml",
                "fail",
                format!("指定的 settings.xml 不存在：{}", path),
            );
        }
    }

    // 6. 本地仓库
    if let Some(repo) = non_empty(payload.local_repo_path.as_deref()) {
        if PathBuf::from(repo).is_dir() {
            push_check(&mut checks, "repo", "本地仓库", "pass", "本地仓库目录存在。");
        } else {
            push_check(
                &mut checks,
                "repo",
                "本地仓库",
                "warn",
                "本地仓库目录不存在，首次构建需要完整下载依赖，耗时会更长。",
            );
        }
    }

    let ok = !checks.iter().any(|check| check.status == "fail");
    PreflightResult { ok, checks }
}

#[tauri::command]
pub fn preflight_build(app: AppHandle, payload: PreflightPayload) -> AppResult<PreflightResult> {
    let result = run_preflight(&payload);
    let failed = result
        .checks
        .iter()
        .filter(|check| check.status == "fail")
        .map(|check| check.label.as_str())
        .collect::<Vec<_>>()
        .join("、");
    app_logger::log_info(
        &app,
        "build.preflight",
        format!(
            "project_root={}, ok={}, failed=[{}]",
            payload.project_root, result.ok, failed
        ),
    );
    Ok(result)
}

#[tauri::command]
pub fn build_command_preview(app: AppHandle, payload: BuildCommandPayload) -> AppResult<String> {
    let project_root = payload.options.project_root.clone();
    let module_path = payload.options.selected_module_path.clone();
    let goals = payload.options.goals.join(" ");
    let command = command_builder::build_command_preview(payload);
    app_logger::log_info(
        &app,
        "build.preview",
        format!(
            "project_root={}, module_path={}, goals={}, command={}",
            project_root,
            if module_path.is_empty() {
                "<all>"
            } else {
                module_path.as_str()
            },
            goals,
            command
        ),
    );
    Ok(command)
}

#[tauri::command]
pub fn start_build(
    window: Window,
    state: State<'_, BuildProcessState>,
    payload: StartBuildPayload,
) -> AppResult<String> {
    process_runner::start_build(window, state, payload)
}

#[tauri::command]
pub fn cancel_build(
    window: Window,
    state: State<'_, BuildProcessState>,
    build_id: String,
) -> AppResult<()> {
    process_runner::cancel_build(window, state, &build_id)
}

#[tauri::command]
pub fn set_max_concurrent_builds(
    state: State<'_, BuildProcessState>,
    max: Option<usize>,
) -> AppResult<()> {
    state.set_max_concurrent(max);
    Ok(())
}

#[tauri::command]
pub fn get_max_concurrent_builds(state: State<'_, BuildProcessState>) -> AppResult<usize> {
    Ok(state.get_max_concurrent())
}

#[tauri::command]
pub fn get_running_build_count(state: State<'_, BuildProcessState>) -> AppResult<usize> {
    Ok(state.running_count())
}
