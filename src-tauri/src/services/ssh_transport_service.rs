use crate::error::{to_user_error, AppResult};
use crate::models::deployment::ServerPrivilegeConfig;
use crate::repositories::deployment_repo::ExecutionServerProfile;
use crate::services::process_utils::{shell_quote, SSH_ENC_ALGORITHMS, SSH_KEX_ALGORITHMS, SSH_PUBKEY_ALGORITHMS, SSH_TIMEOUT_SECS, SSH_CONNECT_TIMEOUT_SECS};
use encoding_rs::GBK;
use ssh2::Session;
use std::collections::HashMap;
use std::fs::File;
use std::io::{ErrorKind, Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub struct CommandResult {
    pub output: String,
    pub exit_status: i32,
}

pub struct SshConnection {
    session: ssh::LocalSession<TcpStream>,
    sftp_session: Option<Arc<Mutex<SftpSession>>>,
    pub command_session: Option<Arc<Mutex<Session>>>,
    privilege: Option<PrivilegeCommandConfig>,
}

#[derive(Clone)]
struct PrivilegeCommandConfig {
    mode: String,
    run_as_user: String,
    shell: String,
    custom_wrapper: Option<String>,
    password: Option<String>,
}

pub struct SftpSession {
    #[allow(dead_code)]
    session: Session,
    sftp: ssh2::Sftp,
}

impl SshConnection {
    pub fn connect<C>(profile: &ExecutionServerProfile, mut is_cancelled: C) -> AppResult<Self>
    where
        C: FnMut() -> bool,
    {
        if is_cancelled() {
            return Err(to_user_error("部署已停止。"));
        }
        let session = match profile.auth_type.as_str() {
            "password" => {
                if profile
                    .password
                    .as_deref()
                    .is_none_or(|value| value.trim().is_empty())
                {
                    return Err(to_user_error("服务器密码不存在。"));
                }
                open_password_session(profile, &mut is_cancelled)?
            }
            "private_key" => {
                let key_path = profile
                    .private_key_path
                    .as_deref()
                    .ok_or_else(|| to_user_error("私钥认证需要提供私钥路径。"))?;
                if !Path::new(key_path).exists() {
                    return Err(to_user_error("私钥文件不存在。"));
                }
                open_private_key_session(profile, &mut is_cancelled)?
            }
            _ => return Err(to_user_error("暂不支持的认证方式。")),
        };

        let sftp_session = match open_sftp_session(profile) {
            Ok(session) => {
                eprintln!("[SSH] SFTP 会话创建成功");
                Some(session)
            },
            Err(error) => {
                eprintln!("[SSH] SFTP 会话创建失败: {}", error);
                None
            },
        };
        let command_session = match open_ssh2_session(profile) {
            Ok(session) => Some(session),
            Err(_) => None,
        };

        Ok(Self {
            session,
            sftp_session,
            command_session,
            privilege: None,
        })
    }

    pub fn configure_privilege(
        &mut self,
        config: &ServerPrivilegeConfig,
        password: Option<String>,
    ) {
        self.privilege = if config.mode.trim() == "none" {
            None
        } else {
            Some(PrivilegeCommandConfig {
                mode: config.mode.clone(),
                run_as_user: config.run_as_user.clone(),
                shell: config.shell.clone(),
                custom_wrapper: config.custom_wrapper.clone(),
                password,
            })
        };
    }

    pub fn execute_with_cancel<C>(
        &mut self,
        command: &str,
        mut is_cancelled: C,
    ) -> AppResult<CommandResult>
    where
        C: FnMut() -> bool,
    {
        self.execute_allowing_status(command, &[], &mut is_cancelled)
    }

    pub fn execute_allowing_status<C>(
        &mut self,
        command: &str,
        success_exit_codes: &[i32],
        mut is_cancelled: C,
    ) -> AppResult<CommandResult>
    where
        C: FnMut() -> bool,
    {
        if is_cancelled() {
            return Err(to_user_error("部署已停止。"));
        }

        let mut channel = self
            .session
            .open_exec()
            .map_err(|error| to_user_error(format!("无法打开 SSH 命令通道：{}", error)))?;

        channel
            .exec_command(command)
            .map_err(|error| to_user_error(format!("远端命令执行失败：{}", error)))?;

        let stdout = channel
            .get_output()
            .map_err(|error| to_user_error(format!("读取命令输出失败：{}", error)))?;

        let exit_status = channel
            .exit_status()
            .map_err(|error| to_user_error(format!("读取远端命令退出码失败：{}", error)))?
            as i32;

        parse_command_bytes(
            stdout,
            Vec::new(),
            exit_status,
            success_exit_codes,
            "远端命令执行失败",
        )
    }

    pub fn execute_allowing_status_with_input<C>(
        &mut self,
        command: &str,
        stdin: Option<&str>,
        success_exit_codes: &[i32],
        mut is_cancelled: C,
    ) -> AppResult<CommandResult>
    where
        C: FnMut() -> bool,
    {
        if stdin.is_none() {
            return self.execute_allowing_status(command, success_exit_codes, is_cancelled);
        }
        if is_cancelled() {
            return Err(to_user_error("部署已停止。"));
        }
        let session = self
            .command_session
            .as_ref()
            .ok_or_else(|| to_user_error("当前 SSH 连接不支持带输入的提权命令。"))?;
        execute_via_ssh2(
            session,
            command,
            stdin.unwrap_or_default(),
            success_exit_codes,
        )
    }

    pub fn execute_privileged_with_cancel<C>(
        &mut self,
        command: &str,
        is_cancelled: C,
    ) -> AppResult<CommandResult>
    where
        C: FnMut() -> bool,
    {
        let Some(privilege) = self.privilege.clone() else {
            return self.execute_with_cancel(command, is_cancelled);
        };
        let (wrapped, stdin) = wrap_privileged_command(&privilege, command)?;
        self.execute_allowing_status_with_input(&wrapped, stdin.as_deref(), &[0], is_cancelled)
    }

    pub fn stream_privileged_with_cancel<C, L>(
        &mut self,
        command: &str,
        is_cancelled: C,
        on_line: L,
    ) -> AppResult<i32>
    where
        C: FnMut() -> bool,
        L: FnMut(String),
    {
        let Some(privilege) = self.privilege.clone() else {
            return self.stream_with_cancel(command, is_cancelled, on_line);
        };
        let (wrapped, stdin) = wrap_privileged_command(&privilege, command)?;
        self.stream_command_with_input(&wrapped, stdin.as_deref(), is_cancelled, on_line)
    }

    pub fn stream_with_cancel<C, L>(
        &mut self,
        command: &str,
        is_cancelled: C,
        on_line: L,
    ) -> AppResult<i32>
    where
        C: FnMut() -> bool,
        L: FnMut(String),
    {
        self.stream_command_with_input(command, None, is_cancelled, on_line)
    }

    fn stream_command_with_input<C, L>(
        &mut self,
        command: &str,
        stdin: Option<&str>,
        mut is_cancelled: C,
        mut on_line: L,
    ) -> AppResult<i32>
    where
        C: FnMut() -> bool,
        L: FnMut(String),
    {
        if is_cancelled() {
            return Err(to_user_error("远程会话已停止。"));
        }

        // 如果 command_session 不可用，使用主会话作为回退
        let Some(session_arc) = self.command_session.as_ref() else {
            return self.stream_via_primary_session(command, stdin, is_cancelled, on_line);
        };

        let session = session_arc
            .lock()
            .map_err(|_| to_user_error("无法获取 SSH2 命令会话锁。"))?;
        let mut channel = session
            .channel_session()
            .map_err(|error| to_user_error(format!("无法打开 SSH2 命令通道：{}", error)))?;
        channel
            .exec(command)
            .map_err(|error| to_user_error(format!("远端命令执行失败：{}", error)))?;
        if let Some(input) = stdin {
            channel
                .write_all(input.as_bytes())
                .map_err(|error| to_user_error(format!("写入提权命令输入失败：{}", error)))?;
            channel
                .send_eof()
                .map_err(|error| to_user_error(format!("关闭提权命令输入失败：{}", error)))?;
        }
        session.set_blocking(false);

        let mut pending = Vec::<u8>::new();
        let mut buffer = [0u8; 4096];

        loop {
            if is_cancelled() {
                let _ = channel.close();
                break;
            }

            match channel.read(&mut buffer) {
                Ok(0) => {
                    if channel.eof() {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(120));
                }
                Ok(size) => {
                    pending.extend_from_slice(&buffer[..size]);
                    emit_complete_lines(&mut pending, &mut on_line);
                }
                Err(error) if error.kind() == ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(120));
                }
                Err(error) => {
                    return Err(to_user_error(format!("读取远程实时输出失败：{}", error)));
                }
            }

            let mut stderr = channel.stderr();
            loop {
                match stderr.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(size) => {
                        pending.extend_from_slice(&buffer[..size]);
                        emit_complete_lines(&mut pending, &mut on_line);
                    }
                    Err(error) if error.kind() == ErrorKind::WouldBlock => break,
                    Err(error) => {
                        return Err(to_user_error(format!("读取远程错误输出失败：{}", error)));
                    }
                }
            }

            if channel.eof() {
                break;
            }
        }

        if !pending.is_empty() {
            on_line(decode_output(&pending));
        }

        let _ = channel.wait_close();
        let exit_status = channel.exit_status().unwrap_or(0);
        session.set_blocking(true);
        Ok(exit_status)
    }

    fn stream_via_primary_session<C, L>(
        &mut self,
        command: &str,
        _stdin: Option<&str>,
        mut is_cancelled: C,
        mut on_line: L,
    ) -> AppResult<i32>
    where
        C: FnMut() -> bool,
        L: FnMut(String),
    {
        if is_cancelled() {
            return Err(to_user_error("远程会话已停止。"));
        }

        let wrapped_command = if let Some(privilege) = self.privilege.clone() {
            let (wrapped, _) = wrap_privileged_command(&privilege, command)?;
            wrapped
        } else {
            command.to_string()
        };

        let mut channel = self
            .session
            .open_exec()
            .map_err(|error| to_user_error(format!("无法打开 SSH 命令通道：{}", error)))?;

        channel
            .exec_command(&wrapped_command)
            .map_err(|error| to_user_error(format!("远端命令执行失败：{}", error)))?;

        let output = channel
            .get_output()
            .map_err(|error| to_user_error(format!("读取命令输出失败：{}", error)))?;

        if !output.is_empty() {
            let output_str = decode_output(&output);
            for line in output_str.lines() {
                if !line.trim().is_empty() {
                    on_line(line.to_string());
                }
            }
        }

        let exit_status = channel
            .exit_status()
            .map_err(|error| to_user_error(format!("读取远端命令退出码失败：{}", error)))?
            as i32;

        Ok(exit_status)
    }

    #[allow(dead_code)]
    pub fn download_file_with_progress<C, P>(
        &mut self,
        remote_path: &str,
        local_path: &Path,
        mut is_cancelled: C,
        mut on_progress: P,
    ) -> AppResult<()>
    where
        C: FnMut() -> bool,
        P: FnMut(u64, u64, Option<f64>),
    {
        let sftp_arc = self
            .sftp_session
            .as_ref()
            .ok_or_else(|| to_user_error("SFTP 不可用，无法下载文件。"))?;

        let sftp_guard = sftp_arc
            .lock()
            .map_err(|_| to_user_error("无法获取 SFTP 锁。"))?;

        let remote = std::path::Path::new(remote_path);
        let mut sftp_file = sftp_guard
            .sftp
            .open(remote)
            .map_err(|error| to_user_error(format!("SFTP 打开远程文件失败：{}", error)))?;

        let stat = sftp_file
            .stat()
            .map_err(|error| to_user_error(format!("SFTP 获取远程文件信息失败：{}", error)))?;
    let file_size = stat.size.unwrap_or(0);

        // 确保本地目录存在
        if let Some(parent) = local_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let mut local_file = File::create(local_path)
            .map_err(|error| to_user_error(format!("无法创建本地文件：{}", error)))?;

        let mut buffer = [0u8; 256 * 1024];
        let mut downloaded: u64 = 0;
        let start_time = Instant::now();
        let mut last_progress_time = Instant::now();
        let mut last_downloaded: u64 = 0;

        loop {
            if is_cancelled() {
                return Err(to_user_error("下载已取消。"));
            }

            let bytes_read = sftp_file
                .read(&mut buffer)
                .map_err(|error| to_user_error(format!("SFTP 读取远程文件失败：{}", error)))?;

            if bytes_read == 0 {
                break;
            }

            local_file
                .write_all(&buffer[..bytes_read])
                .map_err(|error| to_user_error(format!("写入本地文件失败：{}", error)))?;

            downloaded += bytes_read as u64;

            let now = Instant::now();
            let speed = if now.duration_since(last_progress_time) >= Duration::from_millis(200) {
                let elapsed_secs = now.duration_since(last_progress_time).as_secs_f64();
                let bytes_delta = downloaded.saturating_sub(last_downloaded) as f64;
                let speed = if elapsed_secs > 0.0 {
                    Some(bytes_delta / elapsed_secs)
                } else {
                    None
                };
                last_progress_time = now;
                last_downloaded = downloaded;
                speed
            } else {
                let total_elapsed = start_time.elapsed().as_secs_f64();
                if total_elapsed > 0.0 {
                    Some(downloaded as f64 / total_elapsed)
                } else {
                    None
                }
            };

            on_progress(downloaded, file_size, speed);
        }

        drop(local_file);
        drop(sftp_file);
        drop(sftp_guard);

        on_progress(file_size, file_size, None);
        Ok(())
    }

    pub fn upload_file_with_progress<C, P>(
        &mut self,
        local_path: &Path,
        remote_path: &str,
        mut is_cancelled: C,
        mut on_progress: P,
    ) -> AppResult<()>
    where
        C: FnMut() -> bool,
        P: FnMut(u64, u64, Option<f64>),
    {
        if !local_path.exists() {
            return Err(to_user_error("本地产物不存在。"));
        }

        let mut local_file = File::open(local_path)
            .map_err(|error| to_user_error(format!("无法打开本地产物：{}", error)))?;
        let file_size = local_file
            .metadata()
            .map_err(|error| to_user_error(format!("无法读取本地产物信息：{}", error)))?
            .len();

        let remote_dir = Path::new(remote_path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "/tmp".to_string());

        if let Some(cmd_session) = &self.command_session {
            let guard = cmd_session.lock().map_err(|_| to_user_error("无法获取命令会话锁。"))?;
            let mut channel = guard.channel_session().map_err(|error| to_user_error(format!("无法打开命令通道：{}", error)))?;
            let mkdir_cmd = format!("mkdir -p {}", shell_quote(&remote_dir));
            channel.exec(&mkdir_cmd).map_err(|error| to_user_error(format!("创建远端目录失败：{}", error)))?;
            eprintln!("[上传] 确保远程目录存在: {}", remote_dir);
            let _ = channel.send_eof();
            let _ = channel.wait_eof();
            let _ = channel.wait_close();
        } else {
            eprintln!("[上传] 警告: 无命令会话，跳过目录检查");
        }

        let use_sftp = self.sftp_session.is_some();
        eprintln!("[上传] 使用 {} 方式上传", if use_sftp { "SFTP" } else { "Base64" });

        if let Some(sftp_arc) = &self.sftp_session {
            upload_via_sftp(
                sftp_arc,
                &mut local_file,
                remote_path,
                file_size,
                &mut is_cancelled,
                &mut on_progress,
            )
        } else {
            upload_via_base64(
                &mut self.session,
                &mut local_file,
                remote_path,
                &remote_dir,
                file_size,
                &mut is_cancelled,
                &mut on_progress,
            )
        }
    }
}

