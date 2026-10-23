use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, WebviewWindow};
use tokio::sync::oneshot;

use crate::setting::{get_active_database_name, load_or_init_setting};

const MAX_BYTES: usize = 128 * 1024 * 1024;
type Reply = Result<Value, String>;

struct Host {
    token: String,
    database: String,
}
#[derive(Default)]
struct Transport {
    host: Option<Host>,
    pending: HashMap<String, oneshot::Sender<Reply>>,
    fetches: HashMap<String, oneshot::Sender<()>>,
    cancelled: HashSet<String>,
}
fn transport() -> &'static Mutex<Transport> {
    static STATE: OnceLock<Mutex<Transport>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(Transport::default()))
}

struct PendingRequest(String);
impl Drop for PendingRequest {
    fn drop(&mut self) {
        if let Ok(mut state) = transport().lock() {
            state.pending.remove(&self.0);
        }
    }
}
pub(crate) fn window_allowed(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("插件传输仅属于主窗口".into());
    }
    Ok(())
}
fn assert_host(state: &Transport, token: &str) -> Result<(), String> {
    if state.host.as_ref().is_none_or(|host| host.token != token) {
        return Err("插件宿主会话已结束".into());
    }
    Ok(())
}
fn release(state: &mut Transport) {
    state.host = None;
    for (_, pending) in state.pending.drain() {
        let _ = pending.send(Err("插件宿主会话已结束".into()));
    }
    for (_, cancel) in state.fetches.drain() {
        let _ = cancel.send(());
    }
    state.cancelled.clear();
}

pub(crate) fn invalidate() {
    if let Ok(mut state) = transport().lock() {
        release(&mut state);
    }
}

#[tauri::command]
pub fn plugin_transport_connect(
    app: AppHandle,
    window: WebviewWindow,
    database: String,
) -> Result<String, String> {
    window_allowed(&window)?;
    if get_active_database_name(&load_or_init_setting(&app)?) != database {
        return Err("插件工作区已失效".into());
    }
    let mut state = transport().lock().map_err(|_| "插件传输状态不可用")?;
    release(&mut state);
    let token = uuid::Uuid::new_v4().to_string();
    state.host = Some(Host {
        token: token.clone(),
        database,
    });
    Ok(token)
}

#[tauri::command]
pub fn plugin_transport_disconnect(window: WebviewWindow, token: String) -> Result<(), String> {
    window_allowed(&window)?;
    let mut state = transport().lock().map_err(|_| "插件传输状态不可用")?;
    if assert_host(&state, &token).is_ok() {
        release(&mut state);
    }
    Ok(())
}

#[tauri::command]
pub fn plugin_transport_reply(
    window: WebviewWindow,
    token: String,
    request_id: String,
    result: Option<Value>,
    error: Option<String>,
) -> Result<(), String> {
    window_allowed(&window)?;
    let mut state = transport().lock().map_err(|_| "插件传输状态不可用")?;
    assert_host(&state, &token)?;
    if let Some(pending) = state.pending.remove(&request_id) {
        let _ = pending.send(match error {
            Some(error) => Err(error),
            None => Ok(result.unwrap_or(Value::Null)),
        });
    }
    Ok(())
}

pub(crate) fn host_token(database: &str) -> Result<String, String> {
    let state = transport().lock().map_err(|_| "插件传输状态不可用")?;
    let host = state.host.as_ref().ok_or("同步或上传插件尚未就绪")?;
    if host.database != database {
        return Err("插件工作区已失效".into());
    }
    Ok(host.token.clone())
}

