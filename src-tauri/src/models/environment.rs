use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentSettings {
    pub java_home: Option<String>,
    pub maven_home: Option<String>,
    pub use_maven_wrapper: bool,
    pub last_project_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildEnvironment {
    pub java_home: Option<String>,
    pub java_version: Option<String>,
    pub java_path: Option<String>,
    pub maven_home: Option<String>,
    pub maven_version: Option<String>,
    pub maven_path: Option<String>,
    pub settings_xml_path: Option<String>,
    pub has_maven_wrapper: bool,
    pub maven_wrapper_path: Option<String>,
    pub use_maven_wrapper: bool,
    pub errors: Vec<String>,
}
