use crate::error::AppResult;
use crate::models::template::BuildTemplate;
use crate::repositories::storage::{read_json, write_json};
use chrono::Utc;
use tauri::AppHandle;

const TEMPLATE_FILE: &str = "templates.json";

pub fn list(app: &AppHandle) -> AppResult<Vec<BuildTemplate>> {
    let mut templates: Vec<BuildTemplate> = read_json(app, TEMPLATE_FILE)?;
    templates.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(templates)
}

pub fn save(app: &AppHandle, mut template: BuildTemplate) -> AppResult<()> {
    let now = Utc::now().to_rfc3339();
    let mut templates: Vec<BuildTemplate> = read_json(app, TEMPLATE_FILE)?;
    let existing = templates
        .iter()
        .find(|item| item.id == template.id)
        .and_then(|item| item.created_at.clone());
    template.created_at = existing.or_else(|| Some(now.clone()));
    template.updated_at = Some(now);
    templates.retain(|item| item.id != template.id);
    templates.push(template);
    write_json(app, TEMPLATE_FILE, &templates)
}

pub fn delete(app: &AppHandle, template_id: &str) -> AppResult<()> {
    let mut templates: Vec<BuildTemplate> = read_json(app, TEMPLATE_FILE)?;
    templates.retain(|item| item.id != template_id);
    write_json(app, TEMPLATE_FILE, &templates)
}