fn open_sftp_session(profile: &ExecutionServerProfile) -> AppResult<Arc<Mutex<SftpSession>>> {
    eprintln!("[SFTP] 创建新的 SSH 连接用于 SFTP...");
    let session = open_ssh2_session(profile)?;

    eprintln!("[SFTP] 创建 SFTP 通道...");
    let sftp = {
        let guard = session
            .lock()
            .map_err(|_| to_user_error("无法获取 SFTP 会话锁。"))?;
        guard
            .sftp()
            .map_err(|error| to_user_error(format!("创建 SFTP 通道失败：{}", error)))?
    };

    eprintln!("[SFTP] SFTP 通道创建成功");
    let session = Arc::try_unwrap(session)
        .map_err(|_| to_user_error("无法初始化 SFTP 会话。"))?
        .into_inner()
        .map_err(|_| to_user_error("无法获取 SFTP 会话。"))?;

    Ok(Arc::new(Mutex::new(SftpSession { session, sftp })))
}

fn open_ssh2_session(profile: &ExecutionServerProfile) -> AppResult<Arc<Mutex<Session>>> {
    let tcp = TcpStream::connect((&profile.host as &str, profile.port))
        .map_err(|error| to_user_error(format!("SSH2 TCP 连接失败：{}", error)))?;
    tcp.set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|error| to_user_error(format!("设置 SSH2 超时失败：{}", error)))?;
    tcp.set_write_timeout(Some(Duration::from_secs(30)))
        .map_err(|error| to_user_error(format!("设置 SSH2 超时失败：{}", error)))?;

    let mut session =
        Session::new().map_err(|error| to_user_error(format!("创建 SSH2 会话失败：{}", error)))?;
    session.set_tcp_stream(tcp);
    session
        .handshake()
        .map_err(|error| to_user_error(format!("SSH2 握手失败：{}", error)))?;

    match profile.auth_type.as_str() {
        "password" => {
            let password = profile
                .password
                .as_deref()
                .ok_or_else(|| to_user_error("服务器密码不存在。"))?;
            session
                .userauth_password(&profile.username, password)
                .map_err(|error| to_user_error(format!("SSH2 密码认证失败：{}", error)))?;
        }
        "private_key" => {
            let key_path = profile
                .private_key_path
                .as_deref()
                .ok_or_else(|| to_user_error("私钥认证需要提供私钥路径。"))?;
            session
                .userauth_pubkey_file(&profile.username, None, Path::new(key_path), None)
                .map_err(|error| to_user_error(format!("SSH2 私钥认证失败：{}", error)))?;
        }
        _ => return Err(to_user_error("暂不支持的认证方式。")),
    }

    if !session.authenticated() {
        return Err(to_user_error("SSH2 认证未通过。"));
    }

    Ok(Arc::new(Mutex::new(session)))
}