pub(crate) async fn request(app: &AppHandle, token: &str, mut message: Value) -> Reply {
    let id = uuid::Uuid::new_v4().to_string();
    let (sender, receiver) = oneshot::channel();
    {
        let mut state = transport().lock().map_err(|_| "插件传输状态不可用")?;
        assert_host(&state, token)?;
        if state.pending.len() >= 32 {
            return Err("插件传输任务过多，请稍后重试".into());
        }
        state.pending.insert(id.clone(), sender);
    }
    let _pending = PendingRequest(id.clone());
    message["requestId"] = json!(id);
    message["token"] = json!(token);
    let result = match app.emit_to("main", "plugin-provider-request", message) {
        Err(error) => Err(error.to_string()),
        Ok(()) => match tokio::time::timeout(Duration::from_secs(180), receiver).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("插件宿主已断开".into()),
            Err(_) => Err("插件操作超时".into()),
        },
    };
    let mut state = transport().lock().map_err(|_| "插件传输状态不可用")?;
    state.pending.remove(&id);
    assert_host(&state, token)?;
    result
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchRequest {
    request_id: String,
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
    redirect: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResponse {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
    body: String,
    url: String,
}

async fn execute_fetch(request: FetchRequest) -> Result<FetchResponse, String> {
    let url = url::Url::parse(&request.url).map_err(|_| "网络地址无效")?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("插件网络请求仅支持 HTTP(S) 地址".into());
    }
    let policy = match request.redirect.as_str() {
        "error" | "manual" => reqwest::redirect::Policy::none(),
        _ => reqwest::redirect::Policy::limited(5),
    };
    let client = reqwest::Client::builder()
        .redirect(policy)
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|_| "无法创建插件网络连接")?;
    let method =
        reqwest::Method::from_bytes(request.method.as_bytes()).map_err(|_| "网络请求方法无效")?;
    let mut builder = client.request(method, url);
    for (name, value) in request.headers {
        builder = builder.header(name, value);
    }
    if let Some(body) = request.body {
        if body.len() > MAX_BYTES.div_ceil(3) * 4 {
            return Err("插件请求体超过 128 MiB".into());
        }
        let bytes = STANDARD.decode(body).map_err(|_| "插件请求体编码无效")?;
        if bytes.len() > MAX_BYTES {
            return Err("插件请求体超过 128 MiB".into());
        }
        builder = builder.body(bytes);
    }
    let mut response = builder
        .send()
        .await
        .map_err(|_| "插件网络连接失败，请检查网络与服务器")?;
    if request.redirect == "error" && response.status().is_redirection() {
        return Err("插件请求不允许重定向".into());
    }
    if response
        .content_length()
        .is_some_and(|size| size > MAX_BYTES as u64)
    {
        return Err("插件响应体超过 128 MiB".into());
    }
    let status = response.status();
    let headers = response
        .headers()
        .iter()
        .map(|(key, value)| {
            Ok((
                key.to_string(),
                value.to_str().map_err(|_| "网络响应头无效")?.to_string(),
            ))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let url = response.url().to_string();
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "读取插件网络响应失败")? {
        if body.len() + chunk.len() > MAX_BYTES {
            return Err("插件响应体超过 128 MiB".into());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(FetchResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").into(),
        headers,
        body: STANDARD.encode(body),
        url,
    })
}

#[tauri::command]
pub async fn plugin_fetch(
    window: WebviewWindow,
    token: String,
    request: FetchRequest,
) -> Result<FetchResponse, String> {
    window_allowed(&window)?;
    uuid::Uuid::parse_str(&request.request_id).map_err(|_| "网络请求身份无效")?;
    let id = request.request_id.clone();
    let (sender, receiver) = oneshot::channel();
    {
        let mut state = transport().lock().map_err(|_| "插件传输状态不可用")?;
        assert_host(&state, &token)?;
        if state.cancelled.remove(&id) {
            return Err("网络请求已取消".into());
        }
        if state.fetches.len() >= 16 || state.fetches.contains_key(&id) {
            return Err("插件网络任务过多或身份重复".into());
        }
        state.fetches.insert(id.clone(), sender);
    }
    let result = tokio::select! {
        result = execute_fetch(request) => result,
        _ = receiver => Err("网络请求已取消".into()),
    };
    let mut state = transport().lock().map_err(|_| "插件传输状态不可用")?;
    state.fetches.remove(&id);
    assert_host(&state, &token)?;
    result
}

#[tauri::command]
pub fn plugin_fetch_cancel(
    window: WebviewWindow,
    token: String,
    request_id: String,
) -> Result<(), String> {
    window_allowed(&window)?;
    let mut state = transport().lock().map_err(|_| "插件传输状态不可用")?;
    assert_host(&state, &token)?;
    if let Some(cancel) = state.fetches.remove(&request_id) {
        let _ = cancel.send(());
    } else if state.cancelled.len() < 1024 {
        state.cancelled.insert(request_id);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cancelled_wait_releases_its_request_slot() {
        let id = uuid::Uuid::new_v4().to_string();
        let (sender, _receiver) = oneshot::channel();
        transport()
            .lock()
            .unwrap()
            .pending
            .insert(id.clone(), sender);
        {
            let _pending = PendingRequest(id.clone());
        }
        assert!(!transport().lock().unwrap().pending.contains_key(&id));
    }
    #[tokio::test]
    async fn native_fetch_preserves_method_auth_binary_and_http_error() {
        use std::io::{Read, Write};
        let server = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = server.local_addr().unwrap();
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = server.accept().unwrap();
            let mut request = Vec::new();
            loop {
                let mut bytes = [0u8; 1024];
                let count = socket.read(&mut bytes).unwrap();
                request.extend_from_slice(&bytes[..count]);
                if request.ends_with(&[255, 1]) {
                    break;
                }
                assert!(count > 0);
            }
            let headers = String::from_utf8_lossy(&request);
            assert!(headers.starts_with("PROPFIND /dav HTTP/1.1"));
            assert!(headers
                .to_ascii_lowercase()
                .contains("authorization: basic fixture"));
            socket.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 3\r\nConnection: close\r\n\r\n\x00\xff\x03").unwrap();
        });
        let result = execute_fetch(FetchRequest {
            request_id: uuid::Uuid::new_v4().to_string(),
            url: format!("http://{address}/dav"),
            method: "PROPFIND".into(),
            headers: vec![("Authorization".into(), "Basic fixture".into())],
            body: Some(STANDARD.encode([255, 1])),
            redirect: "follow".into(),
        })
        .await
        .unwrap();
        assert_eq!(result.status, 403);
        assert_eq!(STANDARD.decode(result.body).unwrap(), [0, 255, 3]);
        worker.join().unwrap();
    }
    #[tokio::test]
    async fn disconnect_rejects_pending_and_cancels_network() {
        let (sender, receiver) = oneshot::channel();
        let (cancel, cancelled) = oneshot::channel();
        let mut state = Transport::default();
        state.host = Some(Host {
            token: "old".into(),
            database: "data.db".into(),
        });
        state.pending.insert("operation".into(), sender);
        state.fetches.insert("network".into(), cancel);
        release(&mut state);
        assert!(receiver.await.unwrap().is_err());
        assert!(cancelled.await.is_ok());
        assert!(assert_host(&state, "old").is_err());
    }
}
