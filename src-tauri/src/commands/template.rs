use crate::error::AppResult;
use crate::models::template::BuildTemplate;
use crate::repositories::template_repo;
use tauri::AppHandle;

#[tauri::command]
pub fn list_templates(app: AppHandle) -> AppResult<Vec<BuildTemplate>> {
    template_repo::list(&app)
}

#[tauri::command]
pub fn save_template(app: AppHandle, template: BuildTemplate) -> AppResult<()> {
    template_repo::save(&app, template)
}

#[tauri::command]
pub fn delete_template(app: AppHandle, template_id: String) -> AppResult<()> {
    template_repo::delete(&app, &template_id)
}
