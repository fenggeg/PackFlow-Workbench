use crate::error::AppResult;
use crate::models::command_template::{CommandExecution, CommandTemplate, SaveCommandTemplatePayload};
use crate::repositories::storage::open_database;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use tauri::AppHandle;
use uuid::Uuid;

pub fn list_templates(app: &AppHandle) -> AppResult<Vec<CommandTemplate>> {
    let connection = open_database(app)?;
    let mut statement = connection
        .prepare("SELECT payload FROM command_templates ORDER BY updated_at DESC, name ASC")
        .map_err(|error| format!("无法读取命令模板：{}", error))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("无法读取命令模板：{}", error))?;

    let mut templates = Vec::new();
    for row in rows {
        let payload = row.map_err(|error| format!("无法读取命令模板：{}", error))?;
        let template: CommandTemplate = serde_json::from_str(&payload)
            .map_err(|error| format!("命令模板数据格式异常：{}", error))?;
        templates.push(template);
    }
    Ok(templates)
}

pub fn get_template(app: &AppHandle, template_id: &str) -> AppResult<CommandTemplate> {
    let connection = open_database(app)?;
    let payload: String = connection
        .query_row(
            "SELECT payload FROM command_templates WHERE id = ?1",
            params![template_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("无法读取命令模板：{}", error))?;
    serde_json::from_str(&payload).map_err(|error| format!("命令模板数据格式异常：{}", error))
}

pub fn save_template(
    app: &AppHandle,
    payload: &SaveCommandTemplatePayload,
) -> AppResult<CommandTemplate> {
    let mut template = CommandTemplate {
        id: payload.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string()),
        name: payload.name.clone(),
        description: payload.description.clone(),
        steps: payload.steps.clone(),
        variables: payload.variables.clone(),
        created_at: None,
        updated_at: None,
    };
    let connection = open_database(app)?;
    let now = Utc::now().to_rfc3339();
    let existing: Option<String> = connection
        .query_row(
            "SELECT created_at FROM command_templates WHERE id = ?1",
            params![template.id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("无法读取命令模板：{}", error))?;

    template.created_at = existing.or_else(|| Some(now.clone()));
    template.updated_at = Some(now);
    let payload = serde_json::to_string(&template)
        .map_err(|error| format!("无法序列化命令模板：{}", error))?;
    connection
        .execute(
            r#"
            INSERT INTO command_templates (id, name, created_at, updated_at, payload)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                payload = excluded.payload
            "#,
            params![
                template.id,
                template.name,
                template.created_at,
                template.updated_at,
                payload
            ],
        )
        .map_err(|error| format!("无法保存命令模板：{}", error))?;

    Ok(template)
}

pub fn delete_template(app: &AppHandle, template_id: &str) -> AppResult<()> {
    let connection = open_database(app)?;
    connection
        .execute(
            "DELETE FROM command_templates WHERE id = ?1",
            params![template_id],
        )
        .map_err(|error| format!("无法删除命令模板：{}", error))?;
    Ok(())
}

pub fn list_executions(app: &AppHandle) -> AppResult<Vec<CommandExecution>> {
    let connection = open_database(app)?;
    let mut statement = connection
        .prepare("SELECT payload FROM command_executions ORDER BY started_at DESC LIMIT 100")
        .map_err(|error| format!("无法读取执行历史：{}", error))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("无法读取执行历史：{}", error))?;

    let mut executions = Vec::new();
    for row in rows {
        let payload = row.map_err(|error| format!("无法读取执行历史：{}", error))?;
        let execution: CommandExecution = serde_json::from_str(&payload)
            .map_err(|error| format!("执行历史数据格式异常：{}", error))?;
        executions.push(execution);
    }
    Ok(executions)
}

pub fn save_execution(app: &AppHandle, execution: &CommandExecution) -> AppResult<()> {
    let connection = open_database(app)?;
    let payload = serde_json::to_string(execution)
        .map_err(|error| format!("无法序列化执行记录：{}", error))?;
    connection
        .execute(
            r#"
            INSERT INTO command_executions (id, template_id, template_name, server_id, status, started_at, finished_at, payload)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                finished_at = excluded.finished_at,
                payload = excluded.payload
            "#,
            params![
                execution.id,
                execution.template_id,
                execution.template_name,
                execution.server_id,
                execution.status,
                execution.started_at,
                execution.finished_at,
                payload
            ],
        )
        .map_err(|error| format!("无法保存执行记录：{}", error))?;

    // 清理旧记录，只保留最近 100 条
    connection
        .execute(
            r#"
            DELETE FROM command_executions
            WHERE id NOT IN (
                SELECT id FROM command_executions
                ORDER BY started_at DESC
                LIMIT 100
            )
            "#,
            [],
        )
        .map_err(|error| format!("无法清理执行历史：{}", error))?;

    Ok(())
}

pub fn delete_execution(app: &AppHandle, execution_id: &str) -> AppResult<()> {
    let connection = open_database(app)?;
    connection
        .execute(
            "DELETE FROM command_executions WHERE id = ?1",
            params![execution_id],
        )
        .map_err(|error| format!("无法删除执行记录：{}", error))?;
    Ok(())
}
