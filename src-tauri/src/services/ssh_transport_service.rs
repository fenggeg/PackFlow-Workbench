use crate::error::{to_user_error, AppResult};
use crate::repositories::deployment_repo::ExecutionServerProfile;
use encoding_rs::GBK;
use ssh::algorithm::{Kex, PubKey, Enc};
use ssh2::Session;
use std::fs::File;
use std::io::{Read, Write};
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
}

struct SftpSession {
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
                if profile.password.as_deref().is_none_or(|value| value.trim().is_empty()) {
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

        let sftp_session = open_sftp_session(profile).ok();

        Ok(Self {
            session,
            sftp_session,
        })
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
            .map_err(|error| to_user_error(format!("读取远端命令退出码失败：{}", error)))? as i32;

        parse_command_bytes(stdout, Vec::new(), exit_status, success_exit_codes, "远端命令执行失败")
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

        let mkdir_cmd = format!("mkdir -p {}", remote_dir);
        let mut mkdir_channel = self
            .session
            .open_exec()
            .map_err(|error| to_user_error(format!("无法打开 SSH 命令通道：{}", error)))?;
        mkdir_channel
            .exec_command(&mkdir_cmd)
            .map_err(|error| to_user_error(format!("创建远端目录失败：{}", error)))?;
        let _ = mkdir_channel.get_output();

        if let Some(sftp_arc) = &self.sftp_session {
            upload_via_sftp(sftp_arc, &mut local_file, remote_path, file_size, &mut is_cancelled, &mut on_progress)
        } else {
            upload_via_base64(&mut self.session, &mut local_file, remote_path, &remote_dir, file_size, &mut is_cancelled, &mut on_progress)
        }
    }
}

