use crate::error::{to_user_error, AppResult};
use crate::services::{app_logger, blocking};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

/// 单次返回的条目上限：超大 jar（几万条目）只取前 N 条，避免一次把 UI 拖慢
const MAX_ENTRIES: usize = 5000;
const MANIFEST_PATH: &str = "META-INF/MANIFEST.MF";
/// 单个条目最多读取的字节数：只是预览，不必把几十兆的资源读进内存
const MAX_ENTRY_BYTES: u64 = 1024 * 1024;

/// 可直接按文本预览的扩展名（jar 内常见的配置、脚本与静态资源）
const TEXT_EXTENSIONS: &[&str] = &[
    "properties", "xml", "yml", "yaml", "json", "txt", "mf", "sql", "html", "htm", "css", "js",
    "ts", "tsx", "jsx", "sh", "cmd", "bat", "conf", "cfg", "ini", "md", "dtd", "xsd", "tld",
    "jsp", "ftl", "vm", "gradle", "pom", "csv", "log", "list", "policy", "kotlin_module",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JarEntryInfo {
    pub name: String,
    pub size_bytes: u64,
    pub compressed_bytes: u64,
    pub is_directory: bool,
    /// 是否可以用文本方式预览（二进制类文件为 false）
    pub is_text: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JarInspection {
    pub path: String,
    pub file_name: String,
    pub file_size_bytes: u64,
    pub entry_count: usize,
    pub file_count: usize,
    pub entries: Vec<JarEntryInfo>,
    pub manifest: Option<String>,
    /// 条目数超过上限时为 true，表示只返回了部分内容
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JarEntryContent {
    pub name: String,
    pub size_bytes: u64,
    pub is_text: bool,
    /// 超过单次读取上限时为 true，内容只包含前一段
    pub truncated: bool,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JarEntryUpdate {
    pub name: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JarUpdateResult {
    /// 本次写入的条目名（按归档内出现顺序）
    pub updated_names: Vec<String>,
    /// 修改前的自动备份路径
    pub backup_path: String,
    /// 因内容变更而移除的签名文件（保留会导致 Java 拒绝加载）
    pub removed_signatures: Vec<String>,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JarBackupInfo {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub modified_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JarRestoreResult {
    /// 恢复前对当前归档新做的备份路径
    pub backup_path: String,
    pub size_bytes: u64,
}

/// jarsigner 生成的签名文件：条目内容一变，签名必然不匹配
fn is_signature_file(name: &str) -> bool {
    let upper = name.to_ascii_uppercase();
    let file = match upper.strip_prefix("META-INF/") {
        Some(file) => file,
        None => return false,
    };
    // 签名文件位于 META-INF 顶层，子目录里的同名文件不算
    if file.contains('/') {
        return false;
    }
    file.ends_with(".SF")
        || file.ends_with(".RSA")
        || file.ends_with(".DSA")
        || file.ends_with(".EC")
        || file.starts_with("SIG-")
}

fn ensure_archive_path(raw: &str) -> AppResult<PathBuf> {
    let path = PathBuf::from(raw.trim());
    if !path.is_file() {
        return Err(to_user_error(format!("文件不存在：{}", raw)));
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "jar" | "war" | "ear" | "zip") {
        return Err(to_user_error(format!(
            "仅支持查看 jar / war / ear / zip 归档：{}",
            raw
        )));
    }
    Ok(path)
}

/// 判断条目能否按文本预览：先看扩展名，再用 NUL 字节兜底排除二进制
fn is_text_entry(name: &str, head: &[u8]) -> bool {
    let lower = name.to_ascii_lowercase();
    let file_name = lower.rsplit('/').next().unwrap_or(lower.as_str());
    if matches!(file_name, "license" | "notice" | "manifest.mf") {
        return true;
    }
    let extension = match file_name.rsplit_once('.') {
        Some((stem, extension)) if !stem.is_empty() => extension,
        _ => return false,
    };
    if !TEXT_EXTENSIONS.contains(&extension) {
        return false;
    }
    // 文本文件不应包含 NUL 字节
    !head.contains(&0)
}

/// 读取归档条目与 MANIFEST。只读中央目录，不解压普通条目内容，开销很小。
fn read_archive(path: &Path) -> AppResult<(Vec<JarEntryInfo>, Option<String>, bool)> {
    let file = File::open(path)
        .map_err(|error| to_user_error(format!("无法打开归档文件：{}", error)))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|error| to_user_error(format!("无法解析归档文件：{}", error)))?;

    let total = archive.len();
    let mut entries: Vec<JarEntryInfo> = Vec::with_capacity(total.min(MAX_ENTRIES));
    let mut manifest: Option<String> = None;
    let mut truncated = false;

    for index in 0..total {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| to_user_error(format!("无法读取归档条目：{}", error)))?;
        let name = entry.name().to_string();
        let is_directory = entry.is_dir();
        let size_bytes = entry.size();
        let compressed_bytes = entry.compressed_size();
        let is_manifest = !is_directory && name.eq_ignore_ascii_case(MANIFEST_PATH);
        let keep_entry = entries.len() < MAX_ENTRIES;

        // 统一先读前 512 字节：既用于文本判定，也是 MANIFEST 的开头部分。
        // 只在需要该条目的信息时才读，避免超大归档做无谓解压。
        let mut head: Vec<u8> = Vec::new();
        if !is_directory && (keep_entry || is_manifest) {
            let mut buffer = vec![0u8; 512];
            let read = entry.read(&mut buffer).unwrap_or(0);
            buffer.truncate(read);
            head = buffer;
        }

        if manifest.is_none() && is_manifest {
            let mut content = String::from_utf8_lossy(&head).to_string();
            let mut rest = String::new();
            // 读取失败不影响条目列表，仅缺少 MANIFEST 展示
            if entry.read_to_string(&mut rest).is_ok() {
                content.push_str(&rest);
            }
            manifest = Some(content);
        }

        if keep_entry {
            entries.push(JarEntryInfo {
                name,
                size_bytes,
                compressed_bytes,
                is_directory,
                is_text: !is_directory && is_text_entry(&entry.name(), &head),
            });
        } else {
            truncated = true;
        }
    }

    Ok((entries, manifest, truncated))
}

#[tauri::command]
pub async fn inspect_jar(app: AppHandle, path: String) -> AppResult<JarInspection> {
    app_logger::log_info(&app, "jar.inspect.start", format!("path={}", path));
    let task_path = path.clone();
    let result = blocking::run(move || {
        let target = ensure_archive_path(&task_path)?;
        let file_size_bytes = std::fs::metadata(&target).map(|meta| meta.len()).unwrap_or(0);
        let (entries, manifest, truncated) = read_archive(&target)?;
        let file_count = entries.iter().filter(|entry| !entry.is_directory).count();
        let file_name = target
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        Ok(JarInspection {
            path: target.to_string_lossy().to_string(),
            file_name,
            file_size_bytes,
            entry_count: entries.len(),
            file_count,
            entries,
            manifest,
            truncated,
        })
    })
    .await;

    match &result {
        Ok(inspection) => app_logger::log_info(
            &app,
            "jar.inspect.done",
            format!(
                "path={}, entries={}, truncated={}",
                path, inspection.entry_count, inspection.truncated
            ),
        ),
        Err(error) => app_logger::log_error(&app, "jar.inspect.failed", format!("error={}", error)),
    }
    result
}

/// 读取归档中单个条目的内容：文本类文件直接返回原文，二进制只回传元信息。
#[tauri::command]
pub async fn read_jar_entry(
    app: AppHandle,
    path: String,
    entry_name: String,
) -> AppResult<JarEntryContent> {
    app_logger::log_info(
        &app,
        "jar.entry.start",
        format!("path={}, entry={}", path, entry_name),
    );
    let task_path = path.clone();
    let task_entry = entry_name.clone();
    let result = blocking::run(move || {
        let target = ensure_archive_path(&task_path)?;
        let file = File::open(&target)
            .map_err(|error| to_user_error(format!("无法打开归档文件：{}", error)))?;
        let mut archive = ZipArchive::new(file)
            .map_err(|error| to_user_error(format!("无法解析归档文件：{}", error)))?;
        let mut entry = archive
            .by_name(&task_entry)
            .map_err(|_| to_user_error(format!("归档中不存在条目：{}", task_entry)))?;
        if entry.is_dir() {
            return Err(to_user_error("目录条目没有内容可查看。".to_string()));
        }

        let size_bytes = entry.size();
        let mut buffer = Vec::new();
        entry
            .by_ref()
            .take(MAX_ENTRY_BYTES)
            .read_to_end(&mut buffer)
            .map_err(|error| to_user_error(format!("无法读取条目内容：{}", error)))?;

        let is_text = is_text_entry(&task_entry, &buffer);
        Ok(JarEntryContent {
            name: task_entry,
            size_bytes,
            is_text,
            truncated: size_bytes > MAX_ENTRY_BYTES,
            content: if is_text {
                String::from_utf8_lossy(&buffer).to_string()
            } else {
                String::new()
            },
        })
    })
    .await;

    match &result {
        Ok(content) => app_logger::log_info(
            &app,
            "jar.entry.done",
            format!(
                "entry={}, size={}, is_text={}, truncated={}",
                content.name, content.size_bytes, content.is_text, content.truncated
            ),
        ),
        Err(error) => app_logger::log_error(&app, "jar.entry.failed", format!("error={}", error)),
    }
    result
}

/// 重组归档并替换若干条目的内容。
/// 流程：校验条目 → 扫描签名 → 备份原文件 → 写临时归档 → 原子替换。
/// 签名文件（META-INF/*.SF 等）必须一并移除：内容已变，保留它们会让 Java 直接拒绝加载。
/// 多个条目在同一次重建中完成，避免逐个保存时反复重建整个归档。
fn rewrite_entries(
    path: &Path,
    updates: &[(String, Vec<u8>)],
) -> AppResult<(Vec<String>, String, Vec<String>, u64)> {
    if updates.is_empty() {
        return Err(to_user_error("没有需要写入的条目。".to_string()));
    }

    let source = File::open(path)
        .map_err(|error| to_user_error(format!("无法打开归档文件：{}", error)))?;
    let mut archive = ZipArchive::new(source)
        .map_err(|error| to_user_error(format!("无法解析归档文件：{}", error)))?;

    for (name, _) in updates {
        let entry = archive
            .by_name(name)
            .map_err(|_| to_user_error(format!("归档中不存在条目：{}", name)))?;
        if entry.is_dir() {
            return Err(to_user_error(format!("目录条目不支持修改：{}", name)));
        }
    }

    let mut signatures: Vec<String> = Vec::new();
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| to_user_error(format!("无法读取归档条目：{}", error)))?;
        let name = entry.name().to_string();
        if is_signature_file(&name) {
            signatures.push(name);
        }
    }

    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("archive");
    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let backup_path = path.with_file_name(format!("{}.bak-{}", file_name, timestamp));
    std::fs::copy(path, &backup_path)
        .map_err(|error| to_user_error(format!("无法创建备份文件：{}", error)))?;

    // 临时文件与目标同目录，保证可以原子替换
    let temp_path = path.with_file_name(format!(".{}.updating", file_name));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let updates: HashMap<&str, &[u8]> = updates
        .iter()
        .map(|(name, content)| (name.as_str(), content.as_slice()))
        .collect();

    let rewritten = (|| -> AppResult<(Vec<String>, u64)> {
        let target = File::create(&temp_path)
            .map_err(|error| to_user_error(format!("无法创建临时归档：{}", error)))?;
        let mut writer = ZipWriter::new(target);
        let mut written: Vec<String> = Vec::with_capacity(updates.len());
        let mut pending: HashSet<&str> = updates.keys().copied().collect();

        for index in 0..archive.len() {
            // 以 raw 模式读取：未修改的条目直接搬运原始压缩数据，
            // 跳过「解压 → 重新压缩」。这是大归档保存慢的根因 ——
            // 之前把所有 class 都解压重压了一遍，几十兆的包就要等很久。
            let entry = archive
                .by_index_raw(index)
                .map_err(|error| to_user_error(format!("无法读取归档条目：{}", error)))?;
            let name = entry.name().to_string();

            if is_signature_file(&name) {
                continue;
            }

            if let Some(content) = updates.get(name.as_str()) {
                pending.remove(name.as_str());
                written.push(name.clone());
                writer
                    .start_file(name.clone(), options)
                    .map_err(|error| to_user_error(format!("无法写入条目 {}：{}", name, error)))?;
                writer
                    .write_all(content)
                    .map_err(|error| to_user_error(format!("无法写入新内容：{}", error)))?;
                continue;
            }

            // raw_copy_file 会连压缩方式与目录属性一起原样搬运
            writer
                .raw_copy_file(entry)
                .map_err(|error| to_user_error(format!("无法复制条目 {}：{}", name, error)))?;
        }

        if let Some(missing) = pending.iter().next() {
            return Err(to_user_error(format!("归档中不存在条目：{}", missing)));
        }

        writer
            .finish()
            .map_err(|error| to_user_error(format!("无法完成归档写入：{}", error)))?;
        let size_bytes = std::fs::metadata(&temp_path).map(|meta| meta.len()).unwrap_or(0);
        Ok((written, size_bytes))
    })();

    let (written, size_bytes) = match rewritten {
        Ok(value) => value,
        Err(error) => {
            let _ = std::fs::remove_file(&temp_path);
            return Err(error);
        }
    };

    if let Err(error) = std::fs::rename(&temp_path, path) {
        let _ = std::fs::remove_file(&temp_path);
        // 替换失败时用备份还原，避免留下半截文件
        let _ = std::fs::copy(&backup_path, path);
        return Err(to_user_error(format!("无法替换归档文件：{}", error)));
    }

    Ok((
        written,
        backup_path.to_string_lossy().to_string(),
        signatures,
        size_bytes,
    ))
}

#[tauri::command]
pub async fn update_jar_entries(
    app: AppHandle,
    path: String,
    updates: Vec<JarEntryUpdate>,
) -> AppResult<JarUpdateResult> {
    let names = updates
        .iter()
        .map(|update| update.name.clone())
        .collect::<Vec<_>>()
        .join(",");
    app_logger::log_info(
        &app,
        "jar.update.start",
        format!("path={}, entries={}", path, names),
    );
    let task_path = path.clone();
    let result = blocking::run(move || {
        let target = ensure_archive_path(&task_path)?;
        // 同名条目只保留最后一次内容，避免归档里出现二义性
        let mut merged: HashMap<String, Vec<u8>> = HashMap::new();
        for update in updates {
            merged.insert(update.name, update.content.into_bytes());
        }
        let merged: Vec<(String, Vec<u8>)> = merged.into_iter().collect();
        let (updated_names, backup_path, removed_signatures, size_bytes) =
            rewrite_entries(&target, &merged)?;
        Ok(JarUpdateResult {
            updated_names,
            backup_path,
            removed_signatures,
            size_bytes,
        })
    })
    .await;

    match &result {
        Ok(update) => app_logger::log_info(
            &app,
            "jar.update.done",
            format!(
                "entries={}, backup={}, removed_signatures={}, size={}",
                update.updated_names.join(","),
                update.backup_path,
                update.removed_signatures.len(),
                update.size_bytes
            ),
        ),
        Err(error) => app_logger::log_error(&app, "jar.update.failed", format!("error={}", error)),
    }
    result
}

/// 校验备份路径：必须是目标归档的同目录兄弟文件，且文件名以 `<归档名>.bak-` 开头，
/// 防止借备份管理之名操作任意文件。
fn ensure_backup_path(archive_raw: &str, backup_raw: &str) -> AppResult<(PathBuf, PathBuf)> {
    let archive = ensure_archive_path(archive_raw)?;
    let file_name = archive
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let prefix = format!("{}.bak-", file_name);

    let backup = PathBuf::from(backup_raw.trim());
    if !backup.is_file() {
        return Err(to_user_error(format!("备份文件不存在：{}", backup_raw)));
    }
    if backup.parent() != archive.parent() {
        return Err(to_user_error("备份文件必须与归档位于同一目录。".to_string()));
    }
    let backup_name = backup
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if !backup_name.starts_with(&prefix) {
        return Err(to_user_error(format!(
            "该文件不是 {} 的备份：{}",
            file_name, backup_raw
        )));
    }
    Ok((archive, backup))
}

/// 列出归档同目录下的全部自动备份（`<归档名>.bak-*`），按时间倒序。
#[tauri::command]
pub async fn list_jar_backups(app: AppHandle, path: String) -> AppResult<Vec<JarBackupInfo>> {
    let _ = &app;
    let task_path = path.clone();
    blocking::run(move || {
        let target = ensure_archive_path(&task_path)?;
        let file_name = target
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        let prefix = format!("{}.bak-", file_name);
        let parent = target
            .parent()
            .ok_or_else(|| to_user_error("无法定位归档所在目录。".to_string()))?;

        let mut backups: Vec<JarBackupInfo> = Vec::new();
        let dir = std::fs::read_dir(parent)
            .map_err(|error| to_user_error(format!("无法读取归档目录：{}", error)))?;
        for item in dir.flatten() {
            let name = item.file_name().to_string_lossy().to_string();
            if !name.starts_with(&prefix) {
                continue;
            }
            let meta = match item.metadata() {
                Ok(meta) => meta,
                Err(_) => continue,
            };
            let modified_at = meta
                .modified()
                .ok()
                .map(|time| {
                    chrono::DateTime::<chrono::Local>::from(time)
                        .format("%Y-%m-%d %H:%M:%S")
                        .to_string()
                })
                .unwrap_or_default();
            backups.push(JarBackupInfo {
                path: item.path().to_string_lossy().to_string(),
                file_name: name,
                size_bytes: meta.len(),
                modified_at,
            });
        }
        // 文件名带时间戳，但 mtime 更能反映真实写入时间；两者都缺失时按名称兜底
        backups.sort_by(|a, b| {
            b.modified_at
                .partial_cmp(&a.modified_at)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.file_name.cmp(&a.file_name))
        });
        Ok(backups)
    })
    .await
}

/// 删除选中的备份文件（逐个校验与归档的同目录兄弟关系）。
#[tauri::command]
pub async fn delete_jar_backups(
    app: AppHandle,
    path: String,
    backup_paths: Vec<String>,
) -> AppResult<usize> {
    app_logger::log_info(
        &app,
        "jar.backup.delete",
        format!("path={}, count={}", path, backup_paths.len()),
    );
    let task_path = path.clone();
    blocking::run(move || {
        if backup_paths.is_empty() {
            return Err(to_user_error("没有选择要删除的备份。".to_string()));
        }
        let mut deleted = 0usize;
        for backup_raw in &backup_paths {
            let (_archive, backup) = ensure_backup_path(&task_path, backup_raw)?;
            std::fs::remove_file(&backup)
                .map_err(|error| to_user_error(format!("无法删除备份文件：{}", error)))?;
            deleted += 1;
        }
        Ok(deleted)
    })
    .await
}

/// 用备份恢复归档：先把当前文件另存为新备份，再原子替换，失败可再回退。
#[tauri::command]
pub async fn restore_jar_backup(
    app: AppHandle,
    path: String,
    backup_path: String,
) -> AppResult<JarRestoreResult> {
    app_logger::log_info(
        &app,
        "jar.backup.restore",
        format!("path={}, backup={}", path, backup_path),
    );
    let task_path = path.clone();
    let task_backup = backup_path.clone();
    let result = blocking::run(move || {
        let (archive, backup) = ensure_backup_path(&task_path, &task_backup)?;

        let file_name = archive
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("archive");
        let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
        let safety_path = archive.with_file_name(format!("{}.bak-{}", file_name, timestamp));
        std::fs::copy(&archive, &safety_path)
            .map_err(|error| to_user_error(format!("无法备份当前归档：{}", error)))?;

        let temp_path = archive.with_file_name(format!(".{}.restoring", file_name));
        let outcome = (|| -> AppResult<u64> {
            std::fs::copy(&backup, &temp_path)
                .map_err(|error| to_user_error(format!("无法读取备份内容：{}", error)))?;
            std::fs::rename(&temp_path, &archive)
                .map_err(|error| to_user_error(format!("无法替换归档文件：{}", error)))?;
            Ok(std::fs::metadata(&archive).map(|meta| meta.len()).unwrap_or(0))
        })();

        match outcome {
            Ok(size_bytes) => Ok(JarRestoreResult {
                backup_path: safety_path.to_string_lossy().to_string(),
                size_bytes,
            }),
            Err(error) => {
                let _ = std::fs::remove_file(&temp_path);
                // 替换失败时回退到恢复前的状态
                let _ = std::fs::copy(&safety_path, &archive);
                Err(error)
            }
        }
    })
    .await;

    match &result {
        Ok(restored) => app_logger::log_info(
            &app,
            "jar.backup.restore.done",
            format!(
                "backup={}, safety={}, size={}",
                backup_path, restored.backup_path, restored.size_bytes
            ),
        ),
        Err(error) => {
            app_logger::log_error(&app, "jar.backup.restore.failed", format!("error={}", error));
        }
    }
    result
}
