use crate::error::{to_user_error, AppResult};
use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const DATABASE_FILE: &str = "app.sqlite3";

pub fn open_database(app: &AppHandle) -> AppResult<Connection> {
    let path = database_path(app)?;
    let connection = Connection::open(path)
        .map_err(|error| to_user_error(format!("无法打开本地数据库：{}", error)))?;
    initialize_database(&connection)?;
    Ok(connection)
}

fn initialize_database(connection: &Connection) -> AppResult<()> {
    connection
        .execute_batch(
            r#"
            PRAGMA foreign_keys = ON;

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

            CREATE TABLE IF NOT EXISTS server_profiles (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT,
                updated_at TEXT,
                payload TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_server_profiles_name
                ON server_profiles(name ASC);

            CREATE TABLE IF NOT EXISTS deployment_profiles (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT,
                updated_at TEXT,
                payload TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_deployment_profiles_name
                ON deployment_profiles(name ASC);

            CREATE TABLE IF NOT EXISTS deployment_tasks (
                id TEXT PRIMARY KEY NOT NULL,
                deployment_profile_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                payload TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_deployment_tasks_created_at
                ON deployment_tasks(created_at DESC);

            CREATE TABLE IF NOT EXISTS service_runtime_configs (
                id TEXT PRIMARY KEY NOT NULL,
                service_mapping_id TEXT NOT NULL,
                environment_id TEXT NOT NULL,
                server_id TEXT NOT NULL,
                service_name TEXT NOT NULL,
                created_at TEXT,
                updated_at TEXT,
                payload TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_service_runtime_configs_mapping_server
                ON service_runtime_configs(service_mapping_id, environment_id, server_id);

            CREATE TABLE IF NOT EXISTS service_operation_histories (
                id TEXT PRIMARY KEY NOT NULL,
                operation_type TEXT NOT NULL,
                service_name TEXT NOT NULL,
                started_at TEXT NOT NULL,
                payload TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_service_operation_histories_started_at
                ON service_operation_histories(started_at DESC);

            CREATE TABLE IF NOT EXISTS server_groups (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                parent_id TEXT,
                sort INTEGER NOT NULL DEFAULT 0,
                created_at TEXT,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS favorite_paths (
                id TEXT PRIMARY KEY NOT NULL,
                server_id TEXT NOT NULL,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                path_type TEXT NOT NULL DEFAULT 'custom',
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT,
                updated_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_favorite_paths_server_id
                ON favorite_paths(server_id);

            CREATE TABLE IF NOT EXISTS common_commands (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                command TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT '',
                scope TEXT NOT NULL DEFAULT 'global',
                server_id TEXT,
                risk_level TEXT NOT NULL DEFAULT 'safe',
                description TEXT,
                created_at TEXT,
                updated_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_common_commands_scope
                ON common_commands(scope, server_id);

            CREATE TABLE IF NOT EXISTS log_sources (
                id TEXT PRIMARY KEY NOT NULL,
                server_id TEXT NOT NULL,
                app_id TEXT,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                encoding TEXT NOT NULL DEFAULT 'UTF-8',
                default_tail_lines INTEGER NOT NULL DEFAULT 500,
                enabled INTEGER NOT NULL DEFAULT 1,
                remark TEXT,
                created_at TEXT,
                updated_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_log_sources_server_id
                ON log_sources(server_id);

            CREATE TABLE IF NOT EXISTS highlight_rules (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                pattern TEXT NOT NULL,
                pattern_type TEXT NOT NULL DEFAULT 'keyword',
                color TEXT NOT NULL DEFAULT '#ffffff',
                enabled INTEGER NOT NULL DEFAULT 1,
                scope TEXT NOT NULL DEFAULT 'global',
                server_id TEXT,
                app_id TEXT,
                created_at TEXT,
                updated_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_highlight_rules_scope
                ON highlight_rules(scope, server_id, app_id);
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
