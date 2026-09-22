use crate::error::AppResult;
use crate::models::history::BuildHistoryRecord;
use crate::repositories::storage::open_database;
use crate::services::app_logger;
use rusqlite::params;
use tauri::AppHandle;

pub fn list(app: &AppHandle) -> AppResult<Vec<BuildHistoryRecord>> {
    let connection = open_database(app)?;
    let mut statement = connection
        .prepare("SELECT payload FROM build_history ORDER BY created_at DESC")
        .map_err(|error| format!("无法读取构建历史：{}", error))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("无法读取构建历史：{}", error))?;

    let mut records = Vec::new();
    for row in rows {
        let payload = row.map_err(|error| format!("无法读取构建历史：{}", error))?;
        // 逐行容错：单条记录损坏时跳过并记日志，避免整表不可用
        match serde_json::from_str::<BuildHistoryRecord>(&payload) {
            Ok(record) => records.push(record),
            Err(error) => {
                app_logger::log_error(
                    app,
                    "history.record.invalid",
                    format!("已跳过无法解析的历史记录：{}", error),
                );
            }
        }
    }

    Ok(records)
}

pub fn save(app: &AppHandle, record: BuildHistoryRecord) -> AppResult<()> {
    let mut connection = open_database(app)?;
    let payload =
        serde_json::to_string(&record).map_err(|error| format!("无法序列化构建历史：{}", error))?;

    // 写入与“仅保留最近 100 条”必须同事务，否则中途失败会留下超限数据
    let transaction = connection
        .transaction()
        .map_err(|error| format!("无法开启构建历史事务：{}", error))?;

    transaction
        .execute(
            r#"
            INSERT INTO build_history (id, created_at, payload)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(id) DO UPDATE SET
                created_at = excluded.created_at,
                payload = excluded.payload
            "#,
            params![record.id, record.created_at, payload],
        )
        .map_err(|error| format!("无法保存构建历史：{}", error))?;

    transaction
        .execute(
            r#"
            DELETE FROM build_history
            WHERE id NOT IN (
                SELECT id FROM build_history
                ORDER BY created_at DESC
                LIMIT 100
            )
            "#,
            [],
        )
        .map_err(|error| format!("无法清理构建历史：{}", error))?;

    transaction
        .commit()
        .map_err(|error| format!("无法提交构建历史：{}", error))?;

    Ok(())
}

pub fn delete(app: &AppHandle, history_id: &str) -> AppResult<()> {
    let connection = open_database(app)?;
    connection
        .execute("DELETE FROM build_history WHERE id = ?1", params![history_id])
        .map_err(|error| format!("无法删除构建历史：{}", error))?;
    Ok(())
}
