use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::environment::BuildEnvironment;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildOptions {
    pub project_root: String,
    pub selected_module_path: String,
    pub goals: Vec<String>,
    pub profiles: Vec<String>,
    pub properties: HashMap<String, serde_json::Value>,
    pub also_make: bool,
    pub skip_tests: bool,
    pub custom_args: Vec<String>,
    pub editable_command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildCommandPayload {
    pub options: BuildOptions,
    pub environment: BuildEnvironment,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartBuildPayload {
    pub project_root: String,
    pub command: String,
    pub module_path: String,
    pub module_artifact_id: Option<String>,
    pub java_home: Option<String>,
    pub maven_home: Option<String>,
    pub use_maven_wrapper: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildLogEvent {
    pub build_id: String,
    pub stream: String,
    pub line: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildFinishedEvent {
    pub build_id: String,
    pub status: String,
    pub duration_ms: u128,
}
