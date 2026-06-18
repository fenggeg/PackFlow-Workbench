use crate::error::AppResult;
use crate::models::environment::{BuildEnvironment, EnvironmentSettings, JdkEntry};
use crate::repositories::settings_repo;
use crate::services::{app_logger, blocking, env_detector, jdk_scanner, pom_parser};
use std::path::PathBuf;
use tauri::AppHandle;

#[tauri::command]
pub async fn detect_environment(app: AppHandle, root_path: String) -> AppResult<BuildEnvironment> {
    app_logger::log_info(
        &app,
        "environment.detect.start",
        format!("root_path={}", root_path),
    );
    let task_app = app.clone();
    let log_root_path = root_path.clone();
    let (settings, environment) = blocking::run(move || {
        let settings = settings_repo::load(&task_app)?;
        // 从 pom.xml 解析 JDK 需求
        let jdk_requirement = if !root_path.trim().is_empty() {
            let pom_path = PathBuf::from(&root_path).join("pom.xml");
            pom_parser::extract_jdk_requirement_from_file(&pom_path)
                .ok()
                .flatten()
        } else {
            None
        };
        let environment = env_detector::detect_environment(&root_path, settings.clone(), jdk_requirement);
        Ok((settings, environment))
    })
    .await?;
    app_logger::log_info(
        &app,
        "environment.detect.result",
        format!(
            "root_path={}, active_profile={}, profile_count={}, java_home={}, java_path={}, java_version={}, maven_home={}, maven_path={}, maven_version={}, settings_xml={}, local_repo={}, git_path={}, has_maven_wrapper={}, use_maven_wrapper={}, status={:?}, errors={}",
            log_root_path,
            settings.active_profile_id.as_deref().unwrap_or("<auto>"),
            settings.profiles.len(),
            environment.java_home.as_deref().unwrap_or("<empty>"),
            environment.java_path.as_deref().unwrap_or("<empty>"),
            environment.java_version.as_deref().unwrap_or("<empty>"),
            environment.maven_home.as_deref().unwrap_or("<empty>"),
            environment.maven_path.as_deref().unwrap_or("<empty>"),
            environment.maven_version.as_deref().unwrap_or("<empty>"),
            environment.settings_xml_path.as_deref().unwrap_or("<empty>"),
            environment.local_repo_path.as_deref().unwrap_or("<empty>"),
            environment.git_path.as_deref().unwrap_or("<empty>"),
            environment.has_maven_wrapper,
            environment.use_maven_wrapper,
            environment.status,
            if environment.errors.is_empty() {
                "<none>".to_string()
            } else {
                environment.errors.join(" | ")
            }
        ),
    );
    Ok(environment)
}

#[tauri::command]
pub async fn load_environment_settings(app: AppHandle) -> AppResult<EnvironmentSettings> {
    let task_app = app.clone();
    let settings = blocking::run(move || settings_repo::load(&task_app)).await;
    match &settings {
        Ok(settings) => app_logger::log_info(
            &app,
            "settings.load.success",
            format!(
                "active_profile={}, profile_count={}, last_project_path={}",
                settings.active_profile_id.as_deref().unwrap_or("<auto>"),
                settings.profiles.len(),
                settings.last_project_path.as_deref().unwrap_or("<empty>")
            ),
        ),
        Err(error) => {
            app_logger::log_error(&app, "settings.load.failed", format!("error={}", error));
        }
    }
    settings
}

#[tauri::command]
pub async fn save_environment_settings(
    app: AppHandle,
    settings: EnvironmentSettings,
) -> AppResult<()> {
    app_logger::log_info(
        &app,
        "settings.save.start",
        format!(
            "active_profile={}, profile_count={}, last_project_path={}",
            settings.active_profile_id.as_deref().unwrap_or("<auto>"),
            settings.profiles.len(),
            settings.last_project_path.as_deref().unwrap_or("<empty>")
        ),
    );
    let task_app = app.clone();
    let result = blocking::run(move || {
        let mut current = settings_repo::load(&task_app).unwrap_or_default();
        current.active_profile_id = settings.active_profile_id;
        current.profiles = settings.profiles;
        if settings.last_project_path.is_some() {
            current.last_project_path = settings.last_project_path.clone();
        }
        if !settings.project_paths.is_empty() {
            current.project_paths = normalize_project_paths(settings.project_paths);
        }
        // 保留项目绑定映射
        if !settings.project_profile_bindings.is_empty() {
            current.project_profile_bindings = settings.project_profile_bindings;
        }
        // 保留 JDK 注册表
        if !settings.jdk_registry.is_empty() {
            current.jdk_registry = settings.jdk_registry;
        }
        settings_repo::save(&task_app, current)
    })
    .await;
    if let Err(error) = &result {
        app_logger::log_error(&app, "settings.save.failed", format!("error={}", error));
    } else {
        app_logger::log_info(&app, "settings.save.success", "保存环境设置成功");
    }
    result
}

