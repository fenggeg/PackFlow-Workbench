use crate::error::{to_user_error, AppResult};
use crate::models::dependency::{
    ModuleDependencyEdge, ModuleDependencyGraph, ModuleDependencySummary,
};
use crate::models::module::MavenModule;
use crate::services::pom_parser;
use roxmltree::{Document, Node};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone)]
struct ParsedModulePom {
    parent: Option<(Option<String>, String)>,
    child_modules: Vec<String>,
    dependencies: Vec<ParsedDependency>,
}

#[derive(Debug, Clone)]
struct ParsedDependency {
    group_id: Option<String>,
    artifact_id: String,
    dependency_type: String,
}

#[derive(Debug, Clone)]
struct ModuleSnapshot {
    id: String,
    group_id: Option<String>,
    artifact_id: String,
    packaging: Option<String>,
    pom_path: String,
    relative_path: String,
}

pub fn analyze_project_dependencies(root_path: &str) -> AppResult<ModuleDependencyGraph> {
    let project = pom_parser::parse_maven_project(root_path)?;
    let module_snapshots = flatten_modules(&project.modules);
    if module_snapshots.is_empty() {
        return Ok(ModuleDependencyGraph {
            root_path: project.root_path,
            edges: Vec::new(),
            summaries: Vec::new(),
            cycles: Vec::new(),
        });
    }

    let mut by_id = HashMap::new();
    let mut by_coordinate = HashMap::new();
    for module in &module_snapshots {
        by_coordinate.insert(
            (module.group_id.clone(), module.artifact_id.clone()),
            module.id.clone(),
        );
        by_id.insert(module.id.clone(), module.clone());
    }

    let mut edges = Vec::new();
    for module in &module_snapshots {
        let parsed = parse_module_pom(Path::new(&module.pom_path))?;

        if let Some((parent_group_id, parent_artifact_id)) = parsed.parent {
            if let Some(parent_id) = resolve_internal_module(
                &by_coordinate,
                parent_group_id.as_ref().or(module.group_id.as_ref()),
                &parent_artifact_id,
            ) {
                if parent_id != module.id {
                    edges.push(ModuleDependencyEdge {
                        from_module_id: module.id.clone(),
                        to_module_id: parent_id,
                        edge_type: "parent".to_string(),
                    });
                }
            }
        }

        for child_relative_path in parsed.child_modules {
            let normalized_child_path = normalize_path(&child_relative_path);
            if let Some(child_id) = module_snapshots
                .iter()
                .find(|candidate| candidate.relative_path == normalized_child_path)
                .map(|candidate| candidate.id.clone())
            {
                edges.push(ModuleDependencyEdge {
                    from_module_id: module.id.clone(),
                    to_module_id: child_id,
                    edge_type: "aggregation".to_string(),
                });
            }
        }

        for dependency in parsed.dependencies {
            if let Some(target_id) = resolve_internal_module(
                &by_coordinate,
                dependency.group_id.as_ref().or(module.group_id.as_ref()),
                &dependency.artifact_id,
            ) {
                if target_id != module.id {
                    edges.push(ModuleDependencyEdge {
                        from_module_id: module.id.clone(),
                        to_module_id: target_id,
                        edge_type: dependency.dependency_type,
                    });
                }
            }
        }
    }

    dedupe_edges(&mut edges);
    let cycles = detect_cycles(&edges);
    let summaries = build_summaries(&module_snapshots, &edges, &cycles);

    Ok(ModuleDependencyGraph {
        root_path: project.root_path,
        edges,
        summaries,
        cycles,
    })
}

fn flatten_modules(modules: &[MavenModule]) -> Vec<ModuleSnapshot> {
    let mut result = Vec::new();
    for module in modules {
        result.push(ModuleSnapshot {
            id: module.id.clone(),
            group_id: module.group_id.clone(),
            artifact_id: module.artifact_id.clone(),
            packaging: module.packaging.clone(),
            pom_path: module.pom_path.clone(),
            relative_path: normalize_path(&module.relative_path),
        });
        result.extend(flatten_modules(&module.children));
    }
    result
}

fn parse_module_pom(path: &Path) -> AppResult<ParsedModulePom> {
    let content = fs::read_to_string(path).map_err(|error| {
        to_user_error(format!(
            "无法读取依赖分析 POM {}：{}",
            path.to_string_lossy(),
            error
        ))
    })?;
    let document = Document::parse(&content).map_err(|error| {
        to_user_error(format!(
            "无法解析依赖分析 POM {}：{}",
            path.to_string_lossy(),
            error
        ))
    })?;
    let project = document
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == "project")
        .ok_or_else(|| to_user_error("POM 中缺少 project 根节点。"))?;

    let parent = direct_child(project, "parent").and_then(|node| {
        let artifact_id = child_text(node, "artifactId")?;
        Some((child_text(node, "groupId"), artifact_id))
    });
    let child_modules = direct_child(project, "modules")
        .map(|modules_node| {
            modules_node
                .children()
                .filter(|node| node.is_element() && node.tag_name().name() == "module")
                .filter_map(|node| node.text())
                .map(normalize_path)
                .collect()
        })
        .unwrap_or_default();
    let dependencies = direct_child(project, "dependencies")
        .map(|deps_node| {
            deps_node
                .children()
                .filter(|node| node.is_element() && node.tag_name().name() == "dependency")
                .filter_map(parse_dependency_node)
                .collect()
        })
        .unwrap_or_default();

    Ok(ParsedModulePom {
        parent,
        child_modules,
        dependencies,
    })
}

