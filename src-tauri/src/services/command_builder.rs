use crate::models::build::BuildCommandPayload;

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
    if !options.profiles.is_empty() {
        args.push(format!("-P{}", options.profiles.join(",")));
    }
    for (key, value) in options.properties {
        let arg = if let Some(bool_value) = value.as_bool() {
            format!("-D{}={}", key, bool_value)
        } else if let Some(string_value) = value.as_str() {
            format!("-D{}={}", key, string_value)
        } else {
            format!("-D{}={}", key, value)
        };
        args.push(arg);
    }
    args.extend(options.custom_args);

    args.join(" ")
}

fn quote_if_needed(value: String) -> String {
    if value.contains(' ') {
        format!("\"{}\"", value)
    } else {
        value
    }
}
