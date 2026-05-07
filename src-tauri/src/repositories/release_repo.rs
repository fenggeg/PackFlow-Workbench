use crate::error::AppResult;
use crate::models::release::{ReleaseRecord, ReleaseTemplate};
use crate::repositories::storage::open_database;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use tauri::AppHandle;

pub fn list_templates(app: &AppHandle) -> AppResult<Vec<ReleaseTemplate>> {
    let connection = open_database(app)?;
    let mut statement = connection
        .prepare("SELECT payload FROM release_templates ORDER BY updated_at DESC, name ASC")
        .map_err(|error| format!("无法读取发布模板：{}", error))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("无法读取发布模板：{}", error))?;

    let mut templates = Vec::new();
    for row in rows {
        let payload = row.map_err(|error| format!("无法读取发布模板：{}", error))?;
        let template = serde_json::from_str(&payload)
            .map_err(|error| format!("发布模板数据格式异常：{}", error))?;
        templates.push(template);
    }
    Ok(templates)
}

pub fn save_template(
    app: &AppHandle,
    mut template: ReleaseTemplate,
) -> AppResult<ReleaseTemplate> {
    let connection = open_database(app)?;
    let now = Utc::now().to_rfc3339();
    let existing: Option<String> = connection
        .query_row(
            "SELECT created_at FROM release_templates WHERE id = ?1",
            params![template.id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("无法读取发布模板：{}", error))?;

    template.created_at = existing.or_else(|| Some(now.clone()));
    template.updated_at = Some(now);

    let payload = serde_json::to_string(&template)
        .map_err(|error| format!("无法序列化发布模板：{}", error))?;
    connection
        .execute(
            r#"
            INSERT INTO release_templates (
                id, name, project_path, module_id, target_server_id, created_at, updated_at, payload
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                project_path = excluded.project_path,
                module_id = excluded.module_id,
                target_server_id = excluded.target_server_id,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                payload = excluded.payload
            "#,
            params![
                template.id,
                template.name,
                template.project_path,
                template.module_id,
                template.target_server_id,
                template.created_at,
                template.updated_at,
                payload
            ],
        )
        .map_err(|error| format!("无法保存发布模板：{}", error))?;

    Ok(template)
}

pub fn delete_template(app: &AppHandle, template_id: &str) -> AppResult<()> {
    let connection = open_database(app)?;
    connection
        .execute(
            "DELETE FROM release_templates WHERE id = ?1",
            params![template_id],
        )
        .map_err(|error| format!("无法删除发布模板：{}", error))?;
    Ok(())
}

pub fn list_records(app: &AppHandle) -> AppResult<Vec<ReleaseRecord>> {
    let connection = open_database(app)?;
    let mut statement = connection
        .prepare("SELECT payload FROM release_records ORDER BY started_at DESC")
        .map_err(|error| format!("无法读取发布历史：{}", error))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("无法读取发布历史：{}", error))?;

    let mut records = Vec::new();
    for row in rows {
        let payload = row.map_err(|error| format!("无法读取发布历史：{}", error))?;
        let record = serde_json::from_str(&payload)
            .map_err(|error| format!("发布历史数据格式异常：{}", error))?;
        records.push(record);
    }
    Ok(records)
}

pub fn save_record(app: &AppHandle, record: ReleaseRecord) -> AppResult<()> {
    let connection = open_database(app)?;
    let payload =
        serde_json::to_string(&record).map_err(|error| format!("无法序列化发布历史：{}", error))?;
    connection
        .execute(
            r#"
            INSERT INTO release_records (
                id, project_path, module_name, target_server_id, status, started_at, ended_at, payload
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(id) DO UPDATE SET
                project_path = excluded.project_path,
                module_name = excluded.module_name,
                target_server_id = excluded.target_server_id,
                status = excluded.status,
                started_at = excluded.started_at,
                ended_at = excluded.ended_at,
                payload = excluded.payload
            "#,
            params![
                record.id,
                record.project_path,
                record.module_name,
                record.target_server_id,
                record.status,
                record.started_at,
                record.ended_at,
                payload
            ],
        )
        .map_err(|error| format!("无法保存发布历史：{}", error))?;

    connection
        .execute(
            r#"
            DELETE FROM release_records
            WHERE id NOT IN (
                SELECT id FROM release_records
                ORDER BY started_at DESC
                LIMIT 200
            )
            "#,
            [],
        )
        .map_err(|error| format!("无法清理发布历史：{}", error))?;
    Ok(())
}

pub fn delete_record(app: &AppHandle, record_id: &str) -> AppResult<()> {
    let connection = open_database(app)?;
    connection
        .execute("DELETE FROM release_records WHERE id = ?1", params![record_id])
        .map_err(|error| format!("无法删除发布历史：{}", error))?;
    Ok(())
}
