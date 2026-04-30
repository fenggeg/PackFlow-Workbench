use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceRuntimeConfig {
    pub id: String,
    pub service_mapping_id: String,
    #[serde(default)]
    pub deployment_profile_id: Option<String>,
    pub environment_id: String,
    pub server_id: String,
    pub service_name: String,
    #[serde(default)]
    pub restart_command: Option<String>,
    #[serde(default)]
    pub stop_command: Option<String>,
    #[serde(default)]
    pub start_command: Option<String>,
    #[serde(default)]
    pub log_source: Option<ServiceLogConfig>,
    #[serde(default)]
    pub status_command: Option<String>,
    #[serde(default)]
    pub health_check_url: Option<String>,
    #[serde(default)]
    pub work_dir: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceLogConfig {
    #[serde(rename = "type")]
    pub source_type: String,
    #[serde(default)]
    pub log_path: Option<String>,
    #[serde(default)]
    pub systemd_unit: Option<String>,
    #[serde(default)]
    pub docker_container_name: Option<String>,
    #[serde(default)]
    pub custom_command: Option<String>,
    #[serde(default = "default_tail_lines")]
    pub tail_lines: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceOperationTask {
    pub id: String,
    pub service_runtime_config_id: String,
    #[serde(rename = "type")]
    pub task_type: String,
    pub status: String,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub finished_at: Option<String>,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub output_lines: Vec<String>,
    #[serde(default)]
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteLogSession {
    pub id: String,
    pub service_runtime_config_id: String,
    pub server_id: String,
    pub command: String,
    pub status: String,
    pub started_at: String,
    #[serde(default)]
    pub stopped_at: Option<String>,
    #[serde(default)]
    pub keyword: Option<String>,
    pub auto_scroll: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceOperationHistory {
    pub id: String,
    pub operation_type: String,
    pub service_name: String,
    pub environment_name: String,
    pub server_host: String,
    #[serde(default)]
    pub command: Option<String>,
    pub result: String,
    pub started_at: String,
    #[serde(default)]
    pub finished_at: Option<String>,
    #[serde(default)]
    pub operator: Option<String>,
    #[serde(default)]
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartServiceOperationPayload {
    pub service_runtime_config_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRemoteLogSessionPayload {
    pub service_runtime_config_id: String,
    #[serde(default)]
    pub keyword: Option<String>,
    #[serde(default)]
    pub tail_lines: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceOperationLogEvent {
    pub task_id: String,
    pub line: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteLogLineEvent {
    pub session_id: String,
    pub line: String,
}

fn default_tail_lines() -> u32 {
    300
}