fn upload_via_sftp<C, P>(
    sftp_arc: &Arc<Mutex<SftpSession>>,
    local_file: &mut File,
    remote_path: &str,
    file_size: u64,
    is_cancelled: &mut C,
    on_progress: &mut P,
) -> AppResult<()>
where
    C: FnMut() -> bool,
    P: FnMut(u64, u64, Option<f64>),
{
    eprintln!("[SFTP] 开始上传，文件大小: {} bytes", file_size);
    
    let sftp_guard = sftp_arc
        .lock()
        .map_err(|_| to_user_error("无法获取 SFTP 锁。"))?;

    let remote = std::path::Path::new(remote_path);
    eprintln!("[SFTP] 创建远程文件: {}", remote_path);
    let mut sftp_file = sftp_guard
        .sftp
        .create(remote)
        .map_err(|error| to_user_error(format!("SFTP 创建远程文件失败：{}", error)))?;

    let mut buffer = [0u8; 256 * 1024];
    let mut uploaded: u64 = 0;
    let start_time = Instant::now();
    let mut last_progress_time = Instant::now();
    let mut last_uploaded: u64 = 0;
    let mut chunk_count: u64 = 0;

    loop {
        if is_cancelled() {
            return Err(to_user_error("部署已停止。"));
        }

        let bytes_read = local_file
            .read(&mut buffer)
            .map_err(|error| to_user_error(format!("读取本地文件失败：{}", error)))?;

        if bytes_read == 0 {
            break;
        }

        chunk_count += 1;
        if chunk_count % 100 == 0 {
            eprintln!("[SFTP] 已上传 {} chunks, 共 {} bytes", chunk_count, uploaded);
        }

        sftp_file
            .write_all(&buffer[..bytes_read])
            .map_err(|error| to_user_error(format!("SFTP 写入远程文件失败：{}", error)))?;

        uploaded += bytes_read as u64;

        let now = Instant::now();
        let speed = if now.duration_since(last_progress_time) >= Duration::from_millis(200) {
            let elapsed_secs = now.duration_since(last_progress_time).as_secs_f64();
            let bytes_delta = uploaded.saturating_sub(last_uploaded) as f64;
            let speed = if elapsed_secs > 0.0 {
                Some(bytes_delta / elapsed_secs)
            } else {
                None
            };
            last_progress_time = now;
            last_uploaded = uploaded;
            speed
        } else {
            let total_elapsed = start_time.elapsed().as_secs_f64();
            if total_elapsed > 0.0 {
                Some(uploaded as f64 / total_elapsed)
            } else {
                None
            }
        };

        on_progress(uploaded, file_size, speed);
    }

    // 显式关闭远程文件句柄，确保服务端提交文件
    // 使用 drop() 会静默忽略 close 错误，导致文件实际未写入
    sftp_file
        .close()
        .map_err(|error| to_user_error(format!("SFTP 关闭远程文件失败：{}", error)))?;
    drop(sftp_guard);

    on_progress(file_size, file_size, None);
    Ok(())
}

