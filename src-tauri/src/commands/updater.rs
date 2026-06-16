use crate::error::{to_user_error, AppResult};
use crate::services::{app_logger, blocking};
use crate::services::process_utils::CREATE_NO_WINDOW;
use chrono::Utc;
use reqwest::blocking::Client;
use reqwest::blocking::Response;
use reqwest::header::{ACCEPT, CONTENT_TYPE, USER_AGENT};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Window};

const UPDATE_CHECK_URL: &str = "https://node-red.gyfwork.cc.cd/api/latest";
const UPDATE_DOWNLOAD_EVENT: &str = "app-update-download-event";
const UPDATE_USER_AGENT: &str = "PackFlow-Workbench-Updater";

#[derive(Clone, Serialize)]
pub struct AppUpdateInfo {
    #[serde(rename = "currentVersion")]
    current_version: String,
    version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    body: Option<String>,
    #[serde(rename = "downloadUrl")]
    download_url: String,
    #[serde(rename = "apiDownloadUrl", skip_serializing_if = "Option::is_none")]
    api_download_url: Option<String>,
    #[serde(rename = "fileSize", skip_serializing_if = "Option::is_none")]
    file_size: Option<u64>,
    #[serde(rename = "fileName")]
    file_name: String,
    downloaded: bool,
}

#[derive(Deserialize)]
struct GitHubReleaseResponse {
    tag_name: String,
    body: Option<String>,
    published_at: Option<String>,
    assets: Option<Vec<GitHubReleaseAsset>>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

#[derive(Clone, Deserialize)]
struct GitHubReleaseAsset {
    name: String,
    url: Option<String>,
    browser_download_url: String,
    size: Option<u64>,
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

fn create_update_http_client() -> AppResult<Client> {
    Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .tcp_nodelay(true)
        .build()
        .map_err(|error| to_user_error(format!("无法创建更新网络客户端：{}", error)))
}

fn get_update_asset_score(asset: &GitHubReleaseAsset) -> i32 {
    let name = asset.name.to_lowercase();

    if !name.ends_with(".exe") || name.ends_with(".sig") {
        return 0;
    }

    if name == "packflow.workbench_x64-setup.exe" {
        return 100;
    }

    if name.contains("x64-setup") {
        return 90;
    }

    if name.ends_with("-setup.exe") {
        return 80;
    }

    10
}

fn parse_version(version: &str) -> Vec<u64> {
    version
        .trim_start_matches('v')
        .split('.')
        .map(|part| part.parse::<u64>().unwrap_or(0))
        .collect()
}

fn is_newer_version(current: &str, latest: &str) -> bool {
    let current_parts = parse_version(current);
    let latest_parts = parse_version(latest);
    let max_len = current_parts.len().max(latest_parts.len());

    for index in 0..max_len {
        let current_part = current_parts.get(index).copied().unwrap_or(0);
        let latest_part = latest_parts.get(index).copied().unwrap_or(0);

        if latest_part > current_part {
            return true;
        }
        if latest_part < current_part {
            return false;
        }
    }

    false
}

fn sanitize_update_file_name(file_name: &str) -> AppResult<String> {
    Path::new(file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| to_user_error("更新包文件名无效。"))
}

fn update_cache_dir() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("PackFlow Workbench")
        .join("updater")
}

fn cached_installer_path(file_name: &str) -> AppResult<PathBuf> {
    Ok(update_cache_dir().join(sanitize_update_file_name(file_name)?))
}

fn is_cached_installer_valid(path: &Path, expected_size: Option<u64>) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };

    metadata.is_file()
        && match expected_size {
            Some(size) => metadata.len() == size,
            None => true,
        }
}

#[tauri::command]
pub async fn check_for_app_update(
    app: AppHandle,
    current_version: String,
) -> AppResult<Option<AppUpdateInfo>> {
    blocking::run(move || check_for_app_update_sync(&app, current_version)).await
}

