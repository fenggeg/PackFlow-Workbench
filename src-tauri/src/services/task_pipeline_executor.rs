use crate::error::{to_user_error, AppResult};
use crate::models::build::{BuildCommandPayload, BuildOptions};
use crate::models::module::MavenModule;
use crate::models::task_pipeline::{
    StartTaskPipelinePayload, TaskPipelineLogEvent, TaskPipelineRun, TaskPipelineStepEvent,
    TaskStep, TaskStepRun,
};
use crate::repositories::pipeline_repo;
use crate::services::{command_builder, pom_parser};
use chrono::Utc;
use encoding_rs::GBK;
use serde::Deserialize;
use std::collections::HashMap;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MavenGoalStepPayload {
    #[serde(default)]
    module_ids: Vec<String>,
    #[serde(default)]
    goals: Vec<String>,
    #[serde(default)]
    profiles: Vec<String>,
    #[serde(default)]
    properties: HashMap<String, serde_json::Value>,
    #[serde(default = "default_true")]
    also_make: bool,
    #[serde(default = "default_true")]
    skip_tests: bool,
    #[serde(default)]
    custom_args: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShellCommandStepPayload {
    command: String,
    working_directory: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenDirectoryStepPayload {
    location: Option<String>,
    path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NotifyStepPayload {
    title: Option<String>,
    message: Option<String>,
}

pub fn start_pipeline(app: AppHandle, payload: StartTaskPipelinePayload) -> AppResult<String> {
    if payload.pipeline.steps.is_empty() {
        return Err(to_user_error("任务链至少需要一个步骤。"));
    }
    if payload.project_root.trim().is_empty() {
        return Err(to_user_error("任务链执行缺少项目目录。"));
    }

    let run_id = Uuid::new_v4().to_string();
    let spawned_run_id = run_id.clone();
    let app_handle = app.clone();
    thread::spawn(move || {
        let run = execute_pipeline(&app_handle, &spawned_run_id, payload);
        match run {
            Ok(run) => {
                let _ = pipeline_repo::save_pipeline_run(&app_handle, run.clone());
                let _ = app_handle.emit("task-pipeline-finished", run);
            }
            Err(error) => {
                let _ = app_handle.emit(
                    "task-pipeline-log",
                    TaskPipelineLogEvent {
                        run_id: spawned_run_id.clone(),
                        step_id: None,
                        level: "error".to_string(),
                        line: error,
                    },
                );
            }
        }
    });
    Ok(run_id)
}

fn execute_pipeline(
    app: &AppHandle,
    run_id: &str,
    payload: StartTaskPipelinePayload,
) -> AppResult<TaskPipelineRun> {
    let started_at = Utc::now().to_rfc3339();
    let started = Instant::now();
    let project = pom_parser::parse_maven_project(&payload.project_root)?;
    let modules = flatten_modules(&project.modules);
    let mut run = TaskPipelineRun {
        id: run_id.to_string(),
        pipeline_id: payload.pipeline.id.clone(),
        pipeline_name: payload.pipeline.name.clone(),
        project_root: payload.project_root.clone(),
        module_ids: payload.pipeline.module_ids.clone(),
        status: "running".to_string(),
        total_duration_ms: 0,
        started_at,
        finished_at: None,
        steps: payload
            .pipeline
            .steps
            .iter()
            .map(|step| TaskStepRun {
                step_id: step.id.clone(),
                label: step.label.clone(),
                step_type: step.step_type.clone(),
                status: if step.enabled {
                    "pending".to_string()
                } else {
                    "skipped".to_string()
                },
                started_at: None,
                finished_at: None,
                message: None,
                output: Vec::new(),
            })
            .collect(),
    };

    emit_pipeline_log(app, run_id, None, "info", "任务链开始执行");
    for (index, step) in payload.pipeline.steps.iter().enumerate() {
        if !step.enabled {
            run.steps[index].message = Some("步骤已禁用。".to_string());
            emit_pipeline_step(app, run_id, &run.steps[index]);
            continue;
        }

        run.steps[index].status = "running".to_string();
        run.steps[index].started_at = Some(Utc::now().to_rfc3339());
        emit_pipeline_step(app, run_id, &run.steps[index]);
        emit_pipeline_log(
            app,
            run_id,
            Some(step.id.clone()),
            "info",
            format!("开始执行步骤：{}", step.label),
        );

        let outcome = execute_step(
            app,
            run_id,
            step,
            &payload.project_root,
            &payload.pipeline.module_ids,
            &modules,
            &payload.environment,
        );
        run.steps[index].finished_at = Some(Utc::now().to_rfc3339());
        match outcome {
            Ok((message, output)) => {
                run.steps[index].status = "success".to_string();
                run.steps[index].message = Some(message.clone());
                run.steps[index].output = output.clone();
                emit_pipeline_log(app, run_id, Some(step.id.clone()), "info", message);
            }
            Err(error) => {
                run.steps[index].status = "failed".to_string();
                run.steps[index].message = Some(error.clone());
                emit_pipeline_log(app, run_id, Some(step.id.clone()), "error", error.clone());
                emit_pipeline_step(app, run_id, &run.steps[index]);
                run.status = "failed".to_string();
                run.total_duration_ms = started.elapsed().as_millis() as u64;
                run.finished_at = Some(Utc::now().to_rfc3339());
                return Ok(run);
            }
        }
        emit_pipeline_step(app, run_id, &run.steps[index]);
    }

    run.status = "success".to_string();
    run.total_duration_ms = started.elapsed().as_millis() as u64;
    run.finished_at = Some(Utc::now().to_rfc3339());
    emit_pipeline_log(app, run_id, None, "info", "任务链执行完成");
    Ok(run)
}

fn execute_step(
    app: &AppHandle,
    run_id: &str,
    step: &TaskStep,
    project_root: &str,
    pipeline_module_ids: &[String],
    modules: &[MavenModule],
    environment: &crate::models::environment::BuildEnvironment,
) -> AppResult<(String, Vec<String>)> {
    match step.step_type.as_str() {
        "maven_goal" => execute_maven_goal_step(
            app,
            run_id,
            step,
            project_root,
            pipeline_module_ids,
            modules,
            environment,
        ),
        "shell_command" => execute_shell_step(app, run_id, step, project_root),
        "open_directory" => execute_open_directory_step(step, project_root, modules, pipeline_module_ids),
        "notify" => execute_notify_step(step),
        _ => Err(to_user_error("暂不支持的步骤类型。")),
    }
}

fn execute_maven_goal_step(
    app: &AppHandle,
    run_id: &str,
    step: &TaskStep,
    project_root: &str,
    pipeline_module_ids: &[String],
    modules: &[MavenModule],
    environment: &crate::models::environment::BuildEnvironment,
) -> AppResult<(String, Vec<String>)> {
    let payload: MavenGoalStepPayload = serde_json::from_value(step.payload.clone())
        .map_err(|error| to_user_error(format!("Maven 步骤配置无效：{}", error)))?;
    let step_module_ids = if payload.module_ids.is_empty() {
        pipeline_module_ids.to_vec()
    } else {
        payload.module_ids
    };
    let selected_module_path = resolve_module_selection(&step_module_ids, modules);
    let command = command_builder::build_command_preview(BuildCommandPayload {
        options: BuildOptions {
            project_root: project_root.to_string(),
            selected_module_path,
            goals: payload.goals,
            profiles: payload.profiles,
            properties: payload.properties,
            also_make: payload.also_make,
            skip_tests: payload.skip_tests,
            custom_args: payload.custom_args,
            editable_command: String::new(),
        },
        environment: environment.clone(),
    });
    let (message, output) = run_command(app, run_id, Some(step.id.clone()), &command, project_root)?;
    Ok((format!("Maven 步骤完成：{}", message), output))
}

fn execute_shell_step(
    app: &AppHandle,
    run_id: &str,
    step: &TaskStep,
    project_root: &str,
) -> AppResult<(String, Vec<String>)> {
    let payload: ShellCommandStepPayload = serde_json::from_value(step.payload.clone())
        .map_err(|error| to_user_error(format!("Shell 步骤配置无效：{}", error)))?;
    let working_directory = payload
        .working_directory
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|value| resolve_path(project_root, value))
        .unwrap_or_else(|| PathBuf::from(project_root));
    let working_directory_string = working_directory.to_string_lossy().to_string();
    let (message, output) = run_command(
        app,
        run_id,
        Some(step.id.clone()),
        &payload.command,
        &working_directory_string,
    )?;
    Ok((format!("命令执行完成：{}", message), output))
}

fn execute_open_directory_step(
    step: &TaskStep,
    project_root: &str,
    modules: &[MavenModule],
    pipeline_module_ids: &[String],
) -> AppResult<(String, Vec<String>)> {
    let payload: OpenDirectoryStepPayload = serde_json::from_value(step.payload.clone())
        .map_err(|error| to_user_error(format!("打开目录步骤配置无效：{}", error)))?;
    let target_path = match payload.location.as_deref().unwrap_or("project_root") {
        "module_root" => {
            let module = first_selected_module(modules, pipeline_module_ids)
                .ok_or_else(|| to_user_error("未找到任务链绑定模块。"))?;
            resolve_path(project_root, &module.relative_path)
        }
        "module_target" => {
            let module = first_selected_module(modules, pipeline_module_ids)
                .ok_or_else(|| to_user_error("未找到任务链绑定模块。"))?;
            resolve_path(project_root, &format!("{}\\target", module.relative_path))
        }
        "custom" => resolve_path(
            project_root,
            payload
                .path
                .as_deref()
                .ok_or_else(|| to_user_error("自定义目录步骤缺少路径。"))?,
        ),
        _ => PathBuf::from(project_root),
    };

    Command::new("explorer")
        .arg(target_path.clone())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| to_user_error(format!("无法打开目录：{}", error)))?;

    Ok((
        format!("已打开目录：{}", target_path.to_string_lossy()),
        Vec::new(),
    ))
}

fn execute_notify_step(step: &TaskStep) -> AppResult<(String, Vec<String>)> {
    let payload: NotifyStepPayload = serde_json::from_value(step.payload.clone())
        .map_err(|error| to_user_error(format!("通知步骤配置无效：{}", error)))?;
    let title = payload.title.unwrap_or_else(|| step.label.clone());
    let message = payload.message.unwrap_or_else(|| "任务链步骤已完成。".to_string());
    Ok((format!("{}：{}", title, message), vec![message]))
}

fn run_command(
    app: &AppHandle,
    run_id: &str,
    step_id: Option<String>,
    command: &str,
    working_directory: &str,
) -> AppResult<(String, Vec<String>)> {
    let output = Command::new("cmd")
        .args(["/C", command])
        .current_dir(working_directory)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| to_user_error(format!("无法执行命令：{}", error)))?;

    let lines = decode_lines(&output.stdout)
        .into_iter()
        .chain(decode_lines(&output.stderr))
        .collect::<Vec<_>>();
    for line in &lines {
        emit_pipeline_log(app, run_id, step_id.clone(), "info", line.clone());
    }

    if !output.status.success() {
        return Err(to_user_error(if lines.is_empty() {
            format!("命令执行失败，退出码：{}", output.status)
        } else {
            lines.join("\n")
        }));
    }

    Ok((format!("退出码：{}", output.status), lines))
}