fn upload_via_base64<C, P>(
    session: &mut ssh::LocalSession<TcpStream>,
    local_file: &mut File,
    remote_path: &str,
    remote_dir: &str,
    file_size: u64,
    is_cancelled: &mut C,
    on_progress: &mut P,
) -> AppResult<()>
where
    C: FnMut() -> bool,
    P: FnMut(u64, u64, Option<f64>),
{
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

    let mut buffer = Vec::new();
    local_file
        .read_to_end(&mut buffer)
        .map_err(|error| to_user_error(format!("读取本地产物失败：{}", error)))?;

    let encoded = BASE64.encode(&buffer);
    let chunk_size = 512 * 1024;
    let temp_b64 = format!("{}/.upload.b64", remote_dir);
    let quoted_temp_b64 = shell_quote(&temp_b64);
    let quoted_remote_path = shell_quote(remote_path);
    let start_time = Instant::now();
    let mut last_progress_time = Instant::now();
    let mut last_uploaded: u64 = 0;

    if encoded.len() > 100 * 1024 {
        let mut clear_channel = session
            .open_exec()
            .map_err(|error| to_user_error(format!("无法打开 SSH 命令通道：{}", error)))?;
        let clear_cmd = format!("> {}", quoted_temp_b64);
        clear_channel.exec_command(&clear_cmd).ok();
        let _ = clear_channel.get_output();

        let chunks: Vec<&[u8]> = encoded.as_bytes().chunks(chunk_size).collect();
        let encoded_len = encoded.len().max(1) as f64;

        for (i, chunk) in chunks.into_iter().enumerate() {
            if is_cancelled() {
                return Err(to_user_error("部署已停止。"));
            }

            let chunk_str = String::from_utf8_lossy(chunk);
            let heredoc_marker = format!("__CHUNK_{}__", i);
            let append_cmd = format!(
                "cat >> {} << '{}'\n{}\n{}",
                quoted_temp_b64, heredoc_marker, chunk_str, heredoc_marker
            );

            let mut chunk_channel = session
                .open_exec()
                .map_err(|error| to_user_error(format!("无法打开 SSH 命令通道：{}", error)))?;
            chunk_channel
                .exec_command(&append_cmd)
                .map_err(|error| to_user_error(format!("上传文件块失败：{}", error)))?;
            let _ = chunk_channel.get_output();

            let encoded_uploaded = ((i + 1) as u64 * chunk_size as u64).min(encoded.len() as u64);
            let uploaded = ((encoded_uploaded as f64 / encoded_len) * file_size as f64)
                .round()
                .min(file_size as f64) as u64;
            let now = Instant::now();
            let speed = if now.duration_since(last_progress_time) >= Duration::from_millis(200) {
                let elapsed_secs = now.duration_since(last_progress_time).as_secs_f64();
                let bytes_delta = uploaded.saturating_sub(last_uploaded) as f64;
                let speed = if elapsed_secs > 0.0 {
                    Some(bytes_delta / elapsed_secs)
                } else {
                    None
                };
                last_progress_time = now;
                last_uploaded = uploaded;
                speed
            } else {
                let total_elapsed = start_time.elapsed().as_secs_f64();
                if total_elapsed > 0.0 {
                    Some(uploaded as f64 / total_elapsed)
                } else {
                    None
                }
            };

            on_progress(uploaded, file_size, speed);
        }

        let mut decode_channel = session
            .open_exec()
            .map_err(|error| to_user_error(format!("无法打开 SSH 命令通道：{}", error)))?;
        let decode_cmd = format!(
            "base64 -d {} > {} && rm -f {}",
            quoted_temp_b64, quoted_remote_path, quoted_temp_b64
        );
        decode_channel
            .exec_command(&decode_cmd)
            .map_err(|error| to_user_error(format!("解码上传文件失败：{}", error)))?;
        let _ = decode_channel.get_output();
    } else {
        let heredoc_marker = "__UPLOAD_EOF__";
        let write_cmd = format!(
            "cat > {} << '{}'\n{}\n{} && base64 -d {} > {} && rm -f {}",
            quoted_temp_b64,
            heredoc_marker,
            encoded,
            heredoc_marker,
            quoted_temp_b64,
            quoted_remote_path,
            quoted_temp_b64
        );
        let mut upload_channel = session
            .open_exec()
            .map_err(|error| to_user_error(format!("无法打开 SSH 命令通道：{}", error)))?;
        upload_channel
            .exec_command(&write_cmd)
            .map_err(|error| to_user_error(format!("上传产物失败：{}", error)))?;
        let _ = upload_channel.get_output();
        on_progress(file_size, file_size, None);
    }

    Ok(())
}

