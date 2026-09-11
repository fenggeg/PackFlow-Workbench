use crate::models::build::BuildCommandPayload;
use crate::models::environment::EnvironmentSource;

pub fn build_command_preview(payload: BuildCommandPayload) -> String {
    let options = payload.options;
    let environment = payload.environment;
    let executable = if environment.use_maven_wrapper && environment.has_maven_wrapper {
        "mvnw.cmd".to_string()
    } else {
        environment
            .maven_path
            .or(environment.maven_home)
            .map(quote_if_needed)
            .unwrap_or_else(|| "mvn.cmd".to_string())
    };

    let mut args = Vec::new();
    args.push(executable);

    if options.goals.is_empty() {
        args.push("package".to_string());
    } else {
        args.extend(options.goals);
    }

    if !options.selected_module_path.trim().is_empty() {
        args.push("-pl".to_string());
        args.push(quote_if_needed(options.selected_module_path));
    }

    if options.also_make {
        args.push("-am".to_string());
    }
    if options.skip_tests {
        args.push("-Dmaven.test.skip=true".to_string());
    }
    if matches!(environment.settings_xml_source, EnvironmentSource::Manual) {
        if let Some(settings_xml_path) = environment.settings_xml_path {
            args.push("-s".to_string());
            args.push(quote_if_needed(settings_xml_path));
        }
    }
    if matches!(environment.local_repo_source, EnvironmentSource::Manual) {
        if let Some(local_repo_path) = environment.local_repo_path {
            args.push(format!(
                "-Dmaven.repo.local={}",
                quote_if_needed(local_repo_path)
            ));
        }
    }
    if !options.profiles.is_empty() {
        args.push(format!("-P{}", quote_if_needed(options.profiles.join(","))));
    }
    for (key, value) in options.properties {
        let raw = if let Some(bool_value) = value.as_bool() {
            format!("-D{}={}", key, bool_value)
        } else if let Some(string_value) = value.as_str() {
            format!("-D{}={}", key, string_value)
        } else {
            format!("-D{}={}", key, value)
        };
        // 整体按需要加引号，避免 key/value 中的空格与 cmd 元字符被解释
        args.push(quote_if_needed(raw));
    }
    args.extend(options.custom_args);

    args.join(" ")
}

fn quote_if_needed(value: String) -> String {
    if value.is_empty()
        || value
            .chars()
            .any(|c| matches!(c, ' ' | '\t' | '"' | '&' | '|' | '<' | '>' | '^' | '%' | '(' | ')'))
    {
        // Windows cmd 双引号内：内嵌 " 转义为 ""
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value
    }
}
