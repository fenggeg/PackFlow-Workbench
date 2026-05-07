use crate::error::AppResult;
use crate::models::server_ops::{
    CommonCommand, FavoritePath, HighlightRule, LogSource, RemoteCommandResult, RemoteFileEntry,
    ServerGroup,
};
use crate::repositories::{deployment_repo, server_ops_repo};
use crate::services::{blocking, ssh_transport_service, terminal_session_service};
use tauri::AppHandle;
use tauri::State;

// ==================== Server Groups ====================

#[tauri::command]
pub async fn list_server_groups(app: AppHandle) -> AppResult<Vec<ServerGroup>> {
    let task_app = app.clone();
    blocking::run(move || server_ops_repo::list_server_groups(&task_app)).await
}

#[tauri::command]
pub async fn save_server_group(app: AppHandle, group: ServerGroup) -> AppResult<ServerGroup> {
    let task_app = app.clone();
    blocking::run(move || server_ops_repo::save_server_group(&task_app, group)).await
}

#[tauri::command]
pub async fn delete_server_group(app: AppHandle, group_id: String) -> AppResult<()> {
    let task_app = app.clone();
    blocking::run(move || server_ops_repo::delete_server_group(&task_app, &group_id)).await
}

// ==================== Favorite Paths ====================

#[tauri::command]
pub async fn list_favorite_paths(app: AppHandle, server_id: String) -> AppResult<Vec<FavoritePath>> {
    let task_app = app.clone();
    blocking::run(move || server_ops_repo::list_favorite_paths(&task_app, &server_id)).await
}

#[tauri::command]
pub async fn save_favorite_path(app: AppHandle, path: FavoritePath) -> AppResult<FavoritePath> {
    let task_app = app.clone();
    blocking::run(move || server_ops_repo::save_favorite_path(&task_app, path)).await
}

#[tauri::command]
pub async fn delete_favorite_path(app: AppHandle, path_id: String) -> AppResult<()> {
    let task_app = app.clone();
    blocking::run(move || server_ops_repo::delete_favorite_path(&task_app, &path_id)).await
}

// ==================== Common Commands ====================

#[tauri::command]
pub async fn list_common_commands(
    app: AppHandle,
    server_id: Option<String>,
) -> AppResult<Vec<CommonCommand>> {
    let task_app = app.clone();
    blocking::run(move || server_ops_repo::list_common_commands(&task_app, server_id.as_deref()))
        .await
}

#[tauri::command]
pub async fn save_common_command(
    app: AppHandle,
    command: CommonCommand,
) -> AppResult<CommonCommand> {
    let task_app = app.clone();
    blocking::run(move || server_ops_repo::save_common_command(&task_app, command)).await
}

#[tauri::command]
pub async fn delete_common_command(app: AppHandle, command_id: String) -> AppResult<()> {
    let task_app = app.clone();
    blocking::run(move || server_ops_repo::delete_common_command(&task_app, &command_id)).await
}

// ==================== Log Sources ====================

#[tauri::command]
pub async fn list_log_sources(app: AppHandle, server_id: String) -> AppResult<Vec<LogSource>> {
    let task_app = app.clone();
    blocking::run(move || server_ops_repo::list_log_sources(&task_app, &server_id)).await
}

#[tauri::command]
pub async fn save_log_source(app: AppHandle, source: LogSource) -> AppResult<LogSource> {
    let task_app = app.clone();
    blocking::run(move || server_ops_repo::save_log_source(&task_app, source)).await
}

#[tauri::command]
pub async fn delete_log_source(app: AppHandle, source_id: String) -> AppResult<()> {
    let task_app = app.clone();
    blocking::run(move || server_ops_repo::delete_log_source(&task_app, &source_id)).await
}

// ==================== Highlight Rules ====================

