use crate::error::{to_user_error, AppResult};
use crate::repositories::deployment_repo::ExecutionServerProfile;
use encoding_rs::GBK;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;

pub struct CommandResult {
    pub output: String,
}

pub fn connect(profile: &ExecutionServerProfile) -> AppResult<ExecutionServerProfile> {
    match profile.auth_type.as_str() {
        "password" => {
            ensure_command_exists("plink")?;
            ensure_command_exists("pscp")?;
            if profile.password.as_deref().is_none_or(|value| value.trim().is_empty()) {
                return Err(to_user_error("服务器密码不存在。"));
            }
        }
        "private_key" => {
            ensure_command_exists("ssh")?;
            ensure_command_exists("scp")?;
            let key_path = profile
                .private_key_path
                .as_deref()
                .ok_or_else(|| to_user_error("私钥认证需要提供私钥路径。"))?;
            if !Path::new(key_path).exists() {
                return Err(to_user_error("私钥文件不存在。"));
            }
        }
        _ => return Err(to_user_error("暂不支持的认证方式。")),
    }

    Ok(profile.clone())
}

pub fn execute(profile: &ExecutionServerProfile, command: &str) -> AppResult<CommandResult> {
    let output = match profile.auth_type.as_str() {
        "password" => Command::new("plink")
            .args([
                "-batch",
                "-P",
                &profile.port.to_string(),
                "-l",
                &profile.username,
                "-pw",
                profile
                    .password
                    .as_deref()
                    .ok_or_else(|| to_user_error("服务器密码不存在。"))?,
                &profile.host,
                command,
            ])
            .creation_flags(0x08000000)
            .output(),
        "private_key" => Command::new("ssh")
            .args([
                "-o",
                "BatchMode=yes",
                "-o",
                "StrictHostKeyChecking=no",
                "-p",
                &profile.port.to_string(),
                "-i",
                profile
                    .private_key_path
                    .as_deref()
                    .ok_or_else(|| to_user_error("私钥认证需要提供私钥路径。"))?,
                &format!("{}@{}", profile.username, profile.host),
                command,
            ])
            .creation_flags(0x08000000)
            .output(),
        _ => return Err(to_user_error("暂不支持的认证方式。")),
    }
    .map_err(|error| to_user_error(format!("远端命令执行失败：{}", error)))?;

    parse_output(output, "远端命令执行失败")
}

pub fn upload_file(
    profile: &ExecutionServerProfile,
    local_path: &Path,
    remote_path: &str,
) -> AppResult<()> {
    if !local_path.exists() {
        return Err(to_user_error("本地产物不存在。"));
    }

    let output = match profile.auth_type.as_str() {
        "password" => Command::new("pscp")
            .args([
                "-batch",
                "-P",
                &profile.port.to_string(),
                "-l",
                &profile.username,
                "-pw",
                profile
                    .password
                    .as_deref()
                    .ok_or_else(|| to_user_error("服务器密码不存在。"))?,
                &local_path.to_string_lossy(),
                &format!("{}@{}:{}", profile.username, profile.host, remote_path),
            ])
            .creation_flags(0x08000000)
            .output(),
        "private_key" => Command::new("scp")
            .args([
                "-o",
                "BatchMode=yes",
                "-o",
                "StrictHostKeyChecking=no",
                "-P",
                &profile.port.to_string(),
                "-i",
                profile
                    .private_key_path
                    .as_deref()
                    .ok_or_else(|| to_user_error("私钥认证需要提供私钥路径。"))?,
                &local_path.to_string_lossy(),
                &format!("{}@{}:{}", profile.username, profile.host, remote_path),
            ])
            .creation_flags(0x08000000)
            .output(),
        _ => return Err(to_user_error("暂不支持的认证方式。")),
    }
    .map_err(|error| to_user_error(format!("无法上传产物到远端：{}", error)))?;

    parse_output(output, "上传产物失败")?;
    Ok(())
}

fn ensure_command_exists(command: &str) -> AppResult<()> {
    let output = Command::new("where")
        .arg(command)
        .creation_flags(0x08000000)
        .output()
        .map_err(|error| to_user_error(format!("无法检查本地 {} 命令：{}", command, error)))?;
    if !output.status.success() {
        return Err(to_user_error(format!(
            "本机未找到 {} 命令，请先安装对应的 SSH 客户端工具。",
            command
        )));
    }
    Ok(())
}

fn parse_output(output: std::process::Output, fallback: &str) -> AppResult<CommandResult> {
    let combined = format!(
        "{}{}",
        decode_output(&output.stdout),
        decode_output(&output.stderr)
    )
    .trim()
    .to_string();
    if !output.status.success() {
        return Err(to_user_error(if combined.is_empty() {
            fallback.to_string()
        } else {
            combined
        }));
    }
    Ok(CommandResult { output: combined })
}

fn decode_output(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    String::from_utf8(bytes.to_vec()).unwrap_or_else(|_| {
        let (value, _, _) = GBK.decode(bytes);
        value.into_owned()
    })
}
