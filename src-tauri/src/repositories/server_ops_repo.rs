use crate::error::AppResult;
use crate::models::server_ops::{
    CommonCommand, FavoritePath, HighlightRule, LogSource, ServerGroup,
};
use crate::repositories::storage::open_database;
use chrono::Utc;
use rusqlite::params;
use tauri::AppHandle;
use uuid::Uuid;

// ==================== Server Groups ====================

pub fn list_server_groups(app: &AppHandle) -> AppResult<Vec<ServerGroup>> {
    let connection = open_database(app)?;
    let mut statement = connection
        .prepare("SELECT id, name, parent_id, sort FROM server_groups ORDER BY sort ASC, name ASC")
        .map_err(|e| format!("无法读取服务器分组：{}", e))?;

    let groups = statement
        .query_map([], |row| {
            Ok(ServerGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                sort: row.get(3)?,
            })
        })
        .map_err(|e| format!("无法读取服务器分组：{}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("无法读取服务器分组：{}", e))?;

    Ok(groups)
}

pub fn save_server_group(app: &AppHandle, group: ServerGroup) -> AppResult<ServerGroup> {
    let connection = open_database(app)?;
    let id = if group.id.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        group.id.clone()
    };
    let now = Utc::now().to_rfc3339();

    connection
        .execute(
            "INSERT OR REPLACE INTO server_groups (id, name, parent_id, sort, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, group.name, group.parent_id, group.sort, now],
        )
        .map_err(|e| format!("无法保存服务器分组：{}", e))?;

    Ok(ServerGroup {
        id,
        name: group.name,
        parent_id: group.parent_id,
        sort: group.sort,
    })
}

pub fn delete_server_group(app: &AppHandle, group_id: &str) -> AppResult<()> {
    let connection = open_database(app)?;
    connection
        .execute("DELETE FROM server_groups WHERE id = ?1", params![group_id])
        .map_err(|e| format!("无法删除服务器分组：{}", e))?;
    Ok(())
}

// ==================== Favorite Paths ====================

