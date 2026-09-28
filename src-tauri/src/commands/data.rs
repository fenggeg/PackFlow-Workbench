use crate::error::{to_user_error, AppResult};
use crate::repositories::storage;
use crate::services::{app_logger, blocking};
use rusqlite::backup::Backup;
use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::AppHandle;

const SQLITE_HEADER: &[u8] = b"SQLite format 3";
// 在线备份 API 每步拷贝的页数与步进间隔：库很小（几 MB）时一步完成，
// 库较大时分批进行，避免长时间持有读锁阻塞其他命令。
const BACKUP_STEP_PAGES: i32 = 64;
const BACKUP_STEP_PACE: Duration = Duration::from_millis(5);

fn db_file(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(storage::app_data_dir(app)?.join("app.sqlite3"))
}

/// 备份本地数据库。
/// 使用 SQLite 在线备份 API 生成一致快照：即使有其他命令正在写库，
/// 拷贝的也是某一时刻的完整数据，不依赖 WAL checkpoint 是否成功。
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
        let target = PathBuf::from(&target_path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| to_user_error(format!("无法创建备份目录：{}", error)))?;
        }
        {
            let mut dest = Connection::open(&target)
                .map_err(|error| to_user_error(format!("无法创建备份文件：{}", error)))?;
            let backup = Backup::new(&connection, &mut dest)
                .map_err(|error| to_user_error(format!("无法初始化数据库备份：{}", error)))?;
            backup
                .run_to_completion(BACKUP_STEP_PAGES, BACKUP_STEP_PACE, None)
                .map_err(|error| to_user_error(format!("无法写入备份文件：{}", error)))?;
        }
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
        // 旧库的 -wal/-shm 校验和只对旧库自洽：残留到替换后的新库上，
        // 下次打开时 WAL recovery 会把旧页回放进新库，造成新旧数据混合甚至损坏。
        // 删除失败说明还有连接占用着数据库（Windows 上打开的文件无法删除），
        // 此时放弃恢复，原库保持原样。
        let wal_path = target.with_extension("sqlite3-wal");
        let shm_path = target.with_extension("sqlite3-shm");
        for stale in [&wal_path, &shm_path] {
            if stale.exists() {
                fs::remove_file(stale).map_err(|error| {
                    to_user_error(format!(
                        "本地数据库正被占用（{}），请停止正在进行的任务后重试恢复。",
                        error
                    ))
                })?;
            }
        }
        // 先落地为临时文件再替换，避免中途失败留下半截数据库；
        // 替换前强制落盘，防止掉电后留下 0 字节的目标文件。
        let temp = target.with_extension("sqlite3.restore");
        fs::copy(&source, &temp)
            .map_err(|error| to_user_error(format!("无法读取备份文件：{}", error)))?;
        {
            let handle = fs::OpenOptions::new()
                .write(true)
                .open(&temp)
                .map_err(|error| to_user_error(format!("无法读取备份文件：{}", error)))?;
            handle
                .sync_all()
                .map_err(|error| to_user_error(format!("无法写入备份文件：{}", error)))?;
        }
        fs::rename(&temp, &target)
            .map_err(|error| to_user_error(format!("无法替换本地数据库：{}", error)))?;
        // 兜底：极小概率下 WAL 在上面的删除与替换之间被并发连接重建，再清一次
        for stale in [&wal_path, &shm_path] {
            if stale.exists() {
                let _ = fs::remove_file(stale);
                if stale.exists() {
                    return Err(to_user_error(
                        "恢复完成，但数据库缓存文件仍被占用且无法删除，请立即重启应用，否则恢复的数据可能无法正确加载。"
                            .to_string(),
                    ));
                }
            }
        }
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
