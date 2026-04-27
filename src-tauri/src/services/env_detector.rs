use crate::models::environment::{
    BuildEnvironment, EnvironmentSettings, EnvironmentSource, EnvironmentStatus,
};
use std::env;
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn detect_environment(root_path: &str, settings: EnvironmentSettings) -> BuildEnvironment {
    let mut errors = Vec::new();
    let active_profile = settings
        .active_profile_id
        .as_deref()
        .and_then(|profile_id| {
            settings
                .profiles
                .iter()
                .find(|profile| profile.id == profile_id)
        });
    let (java_home, java_path, java_source) =
        resolve_java(active_profile.and_then(|profile| profile.java_home.as_deref()));
    let java_version = java_path
        .as_deref()
        .and_then(|path| run_version(path, &["-version"]))
        .or_else(|| run_version("java", &["-version"]));

    if java_home.is_none() && java_path.is_none() {
        errors.push("未识别到 JDK，请设置 JAVA_HOME 或手工指定 JDK 路径。".to_string());
    }
    if java_version.is_none() {
        errors.push("无法执行 java -version，请检查 JDK 是否可用。".to_string());
    }

    let (maven_path, maven_source) =
        resolve_maven(active_profile.and_then(|profile| profile.maven_home.as_deref()));
    let maven_home = maven_path
        .as_deref()
        .and_then(|path| maven_home_from_path(&PathBuf::from(path)))
        .or_else(|| active_profile.and_then(|profile| profile.maven_home.clone()));
    let maven_version = maven_path
        .as_deref()
        .and_then(|path| run_version(path, &["-version"]))
        .or_else(|| run_version("mvn.cmd", &["-version"]));

    if maven_path.is_none() {
        errors.push("未识别到 Maven，请安装 Maven 或手工指定 mvn.cmd 路径。".to_string());
    }
    if maven_version.is_none() {
        errors.push("无法执行 mvn -version，请检查 Maven 是否可用。".to_string());
    }

    let wrapper_path =
        (!root_path.trim().is_empty()).then(|| PathBuf::from(root_path).join("mvnw.cmd"));
    let has_maven_wrapper = wrapper_path.as_ref().is_some_and(|path| path.exists());
    let wrapper_source = if has_maven_wrapper {
        EnvironmentSource::Wrapper
    } else {
        EnvironmentSource::Missing
    };
    let use_maven_wrapper = active_profile.is_some_and(|profile| profile.use_maven_wrapper);
    if use_maven_wrapper && !has_maven_wrapper {
        errors.push("已启用 Maven Wrapper，但项目根目录未发现 mvnw.cmd。".to_string());
    }

    let (settings_xml_path, settings_xml_source) = detect_settings_xml(
        active_profile.and_then(|profile| profile.settings_xml_path.as_deref()),
        maven_path.as_deref(),
        maven_home.as_deref(),
    );
    let (local_repo_path, local_repo_source) = detect_local_repo(
        active_profile.and_then(|profile| profile.local_repo_path.as_deref()),
        settings_xml_path.as_deref(),
        maven_path.as_deref(),
        maven_home.as_deref(),
    );
    let (git_path, git_source) = first_where("git")
        .map(|path| (Some(path), EnvironmentSource::Auto))
        .unwrap_or((None, EnvironmentSource::Missing));
    let git_version = git_path
        .as_deref()
        .and_then(|path| run_version(path, &["--version"]));

    if git_path.is_none() {
        errors.push("未识别到 Git，Git 状态与分支操作将不可用。".to_string());
    }

    let status = environment_status(&errors);

    BuildEnvironment {
        java_home,
        java_version,
        java_path,
        java_source,
        maven_home,
        maven_version,
        maven_path,
        maven_source,
        settings_xml_path,
        settings_xml_source,
        local_repo_path,
        local_repo_source,
        has_maven_wrapper,
        maven_wrapper_path: wrapper_path
            .filter(|_| has_maven_wrapper)
            .map(path_to_string),
        use_maven_wrapper: use_maven_wrapper && has_maven_wrapper,
        wrapper_source,
        git_path,
        git_version,
        git_source,
        status,
        errors,
    }
}

fn resolve_java(saved: Option<&str>) -> (Option<String>, Option<String>, EnvironmentSource) {
    let from_saved = saved.and_then(|path| normalize_java_path(PathBuf::from(path)));
    let from_java_home = env::var("JAVA_HOME")
        .ok()
        .and_then(|path| normalize_java_path(PathBuf::from(path)));
    let from_path = first_where("java").and_then(|path| normalize_java_path(PathBuf::from(path)));

    let (resolved, source) = if let Some(value) = from_saved {
        (Some(value), EnvironmentSource::Manual)
    } else if let Some(value) = from_java_home {
        (Some(value), EnvironmentSource::Auto)
    } else if let Some(value) = from_path {
        (Some(value), EnvironmentSource::Auto)
    } else {
        (None, EnvironmentSource::Missing)
    };

    match resolved {
        Some((home, executable)) => (
            Some(path_to_string(home)),
            Some(path_to_string(executable)),
            source,
        ),
        None => (None, None, source),
    }
}