fn execute_via_ssh2(
    session_arc: &Arc<Mutex<Session>>,
    command: &str,
    stdin: &str,
    success_exit_codes: &[i32],
) -> AppResult<CommandResult> {
    let session = session_arc
        .lock()
        .map_err(|_| to_user_error("无法获取 SSH2 命令会话锁。"))?;
    let mut channel = session
        .channel_session()
        .map_err(|error| to_user_error(format!("无法打开 SSH2 命令通道：{}", error)))?;
    channel
        .exec(command)
        .map_err(|error| to_user_error(format!("远端命令执行失败：{}", error)))?;
    channel
        .write_all(stdin.as_bytes())
        .map_err(|error| to_user_error(format!("写入提权命令输入失败：{}", error)))?;
    channel
        .send_eof()
        .map_err(|error| to_user_error(format!("关闭提权命令输入失败：{}", error)))?;

    let mut stdout = Vec::new();
    channel
        .read_to_end(&mut stdout)
        .map_err(|error| to_user_error(format!("读取命令输出失败：{}", error)))?;
    let mut stderr = Vec::new();
    channel
        .stderr()
        .read_to_end(&mut stderr)
        .map_err(|error| to_user_error(format!("读取命令错误输出失败：{}", error)))?;
    channel
        .wait_close()
        .map_err(|error| to_user_error(format!("等待远端命令结束失败：{}", error)))?;
    let exit_status = channel
        .exit_status()
        .map_err(|error| to_user_error(format!("读取远端命令退出码失败：{}", error)))?;
    drop(channel);
    drop(session);

    parse_command_bytes(
        stdout,
        stderr,
        exit_status,
        success_exit_codes,
        "远端命令执行失败",
    )
}

