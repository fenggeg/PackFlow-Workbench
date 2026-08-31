use crate::error::{to_user_error, AppResult};
use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const DATABASE_FILE: &str = "app.sqlite3";

pub struct DatabasePool {
    initialized: AtomicBool,
    schema_lock: Mutex<()>,
}

impl DatabasePool {
    pub fn new() -> Self {
        Self {
            initialized: AtomicBool::new(false),
            schema_lock: Mutex::new(()),
        }
    }

    pub fn get_connection(&self, app: &AppHandle) -> AppResult<Connection> {
        let path = database_path(app)?;
        let conn = Connection::open(&path)
            .map_err(|error| to_user_error(format!("无法打开本地数据库：{}", error)))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys = ON;")
            .map_err(|error| to_user_error(format!("无法设置数据库模式：{}", error)))?;

        if !self.initialized.load(Ordering::Relaxed) {
            let _guard = self.schema_lock.lock().unwrap_or_else(|e| e.into_inner());
            if !self.initialized.load(Ordering::Relaxed) {
                initialize_database(&conn)?;
                self.initialized.store(true, Ordering::Relaxed);
            }
        }
        Ok(conn)
    }
}

pub fn open_database(app: &AppHandle) -> AppResult<Connection> {
    let pool = app.state::<DatabasePool>();
    pool.get_connection(app)
}

fn initialize_database(connection: &Connection) -> AppResult<()> {
    connection
        .execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS build_history (
                id TEXT PRIMARY KEY NOT NULL,
                created_at TEXT NOT NULL,
                payload TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_build_history_created_at
                ON build_history(created_at DESC);

            CREATE TABLE IF NOT EXISTS build_templates (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT,
                updated_at TEXT,
                payload TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_build_templates_name
                ON build_templates(name ASC);

            CREATE TABLE IF NOT EXISTS app_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL
            );

            "#,
        )
        .map_err(|error| to_user_error(format!("无法初始化本地数据库：{}", error)))
}

fn database_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| to_user_error(format!("无法获取应用数据目录：{}", error)))?;
    fs::create_dir_all(&dir)
        .map_err(|error| to_user_error(format!("无法创建应用数据目录：{}", error)))?;
    Ok(dir.join(DATABASE_FILE))
}
