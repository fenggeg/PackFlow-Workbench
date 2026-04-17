use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildHistoryRecord {
    pub id: String,
    pub created_at: String,
    pub project_root: String,
    pub module_path: String,
    pub module_artifact_id: Option<String>,
    pub command: String,
    pub status: String,
    pub duration_ms: u128,
    pub java_home: Option<String>,
    pub maven_home: Option<String>,
    pub use_maven_wrapper: bool,
}