fn wrap_privileged_command(
    privilege: &PrivilegeCommandConfig,
    command: &str,
) -> AppResult<(String, Option<String>)> {
    let command_with_shell = format!("{} {}", privilege.shell.trim(), shell_quote(command));
    let stdin = privilege
        .password
        .as_ref()
        .map(|password| format!("{}\n", password));
    let wrapped = match privilege.mode.as_str() {
        "sudo" | "sudo_i" => {
            let identity_arg = if privilege.mode == "sudo_i" {
                "-i "
            } else {
                ""
            };
            let password_arg = if stdin.is_some() { "-S -p ''" } else { "-n" };
            format!(
                "sudo {password_arg} {identity_arg}-u {user} {command}",
                password_arg = password_arg,
                identity_arg = identity_arg,
                user = shell_quote(privilege.run_as_user.trim()),
                command = command_with_shell,
            )
        }
        "su" => format!(
            "su - {user} -c {command}",
            user = shell_quote(privilege.run_as_user.trim()),
            command = shell_quote(&command_with_shell),
        ),
        "custom" => {
            let wrapper = privilege
                .custom_wrapper
                .as_deref()
                .ok_or_else(|| to_user_error("自定义提权模式需要填写包装命令。"))?;
            if wrapper.contains("${command}") {
                wrapper.replace("${command}", &shell_quote(command))
            } else {
                format!("{} {}", wrapper, shell_quote(command))
            }
        }
        _ => command.to_string(),
    };
    Ok((wrapped, stdin))
}

fn open_password_session<C>(
    profile: &ExecutionServerProfile,
    mut is_cancelled: C,
) -> AppResult<ssh::LocalSession<TcpStream>>
where
    C: FnMut() -> bool,
{
    let password = profile
        .password
        .as_deref()
        .ok_or_else(|| to_user_error("服务器密码不存在。"))?;

    if is_cancelled() {
        return Err(to_user_error("部署已停止。"));
    }

    let connector = ssh::create_session()
        .username(&profile.username)
        .password(password)
        .add_kex_algorithms(SSH_KEX_ALGORITHMS[0])
        .add_kex_algorithms(SSH_KEX_ALGORITHMS[1])
        .add_kex_algorithms(SSH_KEX_ALGORITHMS[2])
        .add_kex_algorithms(SSH_KEX_ALGORITHMS[3])
        .add_pubkey_algorithms(SSH_PUBKEY_ALGORITHMS[0])
        .add_pubkey_algorithms(SSH_PUBKEY_ALGORITHMS[1])
        .add_pubkey_algorithms(SSH_PUBKEY_ALGORITHMS[2])
        .add_enc_algorithms(SSH_ENC_ALGORITHMS[0])
        .add_enc_algorithms(SSH_ENC_ALGORITHMS[1])
        .add_enc_algorithms(SSH_ENC_ALGORITHMS[2])
        .add_enc_algorithms(SSH_ENC_ALGORITHMS[3])
        .timeout(Some(Duration::from_secs(SSH_TIMEOUT_SECS)))
        .connect_with_timeout(
            (&profile.host as &str, profile.port),
            Some(Duration::from_secs(SSH_CONNECT_TIMEOUT_SECS)),
        )
        .map_err(|error| to_user_error(format!("SSH 连接失败：{}", error)))?;

    let session = connector.run_local();

    Ok(session)
}

