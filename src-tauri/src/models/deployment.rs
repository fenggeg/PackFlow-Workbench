use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String,
    pub private_key_path: Option<String>,
    pub group: Option<String>,
    pub password_configured: bool,
    #[serde(default)]
    pub privilege: ServerPrivilegeConfig,
    #[serde(default)]
    pub privilege_password_configured: bool,
    #[serde(default)]
    pub env_type: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub remark: Option<String>,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub last_connected_at: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerPrivilegeConfig {
    #[serde(default = "default_privilege_mode")]
    pub mode: String,
    #[serde(default = "default_privilege_run_as_user")]
    pub run_as_user: String,
    #[serde(default = "default_privilege_password_mode")]
    pub password_mode: String,
    #[serde(default = "default_privilege_upload_temp_dir")]
    pub upload_temp_dir: String,
    #[serde(default = "default_privilege_shell")]
    pub shell: String,
    #[serde(default)]
    pub custom_wrapper: Option<String>,
    #[serde(default = "default_true")]
    pub cleanup_on_success: bool,
    #[serde(default = "default_true")]
    pub keep_temp_on_failure: bool,
}

impl Default for ServerPrivilegeConfig {
    fn default() -> Self {
        Self {
            mode: default_privilege_mode(),
            run_as_user: default_privilege_run_as_user(),
            password_mode: default_privilege_password_mode(),
            upload_temp_dir: default_privilege_upload_temp_dir(),
            shell: default_privilege_shell(),
            custom_wrapper: None,
            cleanup_on_success: true,
            keep_temp_on_failure: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveServerProfilePayload {
    pub id: Option<String>,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub group: Option<String>,
    #[serde(default)]
    pub privilege: ServerPrivilegeConfig,
    #[serde(default)]
    pub privilege_password: Option<String>,
    #[serde(default)]
    pub env_type: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub remark: Option<String>,
    #[serde(default)]
    pub favorite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentProfile {
    pub id: String,
    pub name: String,
    pub local_artifact_pattern: String,
    #[serde(default)]
    pub remote_artifact_name: Option<String>,
    #[serde(default)]
    pub remote_deploy_path: String,
    #[serde(default)]
    pub working_dir: Option<String>,
    #[serde(default)]
    pub java_bin_path: Option<String>,
    #[serde(default)]
    pub jvm_options: Option<String>,
    #[serde(default)]
    pub spring_profile: Option<String>,
    #[serde(default)]
    pub extra_args: Option<String>,
    #[serde(default)]
    pub log_name: Option<String>,
    #[serde(default)]
    pub log_path: Option<String>,
    #[serde(default)]
    pub startup_probe: Option<StartupProbeConfig>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupProbeConfig {
    #[serde(default)]
    pub process_probe: Option<ProcessProbeConfig>,
    #[serde(default)]
    pub port_probe: Option<PortProbeConfig>,
    #[serde(default)]
    pub http_probe: Option<HttpProbeConfig>,
    #[serde(default)]
    pub log_probe: Option<LogProbeConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessProbeConfig {
    #[serde(default)]
    pub pid_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortProbeConfig {
    pub enabled: bool,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpProbeConfig {
    pub enabled: bool,
    pub url: String,
    #[serde(default)]
    pub expected_status: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogProbeConfig {
    pub enabled: bool,
    pub keyword: String,
    #[serde(default)]
    pub timeout_seconds: Option<u32>,
}

fn default_true() -> bool {
    true
}

fn default_privilege_mode() -> String {
    "none".to_string()
}

fn default_privilege_run_as_user() -> String {
    "root".to_string()
}

fn default_privilege_password_mode() -> String {
    "none".to_string()
}

fn default_privilege_upload_temp_dir() -> String {
    "${loginHome}/.packflow/deploy/${deploymentId}".to_string()
}

fn default_privilege_shell() -> String {
    "bash -lc".to_string()
}