use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerGroup {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub sort: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoritePath {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub path: String,
    #[serde(default = "default_path_type")]
    pub path_type: String,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommonCommand {
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub category: String,
    #[serde(default = "default_scope")]
    pub scope: String,
    #[serde(default)]
    pub server_id: Option<String>,
    #[serde(default = "default_risk_level")]
    pub risk_level: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogSource {
    pub id: String,
    pub server_id: String,
    #[serde(default)]
    pub app_id: Option<String>,
    pub name: String,
    pub path: String,
    #[serde(default = "default_encoding")]
    pub encoding: String,
    #[serde(default = "default_tail_lines")]
    pub default_tail_lines: i32,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub remark: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HighlightRule {
    pub id: String,
    pub name: String,
    pub pattern: String,
    #[serde(default = "default_pattern_type")]
    pub pattern_type: String,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_scope")]
    pub scope: String,
    #[serde(default)]
    pub server_id: Option<String>,
    #[serde(default)]
    pub app_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified_at: Option<String>,
    pub permissions: Option<String>,
    pub owner: Option<String>,
    pub group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCommandResult {
    pub success: bool,
    pub output: String,
    pub exit_code: i32,
}

fn default_path_type() -> String {
    "custom".to_string()
}

fn default_scope() -> String {
    "global".to_string()
}

fn default_risk_level() -> String {
    "safe".to_string()
}

fn default_encoding() -> String {
    "UTF-8".to_string()
}

fn default_tail_lines() -> i32 {
    500
}

fn default_pattern_type() -> String {
    "keyword".to_string()
}

fn default_color() -> String {
    "#ffffff".to_string()
}

fn default_true() -> bool {
    true
}