pub fn list_favorite_paths(app: &AppHandle, server_id: &str) -> AppResult<Vec<FavoritePath>> {
    let connection = open_database(app)?;
    let mut statement = connection
        .prepare("SELECT id, server_id, name, path, path_type, is_default FROM favorite_paths WHERE server_id = ?1 ORDER BY is_default DESC, name ASC")
        .map_err(|e| format!("无法读取常用路径：{}", e))?;

    let paths = statement
        .query_map(params![server_id], |row| {
            Ok(FavoritePath {
                id: row.get(0)?,
                server_id: row.get(1)?,
                name: row.get(2)?,
                path: row.get(3)?,
                path_type: row.get(4)?,
                is_default: row.get::<_, i32>(5)? != 0,
            })
        })
        .map_err(|e| format!("无法读取常用路径：{}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("无法读取常用路径：{}", e))?;

    Ok(paths)
}

pub fn save_favorite_path(app: &AppHandle, path: FavoritePath) -> AppResult<FavoritePath> {
    let connection = open_database(app)?;
    let id = if path.id.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        path.id.clone()
    };
    let now = Utc::now().to_rfc3339();

    connection
        .execute(
            "INSERT OR REPLACE INTO favorite_paths (id, server_id, name, path, path_type, is_default, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, path.server_id, path.name, path.path, path.path_type, path.is_default as i32, now],
        )
        .map_err(|e| format!("无法保存常用路径：{}", e))?;

    Ok(FavoritePath {
        id,
        server_id: path.server_id,
        name: path.name,
        path: path.path,
        path_type: path.path_type,
        is_default: path.is_default,
    })
}

pub fn delete_favorite_path(app: &AppHandle, path_id: &str) -> AppResult<()> {
    let connection = open_database(app)?;
    connection
        .execute("DELETE FROM favorite_paths WHERE id = ?1", params![path_id])
        .map_err(|e| format!("无法删除常用路径：{}", e))?;
    Ok(())
}

// ==================== Common Commands ====================

pub fn list_common_commands(app: &AppHandle, server_id: Option<&str>) -> AppResult<Vec<CommonCommand>> {
    let connection = open_database(app)?;

    let mut commands = Vec::new();

    match server_id {
        Some(sid) => {
            let mut statement = connection
                .prepare("SELECT id, name, command, category, scope, server_id, risk_level, description FROM common_commands WHERE scope = 'global' OR server_id = ?1 ORDER BY category ASC, name ASC")
                .map_err(|e| format!("无法读取常用命令：{}", e))?;

            let rows = statement
                .query_map(params![sid], |row| {
                    Ok(CommonCommand {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        command: row.get(2)?,
                        category: row.get(3)?,
                        scope: row.get(4)?,
                        server_id: row.get(5)?,
                        risk_level: row.get(6)?,
                        description: row.get(7)?,
                    })
                })
                .map_err(|e| format!("无法读取常用命令：{}", e))?;

            for row in rows {
                commands.push(row.map_err(|e| format!("无法读取常用命令：{}", e))?);
            }
        }
        None => {
            let mut statement = connection
                .prepare("SELECT id, name, command, category, scope, server_id, risk_level, description FROM common_commands WHERE scope = 'global' ORDER BY category ASC, name ASC")
                .map_err(|e| format!("无法读取常用命令：{}", e))?;

            let rows = statement
                .query_map([], |row| {
                    Ok(CommonCommand {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        command: row.get(2)?,
                        category: row.get(3)?,
                        scope: row.get(4)?,
                        server_id: row.get(5)?,
                        risk_level: row.get(6)?,
                        description: row.get(7)?,
                    })
                })
                .map_err(|e| format!("无法读取常用命令：{}", e))?;

            for row in rows {
                commands.push(row.map_err(|e| format!("无法读取常用命令：{}", e))?);
            }
        }
    };

    Ok(commands)
}

pub fn save_common_command(app: &AppHandle, command: CommonCommand) -> AppResult<CommonCommand> {
    let connection = open_database(app)?;
    let id = if command.id.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        command.id.clone()
    };
    let now = Utc::now().to_rfc3339();

    connection
        .execute(
            "INSERT OR REPLACE INTO common_commands (id, name, command, category, scope, server_id, risk_level, description, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, command.name, command.command, command.category, command.scope, command.server_id, command.risk_level, command.description, now],
        )
        .map_err(|e| format!("无法保存常用命令：{}", e))?;

    Ok(CommonCommand {
        id,
        name: command.name,
        command: command.command,
        category: command.category,
        scope: command.scope,
        server_id: command.server_id,
        risk_level: command.risk_level,
        description: command.description,
    })
}

pub fn delete_common_command(app: &AppHandle, command_id: &str) -> AppResult<()> {
    let connection = open_database(app)?;
    connection
        .execute("DELETE FROM common_commands WHERE id = ?1", params![command_id])
        .map_err(|e| format!("无法删除常用命令：{}", e))?;
    Ok(())
}

// ==================== Log Sources ====================

