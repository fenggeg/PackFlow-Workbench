use crate::error::{to_user_error, AppResult};
use crate::models::build::BuildArtifact;
use crate::services::{app_logger, blocking};
use chrono::{DateTime, Utc};
use reqwest::blocking::Client;
use reqwest::header::{ACCEPT, USER_AGENT};
use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::os::windows::ffi::OsStrExt;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Window};
use windows_sys::Win32::Foundation::{GlobalFree, HWND};
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
};
use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows_sys::Win32::System::Ole::CF_HDROP;
use windows_sys::Win32::System::WindowsProgramming::GMEM_SHARE;

const CREATE_NO_WINDOW: u32 = 0x08000000;
const UPDATE_DOWNLOAD_EVENT: &str = "app-update-download-event";
const UPDATE_USER_AGENT: &str = "PackFlow-Workbench-Updater";

#[tauri::command]
pub fn open_path_in_explorer(app: AppHandle, path: String) -> AppResult<()> {
    app_logger::log_info(&app, "filesystem.open.start", format!("path={}", path));
    let target = PathBuf::from(&path);
    let existing_target = if target.exists() {
        target.clone()
    } else {
        nearest_existing_parent(&target).ok_or_else(|| {
            app_logger::log_error(
                &app,
                "filesystem.open.failed",
                format!("path={}, error=路径不存在且没有可打开的上级目录", path),
            );
            to_user_error(format!("路径不存在：{}", path))
        })?
    };

    let mut command = Command::new("explorer");
    if target.exists() && target.is_file() {
        command.arg("/select,").arg(target);
    } else {
        command.arg(existing_target);
    }
    let result = command
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| to_user_error(format!("无法打开资源管理器：{}", error)));

    match &result {
        Ok(_) => app_logger::log_info(&app, "filesystem.open.success", format!("path={}", path)),
        Err(error) => app_logger::log_error(
            &app,
            "filesystem.open.failed",
            format!("path={}, error={}", path, error),
        ),
    }
    result?;

    Ok(())
}

#[tauri::command]
pub async fn scan_build_artifacts(
    app: AppHandle,
    project_root: String,
    module_path: String,
) -> AppResult<Vec<BuildArtifact>> {
    app_logger::log_info(
        &app,
        "filesystem.artifacts.scan.start",
        format!("project_root={}, module_path={}", project_root, module_path),
    );

    let result =
        blocking::run(move || scan_build_artifacts_sync(&project_root, &module_path)).await;
    match &result {
        Ok(artifacts) => app_logger::log_info(
            &app,
            "filesystem.artifacts.scan.success",
            format!("count={}", artifacts.len()),
        ),
        Err(error) => app_logger::log_error(
            &app,
            "filesystem.artifacts.scan.failed",
            format!("error={}", error),
        ),
    }
    result
}

fn scan_build_artifacts_sync(
    project_root: &str,
    module_path: &str,
) -> AppResult<Vec<BuildArtifact>> {
    let root = PathBuf::from(project_root);
    if !root.exists() {
        return Err(to_user_error(format!("项目路径不存在：{}", project_root)));
    }

    let mut artifacts = Vec::new();
    let module_paths = module_path
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();

    if module_paths.is_empty() {
        scan_target_dirs(&root, &root, &mut artifacts)?;
    } else {
        for module in module_paths {
            let module_root = root.join(module);
            scan_target_dir(&root, &module_root.join("target"), module, &mut artifacts)?;
        }
    }

    artifacts.sort_by(|left, right| {
        right
            .modified_at
            .cmp(&left.modified_at)
            .then_with(|| right.size_bytes.cmp(&left.size_bytes))
    });
    artifacts.truncate(20);
    Ok(artifacts)
}

