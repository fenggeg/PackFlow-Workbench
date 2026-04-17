use crate::error::AppResult;
use crate::models::history::BuildHistoryRecord;
use crate::repositories::storage::{read_json, write_json};
use tauri::AppHandle;

const HISTORY_FILE: &str = "history.json";

pub fn list(app: &AppHandle) -> AppResult<Vec<BuildHistoryRecord>> {
    let mut records: Vec<BuildHistoryRecord> = read_json(app, HISTORY_FILE)?;
    records.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(records)
}

pub fn save(app: &AppHandle, record: BuildHistoryRecord) -> AppResult<()> {
    let mut records: Vec<BuildHistoryRecord> = read_json(app, HISTORY_FILE)?;
    records.retain(|item| item.id != record.id);
    records.push(record);
    records.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    records.truncate(100);
    write_json(app, HISTORY_FILE, &records)
}
