use super::deployment_common::DeploymentContext;

pub fn expand_tokens(value: &str, context: &DeploymentContext) -> String {
    let now = chrono::Local::now();
    let today = now.format("%Y%m%d").to_string();
    let timestamp = now.format("%Y%m%d%H%M%S").to_string();
    let java_bin = context.java_bin_path.as_deref().unwrap_or("java");
    let jvm_opts = context.jvm_options.as_deref().unwrap_or("");
    let profile_arg = match &context.spring_profile {
        Some(p) if !p.trim().is_empty() => format!("--spring.profiles.active={}", p),
        _ => String::new(),
    };
    let extra = context.extra_args.as_deref().unwrap_or("");
    let service_dir = context
        .working_dir
        .as_deref()
        .unwrap_or(&context.remote_deploy_path);
    let base_name = context
        .remote_artifact_name
        .rsplit_once('.')
        .map(|(n, _)| n)
        .unwrap_or(&context.remote_artifact_name);
    let log_name_resolved = resolve_log_name(context, base_name, &today);
    let log_file = resolve_log_file(context, base_name, &today, &timestamp);
    let log_dir = log_file
        .rsplit_once('/')
        .map(|(dir, _)| dir)
        .unwrap_or(&context.remote_deploy_path)
        .to_string();
    let pid_file = format!("{}/{}.pid", context.remote_deploy_path, base_name);
    let log_path_file = format!(
        "{}/.packflow/{}.log.path",
        context.remote_deploy_path, base_name
    );
    let port_probe_port = context
        .port_probe_port
        .map(|port| port.to_string())
        .unwrap_or_default();
    let remote_temp_dir = context
        .frontend_remote_temp_dir
        .as_deref()
        .unwrap_or(&context.remote_deploy_path);
    let frontend_entry_file = context
        .frontend_entry_file
        .as_deref()
        .unwrap_or("index.html");
    let frontend_reload_command = context.frontend_reload_command.as_deref().unwrap_or("");
    let frontend_verify_url = context.frontend_verify_url.as_deref().unwrap_or("");
    let frontend_verify_codes = context
        .frontend_verify_expected_status_codes
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let frontend_verify_body = context
        .frontend_verify_expected_body_contains
        .as_deref()
        .unwrap_or("");
    let frontend_release_dir = context.frontend_release_dir.as_deref().unwrap_or("");
    let frontend_releases_dir = context.frontend_releases_dir.as_deref().unwrap_or("");
    let frontend_current_link_path = context
        .frontend_current_link_path
        .as_deref()
        .unwrap_or("");
    let frontend_keep_releases = context
        .frontend_keep_releases
        .map(|value| value.to_string())
        .unwrap_or_else(|| "5".to_string());
    let frontend_backup_dir = context.frontend_backup_dir.as_deref().unwrap_or("");
    let resolved_upload_path = if uses_privilege(context) {
        value
            .replace(
                "${remoteDeployPath}/.${artifactName}.uploading",
                &context.remote_upload_path,
            )
            .replace(
                "${remoteDeployPath}/.${remoteArtifactName}.uploading",
                &context.remote_upload_path,
            )
            .replace(
                "${remoteDeployPath}/.${remoteArtifactBaseName}.uploading",
                &context.remote_upload_path,
            )
    } else {
        value.to_string()
    };
    resolved_upload_path
        .replace("${remoteArtifactName%.*}", base_name)
        .replace("${artifactName%.*}", artifact_base_name(context))
        .replace("${artifactPath}", &context.artifact_path)
        .replace("${artifactName}", &context.artifact_name)
        .replace("${remoteArtifactName}", &context.remote_artifact_name)
        .replace("${remoteArtifactBaseName}", base_name)
        .replace("${remoteDeployPath}", &context.remote_deploy_path)
        .replace("${remoteSiteDir}", &context.remote_deploy_path)
        .replace("${remoteTempDir}", remote_temp_dir)
        .replace("${remoteUploadDir}", &context.remote_upload_dir)
        .replace("${remoteUploadPath}", &context.remote_upload_path)
        .replace("${deploymentId}", &context.deployment_id)
        .replace("${localArtifactSize}", &context.artifact_size.to_string())
        .replace("${entryFile}", frontend_entry_file)
        .replace("${reloadCommand}", frontend_reload_command)
        .replace("${verifyUrl}", frontend_verify_url)
        .replace("${verifyExpectedStatusCodes}", &frontend_verify_codes)
        .replace("${verifyExpectedBodyContains}", frontend_verify_body)
        .replace("${releaseDir}", frontend_release_dir)
        .replace("${releasesDir}", frontend_releases_dir)
        .replace("${currentLinkPath}", frontend_current_link_path)
        .replace("${keepReleases}", &frontend_keep_releases)
        .replace("${remoteBackupDir}", frontend_backup_dir)
        .replace("${loginUser}", &context.login_user)
        .replace("${runAsUser}", &context.privilege.run_as_user)
        .replace("${date}", &today)
        .replace("${timestamp}", &timestamp)
        .replace("${logName}", &log_name_resolved)
        .replace("${logFile}", &log_file)
        .replace("${logDir}", &log_dir)
        .replace("${logPathFile}", &log_path_file)
        .replace("${javaBin}", java_bin)
        .replace("${jvmOptions}", jvm_opts)
        .replace("${springProfile}", &profile_arg)
        .replace("${extraArgs}", extra)
        .replace("${serviceDir}", service_dir)
        .replace("${pidFile}", &pid_file)
        .replace("${portProbePort}", &port_probe_port)
}