fn scan_target_dirs(
    project_root: &Path,
    current: &Path,
    artifacts: &mut Vec<BuildArtifact>,
) -> AppResult<()> {
    let entries = match fs::read_dir(current) {
        Ok(entries) => entries,
        Err(_) => return Ok(()),
    };

    for entry in entries {
        let entry = entry.map_err(|error| format!("无法读取目录：{}", error))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        if path.file_name().and_then(|name| name.to_str()) == Some("target") {
            let module_path = path
                .parent()
                .and_then(|parent| parent.strip_prefix(project_root).ok())
                .map(|relative| relative.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            scan_target_dir(project_root, &path, &module_path, artifacts)?;
        } else if !is_ignored_dir(&path) {
            scan_target_dirs(project_root, &path, artifacts)?;
        }
    }

    Ok(())
}

fn scan_target_dir(
    project_root: &Path,
    target_dir: &Path,
    module_path: &str,
    artifacts: &mut Vec<BuildArtifact>,
) -> AppResult<()> {
    if !target_dir.exists() {
        return Ok(());
    }

    let entries = fs::read_dir(target_dir).map_err(|error| {
        format!(
            "无法读取构建产物目录 {}：{}",
            target_dir.to_string_lossy(),
            error
        )
    })?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("无法读取构建产物：{}", error))?;
        let path = entry.path();
        if !path.is_file() || !is_package_file(&path) {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|error| format!("无法读取构建产物信息：{}", error))?;
        let modified_at = metadata
            .modified()
            .ok()
            .map(DateTime::<Utc>::from)
            .map(|time| time.to_rfc3339());
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        let normalized_module_path = if module_path.is_empty() {
            path.parent()
                .and_then(|parent| parent.parent())
                .and_then(|parent| parent.strip_prefix(project_root).ok())
                .map(|relative| relative.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default()
        } else {
            module_path.replace('\\', "/")
        };

        artifacts.push(BuildArtifact {
            path: path.to_string_lossy().to_string(),
            file_name,
            extension,
            size_bytes: metadata.len(),
            modified_at,
            module_path: normalized_module_path,
        });
    }

    Ok(())
}

fn is_package_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|value| value.to_str()),
        Some("jar") | Some("war")
    )
}

#[tauri::command]
pub fn delete_build_artifact(app: AppHandle, path: String) -> AppResult<()> {
    app_logger::log_info(
        &app,
        "filesystem.artifact.delete.start",
        format!("path={}", path),
    );
    let target = PathBuf::from(&path);
    if !target.exists() {
        app_logger::log_info(
            &app,
            "filesystem.artifact.delete.skipped",
            format!("path={}, reason=文件已不存在", path),
        );
        return Ok(());
    }
    if !target.is_file() {
        app_logger::log_error(
            &app,
            "filesystem.artifact.delete.failed",
            format!("path={}, error=路径不是文件", path),
        );
        return Err(to_user_error(format!("路径不是文件：{}", path)));
    }
    fs::remove_file(&target).map_err(|error| {
        app_logger::log_error(
            &app,
            "filesystem.artifact.delete.failed",
            format!("path={}, error={}", path, error),
        );
        to_user_error(format!("无法删除文件 {}：{}", path, error))
    })?;
    app_logger::log_info(
        &app,
        "filesystem.artifact.delete.success",
        format!("path={}", path),
    );
    Ok(())
}

#[repr(C)]
struct DropFiles {
    p_files: u32,
    pt_x: i32,
    pt_y: i32,
    f_nc: i32,
    wide: i32,
}

#[tauri::command]
pub fn copy_file_to_clipboard(app: AppHandle, path: String) -> AppResult<()> {
    app_logger::log_info(
        &app,
        "filesystem.clipboard.copy.start",
        format!("path={}", path),
    );
    let target = PathBuf::from(&path);
    if !target.exists() || !target.is_file() {
        return Err(to_user_error(format!("文件不存在：{}", path)));
    }

    unsafe {
        let owner: HWND = std::ptr::null_mut();
        if OpenClipboard(owner) == 0 {
            return Err(to_user_error("无法打开剪贴板"));
        }

        EmptyClipboard();

        let wide_path: Vec<u16> = target
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let drop_size = std::mem::size_of::<DropFiles>();
        let path_size = wide_path.len() * 2;
        let total = drop_size + path_size + 2;

        let h_mem = GlobalAlloc(GMEM_MOVEABLE | GMEM_SHARE, total);
        if h_mem.is_null() {
            CloseClipboard();
            return Err(to_user_error("无法分配剪贴板内存"));
        }

        let ptr = GlobalLock(h_mem) as *mut u8;
        if ptr.is_null() {
            GlobalFree(h_mem);
            CloseClipboard();
            return Err(to_user_error("无法锁定剪贴板内存"));
        }

        let drop = ptr as *mut DropFiles;
        (*drop).p_files = drop_size as u32;
        (*drop).pt_x = 0;
        (*drop).pt_y = 0;
        (*drop).f_nc = 0;
        (*drop).wide = 1;

        let path_dst = ptr.add(drop_size) as *mut u16;
        std::ptr::copy_nonoverlapping(wide_path.as_ptr(), path_dst, wide_path.len());

        GlobalUnlock(h_mem);

        if SetClipboardData(CF_HDROP as u32, h_mem).is_null() {
            GlobalFree(h_mem);
            CloseClipboard();
            return Err(to_user_error("无法设置剪贴板数据"));
        }

        CloseClipboard();
    }

    app_logger::log_info(
        &app,
        "filesystem.clipboard.copy.success",
        format!("path={}", path),
    );
    Ok(())
}

