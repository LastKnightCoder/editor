use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use bytes::Bytes;
use futures_util::stream;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, WebviewWindow};
use tokio::sync::{mpsc, oneshot, watch, Mutex as AsyncMutex};

use crate::plugin_files::{
    decode_chunk, encode_chunk, FileDescriptor, FileLease, TemporaryFile, CHUNK_BYTES,
};
use crate::plugin_transport::{window_allowed, with_host};

type NetworkReply = Result<reqwest::Response, String>;
struct Download {
    ready: Option<oneshot::Receiver<NetworkReply>>,
    response: Option<reqwest::Response>,
    remaining: Bytes,
    received: u64,
}
struct Spool {
    _lease: FileLease,
    _file: TemporaryFile,
}
struct Transfer {
    spool: Mutex<Option<Spool>>,
    limit: Option<u64>,
    upload: AsyncMutex<Option<mpsc::Sender<Vec<u8>>>>,
    download: AsyncMutex<Download>,
    cancel: watch::Sender<bool>,
    activity: watch::Sender<tokio::time::Instant>,
    idle_timeout: Duration,
    original_url: String,
    method: String,
}
impl Transfer {
    fn stop(&self) {
        self.cancel.send_replace(true);
    }
}
impl Drop for Transfer {
    fn drop(&mut self) {
        self.stop();
    }
}
#[derive(Default)]
struct Network {
    next_id: u64,
    transfers: HashMap<u64, Arc<Transfer>>,
}
fn network() -> &'static Mutex<Network> {
    static STATE: OnceLock<Mutex<Network>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(Network::default()))
}
pub(crate) fn invalidate() {
    if let Ok(mut state) = network().lock() {
        for (_, transfer) in state.transfers.drain() {
            transfer.stop();
        }
    }
}
// 未消费的响应也必须回收；内部 arrayBuffer 落盘后的文件消费由调用方和会话管理。
fn expire_idle(id: u64, transfer: &Arc<Transfer>) {
    let weak = Arc::downgrade(transfer);
    let timeout = transfer.idle_timeout;
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(timeout).await;
            let Some(transfer) = weak.upgrade() else {
                return;
            };
            if *transfer.cancel.borrow() {
                return;
            }
            if transfer.spool.lock().is_ok_and(|spool| spool.is_some()) {
                return;
            }
            if transfer.activity.borrow().elapsed() >= timeout {
                if let Ok(mut state) = network().lock() {
                    state.transfers.remove(&id);
                }
                transfer.stop();
                return;
            }
        }
    });
}
fn get(token: &str, id: u64) -> Result<Arc<Transfer>, String> {
    with_host(token, || {
        network()
            .lock()
            .map_err(|_| "插件网络状态不可用")?
            .transfers
            .get(&id)
            .cloned()
            .ok_or_else(|| "插件网络请求已结束".into())
    })
}
fn cancel(token: &str, id: u64) -> Result<(), String> {
    with_host(token, || {
        if let Some(transfer) = network()
            .lock()
            .map_err(|_| "插件网络状态不可用")?
            .transfers
            .remove(&id)
        {
            transfer.stop();
        }
        Ok(())
    })
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchRequest {
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    has_body: bool,
    redirect: String,
    #[serde(default)]
    response_limit: Option<u64>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResponse {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
    url: String,
    redirected: bool,
    r#type: &'static str,
    has_body: bool,
}
fn open(request: FetchRequest) -> Result<Arc<Transfer>, String> {
    open_with_timeout(request, Duration::from_secs(120))
}
fn open_with_timeout(
    request: FetchRequest,
    idle_timeout: Duration,
) -> Result<Arc<Transfer>, String> {
    let url = url::Url::parse(&request.url).map_err(|_| "网络地址无效")?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("插件网络请求仅支持 HTTP(S) 地址".into());
    }
    let redirect = match request.redirect.as_str() {
        "error" | "manual" => reqwest::redirect::Policy::none(),
        _ => reqwest::redirect::Policy::limited(5),
    };
    let client = reqwest::Client::builder()
        .redirect(redirect)
        .connect_timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "无法创建插件网络连接")?;
    let method =
        reqwest::Method::from_bytes(request.method.as_bytes()).map_err(|_| "网络请求方法无效")?;
    let mut builder = client.request(method.clone(), url);
    for (name, value) in request.headers {
        builder = builder.header(name, value);
    }
    let (upload, receiver) = mpsc::channel::<Vec<u8>>(1);
    if request.has_body {
        builder = builder.body(reqwest::Body::wrap_stream(stream::unfold(
            receiver,
            |mut receiver| async move {
                receiver
                    .recv()
                    .await
                    .map(|chunk| (Ok::<_, std::io::Error>(chunk), receiver))
            },
        )));
    }
    let (sender, ready) = oneshot::channel();
    let (cancel, mut cancelled) = watch::channel(false);
    let (activity, mut progress) = watch::channel(tokio::time::Instant::now());
    let transfer = Arc::new(Transfer {
        spool: Mutex::new(None),
        limit: request.response_limit,
        upload: AsyncMutex::new(request.has_body.then_some(upload)),
        download: AsyncMutex::new(Download {
            ready: Some(ready),
            response: None,
            remaining: Bytes::new(),
            received: 0,
        }),
        cancel,
        activity,
        idle_timeout,
        original_url: request.url,
        method: method.to_string(),
    });
    tauri::async_runtime::spawn(async move {
        let request_future = builder.send();
        tokio::pin!(request_future);
        let idle = tokio::time::sleep(idle_timeout);
        tokio::pin!(idle);
        let result = loop {
            tokio::select! {
                biased;
                _ = cancelled.changed() => break Err("插件网络请求已取消".into()),
                result = &mut request_future => break match result {
                    Ok(response) if request.redirect == "error" && response.status().is_redirection() => Err("插件请求不允许重定向".into()),
                    Ok(response) => Ok(response),
                    Err(_) => Err("插件网络连接失败，请检查网络与服务器".into()),
                },
                changed = progress.changed() => {
                    if changed.is_err() { break Err("插件网络请求已取消".into()); }
                    idle.as_mut().reset(*progress.borrow_and_update() + idle_timeout);
                },
                _ = &mut idle => break Err("插件网络传输长时间没有进展".into()),
            }
        };
        let _ = sender.send(result);
    });
    Ok(transfer)
}
async fn upload(transfer: &Transfer, chunk: Option<Vec<u8>>) -> Result<bool, String> {
    let mut cancelled = transfer.cancel.subscribe();
    if *cancelled.borrow() {
        return Err("插件网络请求已取消".into());
    }
    let mut upload = transfer.upload.lock().await;
    let Some(chunk) = chunk else {
        upload.take();
        transfer.activity.send_replace(tokio::time::Instant::now());
        return Ok(false);
    };
    if chunk.len() > CHUNK_BYTES {
        return Err("插件传输块过大".into());
    }
    let Some(sender) = upload.as_ref() else {
        return Ok(false);
    };
    tokio::select! {
        biased;
        _ = cancelled.changed() => Err("插件网络请求已取消".into()),
        result = sender.send(chunk) => {
            if result.is_ok() { transfer.activity.send_replace(tokio::time::Instant::now()); }
            Ok(result.is_ok())
        },
    }
}
async fn response(transfer: &Transfer) -> Result<FetchResponse, String> {
    let mut cancelled = transfer.cancel.subscribe();
    if *cancelled.borrow() {
        return Err("插件网络请求已取消".into());
    }
    let mut download = transfer.download.lock().await;
    let ready = download.ready.take().ok_or("插件响应头已读取")?;
    let response = tokio::select! {
        biased;
        _ = cancelled.changed() => return Err("插件网络请求已取消".into()),
        result = ready => result.map_err(|_| "插件网络连接已结束")??,
    };
    if transfer
        .limit
        .is_some_and(|limit| response.content_length().is_some_and(|size| size > limit))
    {
        return Err("同步响应超过协议分块预算".into());
    }
    let status = response.status();
    let result = FetchResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").into(),
        headers: response
            .headers()
            .iter()
            .map(|(key, value)| {
                Ok((
                    key.to_string(),
                    value.to_str().map_err(|_| "网络响应头无效")?.into(),
                ))
            })
            .collect::<Result<_, String>>()?,
        url: response.url().to_string(),
        redirected: response.url().as_str() != transfer.original_url,
        r#type: "default",
        has_body: transfer.method != "HEAD" && !matches!(status.as_u16(), 204 | 205 | 304),
    };
    download.response = Some(response);
    transfer.activity.send_replace(tokio::time::Instant::now());
    Ok(result)
}
async fn read(transfer: &Transfer) -> Result<Option<Bytes>, String> {
    let mut cancelled = transfer.cancel.subscribe();
    if *cancelled.borrow() {
        return Err("插件网络请求已取消".into());
    }
    let mut download = transfer.download.lock().await;
    loop {
        if !download.remaining.is_empty() {
            let length = download.remaining.len().min(CHUNK_BYTES);
            return Ok(Some(download.remaining.split_to(length)));
        }
        let response = download.response.as_mut().ok_or("插件响应尚未就绪")?;
        let chunk = tokio::select! {
            biased;
            _ = cancelled.changed() => return Err("插件网络请求已取消".into()),
            result = tokio::time::timeout(transfer.idle_timeout, response.chunk()) => result.map_err(|_| "插件网络读取长时间没有进展")?.map_err(|_| "读取插件网络响应失败")?,
        };
        match chunk {
            Some(chunk) => {
                download.received += chunk.len() as u64;
                if transfer
                    .limit
                    .is_some_and(|limit| download.received > limit)
                {
                    return Err("同步响应超过协议分块预算".into());
                }
                transfer.activity.send_replace(tokio::time::Instant::now());
                download.remaining = chunk;
            }
            None => return Ok(None),
        }
    }
}