fn normalize_java_path(path: PathBuf) -> Option<(PathBuf, PathBuf)> {
    if path.is_file() {
        let file_name = path.file_name()?.to_str()?;
        if file_name.eq_ignore_ascii_case("java.exe") {
            let home = path.parent()?.parent()?.to_path_buf();
            return Some((home, path));
        }
        return None;
    }

    let direct = path.join("java.exe");
    if direct.exists() {
        let home = path
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| path.clone());
        return Some((home, direct));
    }

    let bin_java = path.join("bin").join("java.exe");
    if bin_java.exists() {
        return Some((path, bin_java));
    }

    None
}

fn resolve_maven_path(saved: Option<&str>) -> Option<String> {
    let saved = saved?;
    let path = PathBuf::from(saved);
    if path.is_file() {
        return normalize_maven_executable(path);
    }
    [path.join("mvn.cmd"), path.join("bin").join("mvn.cmd")]
        .into_iter()
        .find(|candidate| candidate.exists())
        .map(path_to_string)
}

fn resolve_maven(saved: Option<&str>) -> (Option<String>, EnvironmentSource) {
    if let Some(path) = resolve_maven_path(saved) {
        return (Some(path), EnvironmentSource::Manual);
    }
    if let Some(path) = first_maven_on_path() {
        return (Some(path), EnvironmentSource::Auto);
    }
    (None, EnvironmentSource::Missing)
}

fn maven_home_from_path(path: &PathBuf) -> Option<String> {
    let home = if path.is_file() {
        path.parent()
            .and_then(|bin_dir| bin_dir.parent())
            .map(PathBuf::from)
    } else if path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("bin"))
    {
        path.parent().map(PathBuf::from)
    } else {
        Some(path.clone())
    }?;
    Some(path_to_string(home))
}

fn first_maven_on_path() -> Option<String> {
    first_where("mvn.cmd")
        .map(PathBuf::from)
        .and_then(normalize_maven_executable)
        .or_else(|| {
            first_where("mvn")
                .map(PathBuf::from)
                .and_then(normalize_maven_executable)
        })
}

fn normalize_maven_executable(path: PathBuf) -> Option<String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if extension.eq_ignore_ascii_case("cmd") || extension.eq_ignore_ascii_case("bat") {
        return Some(path_to_string(path));
    }

    let cmd_path = path.with_extension("cmd");
    if cmd_path.exists() {
        return Some(path_to_string(cmd_path));
    }

    path.exists().then(|| path_to_string(path))
}

fn detect_settings_xml(
    saved_settings_xml: Option<&str>,
    maven_path: Option<&str>,
    saved_maven_home: Option<&str>,
) -> (Option<String>, EnvironmentSource) {
    if let Some(path) = saved_settings_xml {
        let path = PathBuf::from(path);
        if path.exists() {
            return (Some(path_to_string(path)), EnvironmentSource::Manual);
        }
    }

    if let Some(path) = user_settings_xml() {
        return (Some(path), EnvironmentSource::Auto);
    }
    if let Some(path) =
        saved_maven_home.and_then(|path| maven_home_settings_xml(&PathBuf::from(path)))
    {
        return (Some(path), EnvironmentSource::Auto);
    }
    if let Some(path) = maven_path.and_then(|path| maven_home_settings_xml(&PathBuf::from(path))) {
        return (Some(path), EnvironmentSource::Auto);
    }
    (None, EnvironmentSource::Missing)
}

fn user_settings_xml() -> Option<String> {
    env::var("USERPROFILE")
        .ok()
        .map(|home| PathBuf::from(home).join(".m2").join("settings.xml"))
        .filter(|path| path.exists())
        .map(path_to_string)
}

fn maven_home_settings_xml(path: &PathBuf) -> Option<String> {
    let maven_home = if path.is_file() {
        path.parent()
            .and_then(|bin_dir| bin_dir.parent())
            .map(PathBuf::from)
    } else if path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("bin"))
    {
        path.parent().map(PathBuf::from)
    } else {
        Some(path.clone())
    }?;

    let settings_xml = maven_home.join("conf").join("settings.xml");
    settings_xml.exists().then(|| path_to_string(settings_xml))
}

fn detect_local_repo(
    saved_local_repo: Option<&str>,
    settings_xml_path: Option<&str>,
    maven_path: Option<&str>,
    saved_maven_home: Option<&str>,
) -> (Option<String>, EnvironmentSource) {
    if let Some(path) = saved_local_repo {
        let path = path.trim();
        if !path.is_empty() {
            return (
                Some(path_to_string(resolve_maven_path_value(path))),
                EnvironmentSource::Manual,
            );
        }
    }

    for settings_path in
        local_repo_settings_candidates(settings_xml_path, maven_path, saved_maven_home)
    {
        if let Some(path) = detect_local_repository_from_settings(&settings_path) {
            return (Some(path), EnvironmentSource::Auto);
        }
    }

    let default_repo = user_m2_path().join("repository");
    if default_repo.exists() {
        return (Some(path_to_string(default_repo)), EnvironmentSource::Auto);
    }

    (
        Some(path_to_string(default_repo)),
        EnvironmentSource::Missing,
    )
}

