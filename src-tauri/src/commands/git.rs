use crate::error::{to_user_error, AppResult};
use crate::models::git::{
    GitBranch, GitCommit, GitPullResult, GitRepositoryStatus, GitSwitchBranchResult,
};
use crate::services::{app_logger, blocking};
use crate::services::process_utils::CREATE_NO_WINDOW;
use encoding_rs::GBK;
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tauri::AppHandle;

/// Git 本地命令超时上限：命令卡死（如 index.lock 被占用）时 60 秒内暴露，
/// 避免永久占住 blocking 线程且前端无法取消。
const GIT_COMMAND_TIMEOUT: Duration = Duration::from_secs(60);

/// Git 网络命令超时上限：fetch 走网络且大仓库传输耗时，慢链路下 60 秒会误杀，
/// 放宽到 180 秒；再久基本就是网络挂起或凭据对话框无人应答。
const GIT_NETWORK_TIMEOUT: Duration = Duration::from_secs(180);

/// 应用内拉取自动贮藏时写入的说明，便于用户在编辑器/终端中识别来源。
const PULL_AUTO_STASH_MESSAGE: &str = "maven-packager-desktop pull auto-stash";

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
    // 上游分支不存在时无法执行快进拉取
    let upstream = optional_git_output(
        root_path,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )?
    .ok_or_else(|| to_user_error("当前分支没有配置上游分支，无法拉取远端更新。"))?;

    // 分叉预检：本地领先时快进不可行，提前终止可避免无效的贮藏/恢复往返
    let (ahead_count, behind_count) = git_ahead_behind(root_path)?;
    if behind_count == 0 {
        return Err(to_user_error("当前分支已与远端同步，无需拉取。"));
    }
    if ahead_count > 0 {
        return Err(to_user_error(format!(
            "本地与远端历史已分叉（本地领先 {} 个提交、远端领先 {} 个提交），应用内拉取仅支持快进更新，请在代码编辑器中合并或变基后再拉取。",
            ahead_count, behind_count
        )));
    }

    // 记录本地是否有未提交改动（含未跟踪文件），决定是否需要自动贮藏
    let had_local_changes = optional_git_output(root_path, &["status", "--porcelain"])?
        .is_some_and(|output| !output.trim().is_empty());

    // 本地有改动时先贮藏，保证快进合并期间工作区干净
    if had_local_changes {
        let stash = run_git(
            root_path,
            &["stash", "push", "--include-untracked", "-m", PULL_AUTO_STASH_MESSAGE],
        )?;
        if !stash.success {
            return Err(to_user_error(format!(
                "自动贮藏本地改动失败，已停止拉取，本地代码未受影响。\n{}",
                stash.combined_output()
            )));
        }
    }

    // 仅拉取当前上游分支且不带 tags，减少慢链路下的网络量；
    // 显式 refspec 确保对应的远端跟踪引用被更新（供 merge --ff-only 使用）
    let (remote, remote_branch) = split_upstream(&upstream);
    let refspec = format!("+refs/heads/{remote_branch}:refs/remotes/{remote}/{remote_branch}");
    let fetch = run_git_with_timeout(
        root_path,
        &["fetch", "--no-tags", remote, &refspec],
        GIT_NETWORK_TIMEOUT,
    )?;
    if !fetch.success {
        return Err(match restore_stashed_changes(root_path) {
            Ok(()) => to_user_error(format!(
                "获取远端更新失败，本地改动已自动恢复，本地代码未受影响。\n{}",
                fetch.combined_output()
            )),
            Err(restore_error) => to_user_error(format!(
                "获取远端更新失败，且自动恢复贮藏改动时出错（改动仍安全保存在 Git 贮藏中）：{}\n获取失败原因：{}",
                restore_error,
                fetch.combined_output()
            )),
        });
    }

    // 快进合并远端更新；失败时 HEAD 未移动，工作区保持干净
    let merge = run_git(root_path, &["merge", "--ff-only", "@{u}"])?;
    if !merge.success {
        return Err(match restore_stashed_changes(root_path) {
            Ok(()) => to_user_error(format!(
                "快进合并远端更新失败，本地改动已自动恢复，本地代码未受影响。建议在代码编辑器中执行 Git Pull 以处理冲突。\n{}",
                merge.combined_output()
            )),
            Err(restore_error) => to_user_error(format!(
                "快进合并远端更新失败，且自动恢复贮藏改动时出错（改动仍安全保存在 Git 贮藏中）：{}\n合并失败原因：{}",
                restore_error,
                merge.combined_output()
            )),
        });
    }

    // 恢复自动贮藏的本地改动；此时 HEAD 已前移，
    // 若改动与拉取的更新触碰同一文件会产生冲突，需停止并交由用户处理
    if had_local_changes {
        let pop = run_git(root_path, &["stash", "pop"])?;
        if !pop.success {
            let combined = pop.combined_output();
            if combined.contains("CONFLICT") {
                return Err(to_user_error(format!(
                    "远端更新已拉取完成，但恢复本地改动时与更新内容冲突：改动已恢复到工作区（带冲突标记），备份仍保留在 Git 贮藏中。请在代码编辑器中解决冲突；确认改动完整后可执行 git stash drop 清理备份。\n{}",
                    combined
                )));
            }
            return Err(to_user_error(format!(
                "远端更新已拉取完成，但自动恢复本地改动失败：改动仍安全保存在 Git 贮藏中，请在终端执行 git stash pop 手动恢复。\n{}",
                combined
            )));
        }
    }

    let status = check_status(root_path, false)?;
    let mut output = merge.combined_output();
    if had_local_changes {
        output = format!("{}\n本地未提交的改动已自动贮藏并恢复。", output);
    }
    Ok(GitPullResult {
        success: true,
        output,
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

    // fetch 前记录上游分支，用于区分“未配置上游”与“远端分支被 prune 删除”
    let upstream_before_fetch = if fetch {
        optional_git_output(
            root_path,
            &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        )?
    } else {
        None
    };

    if fetch {
        let fetch_result =
            run_git_with_timeout(root_path, &["fetch", "--prune"], GIT_NETWORK_TIMEOUT)?;
        if !fetch_result.success {
            return Err(to_user_error(format!(
                "获取远端更新失败：{}",
                fetch_result.combined_output()
            )));
        }
    }

    // status --porcelain=v2 --branch 一次拿全：当前分支、上游、ahead/behind、本地改动
    let raw_status = run_git(root_path, &["status", "--porcelain=v2", "--branch"])?;
    if !raw_status.success {
        return Err(to_user_error(format!(
            "读取 Git 状态失败：{}",
            raw_status.combined_output()
        )));
    }
    let parsed = parse_status_v2(&raw_status.stdout);
    let branches = list_local_branches(root_path, parsed.branch.as_deref())?;

    if parsed.upstream.is_none() {
        let message = if upstream_before_fetch.is_some() {
            Some(
                "远端分支可能已被删除（检查远端后未再发现本地分支的上游分支）。请在编辑器中确认远端分支状态，必要时重新设置上游。"
                    .to_string(),
            )
        } else {
            Some("当前分支没有配置上游分支，无法检查远端更新。".to_string())
        };
        return Ok(GitRepositoryStatus {
            is_git_repo: true,
            branch: parsed.branch,
            branches,
            upstream: None,
            ahead_count: 0,
            behind_count: 0,
            has_remote_updates: false,
            has_local_changes: parsed.has_local_changes,
            message,
        });
    }

    let has_remote_updates = parsed.behind_count > 0;
    let message = if has_remote_updates {
        Some(format!("远端分支有 {} 个提交尚未拉取。", parsed.behind_count))
    } else if fetch {
        Some("当前分支已与远端同步。".to_string())
    } else {
        Some("已读取本地 Git 状态，点击“检查远端”可获取远端更新。".to_string())
    };

    Ok(GitRepositoryStatus {
        is_git_repo: true,
        branch: parsed.branch,
        branches,
        upstream: parsed.upstream,
        ahead_count: parsed.ahead_count,
        behind_count: parsed.behind_count,
        has_remote_updates,
        has_local_changes: parsed.has_local_changes,
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

fn list_local_branches(root_path: &str, current: Option<&str>) -> AppResult<Vec<GitBranch>> {
    let output = run_git(root_path, &["branch", "--format=%(refname:short)"])?;
    if !output.success {
        return Ok(Vec::new());
    }
    Ok(output
        .stdout
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(|name| GitBranch {
            name: name.to_string(),
            is_current: Some(name) == current,
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

/// 读取本地与上游分支的领先/落后提交数。
fn git_ahead_behind(root_path: &str) -> AppResult<(u32, u32)> {
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
    parse_ahead_behind(&counts.stdout)
}

/// 拆分 "origin/feature/x" 形式的上游引用为远端名与远端分支名。
fn split_upstream(upstream: &str) -> (&str, &str) {
    match upstream.split_once('/') {
        Some((remote, remote_branch)) => (remote, remote_branch),
        // 常规仓库不会出现，仅作兜底：把整体视为远端名、分支为空，让 fetch 自行报错
        None => (upstream, ""),
    }
}

/// 拉取中断后恢复自动贮藏的本地改动。
/// 中断时 HEAD 未移动，贮藏基点与当前一致，恢复不会产生冲突；
/// 万一失败则改动仍留在贮藏堆栈中，由错误信息提示手动恢复。
fn restore_stashed_changes(root_path: &str) -> AppResult<()> {
    let pop = run_git(root_path, &["stash", "pop"])?;
    if !pop.success {
        return Err(to_user_error(format!(
            "自动恢复贮藏的本地改动失败：改动仍安全保存在 Git 贮藏中，请在终端执行 git stash pop 手动恢复。\n{}",
            pop.combined_output()
        )));
    }
    Ok(())
}

/// `git status --porcelain=v2 --branch` 的解析结果。
struct GitStatusV2 {
    /// 当前分支；detached HEAD 时为 None
    branch: Option<String>,
    /// 上游分支（如 origin/master），未配置时为 None
    upstream: Option<String>,
    ahead_count: u32,
    behind_count: u32,
    /// 是否存在本地改动（工作区条目行，含未跟踪文件）
    has_local_changes: bool,
}

/// 解析 `git status --porcelain=v2 --branch` 输出：
/// `# branch.head <name>`、`# branch.upstream <upstream>`、`# branch.ab +a -b`
/// 以及工作区条目行（非 `#` 开头即表示有本地改动）。
fn parse_status_v2(output: &str) -> GitStatusV2 {
    let mut result = GitStatusV2 {
        branch: None,
        upstream: None,
        ahead_count: 0,
        behind_count: 0,
        has_local_changes: false,
    };
    for line in output.lines() {
        if let Some(rest) = line.strip_prefix("# branch.head ") {
            let value = rest.trim();
            // detached HEAD 时 git 输出 `(detached)`
            if value != "(detached)" {
                result.branch = Some(value.to_string());
            }
        } else if let Some(rest) = line.strip_prefix("# branch.upstream ") {
            result.upstream = Some(rest.trim().to_string());
        } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
            // 格式：+<ahead> -<behind>
            let parts = rest.split_whitespace().collect::<Vec<_>>();
            if parts.len() >= 2 {
                if let Ok(value) = parts[0].trim_start_matches('+').parse::<u32>() {
                    result.ahead_count = value;
                }
                if let Ok(value) = parts[1].trim_start_matches('-').parse::<u32>() {
                    result.behind_count = value;
                }
            }
        } else if !line.starts_with('#') && !line.trim().is_empty() {
            // 工作区条目行（1 / 2 / u / ? 开头）表示有本地改动
            result.has_local_changes = true;
        }
    }
    result
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

/// Git 子进程的 Job 句柄守卫：句柄关闭时（KILL_ON_JOB_CLOSE）整树终止。
/// git 的 git-remote-https、凭据管理器等子进程随主进程一并终止，
/// 避免超时只杀 git.exe 主进程后残留孤儿进程。
struct GitJobGuard {
    handle: std::os::windows::io::OwnedHandle,
}

/// 创建 KILL_ON_JOB_CLOSE 作业并把 git 子进程挂入；
/// 失败时返回 None（如系统资源限制），超时兜底退化为仅终止主进程。
fn attach_child_to_job(child: &std::process::Child) -> Option<GitJobGuard> {
    use std::mem::size_of;
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        SetInformationJobObject,
    };

    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return None;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let ok = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            (&info as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if ok == 0 {
            CloseHandle(job);
            return None;
        }
        let guard = GitJobGuard {
            handle: OwnedHandle::from_raw_handle(job as HANDLE),
        };
        // 进程可能已退出或被其他 Job 托管，失败时忽略（兜底仅杀主进程）
        let _ = AssignProcessToJobObject(
            guard.handle.as_raw_handle() as HANDLE,
            child.as_raw_handle() as HANDLE,
        );
        Some(guard)
    }
}

fn run_git(root_path: &str, args: &[&str]) -> AppResult<GitCommandOutput> {
    run_git_with_timeout(root_path, args, GIT_COMMAND_TIMEOUT)
}

fn run_git_with_timeout(
    root_path: &str,
    args: &[&str],
    timeout: Duration,
) -> AppResult<GitCommandOutput> {
    let mut command = Command::new("git");
    command
        .args([
            "-c",
            "credential.helper=",
            "-c",
            "credential.helper=manager",
            "-C",
            root_path,
        ])
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW);

    let mut child = command
        .spawn()
        .map_err(|error| to_user_error(format!("无法执行 Git 命令：{}", error)))?;
    // git 远程操作会派生子进程（git-remote-https、凭据管理器等），
    // 挂入 KILL_ON_JOB_CLOSE 的作业，超时终止时整树回收，避免残留孤儿进程
    let job_guard = attach_child_to_job(&child);
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| to_user_error("无法读取 Git 命令输出。".to_string()))?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| to_user_error("无法读取 Git 命令输出。".to_string()))?;

    // 管道在独立线程读取，避免输出较多时子进程写满管道而卡死
    let stdout_handle = std::thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = std::io::Read::read_to_end(&mut stdout, &mut buffer);
        buffer
    });
    let stderr_handle = std::thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = std::io::Read::read_to_end(&mut stderr, &mut buffer);
        buffer
    });

    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {
                if Instant::now() >= deadline {
                    // 先终止主进程，再关闭 Job 句柄触发整树终止（KILL_ON_JOB_CLOSE）
                    let _ = child.kill();
                    drop(job_guard);
                    let _ = child.wait();
                    break None;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(_) => break None,
        }
    };

    let Some(status) = status else {
        return Err(to_user_error(format!(
            "Git 命令执行超时（{} 秒），请检查网络或凭据配置：git {}",
            timeout.as_secs(),
            args.join(" ")
        )));
    };

    let stdout_bytes = stdout_handle.join().unwrap_or_default();
    let stderr_bytes = stderr_handle.join().unwrap_or_default();
    Ok(GitCommandOutput {
        success: status.success(),
        stdout: decode_command_output(&stdout_bytes),
        stderr: decode_command_output(&stderr_bytes),
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