#[tauri::command]
pub fn plugin_fetch_open(
    window: WebviewWindow,
    token: String,
    request: FetchRequest,
) -> Result<u64, String> {
    window_allowed(&window)?;
    with_host(&token, || {
        let mut state = network().lock().map_err(|_| "插件网络状态不可用")?;
        if state.transfers.len() >= 16 {
            return Err("插件网络任务过多，请稍后重试".into());
        }
        let transfer = open(request)?;
        state.next_id += 1;
        let id = state.next_id;
        expire_idle(id, &transfer);
        state.transfers.insert(id, transfer);
        Ok(id)
    })
}
#[tauri::command]
pub async fn plugin_fetch_upload(
    window: WebviewWindow,
    token: String,
    id: u64,
    chunk: Option<String>,
) -> Result<bool, String> {
    window_allowed(&window)?;
    let transfer = get(&token, id)?;
    let result = upload(
        &transfer,
        chunk.map(|value| decode_chunk(&value)).transpose()?,
    )
    .await;
    with_host(&token, || result)
}
#[tauri::command]
pub async fn plugin_fetch_response(
    window: WebviewWindow,
    token: String,
    id: u64,
) -> Result<FetchResponse, String> {
    window_allowed(&window)?;
    let transfer = get(&token, id)?;
    let result = response(&transfer).await;
    if result.is_err() {
        let _ = cancel(&token, id);
    }
    with_host(&token, || result)
}
#[tauri::command]
pub async fn plugin_fetch_read(
    window: WebviewWindow,
    token: String,
    id: u64,
) -> Result<Option<String>, String> {
    window_allowed(&window)?;
    let transfer = get(&token, id)?;
    let result = read(&transfer)
        .await
        .map(|chunk| chunk.map(|bytes| encode_chunk(&bytes)));
    if !matches!(result, Ok(Some(_))) {
        let _ = cancel(&token, id);
    }
    with_host(&token, || result)
}
#[tauri::command]
pub fn plugin_fetch_cancel(window: WebviewWindow, token: String, id: u64) -> Result<(), String> {
    window_allowed(&window)?;
    cancel(&token, id)
}

