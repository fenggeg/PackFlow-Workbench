use crate::models::environment::{BuildEnvironment, EnvironmentSettings};
use std::env;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn detect_environment(root_path: &str, settings: EnvironmentSettings) -> BuildEnvironment {
    let mut errors = Vec::new();
    let java_home = settings.java_home.or_else(|| env::var("JAVA_HOME").ok());
    let java_path = java_home
        .as_ref()
        .map(|home| PathBuf::from(home).join("bin").join("java.exe"))
        .filter(|path| path.exists())
        .map(path_to_string)
        .or_else(|| first_where("java"));
    let java_version = run_version("java", &["-version"]);

    if java_home.is_none() && java_path.is_none() {
        errors.push("未识别到 JDK，请设置 JAVA_HOME 或手工指定 JDK 路径。".to_string());
    }
    if java_version.is_none() {
        errors.push("无法执行 java -version，请检查 JDK 是否可用。".to_string());
    }

    let saved_maven_home = settings.maven_home.clone();
    let maven_path =
        resolve_maven_path(settings.maven_home.as_deref()).or_else(first_maven_on_path);
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

    let wrapper_path = PathBuf::from(root_path).join("mvnw.cmd");
    let has_maven_wrapper = wrapper_path.exists();
    let settings_xml_path =
        detect_settings_xml(maven_path.as_deref(), saved_maven_home.as_deref());

    BuildEnvironment {
        java_home,
        java_version,
        java_path,
        maven_home: settings.maven_home,
        maven_version,
        maven_path,
        settings_xml_path,
        has_maven_wrapper,
        maven_wrapper_path: has_maven_wrapper.then(|| path_to_string(wrapper_path)),
        use_maven_wrapper: settings.use_maven_wrapper && has_maven_wrapper,
        errors,
    }
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

fn detect_settings_xml(maven_path: Option<&str>, saved_maven_home: Option<&str>) -> Option<String> {
    user_settings_xml()
        .or_else(|| saved_maven_home.and_then(|path| maven_home_settings_xml(&PathBuf::from(path))))
        .or_else(|| maven_path.and_then(|path| maven_home_settings_xml(&PathBuf::from(path))))
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
    let mut command = Command::new(program);
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

fn path_to_string(path: impl Into<PathBuf>) -> String {
    path.into().to_string_lossy().replace('/', "\\")
}