#[tauri::command]
pub async fn list_highlight_rules(
    app: AppHandle,
    server_id: Option<String>,
) -> AppResult<Vec<HighlightRule>> {
    let task_app = app.clone();
    blocking::run(move || {
        server_ops_repo::list_highlight_rules(&task_app, server_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn save_highlight_rule(app: AppHandle, rule: HighlightRule) -> AppResult<HighlightRule> {
    let task_app = app.clone();
    blocking::run(move || server_ops_repo::save_highlight_rule(&task_app, rule)).await
}

#[tauri::command]
pub async fn delete_highlight_rule(app: AppHandle, rule_id: String) -> AppResult<()> {
    let task_app = app.clone();
    blocking::run(move || server_ops_repo::delete_highlight_rule(&task_app, &rule_id)).await
}

// ==================== Remote Operations ====================

#[tauri::command]
pub async fn execute_remote_command(
    app: AppHandle,
    server_id: String,
    command: String,
) -> AppResult<RemoteCommandResult> {
    let task_app = app.clone();
    blocking::run(move || {
        let profile = deployment_repo::get_server_profile_for_execution(&task_app, &server_id)?;
        let mut connection =
            ssh_transport_service::SshConnection::connect(&profile, || false)?;
        let result = connection.execute_with_cancel(&command, || false)?;
        Ok(RemoteCommandResult {
            success: true,
            output: result.output,
            exit_code: result.exit_status,
        })
    })
    .await
}

#[tauri::command]
pub async fn list_remote_files(
    app: AppHandle,
    server_id: String,
    path: String,
) -> AppResult<Vec<RemoteFileEntry>> {
    let task_app = app.clone();
    blocking::run(move || {
        let profile = deployment_repo::get_server_profile_for_execution(&task_app, &server_id)?;
        let mut connection =
            ssh_transport_service::SshConnection::connect(&profile, || false)?;

        let safe_path = path.replace('\'', "'\\''");
        let cmd = format!(
            "ls -la --time-style=long-iso '{}' 2>/dev/null || echo 'EMPTY'",
            safe_path
        );
        let result = connection.execute_with_cancel(&cmd, || false)?;

        let mut entries = Vec::new();
        for line in result.output.lines() {
            if line == "EMPTY" || line.starts_with("total") {
                continue;
            }
            if let Some(entry) = parse_ls_line(line, &path) {
                entries.push(entry);
            }
        }

        Ok(entries)
    })
    .await
}

fn parse_ls_line(line: &str, parent_path: &str) -> Option<RemoteFileEntry> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 7 {
        return None;
    }

    let permissions = parts[0].to_string();
    
    // 跳过链接数 (parts[1])
    let owner = parts[2].to_string();
    let group = parts[3].to_string();
    let size: u64 = parts[4].parse().unwrap_or(0);
    
    // 查找日期和时间 - long-iso 格式: 2024-01-15 10:30
    // 或者标准格式: Jan 15 10:30 或 Jan 15  2024
    let (date_str, name_start_idx) = if parts.len() >= 8 
        && parts[5].contains('-') 
        && parts[6].contains(':') 
    {
        // long-iso 格式: 2024-01-15 10:30
        (format!("{} {}", parts[5], parts[6]), 7)
    } else if parts.len() >= 8 && parts[7].contains(':') {
        // 标准格式: Jan 15 10:30
        (format!("{} {} {}", parts[5], parts[6], parts[7]), 8)
    } else if parts.len() >= 8 {
        // 标准格式: Jan 15  2024
        (format!("{} {} {}", parts[5], parts[6], parts[7]), 8)
    } else {
        (format!("{} {}", parts[5], parts[6]), 7)
    };

    if name_start_idx >= parts.len() {
        return None;
    }

    let name = parts[name_start_idx..].join(" ");
    
    // 处理 symlink: filename -> target
    let (actual_name, is_symlink) = if permissions.starts_with('l') {
        if let Some(arrow_pos) = name.find(" -> ") {
            (name[..arrow_pos].to_string(), true)
        } else {
            (name, true)
        }
    } else {
        (name, false)
    };

    if actual_name == "." || actual_name == ".." {
        return None;
    }

    let is_directory = permissions.starts_with('d');
    let path = if parent_path.ends_with('/') {
        format!("{}{}", parent_path, actual_name)
    } else {
        format!("{}/{}", parent_path, actual_name)
    };

    Some(RemoteFileEntry {
        name: actual_name,
        path,
        is_directory,
        is_symlink,
        size,
        modified_at: Some(date_str),
        permissions: Some(permissions),
        owner: Some(owner),
        group: Some(group),
    })
}

#[tauri::command]
pub async fn delete_remote_file(
    app: AppHandle,
    server_id: String,
    path: String,
) -> AppResult<()> {
    let task_app = app.clone();
    blocking::run(move || {
        let profile = deployment_repo::get_server_profile_for_execution(&task_app, &server_id)?;
        let mut connection =
            ssh_transport_service::SshConnection::connect(&profile, || false)?;

        let safe_path = path.replace('\'', "'\\''");
        let cmd = format!("rm -rf '{}'", safe_path);
        connection.execute_with_cancel(&cmd, || false)?;

        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn rename_remote_file(
    app: AppHandle,
    server_id: String,
    old_path: String,
    new_path: String,
) -> AppResult<()> {
    let task_app = app.clone();
    blocking::run(move || {
        let profile = deployment_repo::get_server_profile_for_execution(&task_app, &server_id)?;
        let mut connection =
            ssh_transport_service::SshConnection::connect(&profile, || false)?;

        let safe_old = old_path.replace('\'', "'\\''");
        let safe_new = new_path.replace('\'', "'\\''");
        let cmd = format!("mv '{}' '{}'", safe_old, safe_new);
        connection.execute_with_cancel(&cmd, || false)?;

        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn create_remote_directory(
    app: AppHandle,
    server_id: String,
    path: String,
) -> AppResult<()> {
    let task_app = app.clone();
    blocking::run(move || {
        let profile = deployment_repo::get_server_profile_for_execution(&task_app, &server_id)?;
        let mut connection =
            ssh_transport_service::SshConnection::connect(&profile, || false)?;

        let safe_path = path.replace('\'', "'\\''");
        let cmd = format!("mkdir -p '{}'", safe_path);
        connection.execute_with_cancel(&cmd, || false)?;

        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn read_remote_log_lines(
    app: AppHandle,
    server_id: String,
    log_path: String,
    lines: i32,
) -> AppResult<Vec<String>> {
    let task_app = app.clone();
    blocking::run(move || {
        let profile = deployment_repo::get_server_profile_for_execution(&task_app, &server_id)?;
        let mut connection =
            ssh_transport_service::SshConnection::connect(&profile, || false)?;

        let safe_path = log_path.replace('\'', "'\\''");
        let cmd = format!("tail -n {} '{}'", lines, safe_path);
        let result = connection.execute_with_cancel(&cmd, || false)?;

        Ok(result.output.lines().map(String::from).collect())
    })
    .await
}

// ==================== Terminal ====================

#[tauri::command]
pub async fn create_terminal_session(
    app: AppHandle,
    server_id: String,
    cols: u32,
    rows: u32,
    terminal_manager: State<'_, terminal_session_service::TerminalManager>,
) -> AppResult<String> {
    let task_app = app.clone();
    let manager = terminal_manager.inner().clone();
    blocking::run(move || {
        let profile = deployment_repo::get_server_profile_for_execution(&task_app, &server_id)?;
        manager.create_session(&server_id, &profile, cols, rows)
    })
    .await
}

#[tauri::command]
pub async fn write_terminal_input(
    session_id: String,
    data: Vec<u8>,
    terminal_manager: State<'_, terminal_session_service::TerminalManager>,
) -> AppResult<()> {
    terminal_manager.write_input(&session_id, &data)
}

#[tauri::command]
pub async fn read_terminal_output(
    session_id: String,
    terminal_manager: State<'_, terminal_session_service::TerminalManager>,
) -> AppResult<Vec<u8>> {
    terminal_manager.read_output(&session_id)
}

#[tauri::command]
pub async fn resize_terminal(
    session_id: String,
    cols: u32,
    rows: u32,
    terminal_manager: State<'_, terminal_session_service::TerminalManager>,
) -> AppResult<()> {
    terminal_manager.resize(&session_id, cols, rows)
}

#[tauri::command]
pub async fn close_terminal_session(
    session_id: String,
    terminal_manager: State<'_, terminal_session_service::TerminalManager>,
) -> AppResult<()> {
    terminal_manager.close(&session_id)
}

#[tauri::command]
pub async fn check_terminal_alive(
    session_id: String,
    terminal_manager: State<'_, terminal_session_service::TerminalManager>,
) -> AppResult<bool> {
    Ok(terminal_manager.is_alive(&session_id))
}
