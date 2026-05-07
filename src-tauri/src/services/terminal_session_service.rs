use crate::error::{to_user_error, AppResult};
use crate::repositories::deployment_repo::ExecutionServerProfile;
use ssh2::Session;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use uuid::Uuid;

pub struct TerminalSession {
    _session: Arc<Mutex<Session>>,
    channel: Arc<Mutex<ssh2::Channel>>,
}

#[derive(Clone)]
pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, Arc<TerminalSession>>>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn create_session(
        &self,
        _server_id: &str,
        profile: &ExecutionServerProfile,
        cols: u32,
        rows: u32,
    ) -> AppResult<String> {
        let session_id = Uuid::new_v4().to_string();

        let tcp = TcpStream::connect((&profile.host as &str, profile.port))
            .map_err(|e| to_user_error(format!("SSH 连接失败：{}", e)))?;
        tcp.set_read_timeout(Some(Duration::from_secs(30)))
            .map_err(|e| to_user_error(format!("设置超时失败：{}", e)))?;

        let mut sess = Session::new()
            .map_err(|e| to_user_error(format!("创建会话失败：{}", e)))?;
        sess.set_tcp_stream(tcp);
        sess.handshake()
            .map_err(|e| to_user_error(format!("握手失败：{}", e)))?;

        match profile.auth_type.as_str() {
            "password" => {
                let password = profile
                    .password
                    .as_deref()
                    .ok_or_else(|| to_user_error("密码不存在。"))?;
                sess.userauth_password(&profile.username, password)
                    .map_err(|e| to_user_error(format!("密码认证失败：{}", e)))?;
            }
            "private_key" => {
                let key_path = profile
                    .private_key_path
                    .as_deref()
                    .ok_or_else(|| to_user_error("私钥路径不存在。"))?;
                sess.userauth_pubkey_file(&profile.username, None, std::path::Path::new(key_path), None)
                    .map_err(|e| to_user_error(format!("私钥认证失败：{}", e)))?;
            }
            _ => return Err(to_user_error("不支持的认证方式")),
        }

        if !sess.authenticated() {
            return Err(to_user_error("认证失败"));
        }

        let mut channel = sess.channel_session()
            .map_err(|e| to_user_error(format!("创建通道失败：{}", e)))?;

        channel.request_pty("xterm-256color", None, Some((cols, rows, 0, 0)))
            .map_err(|e| to_user_error(format!("请求 PTY 失败：{}", e)))?;

        channel.shell()
            .map_err(|e| to_user_error(format!("启动 Shell 失败：{}", e)))?;

        sess.set_blocking(false);

        let session = TerminalSession {
            _session: Arc::new(Mutex::new(sess)),
            channel: Arc::new(Mutex::new(channel)),
        };

        let mut sessions = self.sessions.lock().map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        sessions.insert(session_id.clone(), Arc::new(session));

        Ok(session_id)
    }

    pub fn write_input(&self, session_id: &str, data: &[u8]) -> AppResult<()> {
        let sessions = self.sessions.lock().map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| to_user_error("终端会话不存在"))?;

        let mut channel = session.channel.lock().map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        channel.write_all(data)
            .map_err(|e| to_user_error(format!("写入失败：{}", e)))?;
        channel.flush()
            .map_err(|e| to_user_error(format!("刷新失败：{}", e)))?;

        Ok(())
    }

    pub fn read_output(&self, session_id: &str) -> AppResult<Vec<u8>> {
        let sessions = self.sessions.lock().map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| to_user_error("终端会话不存在"))?;

        let mut channel = session.channel.lock().map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        let mut buffer = vec![0u8; 8192];
        let mut output = Vec::new();

        loop {
            match channel.read(&mut buffer) {
                Ok(0) => {
                    if channel.eof() {
                        break;
                    }
                    break;
                }
                Ok(n) => {
                    output.extend_from_slice(&buffer[..n]);
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    break;
                }
                Err(e) => {
                    return Err(to_user_error(format!("读取失败：{}", e)));
                }
            }
        }

        Ok(output)
    }

    pub fn resize(&self, session_id: &str, cols: u32, rows: u32) -> AppResult<()> {
        let sessions = self.sessions.lock().map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| to_user_error("终端会话不存在"))?;

        let mut channel = session.channel.lock().map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        channel.request_pty_size(cols, rows, None, None)
            .map_err(|e| to_user_error(format!("调整大小失败：{}", e)))?;

        Ok(())
    }

    pub fn close(&self, session_id: &str) -> AppResult<()> {
        let mut sessions = self.sessions.lock().map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        if let Some(session) = sessions.remove(session_id) {
            let mut channel = session.channel.lock().map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
            let _ = channel.close();
            let _ = channel.wait_close();
        }
        Ok(())
    }

    pub fn is_alive(&self, session_id: &str) -> bool {
        let sessions = match self.sessions.lock() {
            Ok(s) => s,
            Err(_) => return false,
        };
        if let Some(session) = sessions.get(session_id) {
            if let Ok(channel) = session.channel.lock() {
                return !channel.eof();
            }
        }
        false
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}