fn open_sftp_session(profile: &ExecutionServerProfile) -> AppResult<Arc<Mutex<SftpSession>>> {
    let tcp = TcpStream::connect((&profile.host as &str, profile.port))
        .map_err(|error| to_user_error(format!("SFTP TCP 连接失败：{}", error)))?;
    tcp.set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|error| to_user_error(format!("设置 SFTP 超时失败：{}", error)))?;
    tcp.set_write_timeout(Some(Duration::from_secs(30)))
        .map_err(|error| to_user_error(format!("设置 SFTP 超时失败：{}", error)))?;

    let mut session = Session::new()
        .map_err(|error| to_user_error(format!("创建 SFTP 会话失败：{}", error)))?;
    session.set_tcp_stream(tcp);
    session
        .handshake()
        .map_err(|error| to_user_error(format!("SFTP 握手失败：{}", error)))?;

    match profile.auth_type.as_str() {
        "password" => {
            let password = profile
                .password
                .as_deref()
                .ok_or_else(|| to_user_error("服务器密码不存在。"))?;
            session
                .userauth_password(&profile.username, password)
                .map_err(|error| to_user_error(format!("SFTP 密码认证失败：{}", error)))?;
        }
        "private_key" => {
            let key_path = profile
                .private_key_path
                .as_deref()
                .ok_or_else(|| to_user_error("私钥认证需要提供私钥路径。"))?;
            session
                .userauth_pubkey_file(&profile.username, None, Path::new(key_path), None)
                .map_err(|error| to_user_error(format!("SFTP 私钥认证失败：{}", error)))?;
        }
        _ => return Err(to_user_error("暂不支持的认证方式。")),
    }

    if !session.authenticated() {
        return Err(to_user_error("SFTP 认证未通过。"));
    }

    let sftp = session
        .sftp()
        .map_err(|error| to_user_error(format!("创建 SFTP 通道失败：{}", error)))?;

    Ok(Arc::new(Mutex::new(SftpSession { session, sftp })))
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
    let sftp_guard = sftp_arc
        .lock()
        .map_err(|_| to_user_error("无法获取 SFTP 锁。"))?;

    let remote = std::path::Path::new(remote_path);
    let mut sftp_file = sftp_guard
        .sftp
        .create(remote)
        .map_err(|error| to_user_error(format!("SFTP 创建远程文件失败：{}", error)))?;

    let mut buffer = [0u8; 65536];
    let mut uploaded: u64 = 0;
    let start_time = Instant::now();
    let mut last_progress_time = Instant::now();
    let mut last_uploaded: u64 = 0;

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

        sftp_file
            .write_all(&buffer[..bytes_read])
            .map_err(|error| to_user_error(format!("SFTP 写入远程文件失败：{}", error)))?;

        uploaded += bytes_read as u64;

        let now = Instant::now();
        let speed = if now.duration_since(last_progress_time) >= Duration::from_millis(200) {
            let elapsed_secs = now.duration_since(last_progress_time).as_secs_f64();
            let bytes_delta = uploaded.saturating_sub(last_uploaded) as f64;
            let speed = if elapsed_secs > 0.0 { Some(bytes_delta / elapsed_secs) } else { None };
            last_progress_time = now;
            last_uploaded = uploaded;
            speed
        } else {
            let total_elapsed = start_time.elapsed().as_secs_f64();
            if total_elapsed > 0.0 { Some(uploaded as f64 / total_elapsed) } else { None }
        };

        on_progress(uploaded, file_size, speed);
    }

    drop(sftp_file);
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
    let chunk_size = 65536;
    let temp_b64 = format!("{}/.upload.b64", remote_dir);
    let start_time = Instant::now();
    let mut last_progress_time = Instant::now();
    let mut last_uploaded: u64 = 0;

    if encoded.len() > 100 * 1024 {
        let mut clear_channel = session
            .open_exec()
            .map_err(|error| to_user_error(format!("无法打开 SSH 命令通道：{}", error)))?;
        let clear_cmd = format!("> {}", temp_b64);
        clear_channel.exec_command(&clear_cmd).ok();
        let _ = clear_channel.get_output();

        let chunks: Vec<&[u8]> = encoded.as_bytes().chunks(chunk_size).collect();

        for (i, chunk) in chunks.into_iter().enumerate() {
            if is_cancelled() {
                return Err(to_user_error("部署已停止。"));
            }

            let chunk_str = String::from_utf8_lossy(chunk);
            let heredoc_marker = format!("__CHUNK_{}__", i);
            let append_cmd = format!(
                "cat >> {} << '{}'\n{}\n{}",
                temp_b64, heredoc_marker, chunk_str, heredoc_marker
            );

            let mut chunk_channel = session
                .open_exec()
                .map_err(|error| to_user_error(format!("无法打开 SSH 命令通道：{}", error)))?;
            chunk_channel
                .exec_command(&append_cmd)
                .map_err(|error| to_user_error(format!("上传文件块失败：{}", error)))?;
            let _ = chunk_channel.get_output();

            let uploaded = ((i + 1) as u64 * chunk_size as u64).min(file_size);
            let now = Instant::now();
            let speed = if now.duration_since(last_progress_time) >= Duration::from_millis(200) {
                let elapsed_secs = now.duration_since(last_progress_time).as_secs_f64();
                let bytes_delta = uploaded.saturating_sub(last_uploaded) as f64;
                let speed = if elapsed_secs > 0.0 { Some(bytes_delta / elapsed_secs) } else { None };
                last_progress_time = now;
                last_uploaded = uploaded;
                speed
            } else {
                let total_elapsed = start_time.elapsed().as_secs_f64();
                if total_elapsed > 0.0 { Some(uploaded as f64 / total_elapsed) } else { None }
            };

            on_progress(uploaded, file_size, speed);
        }

        let mut decode_channel = session
            .open_exec()
            .map_err(|error| to_user_error(format!("无法打开 SSH 命令通道：{}", error)))?;
        let decode_cmd = format!("base64 -d {} > {} && rm -f {}", temp_b64, remote_path, temp_b64);
        decode_channel
            .exec_command(&decode_cmd)
            .map_err(|error| to_user_error(format!("解码上传文件失败：{}", error)))?;
        let _ = decode_channel.get_output();
    } else {
        let heredoc_marker = "__UPLOAD_EOF__";
        let write_cmd = format!(
            "cat > {} << '{}'\n{}\n{} && base64 -d {} > {} && rm -f {}",
            temp_b64, heredoc_marker, encoded, heredoc_marker, temp_b64, remote_path, temp_b64
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

const CONNECT_TIMEOUT_SECONDS: u64 = 10;

fn open_password_session<C>(profile: &ExecutionServerProfile, mut is_cancelled: C) -> AppResult<ssh::LocalSession<TcpStream>>
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
        .add_kex_algorithms(Kex::Curve25519Sha256)
        .add_kex_algorithms(Kex::EcdhSha2Nistrp256)
        .add_pubkey_algorithms(PubKey::SshEd25519)
        .add_pubkey_algorithms(PubKey::RsaSha2_256)
        .add_pubkey_algorithms(PubKey::RsaSha2_512)
        .add_enc_algorithms(Enc::Chacha20Poly1305Openssh)
        .add_enc_algorithms(Enc::Aes256Ctr)
        .add_enc_algorithms(Enc::Aes128Ctr)
        .timeout(Some(Duration::from_secs(30)))
        .connect_with_timeout(
            (&profile.host as &str, profile.port),
            Some(Duration::from_secs(CONNECT_TIMEOUT_SECONDS)),
        )
        .map_err(|error| to_user_error(format!("SSH 连接失败：{}", error)))?;

    let session = connector
        .run_local();

    Ok(session)
}

fn open_private_key_session<C>(profile: &ExecutionServerProfile, mut is_cancelled: C) -> AppResult<ssh::LocalSession<TcpStream>>
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
        .add_kex_algorithms(Kex::Curve25519Sha256)
        .add_kex_algorithms(Kex::EcdhSha2Nistrp256)
        .add_pubkey_algorithms(PubKey::SshEd25519)
        .add_pubkey_algorithms(PubKey::RsaSha2_256)
        .add_pubkey_algorithms(PubKey::RsaSha2_512)
        .add_enc_algorithms(Enc::Chacha20Poly1305Openssh)
        .add_enc_algorithms(Enc::Aes256Ctr)
        .add_enc_algorithms(Enc::Aes128Ctr)
        .timeout(Some(Duration::from_secs(30)))
        .connect_with_timeout(
            (&profile.host as &str, profile.port),
            Some(Duration::from_secs(CONNECT_TIMEOUT_SECONDS)),
        )
        .map_err(|error| to_user_error(format!("SSH 连接失败：{}", error)))?;

    let session = connector
        .run_local();

    Ok(session)
}

