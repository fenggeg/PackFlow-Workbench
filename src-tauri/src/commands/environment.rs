use crate::error::AppResult;
use crate::models::environment::{BuildEnvironment, EnvironmentSettings};
use crate::repositories::settings_repo;
use crate::services::env_detector;
use tauri::AppHandle;

#[tauri::command]
pub fn detect_environment(app: AppHandle, root_path: String) -> AppResult<BuildEnvironment> {
    let settings = settings_repo::load(&app)?;
    Ok(env_detector::detect_environment(&root_path, settings))
}

#[tauri::command]
pub fn load_environment_settings(app: AppHandle) -> AppResult<EnvironmentSettings> {
    settings_repo::load(&app)
}

#[tauri::command]
pub fn save_environment_settings(
    app: AppHandle,
    settings: EnvironmentSettings,
) -> AppResult<()> {
    let mut current = settings_repo::load(&app).unwrap_or_default();
    current.java_home = settings.java_home;
    current.maven_home = settings.maven_home;
    current.use_maven_wrapper = settings.use_maven_wrapper;
    if settings.last_project_path.is_some() {
        current.last_project_path = settings.last_project_path;
    }
    settings_repo::save(&app, current)
}

#[tauri::command]
pub fn save_last_project_path(app: AppHandle, root_path: String) -> AppResult<()> {
    let mut current = settings_repo::load(&app).unwrap_or_default();
    current.last_project_path = Some(root_path);
    settings_repo::save(&app, current)
}
