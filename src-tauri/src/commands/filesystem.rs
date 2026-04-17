use crate::error::{to_user_error, AppResult};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[tauri::command]
pub fn open_path_in_explorer(path: String) -> AppResult<()> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(to_user_error(format!("路径不存在：{}", path)));
    }

    Command::new("explorer")
        .arg(target)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| to_user_error(format!("无法打开资源管理器：{}", error)))?;

    Ok(())
}
