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
