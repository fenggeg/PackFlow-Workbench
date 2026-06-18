use crate::error::{to_user_error, AppResult};
use crate::models::environment::{JdkRequirement, JdkRequirementSource};
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
    jdk_requirement: Option<JdkRequirement>,
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
    let modules = if root_pom_data.modules.is_empty() {
        vec![root_as_module(&root, &root_pom, &root_pom_data)]
    } else {
        parse_child_modules(&root, &root, &root_pom_data.modules)
    };

    Ok(MavenProject {
        root_path: path_to_string(&root),
        root_pom_path: path_to_string(&root_pom),
        group_id: root_pom_data.group_id,
        artifact_id: root_pom_data.artifact_id,
        version: root_pom_data.version,
        packaging: root_pom_data.packaging,
        modules,
        jdk_requirement: root_pom_data.jdk_requirement,
    })
}

fn root_as_module(root: &Path, root_pom: &Path, parsed: &ParsedPom) -> MavenModule {
    MavenModule {
        id: ".".to_string(),
        name: parsed.name.clone(),
        artifact_id: parsed.artifact_id.clone(),
        group_id: parsed.group_id.clone(),
        version: parsed.version.clone(),
        packaging: parsed.packaging.clone(),
        relative_path: String::new(),
        pom_path: path_to_string(root_pom),
        children: Vec::new(),
        error_message: if root.exists() {
            None
        } else {
            Some("项目目录不存在。".to_string())
        },
    }
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
    let group_id = child_text(project, "groupId")
        .or_else(|| parent.and_then(|parent_node| child_text(parent_node, "groupId")));
    let version = child_text(project, "version")
        .or_else(|| parent.and_then(|parent_node| child_text(parent_node, "version")));
    let artifact_id = child_text(project, "artifactId")
        .ok_or_else(|| to_user_error("POM 中缺少 artifactId。"))?;
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
        jdk_requirement: extract_jdk_requirement(&project),
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

/// 从 pom.xml 的 project 节点提取 JDK 版本需求
fn extract_jdk_requirement(project: &Node) -> Option<JdkRequirement> {
    // 1. 优先查找 <properties> 中的属性
    if let Some(props) = direct_child(*project, "properties") {
        let candidates = [
            ("maven.compiler.release", JdkRequirementSource::MavenCompilerRelease),
            ("maven.compiler.target", JdkRequirementSource::MavenCompilerTarget),
            ("maven.compiler.source", JdkRequirementSource::MavenCompilerSource),
            ("java.version", JdkRequirementSource::JavaVersion),
        ];
        for (tag, source) in &candidates {
            if let Some(value) = child_text(props, tag) {
                let resolved_major = parse_java_major(&value);
                return Some(JdkRequirement {
                    version_spec: value,
                    source: source.clone(),
                    resolved_major,
                });
            }
        }
    }
    // 2. fallback: <build><plugins><maven-compiler-plugin><configuration>
    extract_from_compiler_plugin(project)
}

/// 从 maven-compiler-plugin 的 <configuration> 中提取 JDK 需求
fn extract_from_compiler_plugin(project: &Node) -> Option<JdkRequirement> {
    let build = direct_child(*project, "build")?;
    let plugins = direct_child(build, "plugins")?;
    for plugin in plugins.children() {
        if !plugin.is_element() || plugin.tag_name().name() != "plugin" {
            continue;
        }
        let artifact_id = child_text(plugin, "artifactId").unwrap_or_default();
        if artifact_id != "maven-compiler-plugin" {
            continue;
        }
        if let Some(config) = direct_child(plugin, "configuration") {
            let candidates = [
                ("release", JdkRequirementSource::MavenCompilerPlugin),
                ("target", JdkRequirementSource::MavenCompilerPlugin),
                ("source", JdkRequirementSource::MavenCompilerPlugin),
            ];
            for (tag, source) in &candidates {
                if let Some(value) = child_text(config, tag) {
                    // 跳过属性占位符如 ${maven.compiler.release}
                    if value.starts_with("${") {
                        continue;
                    }
                    let resolved_major = parse_java_major(&value);
                    return Some(JdkRequirement {
                        version_spec: value,
                        source: source.clone(),
                        resolved_major,
                    });
                }
            }
        }
    }
    None
}

/// 解析 Java 版本规格为主版本号
/// "17" -> Some(17), "1.8" -> Some(8), "1.8.0_392" -> Some(8), "21" -> Some(21)
pub fn parse_java_major(spec: &str) -> Option<u32> {
    let spec = spec.trim();
    if spec.is_empty() {
        return None;
    }
    let parts: Vec<&str> = spec.split('.').collect();
    if parts.is_empty() {
        return None;
    }
    let first: u32 = parts[0].parse().ok()?;
    if first == 1 && parts.len() > 1 {
        // 1.8.0_xxx 形式
        return parts[1].parse().ok();
    }
    Some(first)
}

/// 从 pom.xml 文件路径提取 JDK 需求（公共 API）
pub fn extract_jdk_requirement_from_file(path: &Path) -> AppResult<Option<JdkRequirement>> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("无法读取 pom.xml：{}", e))?;
    let document = Document::parse(&content)
        .map_err(|e| format!("无法解析 pom.xml：{}", e))?;
    let project = document
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == "project")
        .ok_or_else(|| "POM 中缺少 project 根节点".to_string())?;
    Ok(extract_jdk_requirement(&project))
}
