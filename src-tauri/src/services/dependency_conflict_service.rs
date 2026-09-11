use crate::error::{to_user_error, AppResult};
use crate::models::dependency::{DependencyConflict, DependencyConflictResult, ModuleConflictResult};
use crate::services::process_utils::CREATE_NO_WINDOW;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

/// 进度事件 payload
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictScanProgress {
    pub current_module: String,
    pub scanned_modules: usize,
    pub total_modules: usize,
}

fn detect_maven_exec(root_path: &str) -> String {
    let wrapper = PathBuf::from(root_path).join("mvnw.cmd");
    if wrapper.exists() {
        "mvnw.cmd".to_string()
    } else {
        "mvn.cmd".to_string()
    }
}

/// 在根目录执行一次 `mvn dependency:tree -Dverbose`，流式读取输出，
/// 按模块分段解析冲突，并通过 AppHandle 实时推送进度事件。
pub fn detect_dependency_conflicts(
    root_path: &str,
    app: &AppHandle,
    total_modules_hint: usize,
) -> AppResult<DependencyConflictResult> {
    let exec = detect_maven_exec(root_path);
    let work_dir = PathBuf::from(root_path);

    if !work_dir.exists() {
        return Err(to_user_error(format!("项目目录不存在: {}", work_dir.display())));
    }

    let mut cmd = Command::new("cmd");
    cmd.arg("/C")
        .arg(&exec)
        .arg("dependency:tree")
        .arg("-Dverbose=true")
        .arg("-DoutputType=text")
        .creation_flags(CREATE_NO_WINDOW)
        .current_dir(&work_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| to_user_error(format!("无法启动 dependency:tree: {}", e)))?;

    let stdout = child.stdout.take().ok_or_else(|| to_user_error("无法获取 dependency:tree 的标准输出"))?;
    let stderr = child.stderr.take().ok_or_else(|| to_user_error("无法获取 dependency:tree 的标准错误"))?;

    // 后台排空 stderr，避免子进程写满管道缓冲后阻塞
    let stderr_handle = std::thread::spawn(move || {
        let mut lines = Vec::new();
        for line_result in BufReader::new(stderr).lines() {
            if let Ok(l) = line_result {
                lines.push(l);
            }
        }
        lines
    });

    // 流式逐行读取 stdout，按模块分段解析
    let reader = BufReader::new(stdout);
    let mut module_sections: HashMap<String, Vec<String>> = HashMap::new();
    let mut current_module_id = String::new();
    let mut scanned_count = 0usize;
    let mut last_progress_emit = std::time::Instant::now();

    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };

        // 检测模块分隔行: [INFO] --- maven-dependency-plugin:... @ module-artifactId ---
        if let Some(module_name) = extract_module_from_separator(&line) {
            if !current_module_id.is_empty() && !module_name.eq(&current_module_id) {
                scanned_count += 1;
            }
            current_module_id = module_name;

            // 节流：每 500ms 推送一次进度事件，避免高频 emit
            if last_progress_emit.elapsed() >= std::time::Duration::from_millis(500) {
                let _ = app.emit("dependency-conflict-progress", ConflictScanProgress {
                    current_module: current_module_id.clone(),
                    scanned_modules: scanned_count,
                    total_modules: total_modules_hint,
                });
                last_progress_emit = std::time::Instant::now();
            }
        }

        if !current_module_id.is_empty() {
            module_sections
                .entry(current_module_id.clone())
                .or_default()
                .push(line);
        }
    }

    let exit_status = child.wait().map_err(|e| to_user_error(format!("等待 dependency:tree 结束失败: {}", e)))?;
    let stderr_lines = stderr_handle.join().unwrap_or_default();

    if !exit_status.success() && module_sections.is_empty() {
        if !stderr_lines.is_empty() {
            return Err(to_user_error(format!("dependency:tree 执行失败:\n{}", stderr_lines.join("\n"))));
        }
        return Err(to_user_error("dependency:tree 执行失败且无输出。"));
    }

    // 解析每个模块的依赖树，提取冲突
    let coord_re = Regex::new(COORD_PATTERN).unwrap();
    let mut module_results = Vec::new();

    for (module_id, lines) in &module_sections {
        let output = lines.join("\n");
        let deps = parse_dep_tree(&output, &coord_re);
        let conflicts = find_conflicts(&deps, module_id);
        if !conflicts.is_empty() {
            // 用模块 artifactId 近似为 module_id（精确值需 pom 解析，此处用输出中的名称）
            module_results.push(ModuleConflictResult {
                module_id: module_id.clone(),
                artifact_id: module_id.clone(),
                conflicts,
            });
        }
    }

    // 如果有 pom 解析信息，用真实的 artifactId 替换
    // 这里先尝试加载项目信息做映射
    if let Ok(project) = crate::services::pom_parser::parse_maven_project(root_path) {
        let id_to_artifact = collect_module_artifact_ids(&project);
        for result in &mut module_results {
            if let Some(artifact_id) = id_to_artifact.get(&result.module_id) {
                result.artifact_id = artifact_id.clone();
            }
        }
    }

    let has_conflicts = !module_results.is_empty();

    // 最终进度事件
    let _ = app.emit("dependency-conflict-progress", ConflictScanProgress {
        current_module: String::new(),
        scanned_modules: module_sections.len(),
        total_modules: total_modules_hint,
    });

    Ok(DependencyConflictResult {
        root_path: root_path.to_string(),
        modules: module_results,
        has_conflicts,
    })
}

