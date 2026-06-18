use crate::models::environment::{JdkEntry, JdkSource};
use crate::services::process_utils::CREATE_NO_WINDOW;
use std::env;
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

/// 扫描系统中所有已安装的 JDK
pub fn scan_system_jdks() -> Vec<JdkEntry> {
    let mut entries: Vec<JdkEntry> = Vec::new();
    let mut seen_paths: Vec<PathBuf> = Vec::new();

    // 1. 扫描常见安装目录
    for candidate in common_jdk_dirs() {
        add_if_valid_jdk(candidate, JdkSource::Scan, &mut entries, &mut seen_paths);
    }

    // 2. JAVA_HOME 环境变量
    if let Ok(java_home) = env::var("JAVA_HOME") {
        let path = PathBuf::from(java_home.trim());
        add_if_valid_jdk(path, JdkSource::EnvVar, &mut entries, &mut seen_paths);
    }

    // 3. PATH 中的 java.exe
    if let Some(java_on_path) = first_where("java") {
        let java_path = PathBuf::from(java_on_path);
        // 从 java.exe 回溯到 JDK 根目录
        if let Some(jdk_home) = java_path
            .parent() // bin/
            .and_then(|bin| bin.parent()) // jdk root
            .map(PathBuf::from)
        {
            add_if_valid_jdk(jdk_home, JdkSource::Path, &mut entries, &mut seen_paths);
        }
    }

    entries
}

/// 注册单个 JDK 路径到条目（验证 bin/java.exe 是否存在）
fn add_if_valid_jdk(
    java_home: PathBuf,
    source: JdkSource,
    entries: &mut Vec<JdkEntry>,
    seen_paths: &mut Vec<PathBuf>,
) {
    let java_exe = find_java_exe(&java_home);
    if java_exe.is_none() {
        return;
    }
    // 规范化路径用于去重
    let canonical = normalize_path(&java_home);
    if seen_paths.iter().any(|p| normalize_path(p) == canonical) {
        return;
    }
    seen_paths.push(java_home.clone());

    let version = java_exe
        .as_deref()
        .and_then(|path| run_java_version(&path.to_string_lossy()));
    let major_version = version
        .as_deref()
        .and_then(|v| extract_major_from_version_string(v));
    let vendor = detect_vendor(&java_home);
    let name = generate_jdk_name(&vendor, major_version, &java_home);

    entries.push(JdkEntry {
        id: Uuid::new_v4().to_string(),
        name,
        path: path_to_string(&java_home),
        version,
        major_version,
        vendor,
        is_default: false,
        source,
    });
}

/// 查找 java.exe：支持 java_home/bin/java.exe 和 java_home/java.exe
fn find_java_exe(java_home: &Path) -> Option<PathBuf> {
    let candidates = [
        java_home.join("bin").join("java.exe"),
        java_home.join("java.exe"),
    ];
    candidates.into_iter().find(|p| p.exists())
}

/// 常见 JDK 安装目录（Windows）
fn common_jdk_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let program_files = env::var("ProgramFiles").ok();
    let user_profile = env::var("USERPROFILE").ok();

    if let Some(ref pf) = program_files {
        let pf = PathBuf::from(pf);
        // Oracle JDK / OpenJDK
        scan_subdirs(&pf.join("Java"), &mut dirs, None);
        // Eclipse Adoptium / Temurin
        scan_subdirs(&pf.join("Eclipse Adoptium"), &mut dirs, None);
        // Microsoft Build of OpenJDK
        scan_subdirs(&pf.join("Microsoft"), &mut dirs, Some("jdk-"));
        // Azul Zulu
        scan_subdirs(&pf.join("Zulu"), &mut dirs, None);
        // Amazon Corretto
        scan_subdirs(&pf.join("Amazon Corretto"), &mut dirs, None);
        // BellSoft Liberica
        scan_subdirs(&pf.join("BellSoft"), &mut dirs, Some("LibericaJDK-"));
    }

    if let Some(ref up) = user_profile {
        let up = PathBuf::from(up);
        // Scoop apps
        add_if_dir_exists(&up.join("scoop").join("apps").join("java").join("current"), &mut dirs);
        add_if_dir_exists(&up.join("scoop").join("apps").join("openjdk").join("current"), &mut dirs);
        // IntelliJ IDEA downloaded JDKs
        scan_subdirs(&up.join(".jdks"), &mut dirs, None);
    }

    dirs
}