pub fn test_server_connection(profile: &ExecutionServerProfile) -> AppResult<String> {
    let tcp = TcpStream::connect((&profile.host as &str, profile.port))
        .map_err(|error| to_user_error(format!("TCP 连接失败：{}", error)))?;
    tcp.set_read_timeout(Some(Duration::from_secs(10)))
        .map_err(|error| to_user_error(format!("设置超时失败：{}", error)))?;
    tcp.set_write_timeout(Some(Duration::from_secs(10)))
        .map_err(|error| to_user_error(format!("设置超时失败：{}", error)))?;

    let mut session = Session::new()
        .map_err(|error| to_user_error(format!("创建 SSH 会话失败：{}", error)))?;
    session.set_tcp_stream(tcp);
    session
        .handshake()
        .map_err(|error| to_user_error(format!("SSH 握手失败：{}", error)))?;

    match profile.auth_type.as_str() {
        "password" => {
            let password = profile
                .password
                .as_deref()
                .ok_or_else(|| to_user_error("服务器密码不存在。"))?;
            session
                .userauth_password(&profile.username, password)
                .map_err(|error| to_user_error(format!("密码认证失败：{}", error)))?;
        }
        "private_key" => {
            let key_path = profile
                .private_key_path
                .as_deref()
                .ok_or_else(|| to_user_error("私钥认证需要提供私钥路径。"))?;
            session
                .userauth_pubkey_file(&profile.username, None, Path::new(key_path), None)
                .map_err(|error| to_user_error(format!("私钥认证失败：{}", error)))?;
        }
        _ => return Err(to_user_error("暂不支持的认证方式。")),
    }

    if !session.authenticated() {
        return Err(to_user_error("SSH 认证未通过。"));
    }

    let mut channel = session
        .channel_session()
        .map_err(|error| to_user_error(format!("打开命令通道失败：{}", error)))?;
    channel
        .exec("echo OK")
        .map_err(|error| to_user_error(format!("执行测试命令失败：{}", error)))?;
    channel
        .wait_close()
        .map_err(|error| to_user_error(format!("等待命令完成失败：{}", error)))?;

    Ok(format!(
        "连接成功：{}@{}:{}（{} 认证）",
        profile.username, profile.host, profile.port, profile.auth_type
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

fn decode_output(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    String::from_utf8(bytes.to_vec()).unwrap_or_else(|_| {
        let (value, _, _) = GBK.decode(bytes);
        value.into_owned()
    })
}
