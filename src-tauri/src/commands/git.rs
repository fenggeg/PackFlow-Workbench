use crate::error::{to_user_error, AppResult};
use crate::models::git::{
    GitBranch, GitCommit, GitPullResult, GitRepositoryStatus, GitSwitchBranchResult,
};
use crate::services::{app_logger, blocking};
use crate::services::process_utils::CREATE_NO_WINDOW;
use encoding_rs::GBK;
use std::os::windows::process::CommandExt;
use std::process::Command;
use tauri::AppHandle;

#[tauri::command]
pub async fn check_git_status(app: AppHandle, root_path: String) -> AppResult<GitRepositoryStatus> {
    app_logger::log_info(&app, "git.status.start", format!("root_path={}", root_path));
    let log_root_path = root_path.clone();
    let result = blocking::run(move || check_status(&root_path, false)).await;
    match &result {
        Ok(status) => app_logger::log_info(
            &app,
            "git.status.success",
            format!(
                "root_path={}, is_git_repo={}, branch={}, upstream={}, ahead={}, behind={}, dirty={}",
                log_root_path,
                status.is_git_repo,
                status.branch.as_deref().unwrap_or("<empty>"),
                status.upstream.as_deref().unwrap_or("<empty>"),
                status.ahead_count,
                status.behind_count,
                status.has_local_changes
            ),
        ),
        Err(error) => app_logger::log_error(
            &app,
            "git.status.failed",
            format!("root_path={}, error={}", log_root_path, error),
        ),
    }
    result
}

#[tauri::command]
pub async fn fetch_git_updates(
    app: AppHandle,
    root_path: String,
) -> AppResult<GitRepositoryStatus> {
    app_logger::log_info(&app, "git.fetch.start", format!("root_path={}", root_path));
    let log_root_path = root_path.clone();
    let result = blocking::run(move || check_status(&root_path, true)).await;
    match &result {
        Ok(status) => app_logger::log_info(
            &app,
            "git.fetch.success",
            format!(
                "root_path={}, is_git_repo={}, branch={}, upstream={}, ahead={}, behind={}, dirty={}",
                log_root_path,
                status.is_git_repo,
                status.branch.as_deref().unwrap_or("<empty>"),
                status.upstream.as_deref().unwrap_or("<empty>"),
                status.ahead_count,
                status.behind_count,
                status.has_local_changes
            ),
        ),
        Err(error) => app_logger::log_error(
            &app,
            "git.fetch.failed",
            format!("root_path={}, error={}", log_root_path, error),
        ),
    }
    result
}

#[tauri::command]
pub async fn pull_git_updates(app: AppHandle, root_path: String) -> AppResult<GitPullResult> {
    app_logger::log_info(&app, "git.pull.start", format!("root_path={}", root_path));

    let log_root_path = root_path.clone();
    let result = blocking::run(move || pull_git_updates_sync(&root_path)).await;
    match &result {
        Ok(pull) => app_logger::log_info(
            &app,
            "git.pull.success",
            format!("root_path={}, output={}", log_root_path, pull.output),
        ),
        Err(error) => app_logger::log_warn(
            &app,
            "git.pull.failed",
            format!("root_path={}, error={}", log_root_path, error),
        ),
    }
    result
}

#[tauri::command]
pub async fn switch_git_branch(
    app: AppHandle,
    root_path: String,
    branch_name: String,
) -> AppResult<GitSwitchBranchResult> {
    app_logger::log_info(
        &app,
        "git.branch.switch.start",
        format!("root_path={}, branch={}", root_path, branch_name),
    );

    let log_root_path = root_path.clone();
    let log_branch_name = branch_name.clone();
    let result = blocking::run(move || switch_git_branch_sync(&root_path, &branch_name)).await;
    match &result {
        Ok(switch) => app_logger::log_info(
            &app,
            "git.branch.switch.success",
            format!(
                "root_path={}, branch={}, output={}",
                log_root_path, log_branch_name, switch.output
            ),
        ),
        Err(error) => app_logger::log_warn(
            &app,
            "git.branch.switch.failed",
            format!(
                "root_path={}, branch={}, error={}",
                log_root_path, log_branch_name, error
            ),
        ),
    }
    result
}

