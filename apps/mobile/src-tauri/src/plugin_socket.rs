use crate::plugin_transport::{window_allowed, with_host};
use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::WebviewWindow;
use tokio::sync::{mpsc, oneshot, watch, Mutex as AsyncMutex};
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{
        client::IntoClientRequest,
        protocol::{frame::coding::CloseCode, CloseFrame, WebSocketConfig},
        Error as SocketError, Message,
    },
};

const MESSAGE_BYTES: usize = 1024 * 1024;

#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum Frame {
    Text(String),
    Binary(String),
}
impl Frame {
    fn into_message(self) -> Result<Message, String> {
        match self {
            Self::Text(value) if value.len() <= MESSAGE_BYTES => Ok(Message::Text(value.into())),
            Self::Binary(value) if value.len() <= MESSAGE_BYTES.div_ceil(3) * 4 => {
                let bytes = STANDARD
                    .decode(value)
                    .map_err(|_| "WebSocket 音频编码无效")?;
                if bytes.len() > MESSAGE_BYTES {
                    return Err("WebSocket 消息过大".into());
                }
                Ok(Message::Binary(bytes.into()))
            }
            _ => Err("WebSocket 消息过大".into()),
        }
    }
}
#[derive(Deserialize)]
pub struct SocketRequest {
    url: String,
    headers: HashMap<String, String>,
    protocols: Vec<String>,
}
#[derive(Serialize)]
pub struct SocketOpened {
    protocol: String,
    extensions: String,
}
#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Incoming {
    Message {
        data: Frame,
    },
    Close {
        code: u16,
        reason: String,
        #[serde(rename = "wasClean")]
        was_clean: bool,
    },
}
struct SendRequest {
    message: Message,
    done: oneshot::Sender<Result<(), String>>,
}
struct Connection {
    send: mpsc::Sender<SendRequest>,
    receive: AsyncMutex<mpsc::Receiver<Result<Incoming, String>>>,
    cancel: watch::Sender<bool>,
}
impl Drop for Connection {
    fn drop(&mut self) {
        self.cancel.send_replace(true);
    }
}
#[derive(Default)]
struct Sockets {
    connections: HashMap<String, Arc<Connection>>,
    cancelled: HashSet<String>,
}
fn sockets() -> &'static Mutex<Sockets> {
    static STATE: OnceLock<Mutex<Sockets>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(Sockets::default()))
}
pub(crate) fn invalidate() {
    if let Ok(mut state) = sockets().lock() {
        for (_, connection) in state.connections.drain() {
            connection.cancel.send_replace(true);
        }
        state.cancelled.clear();
    }
}
fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 80 || !id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
    {
        return Err("WebSocket 身份无效".into());
    }
    Ok(())
}
fn get(token: &str, id: &str) -> Result<Arc<Connection>, String> {
    with_host(token, || {
        let state = sockets().lock().map_err(|_| "WebSocket 状态不可用")?;
        let connection = state
            .connections
            .get(id)
            .cloned()
            .ok_or("WebSocket 已结束")?;
        Ok(connection)
    })
}

fn handshake_error(error: SocketError) -> String {
    match error {
        SocketError::Http(response) => {
            format!("WebSocket 握手失败（HTTP {}）", response.status().as_u16())
        }
        SocketError::Tls(_) => "WebSocket TLS 安全连接失败".into(),
        SocketError::Io(error) if error.kind() == std::io::ErrorKind::TimedOut => {
            "WebSocket 握手超时".into()
        }
        SocketError::Io(_) => "WebSocket 网络连接失败".into(),
        _ => "WebSocket 握手失败".into(),
    }
}

