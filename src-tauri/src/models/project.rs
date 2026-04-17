use serde::{Deserialize, Serialize};

use super::module::MavenModule;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MavenProject {
    pub root_path: String,
    pub root_pom_path: String,
    pub group_id: Option<String>,
    pub artifact_id: String,
    pub version: Option<String>,
    pub packaging: Option<String>,
    pub modules: Vec<MavenModule>,
}