#[tauri::command]
pub async fn list_git_commits(
    app: AppHandle,
    root_path: String,
    limit: Option<usize>,
) -> AppResult<Vec<GitCommit>> {
    let log_limit = limit.unwrap_or(30).clamp(1, 100);
    app_logger::log_info(
        &app,
        "git.commits.list.start",
        format!("root_path={}, limit={}", root_path, log_limit),
    );

    let log_root_path = root_path.clone();
    let result = blocking::run(move || list_git_commits_sync(&root_path, log_limit)).await;
    match &result {
        Ok(commits) => app_logger::log_info(
            &app,
            "git.commits.list.success",
            format!("root_path={}, count={}", log_root_path, commits.len()),
        ),
        Err(error) => app_logger::log_error(
            &app,
            "git.commits.list.failed",
            format!("root_path={}, error={}", log_root_path, error),
        ),
    }
    result
}

fn pull_git_updates_sync(root_path: &str) -> AppResult<GitPullResult> {
    let pull = run_git(root_path, &["pull", "--ff-only"])?;
    if !pull.success {
        return Err(to_user_error(format!(
            "拉取失败。建议在代码编辑器中执行 Git Pull，以便处理冲突或本地改动。\n{}",
            pull.combined_output()
        )));
    }

    let status = check_status(root_path, false)?;
    Ok(GitPullResult {
        success: true,
        output: pull.combined_output(),
        status,
    })
}

fn switch_git_branch_sync(root_path: &str, branch_name: &str) -> AppResult<GitSwitchBranchResult> {
    let branch_name = branch_name.trim();
    if branch_name.is_empty() {
        return Err(to_user_error("请选择要切换的 Git 分支。"));
    }
    if branch_name.starts_with('-') || branch_name.contains("..") || branch_name.contains('\\') {
        return Err(to_user_error("分支名称不合法。"));
    }

    let switch = run_git(root_path, &["switch", branch_name])?;
    if !switch.success {
        return Err(to_user_error(format!(
            "切换分支失败。建议在代码编辑器中切换分支，以便处理本地改动或冲突。\n{}",
            switch.combined_output()
        )));
    }

    let status = check_status(root_path, false)?;
    Ok(GitSwitchBranchResult {
        success: true,
        output: switch.combined_output(),
        status,
    })
}

fn list_git_commits_sync(root_path: &str, limit: usize) -> AppResult<Vec<GitCommit>> {
    let limit = limit.to_string();
    let repo_check = run_git(root_path, &["rev-parse", "--is-inside-work-tree"])?;
    if !repo_check.success || repo_check.stdout.trim() != "true" {
        return Ok(Vec::new());
    }

    let output = run_git(
        root_path,
        &[
            "log",
            "-n",
            &limit,
            "--date=iso-strict",
            "--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1e",
        ],
    )?;
    if !output.success {
        return Err(to_user_error(format!(
            "读取 Git 提交记录失败：{}",
            output.combined_output()
        )));
    }

    let commits = parse_commits(&output.stdout);
    Ok(commits)
}

fn check_status(root_path: &str, fetch: bool) -> AppResult<GitRepositoryStatus> {
    let repo_check = run_git(root_path, &["rev-parse", "--is-inside-work-tree"])?;
    if !repo_check.success || repo_check.stdout.trim() != "true" {
        return Ok(GitRepositoryStatus {
            is_git_repo: false,
            branch: None,
            branches: Vec::new(),
            upstream: None,
            ahead_count: 0,
            behind_count: 0,
            has_remote_updates: false,
            has_local_changes: false,
            message: Some("当前项目目录不是 Git 仓库。".to_string()),
        });
    }

    let branch = optional_git_output(root_path, &["branch", "--show-current"])?;
    let branches = list_local_branches(root_path)?;
    let upstream = optional_git_output(
        root_path,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )?;
    let has_local_changes = optional_git_output(root_path, &["status", "--porcelain"])?
        .is_some_and(|output| !output.trim().is_empty());

    if upstream.is_none() {
        return Ok(GitRepositoryStatus {
            is_git_repo: true,
            branch,
            branches,
            upstream: None,
            ahead_count: 0,
            behind_count: 0,
            has_remote_updates: false,
            has_local_changes,
            message: Some("当前分支没有配置上游分支，无法检查远端更新。".to_string()),
        });
    }

    if fetch {
        let fetch_result = run_git(root_path, &["fetch", "--prune"])?;
        if !fetch_result.success {
            return Err(to_user_error(format!(
                "获取远端更新失败：{}",
                fetch_result.combined_output()
            )));
        }
    }

    let counts = run_git(
        root_path,
        &["rev-list", "--left-right", "--count", "HEAD...@{u}"],
    )?;
    if !counts.success {
        return Err(to_user_error(format!(
            "比较本地与远端分支失败：{}",
            counts.combined_output()
        )));
    }

    let (ahead_count, behind_count) = parse_ahead_behind(&counts.stdout)?;
    let has_remote_updates = behind_count > 0;
    let message = if has_remote_updates {
        Some(format!("远端分支有 {} 个提交尚未拉取。", behind_count))
    } else if fetch {
        Some("当前分支已与远端同步。".to_string())
    } else {
        Some("已读取本地 Git 状态，点击“检查远端”可获取远端更新。".to_string())
    };

    Ok(GitRepositoryStatus {
        is_git_repo: true,
        branch,
        branches,
        upstream,
        ahead_count,
        behind_count,
        has_remote_updates,
        has_local_changes,
        message,
    })
}

