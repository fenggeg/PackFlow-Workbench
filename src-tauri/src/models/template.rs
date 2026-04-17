use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildTemplate {
    pub id: String,
    pub name: String,
    pub project_root: String,
    pub module_path: String,
    pub goals: Vec<String>,
    pub profiles: Vec<String>,
    pub properties: HashMap<String, serde_json::Value>,
    pub also_make: bool,
    pub skip_tests: bool,
    pub custom_args: Vec<String>,
    pub use_maven_wrapper: bool,
    pub java_home: Option<String>,
    pub maven_home: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}
