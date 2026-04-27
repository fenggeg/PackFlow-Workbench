use crate::error::AppResult;
use crate::models::dependency::ModuleDependencyGraph;
use crate::models::module::MavenModule;
use crate::models::project::MavenProject;
use crate::services::{app_logger, blocking};
use crate::services::{dependency_graph_service, pom_parser};
use tauri::AppHandle;

#[tauri::command]
pub async fn parse_maven_project(app: AppHandle, root_path: String) -> AppResult<MavenProject> {
    app_logger::log_info(
        &app,
        "project.parse.start",
        format!("root_path={}", root_path),
    );
    let log_root_path = root_path.clone();
    match blocking::run(move || pom_parser::parse_maven_project(&root_path)).await {
        Ok(project) => {
            app_logger::log_info(
                &app,
                "project.parse.success",
                format!(
                    "root_path={}, artifact_id={}, module_count={}",
                    project.root_path,
                    project.artifact_id,
                    count_modules(&project.modules)
                ),
            );
            Ok(project)
        }
        Err(error) => {
            app_logger::log_error(
                &app,
                "project.parse.failed",
                format!("root_path={}, error={}", log_root_path, error),
            );
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn analyze_project_dependencies(
    app: AppHandle,
    root_path: String,
) -> AppResult<ModuleDependencyGraph> {
    app_logger::log_info(
        &app,
        "project.dependencies.start",
        format!("root_path={}", root_path),
    );
    let log_root_path = root_path.clone();
    let result =
        blocking::run(move || dependency_graph_service::analyze_project_dependencies(&root_path))
            .await;
    match &result {
        Ok(graph) => app_logger::log_info(
            &app,
            "project.dependencies.success",
            format!(
                "root_path={}, edge_count={}, cycle_count={}",
                graph.root_path,
                graph.edges.len(),
                graph.cycles.len()
            ),
        ),
        Err(error) => app_logger::log_error(
            &app,
            "project.dependencies.failed",
            format!("root_path={}, error={}", log_root_path, error),
        ),
    }
    result
}

fn count_modules(modules: &[MavenModule]) -> usize {
    modules
        .iter()
        .map(|module_item| 1 + count_modules(&module_item.children))
        .sum()
}
