use crate::error::AppResult;
use crate::models::environment::EnvironmentSettings;
use crate::repositories::storage::{app_data_dir, open_database};
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use tauri::AppHandle;

pub fn load(app: &AppHandle) -> AppResult<EnvironmentSettings> {
    let connection = open_database(app)?;
    let payload: Option<String> = connection
        .query_row("SELECT payload FROM app_settings WHERE id = 1", [], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|error| format!("无法读取本地设置：{}", error))?;

    match payload {
        Some(value) => {
            serde_json::from_str(&value).map_err(|error| format!("本地设置数据格式异常：{}", error))
        }
        None => Ok(EnvironmentSettings::default()),
    }
}

/// 统一的设置读取入口。
/// 解析失败时先把原始内容隔离备份再报错 —— 调用方绝不能退回默认值继续保存，
/// 否则下一次保存会用空配置整体覆写，JDK 注册表与环境方案将永久丢失。
pub fn load_or_quarantine(app: &AppHandle) -> AppResult<EnvironmentSettings> {
    match load(app) {
        Ok(settings) => Ok(settings),
        Err(error) => {
            let backup = load_raw(app)
                .ok()
                .flatten()
                .and_then(|raw| quarantine_corrupted(app, &raw));
            match backup {
                Some(path) => Err(format!(
                    "本地设置已损坏，原始内容已备份到 {}，未覆盖保存。{}",
                    path, error
                )),
                None => Err(format!("本地设置已损坏，未覆盖保存。{}", error)),
            }
        }
    }
}

/// 读取未解析的原始设置内容，供损坏时隔离备份
pub fn load_raw(app: &AppHandle) -> AppResult<Option<String>> {
    let connection = open_database(app)?;
    connection
        .query_row("SELECT payload FROM app_settings WHERE id = 1", [], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|error| format!("无法读取本地设置：{}", error))
}

/// 把解析失败的原始内容转存到应用数据目录。
/// 否则下一次保存会用默认值整体覆写，JDK 注册表与环境方案将永久丢失。
pub fn quarantine_corrupted(app: &AppHandle, raw: &str) -> Option<String> {
    let dir = app_data_dir(app).ok()?;
    let name = format!(
        "app-settings.corrupt-{}.json",
        Utc::now().format("%Y%m%d-%H%M%S")
    );
    let path = dir.join(name);
    std::fs::write(&path, raw).ok()?;
    Some(path.to_string_lossy().to_string())
}

pub fn save(app: &AppHandle, settings: EnvironmentSettings) -> AppResult<()> {
    let connection = open_database(app)?;
    let payload = serde_json::to_string(&settings)
        .map_err(|error| format!("无法序列化本地设置：{}", error))?;

    connection
        .execute(
            r#"
            INSERT INTO app_settings (id, payload)
            VALUES (1, ?1)
            ON CONFLICT(id) DO UPDATE SET payload = excluded.payload
            "#,
            params![payload],
        )
        .map_err(|error| format!("无法保存本地设置：{}", error))?;

    Ok(())
}