fn check_for_app_update_sync(
    app: &AppHandle,
    current_version: String,
) -> AppResult<Option<AppUpdateInfo>> {
    app_logger::log_info(app, "updater.check.start", "检查更新");

    let client = create_update_http_client()?;
    let mut url = Url::parse(UPDATE_CHECK_URL)
        .map_err(|error| to_user_error(format!("更新检查地址无效：{}", error)))?;
    url.query_pairs_mut()
        .append_pair("_t", &Utc::now().timestamp_millis().to_string());

    let response = client
        .get(url)
        .header(USER_AGENT, UPDATE_USER_AGENT)
        .header(ACCEPT, "application/json")
        .send()
        .map_err(|error| {
            app_logger::log_error(
                app,
                "updater.check.request_failed",
                format!("error={}", error),
            );
            to_user_error(format!("更新检查请求失败：{}", error))
        })?;

    let status = response.status();
    if !status.is_success() {
        app_logger::log_error(
            app,
            "updater.check.bad_status",
            format!("status={}", status),
        );
        return Err(to_user_error(format!("更新检查失败：HTTP {}", status)));
    }

    let release: GitHubReleaseResponse = response.json().map_err(|error| {
        app_logger::log_error(app, "updater.check.json_failed", format!("error={}", error));
        to_user_error(format!("更新信息格式异常：{}", error))
    })?;

    if release.draft || release.prerelease {
        return Ok(None);
    }

    let latest_version = release.tag_name.trim_start_matches('v').to_string();
    if !is_newer_version(&current_version, &latest_version) {
        return Ok(None);
    }

    let exe_asset = release
        .assets
        .unwrap_or_default()
        .into_iter()
        .filter(|asset| get_update_asset_score(asset) > 0)
        .max_by_key(get_update_asset_score)
        .ok_or_else(|| to_user_error("未找到安装包下载链接"))?;

    let downloaded = cached_installer_path(&exe_asset.name)
        .ok()
        .is_some_and(|path| is_cached_installer_valid(&path, exe_asset.size));

    app_logger::log_info(
        app,
        "updater.check.success",
        format!(
            "current={}, latest={}, file_name={}, downloaded={}",
            current_version, latest_version, exe_asset.name, downloaded
        ),
    );

    Ok(Some(AppUpdateInfo {
        current_version,
        version: latest_version,
        date: release.published_at,
        body: release.body,
        download_url: exe_asset.browser_download_url,
        api_download_url: exe_asset.url,
        file_size: exe_asset.size,
        file_name: exe_asset.name,
        downloaded,
    }))
}

#[tauri::command]
pub async fn download_app_update(
    app: AppHandle,
    window: Window,
    download_url: String,
    api_download_url: Option<String>,
    expected_size: Option<u64>,
    file_name: String,
) -> AppResult<()> {
    blocking::run(move || {
        download_app_update_sync(
            &app,
            &window,
            &download_url,
            api_download_url.as_deref(),
            expected_size,
            &file_name,
        )
    })
    .await
}