pub fn artifact_base_name(context: &DeploymentContext) -> &str {
    context
        .artifact_name
        .rsplit_once('.')
        .map(|(n, _)| n)
        .unwrap_or(&context.artifact_name)
}

pub fn resolve_log_name(context: &DeploymentContext, base_name: &str, today: &str) -> String {
    match context.log_naming_mode.as_str() {
        "fixed" => context
            .log_name
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(base_name)
            .to_string(),
        _ => format!("{}-{}", base_name, today),
    }
}

pub fn resolve_log_file(
    context: &DeploymentContext,
    base_name: &str,
    today: &str,
    timestamp: &str,
) -> String {
    if let Some(custom) = context
        .log_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        let resolved = custom
            .replace("${remoteDeployPath}", &context.remote_deploy_path)
            .replace("${artifactName}", &context.artifact_name)
            .replace("${artifactName%.*}", artifact_base_name(context))
            .replace("${remoteArtifactName}", &context.remote_artifact_name)
            .replace("${remoteArtifactName%.*}", base_name)
            .replace("${remoteArtifactBaseName}", base_name)
            .replace("${date}", today)
            .replace("${timestamp}", timestamp)
            .replace("${logName}", &resolve_log_name(context, base_name, today));

        if is_explicit_log_file(&resolved) {
            return resolved;
        }

        return format!(
            "{}/{}.log",
            resolved.trim_end_matches('/'),
            resolve_log_name(context, base_name, today)
        );
    }

    format!(
        "{}/logs/{}.log",
        context.remote_deploy_path,
        resolve_log_name(context, base_name, today)
    )
}

pub fn is_explicit_log_file(path: &str) -> bool {
    path.trim_end()
        .rsplit_once('/')
        .map(|(_, name)| name)
        .unwrap_or(path)
        .to_ascii_lowercase()
        .ends_with(".log")
}

pub fn normalize_remote_dir(value: &str) -> String {
    let trimmed = value.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        ".".to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn resolve_upload_temp_dir(
    template: &str,
    deployment_id: &str,
    login_user: &str,
    run_as_user: &str,
    remote_artifact_name: &str,
) -> String {
    let login_home = default_login_home(login_user);
    let artifact_base = remote_artifact_name
        .rsplit_once('.')
        .map(|(name, _)| name)
        .unwrap_or(remote_artifact_name);
    let resolved = template
        .replace("${deploymentId}", deployment_id)
        .replace("${loginUser}", login_user)
        .replace("${loginHome}", &login_home)
        .replace("${runAsUser}", run_as_user)
        .replace("${remoteArtifactName}", remote_artifact_name)
        .replace("${remoteArtifactBaseName}", artifact_base);
    normalize_remote_dir(&expand_home_dir(&resolved, &login_home))
}

pub fn default_login_home(login_user: &str) -> String {
    let user = login_user.trim();
    if user == "root" {
        "/root".to_string()
    } else if user.is_empty() {
        "/tmp".to_string()
    } else {
        format!("/home/{}", user)
    }
}

pub fn expand_home_dir(path: &str, login_home: &str) -> String {
    match path.trim() {
        "~" => login_home.to_string(),
        value if value.starts_with("~/") => format!("{}{}", login_home, &value[1..]),
        value => value.to_string(),
    }
}

fn uses_privilege(context: &DeploymentContext) -> bool {
    context.privilege.mode.trim() != "none"
}