fn nearest_existing_parent(path: &Path) -> Option<PathBuf> {
    path.ancestors()
        .skip(1)
        .find(|candidate| candidate.exists())
        .map(Path::to_path_buf)
}

fn is_ignored_dir(path: &Path) -> bool {
    matches!(
        path.file_name().and_then(|name| name.to_str()),
        Some(".git") | Some("node_modules") | Some("dist") | Some(".idea")
    )
}

#[derive(Clone, Serialize)]
struct UpdateDownloadStartedData {
    #[serde(rename = "contentLength", skip_serializing_if = "Option::is_none")]
    content_length: Option<u64>,
}

#[derive(Clone, Serialize)]
struct UpdateDownloadProgressData {
    #[serde(rename = "chunkLength")]
    chunk_length: u64,
}

#[derive(Clone, Serialize)]
struct UpdateDownloadStartedEvent {
    event: &'static str,
    data: UpdateDownloadStartedData,
}

#[derive(Clone, Serialize)]
struct UpdateDownloadProgressEvent {
    event: &'static str,
    data: UpdateDownloadProgressData,
}

#[derive(Clone, Serialize)]
struct UpdateDownloadFinishedEvent {
    event: &'static str,
}

#[tauri::command]
pub async fn download_and_install_app_update(
    app: AppHandle,
    window: Window,
    download_url: String,
    file_name: String,
) -> AppResult<()> {
    blocking::run(move || {
        download_and_install_app_update_sync(&app, &window, &download_url, &file_name)
    })
    .await
}

fn download_and_install_app_update_sync(
    app: &AppHandle,
    window: &Window,
    download_url: &str,
    file_name: &str,
) -> AppResult<()> {
    app_logger::log_info(
        app,
        "updater.download.start",
        format!("file_name={}, url={}", file_name, download_url),
    );

    if !download_url.starts_with("https://") {
        app_logger::log_error(
            app,
            "updater.download.invalid_url",
            format!("url={}", download_url),
        );
        return Err(to_user_error("更新包下载地址不是安全的 HTTPS 地址。"));
    }

    let safe_file_name = Path::new(file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .ok_or_else(|| to_user_error("更新包文件名无效。"))?;

    if !safe_file_name.to_lowercase().ends_with(".exe") {
        return Err(to_user_error("更新包格式无效。"));
    }

    let temp_dir = std::env::temp_dir().join("packflow-updater");
    fs::create_dir_all(&temp_dir).map_err(|error| {
        app_logger::log_error(
            app,
            "updater.download.temp_dir_failed",
            format!("error={}", error),
        );
        to_user_error(format!("无法创建临时目录：{}", error))
    })?;

    let installer_path = temp_dir.join(safe_file_name);
    if installer_path.exists() {
        fs::remove_file(&installer_path).map_err(|error| {
            app_logger::log_error(
                app,
                "updater.download.remove_old_failed",
                format!("path={}, error={}", installer_path.display(), error),
            );
            to_user_error(format!("无法清理旧安装文件：{}", error))
        })?;
    }

    let client = Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|error| to_user_error(format!("无法创建更新下载客户端：{}", error)))?;

    let mut response = client
        .get(download_url)
        .header(USER_AGENT, UPDATE_USER_AGENT)
        .header(
            ACCEPT,
            "application/octet-stream, application/x-msdownload, */*",
        )
        .send()
        .map_err(|error| {
            app_logger::log_error(
                app,
                "updater.download.request_failed",
                format!("url={}, error={}", download_url, error),
            );
            to_user_error(format!("更新包下载请求失败：{}", error))
        })?;

    let status = response.status();
    if !status.is_success() {
        app_logger::log_error(
            app,
            "updater.download.bad_status",
            format!("url={}, status={}", download_url, status),
        );
        return Err(to_user_error(format!("更新包下载失败：HTTP {}", status)));
    }

    let total = response.content_length();
    let _ = window.emit(
        UPDATE_DOWNLOAD_EVENT,
        UpdateDownloadStartedEvent {
            event: "Started",
            data: UpdateDownloadStartedData {
                content_length: total,
            },
        },
    );

    let mut file = fs::File::create(&installer_path).map_err(|error| {
        app_logger::log_error(
            app,
            "updater.download.file_create_failed",
            format!("path={}, error={}", installer_path.display(), error),
        );
        to_user_error(format!("无法创建安装文件：{}", error))
    })?;

    let mut downloaded = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = response.read(&mut buffer).map_err(|error| {
            app_logger::log_error(
                app,
                "updater.download.read_failed",
                format!("path={}, error={}", installer_path.display(), error),
            );
            to_user_error(format!("更新包下载中断：{}", error))
        })?;

        if read == 0 {
            break;
        }

        file.write_all(&buffer[..read]).map_err(|error| {
            app_logger::log_error(
                app,
                "updater.download.file_write_failed",
                format!("path={}, error={}", installer_path.display(), error),
            );
            to_user_error(format!("无法写入安装文件：{}", error))
        })?;

        downloaded += read as u64;
        let _ = window.emit(
            UPDATE_DOWNLOAD_EVENT,
            UpdateDownloadProgressEvent {
                event: "Progress",
                data: UpdateDownloadProgressData {
                    chunk_length: read as u64,
                },
            },
        );
    }

    file.flush().map_err(|error| {
        app_logger::log_error(
            app,
            "updater.download.file_flush_failed",
            format!("path={}, error={}", installer_path.display(), error),
        );
        to_user_error(format!("无法保存安装文件：{}", error))
    })?;
    drop(file);

    if let Some(total) = total {
        if downloaded != total {
            app_logger::log_error(
                app,
                "updater.download.incomplete",
                format!(
                    "path={}, downloaded={}, total={}",
                    installer_path.display(),
                    downloaded,
                    total
                ),
            );
            return Err(to_user_error("更新包下载中断或内容不完整。"));
        }
    }

    let _ = window.emit(
        UPDATE_DOWNLOAD_EVENT,
        UpdateDownloadFinishedEvent { event: "Finished" },
    );

    app_logger::log_info(
        app,
        "updater.download.success",
        format!("path={}, size={}", installer_path.display(), downloaded),
    );

    execute_app_installer(app, &installer_path, safe_file_name)
}

