use crate::models::environment::BuildEnvironment;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStep {
    pub id: String,
    #[serde(rename = "type")]
    pub step_type: String,
    pub label: String,
    pub enabled: bool,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPipeline {
    pub id: String,
    pub name: String,
    pub module_ids: Vec<String>,
    pub steps: Vec<TaskStep>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStepRun {
    pub step_id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub step_type: String,
    pub status: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub message: Option<String>,
    #[serde(default)]
    pub output: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPipelineRun {
    pub id: String,
    pub pipeline_id: String,
    pub pipeline_name: String,
    pub project_root: String,
    pub module_ids: Vec<String>,
    pub status: String,
    pub total_duration_ms: u64,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub steps: Vec<TaskStepRun>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartTaskPipelinePayload {
    pub pipeline: TaskPipeline,
    pub project_root: String,
    pub environment: BuildEnvironment,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPipelineLogEvent {
    pub run_id: String,
    pub step_id: Option<String>,
    pub level: String,
    pub line: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPipelineStepEvent {
    pub run_id: String,
    pub step: TaskStepRun,
}
