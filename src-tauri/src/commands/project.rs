use crate::error::AppResult;
use crate::models::project::MavenProject;
use crate::services::pom_parser;

#[tauri::command]
pub fn parse_maven_project(root_path: String) -> AppResult<MavenProject> {
    pom_parser::parse_maven_project(&root_path)
}