#[tauri::command]
pub async fn save_last_project_path(app: AppHandle, root_path: String) -> AppResult<()> {
    app_logger::log_info(
        &app,
        "settings.last_project.save.start",
        format!("root_path={}", root_path),
    );
    let task_app = app.clone();
    let result = blocking::run(move || {
        let mut current = settings_repo::load(&task_app).unwrap_or_default();
        current.last_project_path = Some(root_path.clone());
        upsert_project_path(&mut current.project_paths, root_path);
        settings_repo::save(&task_app, current)
    })
    .await;
    if let Err(error) = &result {
        app_logger::log_error(
            &app,
            "settings.last_project.save.failed",
            format!("error={}", error),
        );
    }
    result
}

#[tauri::command]
pub async fn remove_saved_project_path(
    app: AppHandle,
    root_path: String,
) -> AppResult<EnvironmentSettings> {
    app_logger::log_info(
        &app,
        "settings.project.remove.start",
        format!("root_path={}", root_path),
    );
    let task_app = app.clone();
    blocking::run(move || {
        let mut current = settings_repo::load(&task_app).unwrap_or_default();
        current.project_paths = current
            .project_paths
            .into_iter()
            .filter(|path| !same_path(path, &root_path))
            .collect();
        if current
            .last_project_path
            .as_deref()
            .is_some_and(|path| same_path(path, &root_path))
        {
            current.last_project_path = current.project_paths.first().cloned();
        }
        settings_repo::save(&task_app, current.clone())?;
        Ok(current)
    })
    .await
}

fn normalize_project_paths(paths: Vec<String>) -> Vec<String> {
    let mut result = Vec::new();
    for path in paths {
        upsert_project_path(&mut result, path);
    }
    result
}

fn upsert_project_path(paths: &mut Vec<String>, path: String) {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return;
    }
    paths.retain(|item| !same_path(item, trimmed));
    paths.insert(0, trimmed.to_string());
    paths.truncate(20);
}

fn same_path(left: &str, right: &str) -> bool {
    left.trim().eq_ignore_ascii_case(right.trim())
}

#[tauri::command]
pub async fn bind_project_profile(
    app: AppHandle,
    project_path: String,
    profile_id: String,
) -> AppResult<()> {
    app_logger::log_info(
        &app,
        "settings.project_profile.bind",
        format!("project_path={}, profile_id={}", project_path, profile_id),
    );
    let task_app = app.clone();
    let result = blocking::run(move || {
        let mut current = settings_repo::load(&task_app).unwrap_or_default();
        // 校验方案是否存在
        if !current.profiles.iter().any(|p| p.id == profile_id) {
            return Err(format!("环境方案 {} 不存在", profile_id));
        }
        current
            .project_profile_bindings
            .insert(project_path.trim().to_string(), profile_id);
        settings_repo::save(&task_app, current)
    })
    .await;
    if let Err(error) = &result {
        app_logger::log_error(&app, "settings.project_profile.bind.failed", format!("error={}", error));
    }
    result
}

#[tauri::command]
pub async fn unbind_project_profile(
    app: AppHandle,
    project_path: String,
) -> AppResult<()> {
    app_logger::log_info(
        &app,
        "settings.project_profile.unbind",
        format!("project_path={}", project_path),
    );
    let task_app = app.clone();
    let result = blocking::run(move || {
        let mut current = settings_repo::load(&task_app).unwrap_or_default();
        current
            .project_profile_bindings
            .remove(project_path.trim());
        settings_repo::save(&task_app, current)
    })
    .await;
    if let Err(error) = &result {
        app_logger::log_error(&app, "settings.project_profile.unbind.failed", format!("error={}", error));
    }
    result
}

