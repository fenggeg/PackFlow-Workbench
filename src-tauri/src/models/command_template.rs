use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandTemplate {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub steps: Vec<CommandStep>,
    #[serde(default)]
    pub variables: Vec<TemplateVariable>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCommandTemplatePayload {
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub steps: Vec<CommandStep>,
    #[serde(default)]
    pub variables: Vec<TemplateVariable>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandStep {
    pub id: String,
    #[serde(rename = "type")]
    pub step_type: String, // "upload" | "command"
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub local_path: Option<String>,
    #[serde(default)]
    pub remote_path: Option<String>,
    #[serde(default)]
    pub local_path_mode: Option<String>, // "fixed" | "variable"
    #[serde(default)]
    pub remote_path_mode: Option<String>, // "fixed" | "variable"
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub shell: Option<String>,
    #[serde(default)]
    pub working_dir: Option<String>,
    #[serde(default)]
    pub ignore_error: bool,
    #[serde(default)]
    pub privileged: bool,
    #[serde(default = "default_true")]
    pub affects_status: bool, // 是否影响执行状态判断，默认 true
    #[serde(default)]
    pub timeout_seconds: Option<u64>, // 步骤超时时间，None 表示不限制
    #[serde(default)]
    pub wait_seconds: Option<u64>, // 等待步骤的等待秒数
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateVariable {
    pub key: String,
    pub label: String,
    #[serde(default)]
    pub default_value: Option<String>,
    #[serde(default = "default_true")]
    pub required: bool,
    /// 变量类型：text=文本输入，select=下拉选择
    #[serde(default)]
    pub r#type: Option<String>,
    /// 下拉选项列表，仅当 type="select" 时有效
    #[serde(default)]
    pub options: Option<Vec<String>>,
    /// 选项来源：manual=手动输入，artifact=从项目构建产物加载
    #[serde(default)]
    pub variable_source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandExecution {
    pub id: String,
    pub template_id: String,
    pub template_name: String,
    pub server_id: String,
    #[serde(default)]
    pub server_name: Option<String>,
    pub status: String, // "running" | "success" | "failed" | "cancelled"
    #[serde(default)]
    pub logs: Vec<String>,
    pub started_at: String,
    #[serde(default)]
    pub finished_at: Option<String>,
    #[serde(default)]
    pub variables_used: serde_json::Value,
}

fn default_true() -> bool {
    true
}