fn parse_dependency_node<'a, 'input>(node: Node<'a, 'input>) -> Option<ParsedDependency> {
    let artifact_id = child_text(node, "artifactId")?;
    Some(ParsedDependency {
        group_id: child_text(node, "groupId"),
        artifact_id,
        dependency_type: child_text(node, "scope").unwrap_or_else(|| "compile".to_string()),
    })
}

fn direct_child<'a, 'input>(node: Node<'a, 'input>, name: &str) -> Option<Node<'a, 'input>> {
    node.children()
        .find(|child| child.is_element() && child.tag_name().name() == name)
}

fn child_text<'a, 'input>(node: Node<'a, 'input>, name: &str) -> Option<String> {
    direct_child(node, name)
        .and_then(|child| child.text())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn resolve_internal_module(
    by_coordinate: &HashMap<(Option<String>, String), String>,
    group_id: Option<&String>,
    artifact_id: &str,
) -> Option<String> {
    by_coordinate
        .get(&(group_id.cloned(), artifact_id.to_string()))
        .cloned()
        .or_else(|| {
            by_coordinate
                .iter()
                .find(|((_, current_artifact_id), _)| current_artifact_id == artifact_id)
                .map(|(_, module_id)| module_id.clone())
        })
}

fn normalize_path(path: &str) -> String {
    path.replace('/', "\\").trim_matches('\\').to_string()
}

fn dedupe_edges(edges: &mut Vec<ModuleDependencyEdge>) {
    let mut seen = HashSet::new();
    edges.retain(|edge| {
        seen.insert((
            edge.from_module_id.clone(),
            edge.to_module_id.clone(),
            edge.edge_type.clone(),
        ))
    });
}

fn detect_cycles(edges: &[ModuleDependencyEdge]) -> Vec<Vec<String>> {
    let mut adjacency: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for edge in edges.iter().filter(|edge| edge.edge_type != "aggregation") {
        adjacency
            .entry(edge.from_module_id.clone())
            .or_default()
            .push(edge.to_module_id.clone());
    }

    let mut cycles = BTreeSet::new();
    for start in adjacency.keys() {
        let mut stack = Vec::new();
        let mut visiting = HashSet::new();
        dfs_cycles(
            start,
            start,
            &adjacency,
            &mut stack,
            &mut visiting,
            &mut cycles,
        );
    }

    cycles
        .into_iter()
        .map(|cycle| cycle.into_iter().collect())
        .collect()
}

fn dfs_cycles(
    start: &str,
    current: &str,
    adjacency: &BTreeMap<String, Vec<String>>,
    stack: &mut Vec<String>,
    visiting: &mut HashSet<String>,
    cycles: &mut BTreeSet<Vec<String>>,
) {
    stack.push(current.to_string());
    visiting.insert(current.to_string());

    if let Some(next_nodes) = adjacency.get(current) {
        for next in next_nodes {
            if next == start && stack.len() > 1 {
                let mut cycle = stack.clone();
                cycle.push(start.to_string());
                normalize_cycle(&mut cycle);
                cycles.insert(cycle);
            } else if !visiting.contains(next) {
                dfs_cycles(start, next, adjacency, stack, visiting, cycles);
            }
        }
    }

    stack.pop();
    visiting.remove(current);
}

fn normalize_cycle(cycle: &mut Vec<String>) {
    if cycle.len() <= 2 {
        return;
    }
    let body = &cycle[..cycle.len() - 1];
    if let Some((min_index, _)) = body
        .iter()
        .enumerate()
        .min_by(|(_, left), (_, right)| left.cmp(right))
    {
        let mut rotated = body[min_index..].to_vec();
        rotated.extend_from_slice(&body[..min_index]);
        rotated.push(rotated[0].clone());
        *cycle = rotated;
    }
}

fn build_summaries(
    modules: &[ModuleSnapshot],
    edges: &[ModuleDependencyEdge],
    cycles: &[Vec<String>],
) -> Vec<ModuleDependencySummary> {
    let business_edges = edges
        .iter()
        .filter(|edge| matches!(edge.edge_type.as_str(), "compile" | "runtime" | "provided"))
        .cloned()
        .collect::<Vec<_>>();
    let mut summaries = Vec::new();
    for module in modules {
        let dependencies = collect_unique(edges.iter().filter_map(|edge| {
            (edge.from_module_id == module.id && edge.edge_type != "aggregation")
                .then_some(edge.to_module_id.clone())
        }));
        let dependents = collect_unique(edges.iter().filter_map(|edge| {
            (edge.to_module_id == module.id && edge.edge_type != "aggregation")
                .then_some(edge.from_module_id.clone())
        }));
        let aggregation_children = collect_unique(edges.iter().filter_map(|edge| {
            (edge.from_module_id == module.id && edge.edge_type == "aggregation")
                .then_some(edge.to_module_id.clone())
        }));
        let aggregation_parent = edges
            .iter()
            .find(|edge| edge.to_module_id == module.id && edge.edge_type == "aggregation")
            .map(|edge| edge.from_module_id.clone());

        let cycle_paths = cycles
            .iter()
            .filter(|cycle| cycle.iter().any(|item| item == &module.id))
            .cloned()
            .collect::<Vec<_>>();
        let release_candidate_module_ids =
            compute_release_candidates(module, modules, &business_edges);
        let required_build_module_ids = collect_unique(edges.iter().filter_map(|edge| {
            (edge.from_module_id == module.id
                && matches!(
                    edge.edge_type.as_str(),
                    "compile" | "runtime" | "provided" | "parent"
                ))
            .then_some(edge.to_module_id.clone())
        }));
        let suggested_validation_module_ids =
            collect_unique(dependents.iter().cloned().filter(|item| item != &module.id));
        let related_aggregation_module_ids = collect_unique(
            aggregation_children
                .iter()
                .cloned()
                .chain(aggregation_parent.iter().cloned())
                .filter(|item| item != &module.id),
        );
        let recommended_module_ids = collect_unique(
            required_build_module_ids
                .iter()
                .cloned()
                .chain(suggested_validation_module_ids.iter().cloned())
                .filter(|item| item != &module.id),
        );

        summaries.push(ModuleDependencySummary {
            module_id: module.id.clone(),
            packaging: module.packaging.clone(),
            dependencies,
            dependents,
            aggregation_children,
            aggregation_parent,
            release_candidate_module_ids,
            required_build_module_ids,
            suggested_validation_module_ids,
            related_aggregation_module_ids,
            recommended_module_ids,
            has_cycle: !cycle_paths.is_empty(),
            cycle_paths,
        });
    }
    summaries.sort_by(|left, right| left.module_id.cmp(&right.module_id));
    summaries
}

fn collect_unique(items: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for item in items {
        if seen.insert(item.clone()) {
            result.push(item);
        }
    }
    result
}

fn compute_release_candidates(
    module: &ModuleSnapshot,
    modules: &[ModuleSnapshot],
    business_edges: &[ModuleDependencyEdge],
) -> Vec<String> {
    let reverse_business_edges = business_edges
        .iter()
        .filter(|edge| edge.to_module_id == module.id)
        .map(|edge| edge.from_module_id.clone())
        .collect::<Vec<_>>();

    if reverse_business_edges.is_empty() {
        return if is_publish_target(module) {
            vec![module.id.clone()]
        } else {
            Vec::new()
        };
    }

    let impacted = collect_downstream_publish_chain(&module.id, business_edges);
    let leaf_candidates = impacted
        .iter()
        .filter(|candidate_id| {
            !business_edges.iter().any(|edge| {
                edge.to_module_id == **candidate_id && impacted.contains(&edge.from_module_id)
            })
        })
        .filter_map(|candidate_id| modules.iter().find(|item| item.id == *candidate_id))
        .filter(|candidate| is_publish_target(candidate))
        .map(|candidate| candidate.id.clone())
        .collect::<Vec<_>>();

    if !leaf_candidates.is_empty() {
        return leaf_candidates;
    }

    impacted
        .into_iter()
        .filter_map(|candidate_id| modules.iter().find(|item| item.id == candidate_id))
        .filter(|candidate| is_publish_target(candidate))
        .map(|candidate| candidate.id.clone())
        .collect()
}

fn collect_downstream_publish_chain(
    module_id: &str,
    business_edges: &[ModuleDependencyEdge],
) -> HashSet<String> {
    let mut visited = HashSet::new();
    let mut stack = vec![module_id.to_string()];

    while let Some(current) = stack.pop() {
        for next in business_edges
            .iter()
            .filter(|edge| edge.to_module_id == current)
            .map(|edge| edge.from_module_id.clone())
        {
            if visited.insert(next.clone()) {
                stack.push(next);
            }
        }
    }

    visited
}

fn is_publish_target(module: &ModuleSnapshot) -> bool {
    !matches!(module.packaging.as_deref(), Some("pom"))
}
