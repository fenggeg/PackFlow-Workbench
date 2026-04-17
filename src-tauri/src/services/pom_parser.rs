use crate::error::{to_user_error, AppResult};
use crate::models::module::MavenModule;
use crate::models::project::MavenProject;
use roxmltree::{Document, Node};
use std::fs;
use std::path::{Path, PathBuf};

struct ParsedPom {
    name: Option<String>,
    group_id: Option<String>,
    artifact_id: String,
    version: Option<String>,
    packaging: Option<String>,
    modules: Vec<String>,
}

pub fn parse_maven_project(root_path: &str) -> AppResult<MavenProject> {
    let root = PathBuf::from(root_path);
    if !root.exists() || !root.is_dir() {
        return Err(to_user_error("项目目录不存在或不是有效目录。"));
    }

    let root_pom = root.join("pom.xml");
    if !root_pom.exists() {
        return Err(to_user_error("所选目录下未找到 pom.xml。"));
    }

    let root_pom_data = parse_pom_file(&root_pom)?;
    let modules = parse_child_modules(&root, &root, &root_pom_data.modules);

    Ok(MavenProject {
        root_path: path_to_string(&root),
        root_pom_path: path_to_string(&root_pom),
        group_id: root_pom_data.group_id,
        artifact_id: root_pom_data.artifact_id,
        version: root_pom_data.version,
        packaging: root_pom_data.packaging,
        modules,
    })
}

fn parse_child_modules(root: &Path, parent_dir: &Path, modules: &[String]) -> Vec<MavenModule> {
    modules
        .iter()
        .map(|module_path| parse_module(root, parent_dir, module_path))
        .collect()
}

fn parse_module(root: &Path, parent_dir: &Path, module_path: &str) -> MavenModule {
    let module_dir = parent_dir.join(module_path);
    let pom_path = module_dir.join("pom.xml");
    let relative_path = relative_path(root, &module_dir);

    if !pom_path.exists() {
        return MavenModule {
            id: relative_path.clone(),
            name: None,
            artifact_id: module_dir
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or(module_path)
                .to_string(),
            group_id: None,
            version: None,
            packaging: None,
            relative_path,
            pom_path: path_to_string(&pom_path),
            children: Vec::new(),
            error_message: Some("模块目录下未找到 pom.xml，已保留为异常模块。".to_string()),
        };
    }

    match parse_pom_file(&pom_path) {
        Ok(parsed) => MavenModule {
            id: relative_path.clone(),
            name: parsed.name,
            artifact_id: parsed.artifact_id,
            group_id: parsed.group_id,
            version: parsed.version,
            packaging: parsed.packaging,
            relative_path,
            pom_path: path_to_string(&pom_path),
            children: parse_child_modules(root, &module_dir, &parsed.modules),
            error_message: None,
        },
        Err(error) => MavenModule {
            id: relative_path.clone(),
            name: None,
            artifact_id: module_dir
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or(module_path)
                .to_string(),
            group_id: None,
            version: None,
            packaging: None,
            relative_path,
            pom_path: path_to_string(&pom_path),
            children: Vec::new(),
            error_message: Some(error),
        },
    }
}

fn parse_pom_file(path: &Path) -> AppResult<ParsedPom> {
    let content = fs::read_to_string(path).map_err(|error| {
        to_user_error(format!(
            "无法读取 POM 文件 {}：{}",
            path_to_string(path),
            error
        ))
    })?;
    let document = Document::parse(&content).map_err(|error| {
        to_user_error(format!(
            "无法解析 POM XML {}：{}",
            path_to_string(path),
            error
        ))
    })?;
    let project = document
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == "project")
        .ok_or_else(|| to_user_error("POM 中缺少 project 根节点。"))?;

    let parent = direct_child(project, "parent");
    let group_id = child_text(project, "groupId").or_else(|| {
        parent.and_then(|parent_node| child_text(parent_node, "groupId"))
    });
    let version = child_text(project, "version").or_else(|| {
        parent.and_then(|parent_node| child_text(parent_node, "version"))
    });
    let artifact_id =
        child_text(project, "artifactId").ok_or_else(|| to_user_error("POM 中缺少 artifactId。"))?;
    let packaging = child_text(project, "packaging").or(Some("jar".to_string()));
    let modules = direct_child(project, "modules")
        .map(|modules_node| {
            modules_node
                .children()
                .filter(|node| node.is_element() && node.tag_name().name() == "module")
                .filter_map(|node| node.text())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default();

    Ok(ParsedPom {
        name: child_text(project, "name"),
        group_id,
        artifact_id,
        version,
        packaging,
        modules,
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

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('/', "\\")
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().replace('/', "\\")
}
