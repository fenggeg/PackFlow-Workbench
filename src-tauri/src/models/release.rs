use serde::{Deserialize, Serialize};

use super::build::{BuildOptions, BuildArtifact};
use super::deployment::StartupProbeConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseLogConfig {
    #[serde(default)]
    pub log_path: String,
    #[serde(default = "default_tail_lines")]
    pub tail_lines: u32,
    #[serde(default)]
    pub keyword: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseTemplate {
    pub id: String,
    pub name: String,
    pub project_path: String,
    pub module_id: String,
    pub module_name: String,
    pub build_options: BuildOptions,
    #[serde(default)]
    pub environment_profile_id: Option<String>,
    #[serde(default)]
    pub prefer_maven_wrapper: bool,
    #[serde(default = "default_artifact_pattern")]
    pub artifact_pattern: String,
    #[serde(default = "default_target_binding_mode")]
    pub target_binding_mode: String,
    #[serde(default)]
    pub target_server_id: String,
    pub remote_deploy_dir: String,
    #[serde(default)]
    pub stop_command: String,
    #[serde(default)]
    pub start_command: String,
    #[serde(default)]
    pub health_check: Option<StartupProbeConfig>,
    #[serde(default)]
    pub log_config: Option<ReleaseLogConfig>,
    #[serde(default)]
    pub deployment_profile_id: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseStageRecord {
    pub key: String,
    pub label: String,
    pub status: String,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub duration_ms: Option<u128>,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseRecord {
    pub id: String,
    pub project_name: String,
    pub project_path: String,
    pub module_name: String,
    pub git_branch: Option<String>,
    pub git_commit: Option<String>,
    pub build_history_id: Option<String>,
    pub artifact_path: Option<String>,
    pub deployment_task_id: Option<String>,
    pub target_server_id: String,
    pub status: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_ms: Option<u128>,
    pub failed_stage: Option<String>,
    pub failure_summary: Option<String>,
    #[serde(default)]
    pub template_id: Option<String>,
    #[serde(default)]
    pub stages: Vec<ReleaseStageRecord>,
    #[serde(default)]
    pub logs: Vec<String>,
    #[serde(default)]
    pub artifacts: Vec<BuildArtifact>,
}

fn default_artifact_pattern() -> String {
    "*.jar".to_string()
}

fn default_target_binding_mode() -> String {
    "fixed".to_string()
}

fn default_tail_lines() -> u32 {
    500
}
