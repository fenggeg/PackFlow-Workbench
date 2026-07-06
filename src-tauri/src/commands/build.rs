use crate::error::AppResult;
use crate::models::build::{BuildCommandPayload, StartBuildPayload};
use crate::services::app_logger;
use crate::services::command_builder;
use crate::services::process_runner::{self, BuildProcessState};
use tauri::{AppHandle, State, Window};

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