#[tauri::command]
pub async fn scan_system_jdks(app: AppHandle) -> AppResult<Vec<JdkEntry>> {
    app_logger::log_info(&app, "jdk.scan.start", "开始扫描系统 JDK");
    let task_app = app.clone();
    let entries = blocking::run(move || {
        let scanned = jdk_scanner::scan_system_jdks();
        // 合并到现有注册表，保留手工添加的条目
        let mut current = settings_repo::load(&task_app).unwrap_or_default();
        let existing_manual: Vec<JdkEntry> = current
            .jdk_registry
            .iter()
            .filter(|e| matches!(e.source, crate::models::environment::JdkSource::Manual))
            .cloned()
            .collect();
        let mut merged = scanned;
        for entry in existing_manual {
            if !merged.iter().any(|e| e.path.eq_ignore_ascii_case(&entry.path)) {
                merged.push(entry);
            }
        }
        current.jdk_registry = merged.clone();
        let _ = settings_repo::save(&task_app, current);
        Ok(merged)
    })
    .await?;
    app_logger::log_info(
        &app,
        "jdk.scan.done",
        format!("found={} JDKs", entries.len()),
    );
    Ok(entries)
}

#[tauri::command]
pub async fn add_jdk_to_registry(
    app: AppHandle,
    path: String,
    name: Option<String>,
) -> AppResult<JdkEntry> {
    app_logger::log_info(
        &app,
        "jdk.add.start",
        format!("path={}", path),
    );
    let task_app = app.clone();
    let entry = blocking::run(move || {
        let jdk_home = PathBuf::from(&path);
        let java_exe = jdk_home.join("bin").join("java.exe");
        if !java_exe.exists() {
            return Err(format!("路径 {} 下未找到 bin/java.exe", path));
        }
        // 获取版本
        let version = crate::services::env_detector::run_version_public(
            &java_exe.to_string_lossy(),
            &["-version"],
        );
        let major_version = version
            .as_deref()
            .and_then(|v| pom_parser::parse_java_major(v.split('"').nth(1).unwrap_or(v)));
        let vendor = crate::services::jdk_scanner::detect_vendor_public(&jdk_home);
        let display_name = name.unwrap_or_else(|| {
            format!(
                "{} JDK {}",
                vendor.as_deref().unwrap_or("Custom"),
                major_version.map(|m| m.to_string()).unwrap_or_default()
            )
        });
        let entry = JdkEntry {
            id: uuid::Uuid::new_v4().to_string(),
            name: display_name,
            path: path.clone(),
            version,
            major_version,
            vendor,
            is_default: false,
            source: crate::models::environment::JdkSource::Manual,
        };
        let mut current = settings_repo::load(&task_app).unwrap_or_default();
        // 去重
        if current.jdk_registry.iter().any(|e| e.path.eq_ignore_ascii_case(&path)) {
            return Err(format!("路径 {} 已在 JDK 注册表中", path));
        }
        current.jdk_registry.push(entry.clone());
        settings_repo::save(&task_app, current)?;
        Ok(entry)
    })
    .await?;
    app_logger::log_info(
        &app,
        "jdk.add.done",
        format!("id={}, name={}", entry.id, entry.name),
    );
    Ok(entry)
}

#[tauri::command]
pub async fn remove_jdk_from_registry(app: AppHandle, jdk_id: String) -> AppResult<()> {
    app_logger::log_info(&app, "jdk.remove", format!("jdk_id={}", jdk_id));
    let task_app = app.clone();
    blocking::run(move || {
        let mut current = settings_repo::load(&task_app).unwrap_or_default();
        current.jdk_registry.retain(|e| e.id != jdk_id);
        settings_repo::save(&task_app, current)
    })
    .await
}

#[tauri::command]
pub async fn set_default_jdk(app: AppHandle, jdk_id: String) -> AppResult<()> {
    app_logger::log_info(&app, "jdk.set_default", format!("jdk_id={}", jdk_id));
    let task_app = app.clone();
    blocking::run(move || {
        let mut current = settings_repo::load(&task_app).unwrap_or_default();
        for entry in &mut current.jdk_registry {
            entry.is_default = entry.id == jdk_id;
        }
        settings_repo::save(&task_app, current)
    })
    .await
}
