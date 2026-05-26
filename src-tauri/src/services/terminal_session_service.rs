use crate::error::{to_user_error, AppResult};
use crate::repositories::deployment_repo::ExecutionServerProfile;
use ssh::algorithm::{Enc, Kex, PubKey};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;
use std::thread;
use uuid::Uuid;

const CONNECT_TIMEOUT_SECONDS: u64 = 10;

struct TerminalInner {
    stdin_tx: mpsc::Sender<Vec<u8>>,
    stdout_rx: mpsc::Receiver<Vec<u8>>,
    alive: Arc<Mutex<bool>>,
}

pub struct TerminalSession {
    inner: Mutex<TerminalInner>,
}

#[derive(Clone)]
pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, Arc<TerminalSession>>>>,
}

fn connect(profile: &ExecutionServerProfile) -> AppResult<ssh::LocalSession<std::net::TcpStream>> {
    let mut connector = ssh::create_session()
        .username(&profile.username)
        .add_kex_algorithms(Kex::Curve25519Sha256)
        .add_kex_algorithms(Kex::EcdhSha2Nistrp256)
        .add_kex_algorithms(Kex::DiffieHellmanGroup14Sha256)
        .add_kex_algorithms(Kex::DiffieHellmanGroup14Sha1)
        .add_pubkey_algorithms(PubKey::SshEd25519)
        .add_pubkey_algorithms(PubKey::RsaSha2_256)
        .add_pubkey_algorithms(PubKey::RsaSha2_512)
        .add_enc_algorithms(Enc::Chacha20Poly1305Openssh)
        .add_enc_algorithms(Enc::Aes256Ctr)
        .add_enc_algorithms(Enc::Aes192Ctr)
        .add_enc_algorithms(Enc::Aes128Ctr)
        .timeout(Some(Duration::from_secs(30)));

    connector = match profile.auth_type.as_str() {
        "password" => {
            let password = profile
                .password
                .as_deref()
                .ok_or_else(|| to_user_error("密码不存在。"))?;
            connector.password(password)
        }
        "private_key" => {
            let key_path = profile
                .private_key_path
                .as_deref()
                .ok_or_else(|| to_user_error("私钥路径不存在。"))?;
            connector.private_key_path(key_path)
        }
        _ => return Err(to_user_error("不支持的认证方式")),
    };

    let connected = connector
        .connect_with_timeout(
            (&profile.host as &str, profile.port),
            Some(Duration::from_secs(CONNECT_TIMEOUT_SECONDS)),
        )
        .map_err(|error| to_user_error(format!("SSH 连接失败：{}", error)))?;

    Ok(connected.run_local())
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
        _cols: u32,
        _rows: u32,
    ) -> AppResult<String> {
        let session_id = Uuid::new_v4().to_string();
        let profile = profile.clone();

        let (stdin_tx, stdin_rx) = mpsc::channel::<Vec<u8>>();
        let (stdout_tx, stdout_rx) = mpsc::channel::<Vec<u8>>();
        let alive = Arc::new(Mutex::new(true));
        let alive_clone = alive.clone();

        thread::spawn(move || {
            let mut session = match connect(&profile) {
                Ok(s) => s,
                Err(e) => {
                    let _ = stdout_tx.send(e.to_string().into_bytes());
                    let _ = alive_clone.lock().map(|mut v| *v = false);
                    return;
                }
            };

            let mut shell = match session.open_shell() {
                Ok(s) => s,
                Err(e) => {
                    let _ = stdout_tx.send(format!("打开 Shell 失败：{}", e).into_bytes());
                    let _ = alive_clone.lock().map(|mut v| *v = false);
                    return;
                }
            };

            let _ = alive_clone.lock().map(|mut v| *v = true);

            loop {
                // 读取远程输出（非阻塞尝试）
                match shell.read() {
                    Ok(data) => {
                        if data.is_empty() {
                            break;
                        }
                        if stdout_tx.send(data).is_err() {
                            break;
                        }
                    }
                    Err(_) => {
                        // 读取错误，可能连接已断开
                        break;
                    }
                }

                // 检查是否有用户输入
                match stdin_rx.try_recv() {
                    Ok(data) => {
                        if shell.write(&data).is_err() {
                            break;
                        }
                    }
                    Err(mpsc::TryRecvError::Empty) => {}
                    Err(mpsc::TryRecvError::Disconnected) => {
                        break;
                    }
                }

                if shell.closed() {
                    break;
                }
            }

            let _ = shell.close();
            let _ = alive_clone.lock().map(|mut v| *v = false);
        });

        let terminal_session = TerminalSession {
            inner: Mutex::new(TerminalInner {
                stdin_tx,
                stdout_rx,
                alive,
            }),
        };

        let mut sessions = self.sessions.lock().map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        sessions.insert(session_id.clone(), Arc::new(terminal_session));

        Ok(session_id)
    }

    pub fn write_input(&self, session_id: &str, data: &[u8]) -> AppResult<()> {
        let sessions = self.sessions.lock().map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| to_user_error("终端会话不存在"))?;

        let inner = session.inner.lock().map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        inner.stdin_tx.send(data.to_vec())
            .map_err(|_| to_user_error("终端会话已关闭"))?;

        Ok(())
    }

    pub fn read_output(&self, session_id: &str) -> AppResult<Vec<u8>> {
        let sessions = self.sessions.lock().map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| to_user_error("终端会话不存在"))?;

        let inner = session.inner.lock().map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        let mut output = Vec::new();

        loop {
            match inner.stdout_rx.try_recv() {
                Ok(data) => {
                    output.extend_from_slice(&data);
                }
                Err(mpsc::TryRecvError::Empty) => break,
                Err(mpsc::TryRecvError::Disconnected) => break,
            }
        }

        Ok(output)
    }

    pub fn resize(&self, _session_id: &str, _cols: u32, _rows: u32) -> AppResult<()> {
        Ok(())
    }

    pub fn close(&self, session_id: &str) -> AppResult<()> {
        let mut sessions = self.sessions.lock().map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        sessions.remove(session_id);
        Ok(())
    }

    pub fn is_alive(&self, session_id: &str) -> bool {
        let sessions = match self.sessions.lock() {
            Ok(s) => s,
            Err(_) => return false,
        };
        if let Some(session) = sessions.get(session_id) {
            if let Ok(inner) = session.inner.lock() {
                return *inner.alive.lock().unwrap_or_else(|e| e.into_inner());
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
