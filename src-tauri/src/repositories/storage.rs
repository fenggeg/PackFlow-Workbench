use crate::error::{to_user_error, AppResult};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn read_json<T>(app: &AppHandle, file_name: &str) -> AppResult<T>
where
    T: DeserializeOwned + Default,
{
    let path = storage_path(app, file_name)?;
    if !path.exists() {
        return Ok(T::default());
    }
    let content = fs::read_to_string(&path)
        .map_err(|error| to_user_error(format!("无法读取本地数据：{}", error)))?;
    serde_json::from_str(&content)
        .map_err(|error| to_user_error(format!("本地数据格式异常：{}", error)))
}

pub fn write_json<T>(app: &AppHandle, file_name: &str, value: &T) -> AppResult<()>
where
    T: Serialize,
{
    let path = storage_path(app, file_name)?;
    let content = serde_json::to_string_pretty(value)
        .map_err(|error| to_user_error(format!("无法序列化本地数据：{}", error)))?;
    fs::write(&path, content)
        .map_err(|error| to_user_error(format!("无法写入本地数据：{}", error)))
}

fn storage_path(app: &AppHandle, file_name: &str) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| to_user_error(format!("无法获取应用数据目录：{}", error)))?;
    fs::create_dir_all(&dir)
        .map_err(|error| to_user_error(format!("无法创建应用数据目录：{}", error)))?;
    Ok(dir.join(file_name))
}
