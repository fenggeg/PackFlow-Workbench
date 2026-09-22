use serde::{Deserialize, Serialize};

use super::build::{BuildArtifact, BuildOptions};

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
    #[serde(default)]
    pub build_options: Option<BuildOptions>,
    #[serde(default)]
    pub artifacts: Vec<BuildArtifact>,
    /// 构建日志文件路径，用于回看历史构建的完整输出
    #[serde(default)]
    pub log_path: Option<String>,
}