pub fn list_log_sources(app: &AppHandle, server_id: &str) -> AppResult<Vec<LogSource>> {
    let connection = open_database(app)?;
    let mut statement = connection
        .prepare("SELECT id, server_id, app_id, name, path, encoding, default_tail_lines, enabled, remark FROM log_sources WHERE server_id = ?1 ORDER BY name ASC")
        .map_err(|e| format!("无法读取日志源：{}", e))?;

    let sources = statement
        .query_map(params![server_id], |row| {
            Ok(LogSource {
                id: row.get(0)?,
                server_id: row.get(1)?,
                app_id: row.get(2)?,
                name: row.get(3)?,
                path: row.get(4)?,
                encoding: row.get(5)?,
                default_tail_lines: row.get(6)?,
                enabled: row.get::<_, i32>(7)? != 0,
                remark: row.get(8)?,
            })
        })
        .map_err(|e| format!("无法读取日志源：{}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("无法读取日志源：{}", e))?;

    Ok(sources)
}

pub fn save_log_source(app: &AppHandle, source: LogSource) -> AppResult<LogSource> {
    let connection = open_database(app)?;
    let id = if source.id.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        source.id.clone()
    };
    let now = Utc::now().to_rfc3339();

    connection
        .execute(
            "INSERT OR REPLACE INTO log_sources (id, server_id, app_id, name, path, encoding, default_tail_lines, enabled, remark, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![id, source.server_id, source.app_id, source.name, source.path, source.encoding, source.default_tail_lines, source.enabled as i32, source.remark, now],
        )
        .map_err(|e| format!("无法保存日志源：{}", e))?;

    Ok(LogSource {
        id,
        server_id: source.server_id,
        app_id: source.app_id,
        name: source.name,
        path: source.path,
        encoding: source.encoding,
        default_tail_lines: source.default_tail_lines,
        enabled: source.enabled,
        remark: source.remark,
    })
}

pub fn delete_log_source(app: &AppHandle, source_id: &str) -> AppResult<()> {
    let connection = open_database(app)?;
    connection
        .execute("DELETE FROM log_sources WHERE id = ?1", params![source_id])
        .map_err(|e| format!("无法删除日志源：{}", e))?;
    Ok(())
}

// ==================== Highlight Rules ====================

pub fn list_highlight_rules(app: &AppHandle, server_id: Option<&str>) -> AppResult<Vec<HighlightRule>> {
    let connection = open_database(app)?;

    let mut rules = Vec::new();

    match server_id {
        Some(sid) => {
            let mut statement = connection
                .prepare("SELECT id, name, pattern, pattern_type, color, enabled, scope, server_id, app_id FROM highlight_rules WHERE scope = 'global' OR server_id = ?1 ORDER BY name ASC")
                .map_err(|e| format!("无法读取高亮规则：{}", e))?;

            let rows = statement
                .query_map(params![sid], |row| {
                    Ok(HighlightRule {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        pattern: row.get(2)?,
                        pattern_type: row.get(3)?,
                        color: row.get(4)?,
                        enabled: row.get::<_, i32>(5)? != 0,
                        scope: row.get(6)?,
                        server_id: row.get(7)?,
                        app_id: row.get(8)?,
                    })
                })
                .map_err(|e| format!("无法读取高亮规则：{}", e))?;

            for row in rows {
                rules.push(row.map_err(|e| format!("无法读取高亮规则：{}", e))?);
            }
        }
        None => {
            let mut statement = connection
                .prepare("SELECT id, name, pattern, pattern_type, color, enabled, scope, server_id, app_id FROM highlight_rules WHERE scope = 'global' ORDER BY name ASC")
                .map_err(|e| format!("无法读取高亮规则：{}", e))?;

            let rows = statement
                .query_map([], |row| {
                    Ok(HighlightRule {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        pattern: row.get(2)?,
                        pattern_type: row.get(3)?,
                        color: row.get(4)?,
                        enabled: row.get::<_, i32>(5)? != 0,
                        scope: row.get(6)?,
                        server_id: row.get(7)?,
                        app_id: row.get(8)?,
                    })
                })
                .map_err(|e| format!("无法读取高亮规则：{}", e))?;

            for row in rows {
                rules.push(row.map_err(|e| format!("无法读取高亮规则：{}", e))?);
            }
        }
    };

    Ok(rules)
}

pub fn save_highlight_rule(app: &AppHandle, rule: HighlightRule) -> AppResult<HighlightRule> {
    let connection = open_database(app)?;
    let id = if rule.id.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        rule.id.clone()
    };
    let now = Utc::now().to_rfc3339();

    connection
        .execute(
            "INSERT OR REPLACE INTO highlight_rules (id, name, pattern, pattern_type, color, enabled, scope, server_id, app_id, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![id, rule.name, rule.pattern, rule.pattern_type, rule.color, rule.enabled as i32, rule.scope, rule.server_id, rule.app_id, now],
        )
        .map_err(|e| format!("无法保存高亮规则：{}", e))?;

    Ok(HighlightRule {
        id,
        name: rule.name,
        pattern: rule.pattern,
        pattern_type: rule.pattern_type,
        color: rule.color,
        enabled: rule.enabled,
        scope: rule.scope,
        server_id: rule.server_id,
        app_id: rule.app_id,
    })
}

pub fn delete_highlight_rule(app: &AppHandle, rule_id: &str) -> AppResult<()> {
    let connection = open_database(app)?;
    connection
        .execute("DELETE FROM highlight_rules WHERE id = ?1", params![rule_id])
        .map_err(|e| format!("无法删除高亮规则：{}", e))?;
    Ok(())
}
