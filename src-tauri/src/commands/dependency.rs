use crate::error::AppResult;
use crate::models::dependency::{DependencyConflictResult, DependencyConflict};
use crate::services::{app_logger, blocking, dependency_conflict_service, pom_parser};
use tauri::AppHandle;

#[tauri::command]
pub async fn detect_dependency_conflicts(
    app: AppHandle,
    root_path: String,
) -> AppResult<DependencyConflictResult> {
    app_logger::log_info(
        &app,
        "dependency.conflicts.start",
        format!("root_path={}", root_path),
    );
    let log_root_path = root_path.clone();

    // 预先解析项目获取模块数（用于进度展示）
    let root_path_for_count = root_path.clone();
    let total_modules = blocking::run(move || {
        let project = pom_parser::parse_maven_project(&root_path_for_count)?;
        let count = count_modules(&project);
        Ok(count)
    })
    .await
    .unwrap_or(0);

    let app_for_scan = app.clone();
    let result = blocking::run(move || {
        dependency_conflict_service::detect_dependency_conflicts(
            &root_path,
            &app_for_scan,
            total_modules,
        )
    })
    .await;

    match &result {
        Ok(conflicts) => {
            let total = conflicts
                .modules
                .iter()
                .map(|m| m.conflicts.len())
                .sum::<usize>();
            app_logger::log_info(
                &app,
                "dependency.conflicts.finish",
                format!(
                    "root_path={}, modules_with_conflicts={}, total_conflicts={}",
                    log_root_path,
                    conflicts.modules.len(),
                    total
                ),
            );
        }
        Err(error) => {
            app_logger::log_error(
                &app,
                "dependency.conflicts.failed",
                format!("root_path={}, error={}", log_root_path, error),
            );
        }
    }
    result
}

fn count_modules(project: &crate::models::project::MavenProject) -> usize {
    fn walk(modules: &[crate::models::module::MavenModule]) -> usize {
        modules.iter().map(|m| 1 + walk(&m.children)).sum()
    }
    1 + walk(&project.modules) // +1 for root
}

#[tauri::command]
pub fn generate_exclusion_code(group_id: String, artifact_id: String) -> AppResult<String> {
    Ok(dependency_conflict_service::generate_exclusion_code(
        &group_id,
        &artifact_id,
    ))
}

#[tauri::command]
pub fn generate_bulk_exclusion_code(conflicts: Vec<DependencyConflict>) -> AppResult<String> {
    Ok(dependency_conflict_service::generate_bulk_exclusion_code(&conflicts))
}
