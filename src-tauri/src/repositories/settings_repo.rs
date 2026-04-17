use crate::error::AppResult;
use crate::models::environment::EnvironmentSettings;
use crate::repositories::storage::{read_json, write_json};
use tauri::AppHandle;

const SETTINGS_FILE: &str = "settings.json";

pub fn load(app: &AppHandle) -> AppResult<EnvironmentSettings> {
    read_json(app, SETTINGS_FILE)
}

pub fn save(app: &AppHandle, settings: EnvironmentSettings) -> AppResult<()> {
    write_json(app, SETTINGS_FILE, &settings)
}