/// 从 Maven dependency:tree 的模块分隔行提取模块名。
/// 格式: [INFO] --- maven-dependency-plugin:3.3.0:tree (default-cli) @ my-module ---
fn extract_module_from_separator(line: &str) -> Option<String> {
    let line = line.trim();
    if !line.starts_with("[INFO] --- ") {
        return None;
    }
    // 找 @ ... --- 模式
    if let Some(at_pos) = line.find(" @ ") {
        let after_at = &line[at_pos + 3..];
        if let Some(end_pos) = after_at.find(" ---") {
            return Some(after_at[..end_pos].trim().to_string());
        }
        // 也可能是 " --" 两个短横线结尾
        if let Some(end_pos) = after_at.find(" --") {
            return Some(after_at[..end_pos].trim().to_string());
        }
    }
    None
}

/// Maven dependency:tree 输出中单行依赖的坐标正则。
/// 格式: groupId:artifactId:type:version:scope
const COORD_PATTERN: &str =
    r"([\w][\w.-]*):([\w][\w.-]*):([\w][\w.-]*):([\w][\w.-]*):(\w+)";

fn parse_dep_tree(output: &str, coord_re: &Regex) -> Vec<TreeDep> {
    let mut deps = Vec::new();
    let mut path_stack: Vec<String> = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if !line.starts_with("[INFO] ") {
            continue;
        }
        let content = line[7..].trim();

        let indent_level = calc_indent_level(content);

        let is_plus_branch = content.contains("+- ");
        let is_backslash_branch = content.contains("\\- ");
        let is_pipe_branch = content.contains("|- ");
        if !is_plus_branch && !is_backslash_branch && !is_pipe_branch {
            continue;
        }
        let after_branch = if is_plus_branch {
            content.splitn(2, "+- ").nth(1)
        } else if is_backslash_branch {
            content.splitn(2, "\\- ").nth(1)
        } else {
            content.splitn(2, "|- ").nth(1)
        };
        let dep_str = match after_branch {
            Some(s) => s.trim(),
            None => continue,
        };
        if dep_str.is_empty() {
            continue;
        }

        let is_omitted = dep_str.starts_with('(') && dep_str.contains("omitted for conflict");
        let is_managed = dep_str.contains("version managed from");

        let clean = if is_omitted {
            dep_str.trim_start_matches('(').split(')').next().unwrap_or(dep_str)
        } else if is_managed {
            dep_str.split(" (version managed from ").next().unwrap_or(dep_str)
        } else if dep_str.contains(" (") && dep_str.ends_with(')') {
            dep_str.split(" (").next().unwrap_or(dep_str)
        } else {
            dep_str
        };

        if let Some(coord) = coord_re.captures(clean) {
            let group_id = coord.get(1).unwrap().as_str().to_string();
            let artifact_id = coord.get(2).unwrap().as_str().to_string();
            let version = coord.get(4).unwrap().as_str().to_string();
            let scope = coord.get(5).unwrap().as_str().to_string();

            if scope == "test" {
                continue;
            }

            let managed_from = if is_managed {
                dep_str.split("version managed from ").nth(1)
                    .map(|s| s.trim_end_matches(')').trim().to_string())
            } else {
                None
            };

            let dep_label = format!("{}:{}", group_id, artifact_id);
            if path_stack.len() > indent_level {
                path_stack.truncate(indent_level);
            }
            let dependency_path = if path_stack.is_empty() {
                dep_label.clone()
            } else {
                format!("{} -> {}", path_stack.join(" -> "), dep_label)
            };

            if !is_omitted {
                if path_stack.len() <= indent_level {
                    path_stack.push(dep_label.clone());
                } else {
                    path_stack[indent_level] = dep_label.clone();
                }
            }

            deps.push(TreeDep {
                group_id,
                artifact_id,
                version,
                is_omitted,
                managed_from,
                dependency_path,
            });
        }
    }
    deps
}