fn parse_commits(output: &str) -> Vec<GitCommit> {
    output
        .split('\x1e')
        .filter_map(|record| {
            let fields = record.trim().split('\x1f').collect::<Vec<_>>();
            if fields.len() < 5 {
                return None;
            }
            Some(GitCommit {
                hash: fields[0].to_string(),
                short_hash: fields[1].to_string(),
                author: fields[2].to_string(),
                date: fields[3].to_string(),
                subject: fields[4].to_string(),
            })
        })
        .collect()
}

fn list_local_branches(root_path: &str) -> AppResult<Vec<GitBranch>> {
    let output = run_git(root_path, &["branch", "--format=%(refname:short)"])?;
    if !output.success {
        return Ok(Vec::new());
    }
    let current =
        optional_git_output(root_path, &["branch", "--show-current"])?.unwrap_or_default();
    Ok(output
        .stdout
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(|name| GitBranch {
            name: name.to_string(),
            is_current: name == current,
        })
        .collect())
}

fn optional_git_output(root_path: &str, args: &[&str]) -> AppResult<Option<String>> {
    let output = run_git(root_path, args)?;
    if output.success {
        let value = output.stdout.trim().to_string();
        if value.is_empty() {
            Ok(None)
        } else {
            Ok(Some(value))
        }
    } else {
        Ok(None)
    }
}

fn parse_ahead_behind(output: &str) -> AppResult<(u32, u32)> {
    let parts = output.split_whitespace().collect::<Vec<_>>();
    if parts.len() < 2 {
        return Err(to_user_error("Git 分支差异数据格式异常。"));
    }
    let ahead_count = parts[0]
        .parse::<u32>()
        .map_err(|_| to_user_error("Git ahead 数据格式异常。"))?;
    let behind_count = parts[1]
        .parse::<u32>()
        .map_err(|_| to_user_error("Git behind 数据格式异常。"))?;
    Ok((ahead_count, behind_count))
}

struct GitCommandOutput {
    success: bool,
    stdout: String,
    stderr: String,
}

impl GitCommandOutput {
    fn combined_output(&self) -> String {
        [self.stdout.trim(), self.stderr.trim()]
            .into_iter()
            .filter(|item| !item.is_empty())
            .collect::<Vec<_>>()
            .join("\n")
    }
}

fn run_git(root_path: &str, args: &[&str]) -> AppResult<GitCommandOutput> {
    let output = Command::new("git")
        .args([
            "-c",
            "credential.helper=",
            "-c",
            "credential.helper=manager",
            "-C",
            root_path,
        ])
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| to_user_error(format!("无法执行 Git 命令：{}", error)))?;

    Ok(GitCommandOutput {
        success: output.status.success(),
        stdout: decode_command_output(&output.stdout),
        stderr: decode_command_output(&output.stderr),
    })
}

fn decode_command_output(bytes: &[u8]) -> String {
    match String::from_utf8(bytes.to_vec()) {
        Ok(value) => value.trim().to_string(),
        Err(_) => {
            let (decoded, _, _) = GBK.decode(bytes);
            decoded.trim().to_string()
        }
    }
}