fn execute_app_installer(app: &AppHandle, installer_path: &Path, file_name: &str) -> AppResult<()> {
    app_logger::log_info(
        app,
        "updater.install.saved",
        format!("path={}", installer_path.display()),
    );

    let is_nsis = file_name.to_lowercase().contains("setup") || file_name.ends_with(".exe");
    let args = if is_nsis { vec!["/S"] } else { vec![] };

    app_logger::log_info(
        app,
        "updater.install.executing",
        format!("path={}, args={:?}", installer_path.display(), args),
    );

    let status = Command::new(installer_path)
        .args(&args)
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|error| {
            app_logger::log_error(
                app,
                "updater.install.exec_failed",
                format!("path={}, error={}", installer_path.display(), error),
            );
            to_user_error(format!("无法执行安装程序：{}", error))
        })?;

    if !status.success() {
        app_logger::log_error(
            app,
            "updater.install.failed",
            format!(
                "path={}, exit_code={}",
                installer_path.display(),
                status.code().unwrap_or(-1)
            ),
        );
        return Err(to_user_error(format!(
            "安装程序退出码异常：{}",
            status.code().unwrap_or(-1)
        )));
    }

    app_logger::log_info(
        app,
        "updater.install.success",
        format!("path={}", installer_path.display()),
    );

    Ok(())
}

#[tauri::command]
pub async fn install_app_update(
    app: AppHandle,
    installer_bytes: Vec<u8>,
    file_name: String,
) -> AppResult<()> {
    app_logger::log_info(
        &app,
        "updater.install.start",
        format!("file_name={}, size={}", file_name, installer_bytes.len()),
    );

    let temp_dir = std::env::temp_dir().join("packflow-updater");
    fs::create_dir_all(&temp_dir).map_err(|error| {
        app_logger::log_error(
            &app,
            "updater.install.temp_dir_failed",
            format!("error={}", error),
        );
        to_user_error(format!("无法创建临时目录：{}", error))
    })?;

    let installer_path = temp_dir.join(&file_name);
    let mut file = fs::File::create(&installer_path).map_err(|error| {
        app_logger::log_error(
            &app,
            "updater.install.file_create_failed",
            format!("path={}, error={}", installer_path.display(), error),
        );
        to_user_error(format!("无法创建安装文件：{}", error))
    })?;

    file.write_all(&installer_bytes).map_err(|error| {
        app_logger::log_error(
            &app,
            "updater.install.file_write_failed",
            format!("path={}, error={}", installer_path.display(), error),
        );
        to_user_error(format!("无法写入安装文件：{}", error))
    })?;

    drop(file);

    execute_app_installer(&app, &installer_path, &file_name)
}