fn decode_lines(bytes: &[u8]) -> Vec<String> {
    if bytes.is_empty() {
        return Vec::new();
    }
    let decoded = String::from_utf8(bytes.to_vec()).unwrap_or_else(|_| {
        let (value, _, _) = GBK.decode(bytes);
        value.into_owned()
    });
    decoded
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn resolve_module_selection(module_ids: &[String], modules: &[MavenModule]) -> String {
    modules
        .iter()
        .filter(|module| module_ids.iter().any(|id| id == &module.id))
        .map(|module| module.relative_path.clone())
        .collect::<Vec<_>>()
        .join(",")
}

fn first_selected_module<'a>(
    modules: &'a [MavenModule],
    module_ids: &[String],
) -> Option<&'a MavenModule> {
    if module_ids.is_empty() {
        return modules.first();
    }
    modules
        .iter()
        .find(|module| module_ids.iter().any(|id| id == &module.id))
}

fn flatten_modules(modules: &[MavenModule]) -> Vec<MavenModule> {
    let mut result = Vec::new();
    for module in modules {
        result.push(module.clone());
        result.extend(flatten_modules(&module.children));
    }
    result
}

fn resolve_path(project_root: &str, value: &str) -> PathBuf {
    let path = Path::new(value);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        Path::new(project_root).join(value)
    }
}

fn emit_pipeline_log(
    app: &AppHandle,
    run_id: &str,
    step_id: Option<String>,
    level: &str,
    line: impl Into<String>,
) {
    let _ = app.emit(
        "task-pipeline-log",
        TaskPipelineLogEvent {
            run_id: run_id.to_string(),
            step_id,
            level: level.to_string(),
            line: line.into(),
        },
    );
}

fn emit_pipeline_step(app: &AppHandle, run_id: &str, step: &TaskStepRun) {
    let _ = app.emit(
        "task-pipeline-step",
        TaskPipelineStepEvent {
            run_id: run_id.to_string(),
            step: step.clone(),
        },
    );
}

fn default_true() -> bool {
    true
}
