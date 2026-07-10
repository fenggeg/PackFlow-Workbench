use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleDependencyEdge {
    pub from_module_id: String,
    pub to_module_id: String,
    #[serde(rename = "type")]
    pub edge_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleDependencySummary {
    pub module_id: String,
    pub packaging: Option<String>,
    pub dependencies: Vec<String>,
    pub dependents: Vec<String>,
    pub aggregation_children: Vec<String>,
    pub aggregation_parent: Option<String>,
    pub release_candidate_module_ids: Vec<String>,
    pub required_build_module_ids: Vec<String>,
    pub suggested_validation_module_ids: Vec<String>,
    pub related_aggregation_module_ids: Vec<String>,
    pub recommended_module_ids: Vec<String>,
    pub has_cycle: bool,
    pub cycle_paths: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleDependencyGraph {
    pub root_path: String,
    pub edges: Vec<ModuleDependencyEdge>,
    pub summaries: Vec<ModuleDependencySummary>,
    pub cycles: Vec<Vec<String>>,
}

/// A single dependency conflict found in a module's dependency tree
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyConflict {
    pub group_id: String,
    pub artifact_id: String,
    pub requested_version: String,
    pub selected_version: String,
    pub module_id: String,
    pub dependency_path: String,
}

/// Result of scanning a single module
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleConflictResult {
    pub module_id: String,
    pub artifact_id: String,
    pub conflicts: Vec<DependencyConflict>,
}

/// Overall result of dependency conflict detection
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyConflictResult {
    pub root_path: String,
    pub modules: Vec<ModuleConflictResult>,
    pub has_conflicts: bool,
}
