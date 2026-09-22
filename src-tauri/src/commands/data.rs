use crate::error::{to_user_error, AppResult};
use crate::repositories::storage;
use crate::services::{app_logger, blocking};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

const SQLITE_HEADER: &[u8] = b"SQLite format 3";

fn db_file(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(storage::app_data_dir(app)?.join("app.sqlite3"))
}

/// 备份本地数据库。
/// 先执行 WAL checkpoint，确保主库文件里包含最新数据，避免备份到不完整的快照。
#[tauri::command]
pub async fn backup_app_data(app: AppHandle, target_path: String) -> AppResult<String> {
    app_logger::log_info(
        &app,
        "data.backup.start",
        format!("target={}", target_path),
    );
    let task_app = app.clone();
    let result = blocking::run(move || {
        let connection = storage::open_database(&task_app)?;
        let _ = connection.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        let source = db_file(&task_app)?;
        let target = PathBuf::from(&target_path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| to_user_error(format!("无法创建备份目录：{}", error)))?;
        }
        fs::copy(&source, &target)
            .map_err(|error| to_user_error(format!("无法写入备份文件：{}", error)))?;
        Ok(target.to_string_lossy().to_string())
    })
    .await;
    match &result {
        Ok(path) => app_logger::log_info(&app, "data.backup.done", format!("path={}", path)),
        Err(error) => app_logger::log_error(&app, "data.backup.failed", format!("error={}", error)),
    }
    result
}

/// 从备份文件恢复本地数据库。
/// 会校验文件头确实是 SQLite，避免误把任意文件写进数据目录。
#[tauri::command]
pub async fn restore_app_data(app: AppHandle, source_path: String) -> AppResult<()> {
    app_logger::log_info(
        &app,
        "data.restore.start",
        format!("source={}", source_path),
    );
    let task_app = app.clone();
    let result = blocking::run(move || {
        let source = PathBuf::from(&source_path);
        if !source.exists() {
            return Err(to_user_error(format!("备份文件不存在：{}", source_path)));
        }
        let mut header = [0u8; 16];
        {
            use std::io::Read;
            let mut file = fs::File::open(&source)
                .map_err(|error| to_user_error(format!("无法打开备份文件：{}", error)))?;
            let read = file
                .read(&mut header)
                .map_err(|error| to_user_error(format!("无法读取备份文件：{}", error)))?;
            if read < SQLITE_HEADER.len() || &header[..SQLITE_HEADER.len()] != SQLITE_HEADER {
                return Err(to_user_error("所选文件不是有效的 SQLite 备份，已取消恢复。".to_string()));
            }
        }

        let target = db_file(&task_app)?;
        // 先落地为临时文件再替换，避免中途失败留下半截数据库
        let temp = target.with_extension("sqlite3.restore");
        fs::copy(&source, &temp)
            .map_err(|error| to_user_error(format!("无法读取备份文件：{}", error)))?;
        fs::rename(&temp, &target)
            .map_err(|error| to_user_error(format!("无法替换本地数据库：{}", error)))?;
        // 文件已替换，让连接池重新检查 schema
        storage::reset_schema_state(&task_app);
        Ok(())
    })
    .await;
    match &result {
        Ok(()) => app_logger::log_info(&app, "data.restore.done", String::new()),
        Err(error) => app_logger::log_error(&app, "data.restore.failed", format!("error={}", error)),
    }
    result
}

/// 导出诊断包：把前端组装好的环境/命令/日志文本写入用户指定位置，
/// 让用户或开发者能自助排查，而不必手工去应用数据目录翻日志。
#[tauri::command]
pub async fn export_diagnostics(
    app: AppHandle,
    target_path: String,
    content: String,
) -> AppResult<String> {
    app_logger::log_info(
        &app,
        "data.diagnostics.start",
        format!("target={}, size={}", target_path, content.len()),
    );
    let result = blocking::run(move || {
        let target = PathBuf::from(&target_path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| to_user_error(format!("无法创建导出目录：{}", error)))?;
        }
        fs::write(&target, content)
            .map_err(|error| to_user_error(format!("无法写入诊断包：{}", error)))?;
        Ok(target.to_string_lossy().to_string())
    })
    .await;
    match &result {
        Ok(path) => app_logger::log_info(&app, "data.diagnostics.done", format!("path={}", path)),
        Err(error) => {
            app_logger::log_error(&app, "data.diagnostics.failed", format!("error={}", error))
        }
    }
    result
}

/// 读取本地文本文件内容（导入模板 JSON、回看历史构建日志等场景）。
/// 限制单次读取大小，避免误选超大文件把内存打满；按 UTF-8 容错解码，
/// 兼容 Maven 在中文 Windows 下产生的 GBK 输出。
#[tauri::command]
pub async fn read_text_file(
    app: AppHandle,
    path: String,
    max_bytes: Option<u64>,
) -> AppResult<String> {
    let limit = max_bytes.unwrap_or(8 * 1024 * 1024).min(32 * 1024 * 1024);
    app_logger::log_info(
        &app,
        "data.read_text.start",
        format!("path={}, limit={}", path, limit),
    );
    let read_path = path.clone();
    let result = blocking::run(move || {
        let target = PathBuf::from(&read_path);
        if !target.is_file() {
            return Err(to_user_error(format!("文件不存在：{}", read_path)));
        }
        let metadata = fs::metadata(&target)
            .map_err(|error| to_user_error(format!("无法读取文件信息：{}", error)))?;
        if metadata.len() > limit {
            return Err(to_user_error(format!(
                "文件过大（约 {} MB），已取消读取。",
                metadata.len() / 1024 / 1024
            )));
        }
        let bytes = fs::read(&target)
            .map_err(|error| to_user_error(format!("无法读取文件：{}", error)))?;
        Ok(String::from_utf8_lossy(&bytes).to_string())
    })
    .await;
    match &result {
        Ok(content) => app_logger::log_info(
            &app,
            "data.read_text.done",
            format!("path={}, size={}", path, content.len()),
        ),
        Err(error) => app_logger::log_error(&app, "data.read_text.failed", format!("error={}", error)),
    }
    result
}

/// 打开应用数据目录（数据库与日志都在里面）
#[tauri::command]
pub async fn open_app_data_dir(app: AppHandle) -> AppResult<()> {
    let dir = storage::app_data_dir(&app)?;
    crate::commands::filesystem::open_path_in_explorer(app, dir.to_string_lossy().to_string())
}