fn open_private_key_session<C>(
    profile: &ExecutionServerProfile,
    mut is_cancelled: C,
) -> AppResult<ssh::LocalSession<TcpStream>>
where
    C: FnMut() -> bool,
{
    let key_path = profile
        .private_key_path
        .as_deref()
        .ok_or_else(|| to_user_error("私钥认证需要提供私钥路径。"))?;

    if is_cancelled() {
        return Err(to_user_error("部署已停止。"));
    }

    let connector = ssh::create_session()
        .username(&profile.username)
        .private_key_path(key_path)
        .add_kex_algorithms(SSH_KEX_ALGORITHMS[0])
        .add_kex_algorithms(SSH_KEX_ALGORITHMS[1])
        .add_kex_algorithms(SSH_KEX_ALGORITHMS[2])
        .add_kex_algorithms(SSH_KEX_ALGORITHMS[3])
        .add_pubkey_algorithms(SSH_PUBKEY_ALGORITHMS[0])
        .add_pubkey_algorithms(SSH_PUBKEY_ALGORITHMS[1])
        .add_pubkey_algorithms(SSH_PUBKEY_ALGORITHMS[2])
        .add_enc_algorithms(SSH_ENC_ALGORITHMS[0])
        .add_enc_algorithms(SSH_ENC_ALGORITHMS[1])
        .add_enc_algorithms(SSH_ENC_ALGORITHMS[2])
        .add_enc_algorithms(SSH_ENC_ALGORITHMS[3])
        .timeout(Some(Duration::from_secs(SSH_TIMEOUT_SECS)))
        .connect_with_timeout(
            (&profile.host as &str, profile.port),
            Some(Duration::from_secs(SSH_CONNECT_TIMEOUT_SECS)),
        )
        .map_err(|error| to_user_error(format!("SSH 连接失败：{}", error)))?;

    let session = connector.run_local();

    Ok(session)
}

pub fn test_server_connection(profile: &ExecutionServerProfile) -> AppResult<String> {
    let mut connection = SshConnection::connect(profile, || false)?;
    connection.execute_with_cancel("printf OK", || false)?;
    let privilege_enabled = profile.privilege.mode.trim() != "none";
    if privilege_enabled {
        connection.configure_privilege(&profile.privilege, profile.privilege_password.clone());
        connection.execute_privileged_with_cancel("printf PRIVILEGE_OK", || false)?;
    }

    Ok(format!(
        "连接成功：{}@{}:{}（{} 认证{}）",
        profile.username,
        profile.host,
        profile.port,
        profile.auth_type,
        if privilege_enabled {
            "，提权可用"
        } else {
            ""
        }
    ))
}

fn parse_command_bytes(
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    exit_status: i32,
    success_exit_codes: &[i32],
    fallback: &str,
) -> AppResult<CommandResult> {
    let combined = format!("{}{}", decode_output(&stdout), decode_output(&stderr))
        .trim()
        .to_string();
    let success_codes = if success_exit_codes.is_empty() {
        &[0][..]
    } else {
        success_exit_codes
    };
    if !success_codes.contains(&exit_status) {
        return Err(to_user_error(if combined.is_empty() {
            fallback.to_string()
        } else {
            combined
        }));
    }
    Ok(CommandResult {
        output: combined,
        exit_status,
    })
}

fn emit_complete_lines<L>(pending: &mut Vec<u8>, on_line: &mut L)
where
    L: FnMut(String),
{
    while let Some(index) = pending.iter().position(|byte| *byte == b'\n') {
        let mut line = pending.drain(..=index).collect::<Vec<u8>>();
        if line.ends_with(&[b'\n']) {
            line.pop();
        }
        if line.ends_with(&[b'\r']) {
            line.pop();
        }
        on_line(decode_output(&line));
    }
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

const POOL_IDLE_TIMEOUT_SECS: u64 = 10 * 60;

struct PooledSftp {
    sftp_session: Arc<Mutex<SftpSession>>,
    command_session: Arc<Mutex<Session>>,
    last_used: Instant,
}

#[derive(Clone)]
pub struct SshConnectionPool {
    pool: Arc<Mutex<HashMap<String, PooledSftp>>>,
}

impl SshConnectionPool {
    pub fn new() -> Self {
        let pool = Arc::new(Mutex::new(HashMap::<String, PooledSftp>::new()));
        let pool_clone = pool.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_secs(60));
            if let Ok(mut guard) = pool_clone.lock() {
                let before = guard.len();
                guard.retain(|server_id, entry| {
                    if entry.last_used.elapsed().as_secs() >= POOL_IDLE_TIMEOUT_SECS {
                        eprintln!("[连接池] 清理空闲连接: {}", server_id);
                        false
                    } else {
                        true
                    }
                });
                let removed = before - guard.len();
                if removed > 0 {
                    eprintln!("[连接池] 清理了 {} 个空闲连接", removed);
                }
            }
        });
        Self { pool }
    }

    pub fn get_or_connect(
        &self,
        server_id: &str,
        profile: &ExecutionServerProfile,
    ) -> AppResult<(Arc<Mutex<SftpSession>>, Arc<Mutex<Session>>)> {
        let mut guard = self.pool.lock().map_err(|_| to_user_error("无法获取连接池锁。"))?;

        if let Some(entry) = guard.get_mut(server_id) {
            if is_pooled_alive(&entry.sftp_session, &entry.command_session) {
                entry.last_used = Instant::now();
                eprintln!("[连接池] 复用现有连接: {}", server_id);
                return Ok((entry.sftp_session.clone(), entry.command_session.clone()));
            }
            eprintln!("[连接池] 现有连接已断开，重新连接: {}", server_id);
            guard.remove(server_id);
        }

        eprintln!("[连接池] 创建新连接: {}", server_id);
        let sftp_session = open_sftp_session(profile)?;
        let command_session = open_ssh2_session(profile)?;

        let entry = PooledSftp {
            sftp_session: sftp_session.clone(),
            command_session: command_session.clone(),
            last_used: Instant::now(),
        };
        guard.insert(server_id.to_string(), entry);
        Ok((sftp_session, command_session))
    }

    #[allow(dead_code)]
    pub fn invalidate(&self, server_id: &str) {
        if let Ok(mut guard) = self.pool.lock() {
            guard.remove(server_id);
        }
    }
}

