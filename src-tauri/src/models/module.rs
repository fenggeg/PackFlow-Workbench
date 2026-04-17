use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MavenModule {
    pub id: String,
    pub name: Option<String>,
    pub artifact_id: String,
    pub group_id: Option<String>,
    pub version: Option<String>,
    pub packaging: Option<String>,
    pub relative_path: String,
    pub pom_path: String,
    pub children: Vec<MavenModule>,
    pub error_message: Option<String>,
}
