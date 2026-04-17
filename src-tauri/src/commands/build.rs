use crate::error::AppResult;
use crate::models::build::{BuildCommandPayload, StartBuildPayload};
use crate::services::command_builder;
use crate::services::process_runner::{self, BuildProcessState};
use tauri::{State, Window};

#[tauri::command]
pub fn build_command_preview(payload: BuildCommandPayload) -> AppResult<String> {
    Ok(command_builder::build_command_preview(payload))
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