/// 根据 Maven dependency:tree 输出行的缩进计算层级。
fn calc_indent_level(content: &str) -> usize {
    let mut level = 0;
    let chars: Vec<char> = content.chars().collect();
    let mut i = 0;
    while i + 2 < chars.len() {
        let slice: String = chars[i..=i + 2].iter().collect();
        if slice == "|  " || slice == "   " {
            level += 1;
            i += 3;
        } else {
            break;
        }
    }
    level
}

struct TreeDep {
    group_id: String,
    artifact_id: String,
    version: String,
    is_omitted: bool,
    managed_from: Option<String>,
    dependency_path: String,
}

fn find_conflicts(deps: &[TreeDep], module_id: &str) -> Vec<DependencyConflict> {
    let mut by_coord: HashMap<(&str, &str), Vec<&TreeDep>> = HashMap::new();
    for dep in deps {
        by_coord
            .entry((dep.group_id.as_str(), dep.artifact_id.as_str()))
            .or_default()
            .push(dep);
    }

    let mut conflicts = Vec::new();
    for ((g, a), versions) in &by_coord {
        let unique: HashSet<&str> = versions.iter().map(|d| d.version.as_str()).collect();
        if unique.len() <= 1 {
            continue;
        }

        let winner = versions.iter().find(|d| !d.is_omitted).map(|d| &d.version);
        let winner_ver = winner.map(|s| s.as_str()).unwrap_or("");

        for dep in versions {
            if dep.is_omitted {
                let path = if let Some(mf) = &dep.managed_from {
                    format!("{} (managed from {}) via {}", dep.artifact_id, mf, dep.dependency_path)
                } else {
                    dep.dependency_path.clone()
                };
                conflicts.push(DependencyConflict {
                    group_id: g.to_string(),
                    artifact_id: a.to_string(),
                    requested_version: dep.version.clone(),
                    selected_version: winner_ver.to_string(),
                    module_id: module_id.to_string(),
                    dependency_path: format!("{} -> {}", module_id, path),
                });
            }
        }
    }
    conflicts
}

