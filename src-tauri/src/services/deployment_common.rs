use crate::models::deployment::{BackupConfig, ServerPrivilegeConfig};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::collections::HashSet;
use crate::error::{to_user_error, AppResult};

pub const TYPE_SSH_COMMAND: &str = "ssh_command";
pub const TYPE_WAIT: &str = "wait";
pub const TYPE_PORT_CHECK: &str = "port_check";
pub const TYPE_HTTP_CHECK: &str = "http_check";
pub const TYPE_LOG_CHECK: &str = "log_check";
pub const TYPE_UPLOAD_FILE: &str = "upload_file";

pub const STRATEGY_STOP: &str = "stop";
pub const STRATEGY_CONTINUE: &str = "continue";
pub const STRATEGY_ROLLBACK: &str = "rollback";

#[derive(Clone, Default)]
pub struct DeploymentControlState {
    pub cancelled_task_ids: Arc<Mutex<HashSet<String>>>,
}

impl DeploymentControlState {
    pub fn request_cancel(&self, task_id: &str) -> AppResult<()> {
        self.cancelled_task_ids
            .lock()
            .map_err(|_| to_user_error("无法更新部署停止状态。"))?
            .insert(task_id.to_string());
        Ok(())
    }

    pub fn clear(&self, task_id: &str) {
        if let Ok(mut task_ids) = self.cancelled_task_ids.lock() {
            task_ids.remove(task_id);
        }
    }

    pub fn is_cancelled(&self, task_id: &str) -> bool {
        self.cancelled_task_ids
            .lock()
            .map(|task_ids| task_ids.contains(task_id))
            .unwrap_or(false)
    }
}

#[derive(Debug, Clone)]
pub struct DeploymentContext {
    pub deployment_id: String,
    pub artifact_path: String,
    pub artifact_size: u64,
    pub artifact_name: String,
    pub remote_artifact_name: String,
    pub remote_deploy_path: String,
    pub publish_type: String,
    pub frontend_remote_temp_dir: Option<String>,
    pub frontend_entry_file: Option<String>,
    pub frontend_reload_command: Option<String>,
    pub frontend_verify_url: Option<String>,
    pub frontend_verify_expected_status_codes: Vec<u16>,
    pub frontend_verify_expected_body_contains: Option<String>,
    pub frontend_release_dir: Option<String>,
    pub frontend_releases_dir: Option<String>,
    pub frontend_current_link_path: Option<String>,
    pub frontend_keep_releases: Option<u32>,
    pub frontend_backup_dir: Option<String>,
    pub remote_upload_dir: String,
    pub remote_upload_path: String,
    pub login_user: String,
    pub privilege: ServerPrivilegeConfig,
    pub privilege_password: Option<String>,
    pub _service_description: Option<String>,
    pub _service_alias: Option<String>,
    pub java_bin_path: Option<String>,
    pub jvm_options: Option<String>,
    pub spring_profile: Option<String>,
    pub extra_args: Option<String>,
    pub working_dir: Option<String>,
    pub log_path: Option<String>,
    pub log_naming_mode: String,
    pub log_name: Option<String>,
    pub log_encoding: String,
    pub enable_deploy_log: bool,
    pub port_probe_port: Option<u16>,
    pub backup_config: BackupConfig,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshCommandConfig {
    pub command: String,
    pub success_exit_codes: Option<Vec<i32>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaitConfig {
    pub wait_seconds: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortCheckConfig {
    pub host: String,
    pub port: u16,
    pub check_interval_seconds: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpCheckConfig {
    pub url: String,
    pub method: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub expected_status_codes: Option<Vec<u16>>,
    pub expected_body_contains: Option<String>,
    pub check_interval_seconds: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogCheckConfig {
    pub log_path: String,
    pub success_keywords: Vec<String>,
    pub failure_keywords: Option<Vec<String>>,
    pub check_interval_seconds: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadFileConfig {
    pub local_path: String,
    pub remote_path: String,
    pub overwrite: bool,
}
