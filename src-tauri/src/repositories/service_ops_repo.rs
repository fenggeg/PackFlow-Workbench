use crate::error::AppResult;
use crate::models::service_ops::{ServiceOperationHistory, ServiceRuntimeConfig};
use crate::repositories::storage::open_database;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use tauri::AppHandle;
use uuid::Uuid;

pub fn list_service_runtime_configs(app: &AppHandle) -> AppResult<Vec<ServiceRuntimeConfig>> {
    let connection = open_database(app)?;
    let mut statement = connection
        .prepare("SELECT payload FROM service_runtime_configs ORDER BY updated_at DESC, service_name ASC")
        .map_err(|error| format!("无法读取服务运行配置：{}", error))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("无法读取服务运行配置：{}", error))?;

    let mut configs = Vec::new();
    for row in rows {
        let payload = row.map_err(|error| format!("无法读取服务运行配置：{}", error))?;
        let config = serde_json::from_str(&payload)
            .map_err(|error| format!("服务运行配置数据格式异常：{}", error))?;
        configs.push(config);
    }

    Ok(configs)
}

pub fn get_service_runtime_config(
    app: &AppHandle,
    config_id: &str,
) -> AppResult<ServiceRuntimeConfig> {
    let connection = open_database(app)?;
    let payload: String = connection
        .query_row(
            "SELECT payload FROM service_runtime_configs WHERE id = ?1",
            params![config_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("无法读取服务运行配置：{}", error))?;
    serde_json::from_str(&payload).map_err(|error| format!("服务运行配置数据格式异常：{}", error))
}

pub fn save_service_runtime_config(
    app: &AppHandle,
    mut config: ServiceRuntimeConfig,
) -> AppResult<ServiceRuntimeConfig> {
    let connection = open_database(app)?;
    let now = Utc::now().to_rfc3339();
    if config.id.trim().is_empty() {
        config.id = Uuid::new_v4().to_string();
    }
    let existing_created_at: Option<String> = connection
        .query_row(
            "SELECT created_at FROM service_runtime_configs WHERE id = ?1",
            params![config.id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("无法读取服务运行配置：{}", error))?;

    config.created_at = existing_created_at.or_else(|| Some(now.clone()));
    config.updated_at = Some(now);
    config.service_name = config.service_name.trim().to_string();
    config.restart_command = normalize_optional(config.restart_command);
    config.stop_command = normalize_optional(config.stop_command);
    config.start_command = normalize_optional(config.start_command);
    config.status_command = normalize_optional(config.status_command);
    config.health_check_url = normalize_optional(config.health_check_url);
    config.work_dir = normalize_optional(config.work_dir);

    let payload = serde_json::to_string(&config)
        .map_err(|error| format!("无法序列化服务运行配置：{}", error))?;
    connection
        .execute(
            r#"
            INSERT INTO service_runtime_configs (
                id, service_mapping_id, environment_id, server_id, service_name, created_at, updated_at, payload
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(id) DO UPDATE SET
                service_mapping_id = excluded.service_mapping_id,
                environment_id = excluded.environment_id,
                server_id = excluded.server_id,
                service_name = excluded.service_name,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                payload = excluded.payload
            "#,
            params![
                config.id,
                config.service_mapping_id,
                config.environment_id,
                config.server_id,
                config.service_name,
                config.created_at,
                config.updated_at,
                payload
            ],
        )
        .map_err(|error| format!("无法保存服务运行配置：{}", error))?;

    Ok(config)
}

pub fn delete_service_runtime_config(app: &AppHandle, config_id: &str) -> AppResult<()> {
    let connection = open_database(app)?;
    connection
        .execute(
            "DELETE FROM service_runtime_configs WHERE id = ?1",
            params![config_id],
        )
        .map_err(|error| format!("无法删除服务运行配置：{}", error))?;
    Ok(())
}

pub fn list_service_operation_histories(
    app: &AppHandle,
) -> AppResult<Vec<ServiceOperationHistory>> {
    let connection = open_database(app)?;
    let mut statement = connection
        .prepare("SELECT payload FROM service_operation_histories ORDER BY started_at DESC")
        .map_err(|error| format!("无法读取服务操作历史：{}", error))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("无法读取服务操作历史：{}", error))?;

    let mut histories = Vec::new();
    for row in rows {
        let payload = row.map_err(|error| format!("无法读取服务操作历史：{}", error))?;
        let history = serde_json::from_str(&payload)
            .map_err(|error| format!("服务操作历史数据格式异常：{}", error))?;
        histories.push(history);
    }

    Ok(histories)
}

pub fn save_service_operation_history(
    app: &AppHandle,
    history: ServiceOperationHistory,
) -> AppResult<()> {
    let connection = open_database(app)?;
    let payload = serde_json::to_string(&history)
        .map_err(|error| format!("无法序列化服务操作历史：{}", error))?;
    connection
        .execute(
            r#"
            INSERT INTO service_operation_histories (id, operation_type, service_name, started_at, payload)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(id) DO UPDATE SET
                operation_type = excluded.operation_type,
                service_name = excluded.service_name,
                started_at = excluded.started_at,
                payload = excluded.payload
            "#,
            params![
                history.id,
                history.operation_type,
                history.service_name,
                history.started_at,
                payload
            ],
        )
        .map_err(|error| format!("无法保存服务操作历史：{}", error))?;

    connection
        .execute(
            r#"
            DELETE FROM service_operation_histories
            WHERE id NOT IN (
                SELECT id FROM service_operation_histories
                ORDER BY started_at DESC
                LIMIT 200
            )
            "#,
            [],
        )
        .map_err(|error| format!("无法清理服务操作历史：{}", error))?;
    Ok(())
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}
