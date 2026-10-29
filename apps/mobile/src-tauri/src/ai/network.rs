use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use bytes::Bytes;
use futures_util::stream;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tokio::sync::{mpsc, oneshot, watch, Mutex as AsyncMutex};

use super::lifecycle;
use crate::plugin_files::{decode_chunk, encode_chunk, CHUNK_BYTES};

struct Context {
    lease: String,
    base: url::Url,
    headers: Vec<(String, String)>,
    api_key: Option<String>,
}
struct Transfer {
    context_id: String,
    lease: String,
    upload: AsyncMutex<Option<mpsc::Sender<Vec<u8>>>>,
    download: AsyncMutex<Download>,
    cancel: watch::Sender<bool>,
    activity: Mutex<std::time::Instant>,
}
struct Download {
    ready: Option<oneshot::Receiver<Result<reqwest::Response, String>>>,
    response: Option<reqwest::Response>,
    remaining: Bytes,
}
#[derive(Default)]
struct Network {
    contexts: HashMap<String, Arc<Context>>,
    transfers: HashMap<String, Arc<Transfer>>,
}
fn network() -> &'static Mutex<Network> {
    static VALUE: OnceLock<Mutex<Network>> = OnceLock::new();
    VALUE.get_or_init(|| Mutex::new(Network::default()))
}
fn secret_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "authorization" | "proxy-authorization" | "x-api-key" | "api-key" | "cookie" | "set-cookie"
    )
}
pub fn public_config(setting: &Value) -> Value {
    let mut providers = setting["llmProviders"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    for provider in &mut providers {
        if let Some(object) = provider.as_object_mut() {
            let configured = object
                .get("apiKey")
                .and_then(Value::as_str)
                .is_some_and(|value| !value.is_empty());
            object.remove("apiKey");
            object.remove("headers");
            object.insert("configured".into(), Value::Bool(configured));
            if let Some(models) = object.get_mut("models").and_then(Value::as_array_mut) {
                for model in models {
                    if let Some(object) = model.as_object_mut() {
                        object.remove("apiKey");
                        object.remove("headers");
                    }
                }
            }
        }
    }
    serde_json::json!({"llmProviders":providers,"llmUsageSettings":setting["llmUsageSettings"]})
}
pub fn assert_model_revision(
    setting: &Value,
    provider_id: &str,
    expected: Option<&str>,
) -> Result<(), String> {
    let Some(expected) = expected else {
        return Ok(());
    };
    let provider = setting["llmProviders"]
        .as_array()
        .and_then(|providers| {
            providers
                .iter()
                .find(|provider| provider["id"] == provider_id)
        })
        .ok_or("AI_CONFIG_CHANGED:模型提供方已删除")?;
    let bytes = serde_json::to_vec(provider).map_err(|_| "AI_CONFIG_CHANGED:模型配置无法复验")?;
    if format!("{:x}", Sha256::digest(bytes)) != expected {
        return Err("AI_CONFIG_CHANGED:模型配置已改变，请重新授权请求".into());
    }
    Ok(())
}
pub fn context(
    lease: &str,
    setting: &Value,
    provider_id: &str,
    model_id: Option<&str>,
) -> Result<String, String> {
    lifecycle::with_lease(lease, |_| Ok(()))?;
    let provider = setting["llmProviders"]
        .as_array()
        .and_then(|providers| {
            providers
                .iter()
                .find(|provider| provider["id"] == provider_id)
        })
        .ok_or("AI_MODEL_UNAVAILABLE:提供方不存在")?;
    let model = model_id.and_then(|id| {
        provider["models"]
            .as_array()?
            .iter()
            .find(|model| model["id"] == id)
    });
    if model_id.is_some() && model.is_none() {
        return Err("AI_MODEL_UNAVAILABLE:模型不存在".into());
    }
    let base_url = provider["baseUrl"]
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or("AI_MODEL_UNAVAILABLE:请先配置提供方地址")?;
    let base = parse_url(base_url)?;
    let mut headers = Vec::new();
    for value in [Some(provider), model].into_iter().flatten() {
        if let Some(custom) = value["headers"].as_object() {
            for (name, value) in custom {
                if let Some(value) = value.as_str() {
                    headers.retain(|(existing, _): &(String, String)| {
                        !existing.eq_ignore_ascii_case(name)
                    });
                    headers.push((name.clone(), value.into()));
                }
            }
        }
    }
    let api_key = provider["apiKey"]
        .as_str()
        .filter(|key| !key.is_empty())
        .map(str::to_owned);
    let id = uuid::Uuid::new_v4().to_string();
    let mut state = network()
        .lock()
        .map_err(|_| "AI_TRANSPORT_FAILED:网络状态不可用")?;
    if state.contexts.len() >= 64 {
        return Err("AI_TRANSPORT_FAILED:网络上下文过多".into());
    }
    state.contexts.insert(
        id.clone(),
        Arc::new(Context {
            lease: lease.into(),
            base,
            headers,
            api_key,
        }),
    );
    Ok(id)
}
pub fn mcp_context(
    lease: &str,
    url: &str,
    headers: HashMap<String, String>,
) -> Result<String, String> {
    lifecycle::with_lease(lease, |_| Ok(()))?;
    let base = parse_url(url)?;
    let id = uuid::Uuid::new_v4().to_string();
    let mut state = network()
        .lock()
        .map_err(|_| "AI_TRANSPORT_FAILED:网络状态不可用")?;
    if state.contexts.len() >= 64 {
        return Err("AI_TRANSPORT_FAILED:网络上下文过多".into());
    }
    state.contexts.insert(
        id.clone(),
        Arc::new(Context {
            lease: lease.into(),
            base,
            headers: headers.into_iter().collect(),
            api_key: None,
        }),
    );
    Ok(id)
}
fn parse_url(value: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(value).map_err(|_| "AI_TRANSPORT_FAILED:网络地址无效")?;
    if !matches!(url.scheme(), "https" | "http")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err("AI_TRANSPORT_FAILED:仅支持无内嵌凭据的 HTTP(S) 地址".into());
    }
    Ok(url)
}
fn within_base(base: &url::Url, url: &url::Url) -> bool {
    let prefix = base.path().trim_end_matches('/');
    base.origin() == url.origin()
        && (prefix.is_empty()
            || url.path() == prefix
            || url.path().starts_with(&format!("{prefix}/")))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    has_body: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
    url: String,
    has_body: bool,
}
pub fn open(context_id: &str, request: HttpRequest) -> Result<String, String> {
    let context = network()
        .lock()
        .map_err(|_| "AI_TRANSPORT_FAILED:网络状态不可用")?
        .contexts
        .get(context_id)
        .cloned()
        .ok_or("AI_TRANSPORT_FAILED:网络上下文已释放")?;
    lifecycle::with_lease(&context.lease, |_| Ok(()))?;
    let url = parse_url(&request.url)?;
    if !within_base(&context.base, &url) {
        return Err("AI_TRANSPORT_FAILED:请求超出已冻结的提供方地址".into());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "AI_TRANSPORT_FAILED:网络初始化失败")?;
    let method = reqwest::Method::from_bytes(request.method.as_bytes())
        .map_err(|_| "AI_TRANSPORT_FAILED:请求方法无效")?;
    let mut builder = client.request(method, url);
    // 目录可能覆盖配置里的协议，实际 SDK 请求头才是本次调用的有效鉴权形状。
    let auth_header = if request
        .headers
        .iter()
        .any(|(name, _)| name.eq_ignore_ascii_case("x-api-key"))
        && request
            .headers
            .iter()
            .any(|(name, _)| name.eq_ignore_ascii_case("anthropic-version"))
    {
        Some("x-api-key")
    } else if request
        .headers
        .iter()
        .any(|(name, _)| name.eq_ignore_ascii_case("authorization"))
    {
        Some("authorization")
    } else {
        None
    };
    if let (Some(key), Some(name)) = (&context.api_key, auth_header) {
        if !context
            .headers
            .iter()
            .any(|(existing, _)| existing.eq_ignore_ascii_case(name))
        {
            builder = builder.header(
                name,
                if name == "x-api-key" {
                    key.clone()
                } else {
                    format!("Bearer {key}")
                },
            );
        }
    }
    for (name, value) in request.headers {
        if !secret_header(&name)
            && !context
                .headers
                .iter()
                .any(|(existing, _)| existing.eq_ignore_ascii_case(&name))
        {
            builder = builder.header(name, value);
        }
    }
    for (name, value) in &context.headers {
        builder = builder.header(name, value);
    }
    let (sender, receiver) = mpsc::channel::<Vec<u8>>(1);
    if request.has_body {
        builder = builder.body(reqwest::Body::wrap_stream(stream::unfold(
            receiver,
            |mut receiver| async move {
                receiver
                    .recv()
                    .await
                    .map(|bytes| (Ok::<_, std::io::Error>(bytes), receiver))
            },
        )));
    }
    let (cancel, mut cancelled) = watch::channel(false);
    let (reply, ready) = oneshot::channel();
    tauri::async_runtime::spawn(async move {
        let response = tokio::select! {biased;_=cancelled.changed()=>Err("AI_TRANSPORT_FAILED:请求已取消".into()),response=builder.send()=>response.map_err(|_|"AI_TRANSPORT_FAILED:连接提供方失败".into())};
        let _ = reply.send(response);
    });
    let transfer = Arc::new(Transfer {
        context_id: context_id.into(),
        lease: context.lease.clone(),
        upload: AsyncMutex::new(request.has_body.then_some(sender)),
        download: AsyncMutex::new(Download {
            ready: Some(ready),
            response: None,
            remaining: Bytes::new(),
        }),
        cancel,
        activity: Mutex::new(std::time::Instant::now()),
    });
    let id = uuid::Uuid::new_v4().to_string();
    let mut state = network()
        .lock()
        .map_err(|_| "AI_TRANSPORT_FAILED:网络状态不可用")?;
    if state.transfers.len() >= 16 {
        transfer.cancel.send_replace(true);
        return Err("AI_TRANSPORT_FAILED:网络请求过多".into());
    }
    let weak = Arc::downgrade(&transfer);
    let expiry_id = id.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(120)).await;
            let Some(transfer) = weak.upgrade() else {
                return;
            };
            let expired = transfer
                .activity
                .lock()
                .is_ok_and(|activity| activity.elapsed() >= Duration::from_secs(120));
            if expired {
                let _ = self::cancel(&expiry_id);
                return;
            }
        }
    });
    state.transfers.insert(id.clone(), transfer);
    Ok(id)
}
fn get(id: &str) -> Result<Arc<Transfer>, String> {
    let transfer = network()
        .lock()
        .map_err(|_| "AI_TRANSPORT_FAILED:网络状态不可用")?
        .transfers
        .get(id)
        .cloned()
        .ok_or("AI_TRANSPORT_FAILED:请求已结束")?;
    lifecycle::with_lease(&transfer.lease, |_| Ok(()))?;
    if *transfer.cancel.borrow() {
        return Err("AI_TRANSPORT_FAILED:请求已取消".into());
    }
    if let Ok(mut activity) = transfer.activity.lock() {
        *activity = std::time::Instant::now();
    }
    Ok(transfer)
}
pub async fn upload(id: &str, chunk: Option<String>) -> Result<(), String> {
    let transfer = get(id)?;
    let mut upload = transfer.upload.lock().await;
    if let Some(chunk) = chunk {
        let bytes = decode_chunk(&chunk)?;
        let sender = upload
            .as_ref()
            .ok_or("AI_TRANSPORT_FAILED:请求体已经结束")?;
        let mut cancelled = transfer.cancel.subscribe();
        if *cancelled.borrow() {
            return Err("AI_TRANSPORT_FAILED:请求已取消".into());
        }
        tokio::select! {biased;_=cancelled.changed()=>return Err("AI_TRANSPORT_FAILED:请求已取消".into()),result=sender.send(bytes)=>result.map_err(|_|"AI_TRANSPORT_FAILED:上传失败")?};
    } else {
        upload.take();
    }
    lifecycle::with_lease(&transfer.lease, |_| Ok(()))
}
pub async fn response(id: &str) -> Result<HttpResponse, String> {
    let transfer = get(id)?;
    let mut download = transfer.download.lock().await;
    let ready = download
        .ready
        .take()
        .ok_or("AI_TRANSPORT_FAILED:响应头已经读取")?;
    let mut cancelled = transfer.cancel.subscribe();
    if *cancelled.borrow() {
        return Err("AI_TRANSPORT_FAILED:请求已取消".into());
    }
    let response = tokio::select! {biased;_=cancelled.changed()=>return Err("AI_TRANSPORT_FAILED:请求已取消".into()),result=ready=>result.map_err(|_|"AI_TRANSPORT_FAILED:请求结束")??};
    lifecycle::with_lease(&transfer.lease, |_| Ok(()))?;
    let status = response.status();
    let result = HttpResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").into(),
        headers: response
            .headers()
            .iter()
            .filter(|(name, _)| !secret_header(name.as_str()))
            .filter_map(|(name, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|value| (name.as_str().into(), value.into()))
            })
            .collect(),
        url: response.url().to_string(),
        has_body: !matches!(status.as_u16(), 204 | 205 | 304),
    };
    download.response = Some(response);
    Ok(result)
}
pub async fn read(id: &str) -> Result<Option<String>, String> {
    let transfer = get(id)?;
    let mut download = transfer.download.lock().await;
    let mut cancelled = transfer.cancel.subscribe();
    if *cancelled.borrow() {
        return Err("AI_TRANSPORT_FAILED:请求已取消".into());
    }
    loop {
        if !download.remaining.is_empty() {
            let size = download.remaining.len().min(CHUNK_BYTES / 2);
            let bytes = download.remaining.split_to(size);
            return lifecycle::with_lease(&transfer.lease, |_| Ok(Some(encode_chunk(&bytes))));
        }
        let response = download
            .response
            .as_mut()
            .ok_or("AI_TRANSPORT_FAILED:响应头尚未读取")?;
        let bytes = tokio::select! {biased;_=cancelled.changed()=>return Err("AI_TRANSPORT_FAILED:请求已取消".into()),result=tokio::time::timeout(Duration::from_secs(120),response.chunk())=>result.map_err(|_|"AI_TRANSPORT_FAILED:读取超时")?.map_err(|_|"AI_TRANSPORT_FAILED:读取失败")?};
        match bytes {
            Some(bytes) => download.remaining = bytes,
            None => {
                drop(download);
                cancel(id)?;
                return Ok(None);
            }
        }
    }
}
pub fn cancel(id: &str) -> Result<(), String> {
    if let Some(transfer) = network()
        .lock()
        .map_err(|_| "AI_TRANSPORT_FAILED:网络状态不可用")?
        .transfers
        .remove(id)
    {
        transfer.cancel.send_replace(true);
    }
    Ok(())
}
pub fn dispose(context_id: &str) -> Result<(), String> {
    let mut state = network()
        .lock()
        .map_err(|_| "AI_TRANSPORT_FAILED:网络状态不可用")?;
    state.contexts.remove(context_id);
    state.transfers.retain(|_, transfer| {
        if transfer.context_id == context_id {
            transfer.cancel.send_replace(true);
            false
        } else {
            true
        }
    });
    Ok(())
}
pub fn release_leases(leases: &[String]) {
    if let Ok(mut state) = network().lock() {
        state
            .contexts
            .retain(|_, context| !leases.contains(&context.lease));
        state.transfers.retain(|_, transfer| {
            if leases.contains(&transfer.lease) {
                transfer.cancel.send_replace(true);
                false
            } else {
                true
            }
        });
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn authorized_model_revision_rejects_changed_provider_before_network_context() {
        let mut setting = serde_json::json!({"llmProviders":[{"id":"provider","baseUrl":"https://original.invalid/v1","apiKey":"test-only-original","models":[{"id":"model","maxTokens":512}]}]});
        let expected = format!(
            "{:x}",
            sha2::Sha256::digest(serde_json::to_vec(&setting["llmProviders"][0]).unwrap())
        );
        assert!(super::assert_model_revision(&setting, "provider", Some(&expected)).is_ok());
        for (key, value) in [
            ("baseUrl", "https://changed.invalid/v1"),
            ("apiKey", "test-only-changed"),
        ] {
            let mut changed = setting.clone();
            changed["llmProviders"][0][key] = serde_json::json!(value);
            assert!(
                super::assert_model_revision(&changed, "provider", Some(&expected))
                    .unwrap_err()
                    .starts_with("AI_CONFIG_CHANGED:")
            );
        }
        setting["llmProviders"][0]["models"][0]["maxTokens"] = serde_json::json!(4096);
        assert!(super::assert_model_revision(&setting, "provider", Some(&expected)).is_err());
        assert!(super::assert_model_revision(&setting, "missing", Some(&expected)).is_err());
        assert!(super::assert_model_revision(&setting, "provider", None).is_ok());
    }
    use super::*;
    #[test]
    fn boundary_does_not_allow_auth_to_other_origin_or_prefix() {
        let base = parse_url("https://example.test/v1").unwrap();
        assert!(within_base(
            &base,
            &parse_url("https://example.test/v1/messages").unwrap()
        ));
        assert!(!within_base(
            &base,
            &parse_url("https://example.test/v10/messages").unwrap()
        ));
        assert!(!within_base(
            &base,
            &parse_url("https://evil.test/v1/messages").unwrap()
        ));
        assert!(parse_url("https://key@example.test/v1").is_err());
    }
    #[test]
    fn configuration_never_exposes_credentials_or_model_headers() {
        let value = public_config(
            &serde_json::json!({"llmProviders":[{"id":"p","apiKey":"secret","headers":{"Authorization":"secret"},"models":[{"id":"m","headers":{"custom-secret":"secret"}}]}]}),
        );
        assert!(!value.to_string().contains("secret"));
        assert_eq!(value["llmProviders"][0]["configured"], true);
    }
    #[tokio::test]
    async fn native_http_injects_frozen_auth_and_streams_without_redirecting() {
        use std::io::{Read, Write};
        for (anthropic, explicit) in [(false, false), (true, false), (false, true), (true, true)] {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let (request_tx, request_rx) = std::sync::mpsc::channel();
            let server = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut request = Vec::new();
                let mut byte = [0];
                while !request.ends_with(b"\r\n\r\n") {
                    stream.read_exact(&mut byte).unwrap();
                    request.push(byte[0]);
                }
                request_tx
                    .send(String::from_utf8(request).unwrap())
                    .unwrap();
                let body = "data: 中文分片\n\n";
                write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len()).unwrap();
                for chunk in body.as_bytes().chunks(2) {
                    stream.write_all(chunk).unwrap();
                }
            });
            let lease = lifecycle::acquire(&format!("{}.db", uuid::Uuid::new_v4())).unwrap();
            let mut setting = serde_json::json!({"llmProviders":[{"id":"p","api":"openai-completions","baseUrl":format!("http://{address}/v1"),"apiKey":"test-only-frozen-key","models":[{"id":"m","headers":{"X-Model":"frozen"}}]}]});
            if explicit {
                setting["llmProviders"][0]["models"][0]["headers"][if anthropic {
                    "x-api-key"
                } else {
                    "Authorization"
                }] = serde_json::json!("explicit-frozen-key");
            }
            let context_id = context(&lease.lease_id, &setting, "p", Some("m")).unwrap();
            setting["llmProviders"][0]["apiKey"] = serde_json::json!("changed-after-freeze");
            let id = open(
                &context_id,
                HttpRequest {
                    url: format!("http://{address}/v1/models"),
                    method: "GET".into(),
                    headers: if anthropic {
                        vec![
                            ("anthropic-version".into(), "2023-06-01".into()),
                            ("x-api-key".into(), "wrong-key".into()),
                        ]
                    } else {
                        vec![("Authorization".into(), "Bearer wrong-key".into())]
                    },
                    has_body: false,
                },
            )
            .unwrap();
            assert_eq!(response(&id).await.unwrap().status, 200);
            let mut bytes = Vec::new();
            while let Some(chunk) = read(&id).await.unwrap() {
                bytes.extend(decode_chunk(&chunk).unwrap());
            }
            assert_eq!(String::from_utf8(bytes).unwrap(), "data: 中文分片\n\n");
            let request = request_rx
                .recv_timeout(Duration::from_secs(5))
                .unwrap()
                .to_lowercase();
            if explicit {
                assert!(request.contains(if anthropic {
                    "x-api-key: explicit-frozen-key"
                } else {
                    "authorization: explicit-frozen-key"
                }));
            } else {
                assert!(request.contains(if anthropic {
                    "x-api-key: test-only-frozen-key"
                } else {
                    "authorization: bearer test-only-frozen-key"
                }));
            }
            assert!(!request.contains("changed-after-freeze"));
            assert!(!request.contains(if anthropic {
                "authorization:"
            } else {
                "x-api-key:"
            }));
            assert!(request.contains("x-model: frozen"));
            assert!(!request.contains("wrong-key"));
            dispose(&context_id).unwrap();
            lifecycle::release(&lease.lease_id).unwrap();
            server.join().unwrap();
        }
    }
}