fn download_app_update_sync(
    app: &AppHandle,
    window: &Window,
    download_url: &str,
    api_download_url: Option<&str>,
    expected_size: Option<u64>,
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
    if let Some(url) = api_download_url {
        if !url.starts_with("https://") {
            app_logger::log_error(
                app,
                "updater.download.invalid_api_url",
                format!("url={}", url),
            );
            return Err(to_user_error("更新包 API 下载地址不是安全的 HTTPS 地址。"));
        }
    }

    let safe_file_name = sanitize_update_file_name(file_name)?;

    if !safe_file_name.to_lowercase().ends_with(".exe") {
        return Err(to_user_error("更新包格式无效。"));
    }

    let temp_dir = update_cache_dir();
    fs::create_dir_all(&temp_dir).map_err(|error| {
        app_logger::log_error(
            app,
            "updater.download.temp_dir_failed",
            format!("error={}", error),
        );
        to_user_error(format!("无法创建临时目录：{}", error))
    })?;

    let installer_path = temp_dir.join(&safe_file_name);
    if is_cached_installer_valid(&installer_path, expected_size) {
        send_download_started(window, expected_size);
        let _ = window.emit(
            UPDATE_DOWNLOAD_EVENT,
            UpdateDownloadFinishedEvent { event: "Finished" },
        );
        app_logger::log_info(
            app,
            "updater.download.cache_hit",
            format!("path={}", installer_path.display()),
        );
        return Ok(());
    }

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

    let client = create_update_http_client()?;

    let _ = window.emit(
        UPDATE_DOWNLOAD_EVENT,
        UpdateDownloadStartedEvent {
            event: "Started",
            data: UpdateDownloadStartedData {
                content_length: expected_size,
            },
        },
    );

    let mut candidates = Vec::new();
    candidates.push(("browser", download_url));
    if let Some(url) = api_download_url.filter(|url| !url.is_empty()) {
        candidates.push(("asset-api", url));
    }

    let mut last_error = None;
    for (source, url) in candidates {
        match download_update_installer(
            app,
            window,
            &client,
            url,
            source,
            &installer_path,
            expected_size,
        ) {
            Ok(downloaded) => {
                app_logger::log_info(
                    app,
                    "updater.download.success",
                    format!(
                        "source={}, path={}, size={}",
                        source,
                        installer_path.display(),
                        downloaded
                    ),
                );
                return Ok(());
            }
            Err(error) => {
                let _ = fs::remove_file(&installer_path);
                app_logger::log_error(
                    app,
                    "updater.download.candidate_failed",
                    format!("source={}, url={}, error={}", source, url, error),
                );
                last_error = Some(error);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| to_user_error("没有可用的更新包下载地址。")))
}

fn send_download_started(window: &Window, total: Option<u64>) {
    let _ = window.emit(
        UPDATE_DOWNLOAD_EVENT,
        UpdateDownloadStartedEvent {
            event: "Started",
            data: UpdateDownloadStartedData {
                content_length: total,
            },
        },
    );
}

fn download_update_installer(
    app: &AppHandle,
    window: &Window,
    client: &Client,
    url: &str,
    source: &str,
    installer_path: &Path,
    expected_size: Option<u64>,
) -> AppResult<u64> {
    app_logger::log_info(
        app,
        "updater.download.request",
        format!("source={}, url={}", source, url),
    );

    let mut response = client
        .get(url)
        .header(USER_AGENT, UPDATE_USER_AGENT)
        .header(
            ACCEPT,
            "application/octet-stream, application/x-msdownload, */*",
        )
        .send()
        .map_err(|error| to_user_error(format!("更新包下载请求失败：{}", error)))?;

    let status = response.status();
    if !status.is_success() {
        return Err(to_user_error(format!("更新包下载失败：HTTP {}", status)));
    }

    validate_update_response(&response)?;

    let total = response.content_length().or(expected_size);
    send_download_started(window, total);

    let mut file = fs::File::create(installer_path).map_err(|error| {
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

    if let Some(expected_size) = expected_size {
        if downloaded != expected_size {
            app_logger::log_error(
                app,
                "updater.download.size_mismatch",
                format!(
                    "path={}, downloaded={}, expected={}",
                    installer_path.display(),
                    downloaded,
                    expected_size
                ),
            );
            return Err(to_user_error("更新包大小与发布信息不一致。"));
        }
    }

    let _ = window.emit(
        UPDATE_DOWNLOAD_EVENT,
        UpdateDownloadFinishedEvent { event: "Finished" },
    );

    Ok(downloaded)
}

fn validate_update_response(response: &Response) -> AppResult<()> {
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if content_type.contains("application/json") || content_type.contains("text/html") {
        return Err(to_user_error(format!(
            "更新包下载入口返回了非安装包内容：{}",
            content_type
        )));
    }

    Ok(())
}

#[tauri::command]
pub async fn install_cached_app_update(
    app: AppHandle,
    file_name: String,
    expected_size: Option<u64>,
) -> AppResult<()> {
    let task_app = app.clone();
    blocking::run(move || install_cached_app_update_sync(&task_app, &file_name, expected_size))
        .await?;
    app.exit(0);
    Ok(())
}

fn install_cached_app_update_sync(
    app: &AppHandle,
    file_name: &str,
    expected_size: Option<u64>,
) -> AppResult<()> {
    let installer_path = cached_installer_path(file_name)?;
    if !is_cached_installer_valid(&installer_path, expected_size) {
        app_logger::log_error(
            app,
            "updater.install.cache_missing",
            format!("path={}", installer_path.display()),
        );
        return Err(to_user_error("安装包不存在或内容不完整，请重新下载。"));
    }

    let current_exe = std::env::current_exe()
        .map_err(|error| to_user_error(format!("无法定位当前应用程序：{}", error)))?;
    schedule_cached_update_install(app, &installer_path, file_name, &current_exe)?;
    Ok(())
}

fn schedule_cached_update_install(
    app: &AppHandle,
    installer_path: &Path,
    file_name: &str,
    exe_path: &Path,
) -> AppResult<()> {
    app_logger::log_info(
        app,
        "updater.install.schedule",
        format!(
            "installer={}, exe={}",
            installer_path.display(),
            exe_path.display()
        ),
    );

    let cache_dir = update_cache_dir();
    fs::create_dir_all(&cache_dir)
        .map_err(|error| to_user_error(format!("无法创建更新缓存目录：{}", error)))?;

    let pid = std::process::id();
    let script_path = cache_dir.join(format!("install-and-relaunch-{}.ps1", pid));
    let lower_file_name = file_name.to_lowercase();
    let is_nsis = lower_file_name.contains("setup") || lower_file_name.ends_with(".exe");
    let installer_args = if is_nsis { "@('/S')" } else { "@()" };
    let escaped_installer_path = installer_path.to_string_lossy().replace('\'', "''");
    let escaped_exe_path = exe_path.to_string_lossy().replace('\'', "''");
    let escaped_script_path = script_path.to_string_lossy().replace('\'', "''");
    let script = format!(
        "$ErrorActionPreference = 'SilentlyContinue'\r\n\
         Wait-Process -Id {}\r\n\
         Start-Sleep -Milliseconds 300\r\n\
         $installer = '{}'\r\n\
         $target = '{}'\r\n\
         $arguments = {}\r\n\
         $process = Start-Process -FilePath $installer -ArgumentList $arguments -Wait -PassThru\r\n\
         if ($null -ne $process -and ($null -eq $process.ExitCode -or $process.ExitCode -eq 0)) {{\r\n\
         Start-Process -FilePath $target\r\n\
         }}\r\n\
         Remove-Item -LiteralPath '{}' -Force\r\n",
        pid, escaped_installer_path, escaped_exe_path, installer_args, escaped_script_path
    );

    fs::write(&script_path, script).map_err(|error| {
        app_logger::log_error(
            app,
            "updater.install.relaunch_script_failed",
            format!("path={}, error={}", script_path.display(), error),
        );
        to_user_error(format!("无法创建重启脚本：{}", error))
    })?;

    Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-File",
        ])
        .arg(&script_path)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| {
            app_logger::log_error(
                app,
                "updater.install.schedule_failed",
                format!("path={}, error={}", script_path.display(), error),
            );
            to_user_error(format!("无法安排安装更新：{}", error))
        })?;

    Ok(())
}

fn execute_app_installer(app: &AppHandle, installer_path: &Path, file_name: &str) -> AppResult<()> {
    app_logger::log_info(
        app,
        "updater.install.saved",
        format!("path={}", installer_path.display()),
    );

    let lower_file_name = file_name.to_lowercase();
    let is_nsis = lower_file_name.contains("setup") || lower_file_name.ends_with(".exe");
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
