use crate::error::{to_user_error, AppResult};
use crate::repositories::deployment_repo::ExecutionServerProfile;
use ssh::algorithm::{Enc, Kex, PubKey};
use std::collections::HashMap;
use std::io::ErrorKind;
use std::net::TcpStream;
use std::sync::{mpsc as std_mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use uuid::Uuid;

const CONNECT_TIMEOUT_SECONDS: u64 = 10;
const SHELL_READ_TIMEOUT_MS: u64 = 50;

struct TerminalInner {
    input_tx: mpsc::UnboundedSender<Vec<u8>>,
    resize_tx: mpsc::UnboundedSender<TerminalResize>,
    stdout_rx: std_mpsc::Receiver<Vec<u8>>,
    alive: Arc<Mutex<bool>>,
}

pub struct TerminalSession {
    inner: Mutex<TerminalInner>,
}

#[derive(Clone, Copy)]
struct TerminalResize {
    cols: u32,
    rows: u32,
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
        app: AppHandle,
        _server_id: &str,
        profile: &ExecutionServerProfile,
        cols: u32,
        rows: u32,
    ) -> AppResult<String> {
        let session_id = Uuid::new_v4().to_string();
        let thread_session_id = session_id.clone();
        let profile = profile.clone();

        let (input_tx, mut input_rx) = mpsc::unbounded_channel::<Vec<u8>>();
        let (resize_tx, mut resize_rx) = mpsc::unbounded_channel::<TerminalResize>();
        let (stdout_tx, stdout_rx) = std_mpsc::channel::<Vec<u8>>();
        let alive = Arc::new(Mutex::new(true));
        let alive_clone = alive.clone();

        thread::spawn(move || {
            let mut session = match connect(&profile) {
                Ok(s) => s,
                Err(e) => {
                    publish_output(
                        &app,
                        &thread_session_id,
                        &stdout_tx,
                        e.to_string().into_bytes(),
                    );
                    let _ = alive_clone.lock().map(|mut v| *v = false);
                    return;
                }
            };

            let mut shell = match session.open_shell_terminal(ssh::TerminalSize::from(cols, rows)) {
                Ok(s) => s,
                Err(e) => {
                    publish_output(
                        &app,
                        &thread_session_id,
                        &stdout_tx,
                        format!("打开 Shell 失败：{}", e).into_bytes(),
                    );
                    let _ = alive_clone.lock().map(|mut v| *v = false);
                    return;
                }
            };

            session.set_timeout(Some(Duration::from_millis(SHELL_READ_TIMEOUT_MS)));
            if let Err(error) = session.get_raw_io().borrow_mut().set_nonblocking(true) {
                log::warn!(
                    "terminal_session_service set_nonblocking failed sessionId={} error={}",
                    thread_session_id,
                    error
                );
            }

            let _ = alive_clone.lock().map(|mut v| *v = true);

            loop {
                if !drain_shell_commands(
                    &thread_session_id,
                    &mut shell,
                    &mut input_rx,
                    &mut resize_rx,
                ) {
                    break;
                }

                match shell.read() {
                    Ok(data) => {
                        if data.is_empty() {
                            break;
                        }
                        if !publish_output(&app, &thread_session_id, &stdout_tx, data) {
                            break;
                        }
                    }
                    Err(error) => {
                        if !is_transient_read_error(&error) {
                            log::warn!(
                                "terminal_session_service shell.read failed sessionId={} error={}",
                                thread_session_id,
                                error
                            );
                            break;
                        }
                    }
                }

                if !drain_shell_commands(
                    &thread_session_id,
                    &mut shell,
                    &mut input_rx,
                    &mut resize_rx,
                ) {
                    break;
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
                input_tx,
                resize_tx,
                stdout_rx,
                alive,
            }),
        };

        let mut sessions = self
            .sessions
            .lock()
            .map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        sessions.insert(session_id.clone(), Arc::new(terminal_session));

        Ok(session_id)
    }

    pub fn write_input(&self, session_id: &str, data: &[u8]) -> AppResult<()> {
        let input_tx = {
            let sessions = self
                .sessions
                .lock()
                .map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
            let session = sessions
                .get(session_id)
                .ok_or_else(|| to_user_error("终端会话不存在"))?;

            let inner = session
                .inner
                .lock()
                .map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
            inner.input_tx.clone()
        };

        input_tx
            .send(data.to_vec())
            .map_err(|_| to_user_error("终端会话已关闭"))?;

        Ok(())
    }

    pub fn read_output(&self, session_id: &str) -> AppResult<Vec<u8>> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| to_user_error("终端会话不存在"))?;

        let inner = session
            .inner
            .lock()
            .map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        let mut output = Vec::new();

        loop {
            match inner.stdout_rx.try_recv() {
                Ok(data) => {
                    output.extend_from_slice(&data);
                }
                Err(std_mpsc::TryRecvError::Empty) => break,
                Err(std_mpsc::TryRecvError::Disconnected) => break,
            }
        }

        Ok(output)
    }

    pub fn resize(&self, session_id: &str, cols: u32, rows: u32) -> AppResult<()> {
        let resize_tx = {
            let sessions = self
                .sessions
                .lock()
                .map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
            let session = sessions
                .get(session_id)
                .ok_or_else(|| to_user_error("终端会话不存在"))?;

            let inner = session
                .inner
                .lock()
                .map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
            inner.resize_tx.clone()
        };

        resize_tx
            .send(TerminalResize { cols, rows })
            .map_err(|_| to_user_error("终端会话已关闭"))?;

        Ok(())
    }

    pub fn close(&self, session_id: &str) -> AppResult<()> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|e| to_user_error(format!("锁错误：{}", e)))?;
        sessions.remove(session_id);
        Ok(())
    }

    pub fn is_alive(&self, session_id: &str) -> bool {
        let sessions = match self.sessions.lock() {
            Ok(sessions) => sessions,
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

fn publish_output(
    app: &AppHandle,
    session_id: &str,
    stdout_tx: &std_mpsc::Sender<Vec<u8>>,
    data: Vec<u8>,
) -> bool {
    let event_name = format!("terminal-output:{}", session_id);
    let _ = app.emit(&event_name, data.clone());
    stdout_tx.send(data).is_ok()
}

fn drain_shell_commands(
    session_id: &str,
    shell: &mut ssh::LocalShell<TcpStream>,
    input_rx: &mut mpsc::UnboundedReceiver<Vec<u8>>,
    resize_rx: &mut mpsc::UnboundedReceiver<TerminalResize>,
) -> bool {
    loop {
        match resize_rx.try_recv() {
            Ok(size) => {
                log::info!(
                    "terminal_session_service resize received sessionId={} cols={} rows={}",
                    session_id,
                    size.cols,
                    size.rows
                );
            }
            Err(mpsc::error::TryRecvError::Empty) => break,
            Err(mpsc::error::TryRecvError::Disconnected) => return false,
        }
    }

    loop {
        match input_rx.try_recv() {
            Ok(data) => {
                match shell.write(&data) {
                    Ok(()) => {
                        log::info!(
                            "terminal_session_service shell.write success sessionId={} bytes={}",
                            session_id,
                            data.len()
                        );
                    }
                    Err(error) => {
                        log::warn!(
                            "terminal_session_service shell.write failed sessionId={} bytes={} error={}",
                            session_id,
                            data.len(),
                            error
                        );
                        return false;
                    }
                }
            }
            Err(mpsc::error::TryRecvError::Empty) => break,
            Err(mpsc::error::TryRecvError::Disconnected) => return false,
        }
    }

    true
}

fn is_transient_read_error(error: &ssh::SshError) -> bool {
    match error {
        ssh::SshError::TimeoutError => true,
        ssh::SshError::IoError(error) => {
            matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut)
        }
        _ => false,
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}