fn is_pooled_alive(
    _sftp_session: &Arc<Mutex<SftpSession>>,
    command_session: &Arc<Mutex<Session>>,
) -> bool {
    if let Ok(guard) = command_session.lock() {
        guard.authenticated()
    } else {
        false
    }
}

pub fn execute_ssh2_command(
    command_session: &Arc<Mutex<Session>>,
    command: &str,
) -> AppResult<CommandResult> {
    let session = command_session
        .lock()
        .map_err(|_| to_user_error("无法获取 SSH2 命令会话锁。"))?;
    let mut channel = session
        .channel_session()
        .map_err(|error| to_user_error(format!("无法打开 SSH2 命令通道：{}", error)))?;
    channel
        .exec(command)
        .map_err(|error| to_user_error(format!("远端命令执行失败：{}", error)))?;

    let mut stdout = Vec::new();
    channel
        .read_to_end(&mut stdout)
        .map_err(|error| to_user_error(format!("读取命令输出失败：{}", error)))?;
    let mut stderr = Vec::new();
    channel
        .stderr()
        .read_to_end(&mut stderr)
        .map_err(|error| to_user_error(format!("读取命令错误输出失败：{}", error)))?;
    channel
        .wait_close()
        .map_err(|error| to_user_error(format!("等待远端命令结束失败：{}", error)))?;
    let exit_status = channel
        .exit_status()
        .map_err(|error| to_user_error(format!("读取远端命令退出码失败：{}", error)))?;

    parse_command_bytes(stdout, stderr, exit_status, &[], "远端命令执行失败")
}

pub fn upload_via_pool_sftp(
    sftp_session: &Arc<Mutex<SftpSession>>,
    command_session: &Arc<Mutex<Session>>,
    local_path: &Path,
    remote_path: &str,
) -> AppResult<()> {
    if !local_path.exists() {
        return Err(to_user_error("本地文件不存在。"));
    }

    let remote_dir = Path::new(remote_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "/tmp".to_string());

    {
        let guard = command_session
            .lock()
            .map_err(|_| to_user_error("无法获取命令会话锁。"))?;
        let mut channel = guard
            .channel_session()
            .map_err(|error| to_user_error(format!("无法打开命令通道：{}", error)))?;
        let mkdir_cmd = format!("mkdir -p {}", shell_quote(&remote_dir));
        channel
            .exec(&mkdir_cmd)
            .map_err(|error| to_user_error(format!("创建远端目录失败：{}", error)))?;
        eprintln!("[上传] 确保远程目录存在: {}", remote_dir);
        let _ = channel.send_eof();
        let _ = channel.wait_eof();
        let _ = channel.wait_close();
    }

    let mut local_file = File::open(local_path)
        .map_err(|error| to_user_error(format!("无法打开本地文件：{}", error)))?;
    let file_size = local_file
        .metadata()
        .map_err(|error| to_user_error(format!("无法读取本地文件信息：{}", error)))?
        .len();

    upload_via_sftp(
        sftp_session,
        &mut local_file,
        remote_path,
        file_size,
        &mut || false,
        &mut |_, _, _| {},
    )
}

pub fn download_via_pool_sftp(
    sftp_session: &Arc<Mutex<SftpSession>>,
    remote_path: &str,
    local_path: &Path,
) -> AppResult<()> {
    let sftp_arc = sftp_session.clone();
    let sftp_guard = sftp_arc
        .lock()
        .map_err(|_| to_user_error("无法获取 SFTP 锁。"))?;

    let remote = std::path::Path::new(remote_path);
    let mut sftp_file = sftp_guard
        .sftp
        .open(remote)
        .map_err(|error| to_user_error(format!("SFTP 打开远程文件失败：{}", error)))?;

    let stat = sftp_file
        .stat()
        .map_err(|error| to_user_error(format!("SFTP 获取远程文件信息失败：{}", error)))?;
    let _file_size = stat.size.unwrap_or(0);

    if let Some(parent) = local_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let mut local_file = File::create(local_path)
        .map_err(|error| to_user_error(format!("无法创建本地文件：{}", error)))?;

    let mut buffer = [0u8; 256 * 1024];
    loop {
        let bytes_read = sftp_file
            .read(&mut buffer)
            .map_err(|error| to_user_error(format!("SFTP 读取远程文件失败：{}", error)))?;
        if bytes_read == 0 {
            break;
        }
        local_file
            .write_all(&buffer[..bytes_read])
            .map_err(|error| to_user_error(format!("写入本地文件失败：{}", error)))?;
    }

    sftp_file
        .close()
        .map_err(|error| to_user_error(format!("SFTP 关闭远程文件失败：{}", error)))?;
    drop(sftp_guard);

    Ok(())
}