fn collect_module_artifact_ids(project: &crate::models::project::MavenProject) -> HashMap<String, String> {
    let mut map = HashMap::new();
    fn walk(modules: &[crate::models::module::MavenModule], map: &mut HashMap<String, String>) {
        for m in modules {
            map.insert(m.id.clone(), m.artifact_id.clone());
            walk(&m.children, map);
        }
    }
    walk(&project.modules, &mut map);
    if !map.contains_key(".") {
        map.insert(".".to_string(), project.artifact_id.clone());
    }
    map
}

/// 对字符串进行 XML 文本节点转义（& < >）
fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
     .replace('<', "&lt;")
     .replace('>', "&gt;")
}

pub fn generate_exclusion_code(group_id: &str, artifact_id: &str) -> String {
    format!(
        "<exclusions>\n    <exclusion>\n        <groupId>{}</groupId>\n        <artifactId>{}</artifactId>\n    </exclusion>\n</exclusions>",
        xml_escape(group_id),
        xml_escape(artifact_id)
    )
}

pub fn generate_bulk_exclusion_code(conflicts: &[DependencyConflict]) -> String {
    let mut seen = HashSet::new();
    let mut lines = Vec::new();
    for c in conflicts {
        let key = (c.group_id.as_str(), c.artifact_id.as_str());
        if seen.insert(key) {
            lines.push(format!(
                "    <exclusion>\n        <groupId>{}</groupId>\n        <artifactId>{}</artifactId>\n    </exclusion>",
                xml_escape(&c.group_id),
                xml_escape(&c.artifact_id)
            ));
        }
    }
    if lines.is_empty() {
        return String::new();
    }
    format!("<!-- 排除依赖冲突 -->\n<exclusions>\n{}\n</exclusions>", lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_module_separator() {
        assert_eq!(
            extract_module_from_separator("[INFO] --- maven-dependency-plugin:3.3.0:tree (default-cli) @ my-module ---"),
            Some("my-module".to_string())
        );
        assert_eq!(
            extract_module_from_separator("[INFO] --- dependency:tree @ parent-project ---"),
            Some("parent-project".to_string())
        );
        assert_eq!(
            extract_module_from_separator("[INFO] +- org.slf4j:slf4j-api:jar:1.7.36:compile"),
            None
        );
    }

    #[test]
    fn test_parse_conflict_lines() {
        let coord_re = Regex::new(COORD_PATTERN).unwrap();
        let output = r#"[INFO] --- maven-dependency-plugin:3.3.0:tree (default-cli) @ my-module ---
[INFO] com.example:my-module:jar:1.0.0
[INFO] +- org.slf4j:slf4j-api:jar:1.7.36:compile
[INFO] |  \- (org.slf4j:slf4j-api:jar:1.7.35:compile - omitted for conflict with 1.7.36)
[INFO] \- commons-logging:commons-logging:jar:1.2:compile
[INFO]    \- (commons-logging:commons-logging:jar:1.1.3:compile - omitted for conflict with 1.2)
"#;
        let deps = parse_dep_tree(output, &coord_re);
        assert_eq!(deps.len(), 4);
        let omitted: Vec<&TreeDep> = deps.iter().filter(|d| d.is_omitted).collect();
        assert_eq!(omitted.len(), 2);
        assert_eq!(omitted[0].artifact_id, "slf4j-api");
        assert_eq!(omitted[0].version, "1.7.35");
    }

    #[test]
    fn test_parse_multi_hyphen_group_id() {
        let coord_re = Regex::new(COORD_PATTERN).unwrap();
        let output = r#"[INFO] +- org.codehaus.mojo:build-helper-maven-plugin:maven-plugin:3.3.0:compile
"#;
        let deps = parse_dep_tree(output, &coord_re);
        assert_eq!(deps.len(), 1);
        assert_eq!(deps[0].group_id, "org.codehaus.mojo");
        assert_eq!(deps[0].artifact_id, "build-helper-maven-plugin");
    }

    #[test]
    fn test_parse_managed_versions() {
        let coord_re = Regex::new(COORD_PATTERN).unwrap();
        let output = r#"[INFO] com.example:my-module:jar:1.0.0
[INFO] +- org.springframework:spring-core:jar:5.3.20:compile (version managed from 5.3.18)
"#;
        let deps = parse_dep_tree(output, &coord_re);
        assert_eq!(deps.len(), 1);
        assert!(deps[0].managed_from.is_some());
        assert_eq!(deps[0].managed_from.as_ref().unwrap(), "5.3.18");
    }

    #[test]
    fn test_dependency_path_tracking() {
        let coord_re = Regex::new(COORD_PATTERN).unwrap();
        let output = r#"[INFO] com.example:my-module:jar:1.0.0
[INFO] +- org.springframework.boot:spring-boot-starter:jar:2.7.5:compile
[INFO] |  +- org.springframework.boot:spring-boot-starter-logging:jar:2.7.5:compile
[INFO] |  |  \- (org.slf4j:slf4j-api:jar:1.7.35:compile - omitted for conflict with 1.7.36)
"#;
        let deps = parse_dep_tree(output, &coord_re);
        let omitted: Vec<&TreeDep> = deps.iter().filter(|d| d.is_omitted).collect();
        assert_eq!(omitted.len(), 1);
        assert!(omitted[0].dependency_path.contains("spring-boot-starter"), "path should include parent: {}", omitted[0].dependency_path);
        assert!(omitted[0].dependency_path.contains("spring-boot-starter-logging"), "path should include grandparent: {}", omitted[0].dependency_path);
    }

    #[test]
    fn test_generate_exclusion() {
        let code = generate_exclusion_code("org.slf4j", "slf4j-api");
        assert!(code.contains("<groupId>org.slf4j</groupId>"));
        assert!(code.contains("<artifactId>slf4j-api</artifactId>"));
    }

    #[test]
    fn test_generate_exclusion_xml_escape() {
        let code = generate_exclusion_code("com.foo&bar", "artifact<test>");
        assert!(code.contains("&amp;"), "should escape &");
        assert!(code.contains("&lt;"), "should escape <");
        assert!(code.contains("&gt;"), "should escape >");
    }

    #[test]
    fn test_generate_bulk_exclusion() {
        let conflicts = vec![
            DependencyConflict {
                group_id: "org.slf4j".to_string(),
                artifact_id: "slf4j-api".to_string(),
                requested_version: "1.7.35".to_string(),
                selected_version: "1.7.36".to_string(),
                module_id: "module-a".to_string(),
                dependency_path: "module-a -> slf4j-api".to_string(),
            },
            DependencyConflict {
                group_id: "commons-logging".to_string(),
                artifact_id: "commons-logging".to_string(),
                requested_version: "1.1.3".to_string(),
                selected_version: "1.2".to_string(),
                module_id: "module-a".to_string(),
                dependency_path: "module-a -> commons-logging".to_string(),
            },
        ];
        let code = generate_bulk_exclusion_code(&conflicts);
        assert!(code.contains("org.slf4j"));
        assert!(code.contains("commons-logging"));
    }

    #[test]
    fn test_calc_indent_level() {
        assert_eq!(calc_indent_level("+- com.foo:bar:jar:1.0:compile"), 0);
        assert_eq!(calc_indent_level("|  +- com.foo:bar:jar:1.0:compile"), 1);
        assert_eq!(calc_indent_level("|  |  \\- com.foo:bar:jar:1.0:compile"), 2);
        assert_eq!(calc_indent_level("   +- com.foo:bar:jar:1.0:compile"), 1);
    }

    #[test]
    fn test_xml_escape() {
        assert_eq!(xml_escape("normal"), "normal");
        assert_eq!(xml_escape("a&b"), "a&amp;b");
        assert_eq!(xml_escape("a<b"), "a&lt;b");
        assert_eq!(xml_escape("a>b"), "a&gt;b");
        assert_eq!(xml_escape("a&b<c>d"), "a&amp;b&lt;c&gt;d");
    }
}
