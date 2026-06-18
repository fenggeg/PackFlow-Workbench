use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentSettings {
    pub active_profile_id: Option<String>,
    #[serde(default)]
    pub profiles: Vec<EnvironmentProfile>,
    pub last_project_path: Option<String>,
    #[serde(default)]
    pub project_paths: Vec<String>,
    /// projectPath -> profileId，项目专属环境方案绑定
    #[serde(default)]
    pub project_profile_bindings: HashMap<String, String>,
    /// JDK 注册表：全局可用 JDK 列表
    #[serde(default)]
    pub jdk_registry: Vec<JdkEntry>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentProfile {
    pub id: String,
    pub name: String,
    pub java_home: Option<String>,
    pub maven_home: Option<String>,
    pub settings_xml_path: Option<String>,
    pub local_repo_path: Option<String>,
    pub use_maven_wrapper: bool,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EnvironmentStatus {
    Ok,
    Warning,
    Error,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EnvironmentSource {
    Auto,
    Manual,
    Wrapper,
    Missing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildEnvironment {
    pub java_home: Option<String>,
    pub java_version: Option<String>,
    pub java_path: Option<String>,
    pub java_source: EnvironmentSource,
    pub maven_home: Option<String>,
    pub maven_version: Option<String>,
    pub maven_path: Option<String>,
    pub maven_source: EnvironmentSource,
    pub settings_xml_path: Option<String>,
    pub settings_xml_source: EnvironmentSource,
    pub local_repo_path: Option<String>,
    pub local_repo_source: EnvironmentSource,
    pub has_maven_wrapper: bool,
    pub maven_wrapper_path: Option<String>,
    pub use_maven_wrapper: bool,
    pub wrapper_source: EnvironmentSource,
    pub git_path: Option<String>,
    pub git_version: Option<String>,
    pub git_source: EnvironmentSource,
    pub status: EnvironmentStatus,
    pub errors: Vec<String>,
    /// pom.xml 解析出的 JDK 版本需求
    pub project_jdk_requirement: Option<JdkRequirement>,
    /// 注册表中的可用 JDK 列表
    #[serde(default)]
    pub available_jdks: Vec<JdkEntry>,
    /// 自动匹配命中的 JDK 注册表 ID
    pub matched_jdk_id: Option<String>,
}

/// JDK 注册表条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JdkEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    pub version: Option<String>,
    pub major_version: Option<u32>,
    pub vendor: Option<String>,
    pub is_default: bool,
    pub source: JdkSource,
}

/// JDK 来源标记
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JdkSource {
    Scan,
    Manual,
    EnvVar,
    Path,
}

/// pom.xml JDK 版本需求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JdkRequirement {
    pub version_spec: String,
    pub source: JdkRequirementSource,
    pub resolved_major: Option<u32>,
}

/// JDK 需求来源
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JdkRequirementSource {
    MavenCompilerRelease,
    MavenCompilerTarget,
    MavenCompilerSource,
    JavaVersion,
    MavenCompilerPlugin,
    Unspecified,
}