#[tauri::command]
pub async fn plugin_socket_open(
    window: WebviewWindow,
    token: String,
    id: String,
    request: SocketRequest,
) -> Result<SocketOpened, String> {
    window_allowed(&window)?;
    validate_id(&id)?;
    let url = url::Url::parse(&request.url).map_err(|_| "WebSocket 地址无效")?;
    if url.fragment().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || !(url.scheme() == "wss"
            || (url.scheme() == "ws"
                && matches!(
                    url.host_str(),
                    Some("localhost" | "127.0.0.1" | "[::1]" | "::1")
                )))
    {
        return Err("WebSocket 需要安全地址，本机测试可使用 ws".into());
    }
    let mut handshake = request
        .url
        .into_client_request()
        .map_err(|_| "WebSocket 地址无效")?;
    let mut protocols = HashSet::new();
    for protocol in &request.protocols {
        if protocol.is_empty()
            || !protocol
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&c))
            || !protocols.insert(protocol)
        {
            return Err("WebSocket 子协议无效或重复".into());
        }
    }
    if !request.protocols.is_empty() {
        handshake.headers_mut().insert(
            "sec-websocket-protocol",
            request
                .protocols
                .join(", ")
                .parse()
                .map_err(|_| "WebSocket 子协议无效")?,
        );
    }
    for (name, value) in request.headers {
        let lower = name.to_ascii_lowercase();
        if matches!(lower.as_str(), "host" | "connection" | "upgrade")
            || lower.starts_with("sec-websocket-")
        {
            return Err("WebSocket 请求头由宿主管理".into());
        }
        let name = name
            .parse::<tokio_tungstenite::tungstenite::http::HeaderName>()
            .map_err(|_| "WebSocket 请求头无效")?;
        let value = value.parse().map_err(|_| "WebSocket 请求头无效")?;
        handshake.headers_mut().insert(name, value);
    }
    let (send, mut commands) = mpsc::channel::<SendRequest>(1);
    let (responses, receive) = mpsc::channel(2);
    let (cancel, mut cancelled) = watch::channel(false);
    let connection = Arc::new(Connection {
        send,
        receive: AsyncMutex::new(receive),
        cancel,
    });
    with_host(&token, || {
        let mut state = sockets().lock().map_err(|_| "WebSocket 状态不可用")?;
        if state.cancelled.remove(&id) {
            return Err("WebSocket 已取消".into());
        }
        if state.connections.len() >= 32 || state.connections.contains_key(&id) {
            return Err("WebSocket 连接过多或重复".into());
        }
        state.connections.insert(id.clone(), connection.clone());
        Ok(())
    })?;
    let mut config = WebSocketConfig::default();
    config.max_message_size = Some(MESSAGE_BYTES);
    config.max_frame_size = Some(MESSAGE_BYTES);
    let connecting = tokio::time::timeout(
        Duration::from_secs(10),
        connect_async_with_config(handshake, Some(config), false),
    );
    let opened = tokio::select! {
        _ = cancelled.changed() => Err("WebSocket 已取消".to_string()),
        result = connecting => match result { Ok(value) => value.map_err(handshake_error), Err(_) => Err("WebSocket 握手超时".to_string()) },
    };
    let (mut socket, response) = match opened {
        Ok(value) => value,
        Err(error) => {
            sockets()
                .lock()
                .map_err(|_| "WebSocket 状态不可用")?
                .connections
                .remove(&id);
            return Err(error);
        }
    };
    let protocol = response
        .headers()
        .get("sec-websocket-protocol")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if (!request.protocols.is_empty() && !request.protocols.contains(&protocol))
        || (request.protocols.is_empty() && !protocol.is_empty())
    {
        sockets()
            .lock()
            .map_err(|_| "WebSocket 状态不可用")?
            .connections
            .remove(&id);
        return Err("WebSocket 子协议不匹配".into());
    }
    let extensions = response
        .headers()
        .get("sec-websocket-extensions")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    tauri::async_runtime::spawn(async move {
        let run = async {
            loop {
                tokio::select! {
                    outgoing = commands.recv() => {
                        let Some(outgoing) = outgoing else { return Ok(()); };
                        let sent = socket.send(outgoing.message).await.map_err(|_| "WebSocket 发送失败".to_string());
                        let failed = sent.is_err(); let _ = outgoing.done.send(sent);
                        if failed { return Err("WebSocket 发送失败".to_string()); }
                    },
                    incoming = socket.next() => {
                        let event = match incoming {
                            Some(Ok(Message::Text(text))) => Incoming::Message { data: Frame::Text(text.to_string()) },
                            Some(Ok(Message::Binary(bytes))) => Incoming::Message { data: Frame::Binary(STANDARD.encode(bytes)) },
                            Some(Ok(Message::Close(frame))) => {
                                let clean = socket.flush().await.is_ok();
                                let (code, reason) = frame.map(|frame| (u16::from(frame.code), frame.reason.to_string())).unwrap_or((1005, String::new()));
                                let _ = responses.send(Ok(Incoming::Close { code, reason, was_clean: clean })).await;
                                return Ok(());
                            },
                            None | Some(Err(_)) => return Err("WebSocket 接收失败".to_string()),
                            _ => continue,
                        };
                        if responses.send(Ok(event)).await.is_err() { return Ok(()); }
                    },
                }
            }
        };
        tokio::select! {
            _ = cancelled.changed() => {},
            outcome = run => { if let Err(error) = outcome {
                tokio::select! { _ = cancelled.changed() => {}, _ = responses.send(Err(error)) => {} }
            } },
        }
    });
    Ok(SocketOpened {
        protocol,
        extensions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handshake_http_error_keeps_status_without_headers_or_body() {
        let response = tokio_tungstenite::tungstenite::http::Response::builder()
            .status(403)
            .header("x-private", "secret-header")
            .body(Some(b"secret-body".to_vec()))
            .unwrap();
        assert_eq!(
            handshake_error(SocketError::Http(Box::new(response))),
            "WebSocket 握手失败（HTTP 403）"
        );
    }

    #[test]
    fn handshake_network_error_keeps_category_without_native_details() {
        assert_eq!(
            handshake_error(SocketError::Io(std::io::Error::new(
                std::io::ErrorKind::ConnectionRefused,
                "secret-address"
            ))),
            "WebSocket 网络连接失败"
        );
        assert_eq!(
            handshake_error(SocketError::Io(std::io::ErrorKind::TimedOut.into())),
            "WebSocket 握手超时"
        );
    }
}

#[tauri::command]
pub async fn plugin_socket_send(
    window: WebviewWindow,
    token: String,
    id: String,
    message: Frame,
) -> Result<(), String> {
    window_allowed(&window)?;
    let connection = get(&token, &id)?;
    let (done, result) = oneshot::channel();
    let mut cancel = connection.cancel.subscribe();
    let sending = async {
        connection
            .send
            .send(SendRequest {
                message: message.into_message()?,
                done,
            })
            .await
            .map_err(|_| "WebSocket 已关闭")?;
        result.await.map_err(|_| "WebSocket 已关闭")?
    };
    tokio::select! { _ = cancel.changed() => Err("WebSocket 已取消".into()), result = sending => result }
}
#[tauri::command]
pub async fn plugin_socket_receive(
    window: WebviewWindow,
    token: String,
    id: String,
) -> Result<Incoming, String> {
    window_allowed(&window)?;
    let connection = get(&token, &id)?;
    let mut receiver = connection
        .receive
        .try_lock()
        .map_err(|_| "WebSocket 只允许一个读取者")?;
    receiver
        .recv()
        .await
        .ok_or_else(|| "WebSocket 已结束".to_string())?
}
#[tauri::command]
pub fn plugin_socket_dispose(
    window: WebviewWindow,
    token: String,
    id: String,
) -> Result<(), String> {
    window_allowed(&window)?;
    validate_id(&id)?;
    with_host(&token, || {
        let mut state = sockets().lock().map_err(|_| "WebSocket 状态不可用")?;
        if let Some(connection) = state.connections.remove(&id) {
            connection.cancel.send_replace(true);
        } else if state.cancelled.len() < 128 {
            state.cancelled.insert(id);
        }
        Ok(())
    })
}

#[tauri::command]
pub async fn plugin_socket_close(
    window: WebviewWindow,
    token: String,
    id: String,
    code: Option<u16>,
    reason: Option<String>,
) -> Result<(), String> {
    window_allowed(&window)?;
    let reason = reason.unwrap_or_default();
    if code.is_some_and(|v| v != 1000 && !(3000..=4999).contains(&v)) || reason.len() > 123 {
        return Err("WebSocket 关闭参数无效".into());
    }
    let frame = if code.is_some() || !reason.is_empty() {
        Some(CloseFrame {
            code: CloseCode::from(code.unwrap_or(1000)),
            reason: reason.into(),
        })
    } else {
        None
    };
    let connection = get(&token, &id)?;
    let (done, result) = oneshot::channel();
    let mut cancel = connection.cancel.subscribe();
    let closing = async {
        connection
            .send
            .send(SendRequest {
                message: Message::Close(frame),
                done,
            })
            .await
            .map_err(|_| "WebSocket 已关闭")?;
        result.await.map_err(|_| "WebSocket 已关闭")?
    };
    tokio::select! { _ = cancel.changed() => Err("WebSocket 已取消".into()), result = closing => result }
}