#[tauri::command]
pub async fn plugin_fetch_buffer(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    id: u64,
) -> Result<FileDescriptor, String> {
    use std::io::Write;
    window_allowed(&window)?;
    let transfer = get(&token, id)?;
    let result = async {
        let temp = TemporaryFile::new(&app)?;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .open(&temp.path)
            .map_err(|e| e.to_string())?;
        while let Some(chunk) = read(&transfer).await? {
            file.write_all(&chunk).map_err(|e| e.to_string())?;
        }
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        let lease = FileLease::open(&token, &temp.path, false)?;
        let descriptor = lease.descriptor.clone();
        with_host(&token, || {
            if *transfer.cancel.borrow() {
                return Err("插件网络请求已取消".into());
            }
            *transfer.spool.lock().map_err(|_| "插件网络状态不可用")? = Some(Spool {
                _lease: lease,
                _file: temp,
            });
            Ok(descriptor)
        })
    }
    .await;
    if result.is_err() {
        let _ = cancel(&token, id);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    fn request(url: String, method: &str, length: Option<usize>) -> FetchRequest {
        FetchRequest {
            url,
            method: method.into(),
            headers: length
                .map(|size| ("Content-Length".into(), size.to_string()))
                .into_iter()
                .collect(),
            has_body: length.is_some(),
            redirect: "follow".into(),
            response_limit: None,
        }
    }
    fn headers(socket: &mut std::net::TcpStream) -> Vec<u8> {
        let mut headers = Vec::new();
        let mut byte = [0];
        while !headers.ends_with(b"\r\n\r\n") {
            socket.read_exact(&mut byte).unwrap();
            headers.push(byte[0]);
        }
        headers
    }
    #[tokio::test]
    async fn status_auth_and_binary_are_preserved_without_buffering_response() {
        let server = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = server.local_addr().unwrap();
        let (release, wait) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = server.accept().unwrap();
            let header = String::from_utf8(headers(&mut socket)).unwrap();
            assert!(header.starts_with("PROPFIND /dav HTTP/1.1"));
            assert!(header
                .to_ascii_lowercase()
                .contains("authorization: basic fixture"));
            let mut bytes = [0; 2];
            socket.read_exact(&mut bytes).unwrap();
            assert_eq!(bytes, [255, 1]);
            socket
                .write_all(
                    b"HTTP/1.1 403 Forbidden\r\nContent-Length: 3\r\nConnection: close\r\n\r\n\x00",
                )
                .unwrap();
            wait.recv().unwrap();
            socket.write_all(&[255, 3]).unwrap();
        });
        let mut req = request(format!("http://{address}/dav"), "PROPFIND", Some(2));
        req.headers
            .push(("Authorization".into(), "Basic fixture".into()));
        let transfer = open(req).unwrap();
        assert!(upload(&transfer, Some(vec![255, 1])).await.unwrap());
        upload(&transfer, None).await.unwrap();
        let meta = tokio::time::timeout(Duration::from_secs(5), response(&transfer))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(meta.status, 403);
        assert_eq!(read(&transfer).await.unwrap().unwrap().as_ref(), [0]);
        release.send(()).unwrap();
        let mut remaining = Vec::new();
        while let Some(chunk) = read(&transfer).await.unwrap() {
            remaining.extend_from_slice(&chunk);
        }
        assert_eq!(remaining, [255, 3]);
        worker.join().unwrap();
    }
    #[tokio::test]
    async fn streams_more_than_128_mib_in_each_direction_with_bounded_chunks() {
        let length = 129 * 1024 * 1024 + 17;
        let server = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = server.local_addr().unwrap();
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = server.accept().unwrap();
            let header = String::from_utf8(headers(&mut socket)).unwrap();
            assert!(header
                .to_ascii_lowercase()
                .contains(&format!("content-length: {length}")));
            let mut total = 0;
            let mut bytes = [0; 64 * 1024];
            while total < length {
                let size = (length - total).min(bytes.len());
                socket.read_exact(&mut bytes[..size]).unwrap();
                assert!(bytes[..size].iter().all(|byte| *byte == 37));
                total += size;
            }
            socket
                .write_all(
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n"
                    )
                    .as_bytes(),
                )
                .unwrap();
            bytes.fill(51);
            for offset in (0..length).step_by(bytes.len()) {
                socket
                    .write_all(&bytes[..(length - offset).min(bytes.len())])
                    .unwrap();
            }
        });
        let transfer = open(request(
            format!("http://{address}/large"),
            "PUT",
            Some(length),
        ))
        .unwrap();
        for offset in (0..length).step_by(CHUNK_BYTES) {
            assert!(upload(
                &transfer,
                Some(vec![37; (length - offset).min(CHUNK_BYTES)])
            )
            .await
            .unwrap());
        }
        upload(&transfer, None).await.unwrap();
        assert_eq!(response(&transfer).await.unwrap().status, 200);
        let mut total = 0;
        while let Some(chunk) = read(&transfer).await.unwrap() {
            assert!(chunk.len() <= CHUNK_BYTES);
            assert!(chunk.iter().all(|byte| *byte == 51));
            total += chunk.len();
        }
        assert_eq!(total, length);
        worker.join().unwrap();
    }
    #[tokio::test]
    async fn ongoing_upload_progress_extends_header_wait_instead_of_timing_out_total_transfer() {
        let server = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = server.local_addr().unwrap();
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = server.accept().unwrap();
            headers(&mut socket);
            let mut bytes = [0; 4];
            socket.read_exact(&mut bytes).unwrap();
            socket
                .write_all(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n")
                .unwrap();
        });
        let transfer = open_with_timeout(
            request(format!("http://{address}/slow"), "PUT", Some(4)),
            Duration::from_millis(100),
        )
        .unwrap();
        for _ in 0..4 {
            upload(&transfer, Some(vec![1])).await.unwrap();
            tokio::time::sleep(Duration::from_millis(60)).await;
        }
        upload(&transfer, None).await.unwrap();
        assert_eq!(response(&transfer).await.unwrap().status, 204);
        worker.join().unwrap();
    }

    #[tokio::test]
    async fn sync_response_budget_rejects_oversized_headers_and_chunked_bodies() {
        for known in [true, false] {
            let server = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let address = server.local_addr().unwrap();
            let worker = std::thread::spawn(move || {
                let (mut socket, _) = server.accept().unwrap();
                headers(&mut socket);
                let wire = if known {
                    "HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\n12345"
                } else {
                    "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n5\r\n12345\r\n0\r\n\r\n"
                };
                let _ = socket.write_all(wire.as_bytes());
            });
            let mut req = request(format!("http://{address}/budget"), "GET", None);
            req.response_limit = Some(4);
            let transfer = open(req).unwrap();
            if known {
                assert!(response(&transfer).await.is_err());
            } else {
                response(&transfer).await.unwrap();
                assert!(read(&transfer).await.is_err());
            }
            worker.join().unwrap();
        }
    }

    #[tokio::test]
    async fn truncated_response_reports_failure_instead_of_successful_eof() {
        let server = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = server.local_addr().unwrap();
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = server.accept().unwrap();
            headers(&mut socket);
            socket
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\npartial",
                )
                .unwrap();
        });
        let transfer = open(request(format!("http://{address}/broken"), "GET", None)).unwrap();
        response(&transfer).await.unwrap();
        loop {
            match read(&transfer).await {
                Ok(Some(_)) => (),
                Ok(None) => panic!("截断内容不能视为成功"),
                Err(_) => break,
            }
        }
        worker.join().unwrap();
    }

    #[tokio::test]
    async fn upload_backpressure_and_cancel_release_blocked_sender() {
        let (sender, _receiver) = mpsc::channel(1);
        let (cancel, _) = watch::channel(false);
        let transfer = Transfer {
            spool: Mutex::new(None),
            limit: None,
            upload: AsyncMutex::new(Some(sender)),
            download: AsyncMutex::new(Download {
                ready: None,
                response: None,
                remaining: Bytes::new(),
                received: 0,
            }),
            cancel,
            activity: watch::channel(tokio::time::Instant::now()).0,
            idle_timeout: Duration::from_secs(120),
            original_url: String::new(),
            method: "PUT".into(),
        };
        assert!(upload(&transfer, Some(vec![1; CHUNK_BYTES])).await.unwrap());
        assert!(tokio::time::timeout(
            Duration::from_millis(25),
            upload(&transfer, Some(vec![2; CHUNK_BYTES]))
        )
        .await
        .is_err());
        transfer.stop();
        assert!(upload(&transfer, Some(vec![3])).await.is_err());
        assert!(read(&transfer).await.is_err());
    }
    #[tokio::test]
    async fn unconsumed_response_releases_native_slot_after_idle() {
        let _guard = crate::plugin_transport::test_host("expiry");
        let (cancel, _) = watch::channel(false);
        let transfer = Arc::new(Transfer {
            spool: Mutex::new(None),
            limit: None,
            upload: AsyncMutex::new(None),
            download: AsyncMutex::new(Download {
                ready: None,
                response: None,
                remaining: Bytes::new(),
                received: 0,
            }),
            cancel,
            activity: watch::channel(tokio::time::Instant::now()).0,
            idle_timeout: Duration::from_millis(20),
            original_url: String::new(),
            method: "GET".into(),
        });
        let id = {
            let mut state = network().lock().unwrap();
            state.next_id += 1;
            let id = state.next_id;
            state.transfers.insert(id, transfer.clone());
            id
        };
        expire_idle(id, &transfer);
        let mut cancelled = transfer.cancel.subscribe();
        tokio::time::timeout(Duration::from_secs(2), cancelled.changed())
            .await
            .unwrap()
            .unwrap();
        assert!(!network().lock().unwrap().transfers.contains_key(&id));
    }

    #[tokio::test]
    async fn cancelled_response_headers_do_not_keep_waiting() {
        let (cancel, _) = watch::channel(false);
        let (_sender, receiver) = oneshot::channel();
        let transfer = Arc::new(Transfer {
            spool: Mutex::new(None),
            limit: None,
            upload: AsyncMutex::new(None),
            download: AsyncMutex::new(Download {
                ready: Some(receiver),
                response: None,
                remaining: Bytes::new(),
                received: 0,
            }),
            cancel,
            activity: watch::channel(tokio::time::Instant::now()).0,
            idle_timeout: Duration::from_secs(120),
            original_url: String::new(),
            method: "GET".into(),
        });
        let other = transfer.clone();
        let task = tokio::spawn(async move { response(&other).await });
        tokio::task::yield_now().await;
        transfer.stop();
        assert!(tokio::time::timeout(Duration::from_secs(1), task)
            .await
            .unwrap()
            .unwrap()
            .is_err());
    }
}