fn scan_subdirs(dir: &Path, out: &mut Vec<PathBuf>, prefix_filter: Option<&str>) {
    if !dir.exists() || !dir.is_dir() {
        return;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            if let Some(prefix) = prefix_filter {
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("");
                if !name.starts_with(prefix) {
                    continue;
                }
            }
            out.push(path);
        }
    }
}

fn add_if_dir_exists(path: &Path, out: &mut Vec<PathBuf>) {
    if path.exists() && path.is_dir() {
        out.push(path.to_path_buf());
    }
}

/// 执行 java.exe -version 获取版本字符串（第一行）
fn run_java_version(java_exe: &str) -> Option<String> {
    let output = Command::new(java_exe)
        .arg("-version")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
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

/// 从 java -version 输出中提取主版本号
/// "openjdk version \"17.0.9\" 2023-10-17" -> Some(17)
/// "java version \"1.8.0_392\"" -> Some(8)
fn extract_major_from_version_string(version_line: &str) -> Option<u32> {
    // 提取引号内的版本号
    let version = version_line
        .split('"')
        .nth(1)
        .or_else(|| {
            // 没有引号的情况，取第一个空白前的内容
            version_line.split_whitespace().last()
        })?;
    crate::services::pom_parser::parse_java_major(version)
}

/// 从 JDK 目录推断供应商
fn detect_vendor(java_home: &Path) -> Option<String> {
    // 优先读取 release 文件
    if let Some(vendor) = read_vendor_from_release_file(java_home) {
        return Some(vendor);
    }
    // fallback: 路径关键字匹配
    let path_str = java_home.to_string_lossy().to_lowercase();
    if path_str.contains("temurin") || path_str.contains("adoptium") {
        return Some("Eclipse Adoptium".to_string());
    }
    if path_str.contains("zulu") {
        return Some("Azul Systems".to_string());
    }
    if path_str.contains("corretto") {
        return Some("Amazon".to_string());
    }
    if path_str.contains("microsoft") {
        return Some("Microsoft".to_string());
    }
    if path_str.contains("liberica") || path_str.contains("bellsoft") {
        return Some("BellSoft".to_string());
    }
    if path_str.contains("graalvm") {
        return Some("Oracle GraalVM".to_string());
    }
    if path_str.contains("oracle") || path_str.contains("\\java\\") {
        return Some("Oracle".to_string());
    }
    if path_str.contains("openjdk") {
        return Some("OpenJDK".to_string());
    }
    None
}

/// 读取 JDK 的 release 文件中的 IMPLEMENTOR 字段
fn read_vendor_from_release_file(java_home: &Path) -> Option<String> {
    let release_file = java_home.join("release");
    if !release_file.exists() {
        return None;
    }
    let content = fs::read_to_string(&release_file).ok()?;
    for line in content.lines() {
        let line = line.trim();
        if let Some(value) = line.strip_prefix("IMPLEMENTOR=") {
            let vendor = value.trim_matches('"').trim();
            if !vendor.is_empty() {
                return Some(vendor.to_string());
            }
        }
    }
    None
}

/// 生成 JDK 显示名称
fn generate_jdk_name(
    vendor: &Option<String>,
    major: Option<u32>,
    java_home: &Path,
) -> String {
    let mut parts = Vec::new();
    if let Some(ref v) = vendor {
        parts.push(v.clone());
    }
    parts.push("JDK".to_string());
    if let Some(m) = major {
        parts.push(m.to_string());
    } else {
        // fallback: 用目录名
        let dir_name = java_home
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        parts.push(dir_name);
    }
    parts.join(" ")
}

fn normalize_path(path: &Path) -> PathBuf {
    let s = path.to_string_lossy().to_lowercase();
    PathBuf::from(s.trim_end_matches('\\').trim_end_matches('/'))
}

/// 公共接口：推断 JDK 供应商
pub fn detect_vendor_public(java_home: &Path) -> Option<String> {
    detect_vendor(java_home)
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().replace('/', "\\")
}

fn first_where(program: &str) -> Option<String> {
    let output = Command::new("cmd")
        .args(["/C", "where", program])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToOwned::to_owned)
}