fn local_repo_settings_candidates(
    settings_xml_path: Option<&str>,
    maven_path: Option<&str>,
    saved_maven_home: Option<&str>,
) -> Vec<String> {
    let mut candidates = Vec::new();
    if let Some(path) = settings_xml_path {
        push_unique_path(&mut candidates, path.to_string());
    }
    if let Some(path) =
        saved_maven_home.and_then(|path| maven_home_settings_xml(&PathBuf::from(path)))
    {
        push_unique_path(&mut candidates, path);
    }
    if let Some(path) = maven_path.and_then(|path| maven_home_settings_xml(&PathBuf::from(path))) {
        push_unique_path(&mut candidates, path);
    }
    candidates
}

fn push_unique_path(paths: &mut Vec<String>, path: String) {
    if !paths.iter().any(|item| item.eq_ignore_ascii_case(&path)) {
        paths.push(path);
    }
}

fn detect_local_repository_from_settings(settings_xml_path: &str) -> Option<String> {
    let content = fs::read_to_string(settings_xml_path).ok()?;
    extract_local_repository(&content).map(|value| path_to_string(resolve_maven_path_value(&value)))
}

fn extract_local_repository(content: &str) -> Option<String> {
    let document = roxmltree::Document::parse(content).ok()?;
    let value = document
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == "localRepository")?
        .text()?
        .trim();

    (!value.is_empty()).then(|| value.to_string())
}

fn resolve_maven_path_value(value: &str) -> PathBuf {
    let expanded = expand_maven_path_value(value.trim());
    if expanded == "~" {
        return user_home().unwrap_or_else(|| PathBuf::from(expanded));
    }
    if let Some(rest) = expanded
        .strip_prefix("~/")
        .or_else(|| expanded.strip_prefix("~\\"))
    {
        if let Some(home) = user_home() {
            return home.join(rest);
        }
    }
    PathBuf::from(expanded)
}

fn expand_maven_path_value(value: &str) -> String {
    let mut result = value.to_string();
    if let Some(home) = user_home() {
        let home = home.to_string_lossy();
        result = result.replace("${user.home}", &home);
    }

    for (name, value) in env::vars() {
        result = result.replace(&format!("${{env.{}}}", name), &value);
        result = result.replace(&format!("${{{}}}", name), &value);
    }

    result
}

fn user_home() -> Option<PathBuf> {
    env::var("USERPROFILE")
        .or_else(|_| env::var("HOME"))
        .ok()
        .filter(|home| !home.trim().is_empty())
        .map(PathBuf::from)
}

fn user_m2_path() -> PathBuf {
    user_home()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".m2")
}

fn environment_status(errors: &[String]) -> EnvironmentStatus {
    if errors
        .iter()
        .any(|error| error.contains("JDK") || error.contains("Maven"))
    {
        return EnvironmentStatus::Error;
    }
    if errors.is_empty() {
        EnvironmentStatus::Ok
    } else {
        EnvironmentStatus::Warning
    }
}

fn first_where(program: &str) -> Option<String> {
    let mut command = Command::new("cmd");
    command
        .args(["/C", "where", program])
        .creation_flags(CREATE_NO_WINDOW);
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToOwned::to_owned)
}

fn run_version(program: &str, args: &[&str]) -> Option<String> {
    let mut command = if is_windows_script(program) {
        let mut command = Command::new("cmd");
        command.arg("/C").arg(program);
        command
    } else {
        Command::new(program)
    };
    command.args(args).creation_flags(CREATE_NO_WINDOW);
    let output = command.output().ok()?;
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    combined
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToOwned::to_owned)
}

fn is_windows_script(program: &str) -> bool {
    let extension = PathBuf::from(program)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    extension == "cmd" || extension == "bat"
}

fn path_to_string(path: impl Into<PathBuf>) -> String {
    path.into().to_string_lossy().replace('/', "\\")
}

#[cfg(test)]
mod tests {
    use super::extract_local_repository;

    #[test]
    fn extracts_local_repository_with_namespace() {
        let xml = r#"
            <settings xmlns="http://maven.apache.org/SETTINGS/1.0.0">
              <localRepository>D:\maven-repo</localRepository>
            </settings>
        "#;

        assert_eq!(
            extract_local_repository(xml),
            Some("D:\\maven-repo".to_string())
        );
    }

    #[test]
    fn ignores_blank_local_repository() {
        let xml = r#"
            <settings>
              <localRepository>   </localRepository>
            </settings>
        "#;

        assert_eq!(extract_local_repository(xml), None);
    }

    #[test]
    fn extracts_local_repository_with_comments_and_whitespace() {
        let xml = r#"
            <settings>
              <!-- 本地仓库 -->
              <localRepository>
                ${user.home}/repo
              </localRepository>
            </settings>
        "#;

        assert_eq!(
            extract_local_repository(xml),
            Some("${user.home}/repo".to_string())
        );
    }
}
