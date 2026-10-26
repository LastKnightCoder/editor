//! 用户反馈：匿名身份（visitor token）+ multipart 提交到插件中心同源的 `/v1/app-feedback`。
//! 截图经 `app_feedback_image_write` 按块暂存在内存（Android 字符串 IPC 有消息大小约束），
//! 日志由 logger 收集并 gzip；字段与上限以 `apps/plugin-portal/contracts` 的 `AppFeedback*` 为准。
//! 网络类失败返回 `{ok:false, reason, message}` 让前端保留草稿重试，只有输入/配置错误才返回 Err。

use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::multipart::{Form, Part};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;
use url::Url;

use crate::plugin_center::CenterError;

const MESSAGE_LIMIT: usize = 4000;
const IMAGE_LIMIT: usize = 3;
const IMAGE_BYTES_LIMIT: usize = 1536 * 1024;
const LOG_BYTES_LIMIT: usize = 3 * 1024 * 1024;
const VISITOR_FILE: &str = "feedback/visitor.json";
const SUBMIT_TIMEOUT: Duration = Duration::from_secs(60);
const VISITOR_TIMEOUT: Duration = Duration::from_secs(5);
const OFFLINE_MESSAGE: &str = "没能连上服务器，内容已保留，联网后再发一次就行";

#[derive(Debug, Serialize)]
pub struct FeedbackError {
    status: u16,
    code: String,
    message: String,
}

fn error(status: u16, code: &str, message: &str) -> FeedbackError {
    FeedbackError {
        status,
        code: code.into(),
        message: message.into(),
    }
}

fn invalid(message: &str) -> FeedbackError {
    error(400, "INVALID_INPUT", message)
}

impl From<CenterError> for FeedbackError {
    fn from(value: CenterError) -> Self {
        FeedbackError {
            status: value.status,
            code: value.code,
            message: value.message,
        }
    }
}

static IMAGES: Mutex<BTreeMap<String, Vec<u8>>> = Mutex::new(BTreeMap::new());

fn images() -> MutexGuard<'static, BTreeMap<String, Vec<u8>>> {
    IMAGES.lock().unwrap_or_else(PoisonError::into_inner)
}

fn is_token_like(value: &str, min: usize, max: usize) -> bool {
    (min..=max).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

/// 截图分块写入：`offset == 0` 新建（或重置）该图，后续块必须按顺序追加。
#[tauri::command]
pub fn app_feedback_image_write(
    id: String,
    offset: usize,
    chunk: String,
) -> Result<usize, FeedbackError> {
    if !is_token_like(&id, 1, 64) {
        return Err(invalid("截图标识无效"));
    }
    let bytes = STANDARD
        .decode(chunk)
        .map_err(|_| invalid("截图数据无效"))?;
    let mut store = images();
    if offset == 0 {
        if !store.contains_key(&id) && store.len() >= IMAGE_LIMIT {
            return Err(invalid(&format!("最多附带 {IMAGE_LIMIT} 张截图")));
        }
        store.insert(id.clone(), Vec::new());
    }
    let buffer = store
        .get_mut(&id)
        .ok_or_else(|| invalid("截图尚未开始写入"))?;
    if buffer.len() != offset {
        store.remove(&id);
        return Err(invalid("截图数据顺序错误"));
    }
    if buffer.len() + bytes.len() > IMAGE_BYTES_LIMIT {
        store.remove(&id);
        return Err(error(413, "UPLOAD_TOO_LARGE", "单张截图超过大小限制"));
    }
    buffer.extend_from_slice(&bytes);
    Ok(buffer.len())
}

#[tauri::command]
pub fn app_feedback_image_discard(id: String) {
    images().remove(&id);
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiContext {
    #[serde(default)]
    os_version: Option<String>,
    #[serde(default)]
    theme: Option<String>,
    #[serde(default)]
    locale: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FeedbackInput {
    kind: String,
    message: String,
    include_context: bool,
    #[serde(default)]
    ui_context: UiContext,
    client_request_id: String,
    #[serde(default)]
    image_ids: Vec<String>,
    include_logs: bool,
}

#[derive(Debug)]
struct Validated {
    kind: String,
    message: String,
    client_request_id: String,
}

fn validate(input: &FeedbackInput) -> Result<Validated, FeedbackError> {
    if !["bug", "idea", "other"].contains(&input.kind.as_str()) {
        return Err(invalid("反馈类型无效"));
    }
    let message = input.message.trim();
    if message.is_empty() || message.chars().count() > MESSAGE_LIMIT {
        return Err(invalid(&format!("反馈内容需要 1 至 {MESSAGE_LIMIT} 字")));
    }
    if !is_token_like(&input.client_request_id, 16, 80) {
        return Err(invalid("反馈请求 ID 无效"));
    }
    if input.image_ids.len() > IMAGE_LIMIT {
        return Err(invalid(&format!("最多附带 {IMAGE_LIMIT} 张截图")));
    }
    Ok(Validated {
        kind: input.kind.clone(),
        message: message.to_string(),
        client_request_id: input.client_request_id.clone(),
    })
}

/// 只认文件头魔数，与服务端一致；返回 (MIME, 扩展名)
fn image_mime(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some(("image/webp", "webp"));
    }
    if bytes.len() >= 4 && bytes[0] == 0x89 && &bytes[1..4] == b"PNG" {
        return Some(("image/png", "png"));
    }
    if bytes.len() >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff {
        return Some(("image/jpeg", "jpg"));
    }
    None
}

type Attachment = (Vec<u8>, &'static str, &'static str);

fn collect_images(ids: &[String]) -> Result<Vec<Attachment>, FeedbackError> {
    let store = images();
    ids.iter()
        .map(|id| {
            let bytes = store
                .get(id)
                .ok_or_else(|| invalid("截图数据缺失，请重新选择图片"))?;
            let (mime, extension) =
                image_mime(bytes).ok_or_else(|| invalid("截图只支持 PNG、JPEG 或 WebP"))?;
            Ok((bytes.clone(), mime, extension))
        })
        .collect()
}

fn build_context(app: &AppHandle, ui: &UiContext) -> Value {
    let platform = match crate::plugin_center::platform() {
        "unknown" => std::env::consts::OS,
        platform => platform,
    };
    let mut context = json!({
        "appVersion": app.package_info().version.to_string(),
        "platform": platform,
        "arch": std::env::consts::ARCH,
    });
    for (key, value) in [
        ("osVersion", &ui.os_version),
        ("theme", &ui.theme),
        ("locale", &ui.locale),
    ] {
        if let Some(value) = value.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            context[key] = json!(value);
        }
    }
    context
}

fn http_client() -> Result<reqwest::Client, FeedbackError> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(SUBMIT_TIMEOUT)
        .build()
        .map_err(|_| error(0, "NETWORK_ERROR", "无法创建网络连接"))
}

fn visitor_path(app: &AppHandle) -> Result<PathBuf, FeedbackError> {
    crate::setting::resolve_app_dir(app)
        .map(|dir| dir.join(VISITOR_FILE))
        .map_err(|reason| error(500, "STORAGE_ERROR", &reason))
}

fn saved_visitor(file: &Path, origin: &str) -> Option<String> {
    let saved: Value = serde_json::from_slice(&fs::read(file).ok()?).ok()?;
    let token = saved["token"].as_str()?;
    (saved["origin"] == origin && is_token_like(token, 64, 128)).then(|| token.to_string())
}

/// 安装级匿名凭证只保存在应用私有目录，原子写入且仅本用户可读
fn save_visitor(file: &Path, origin: &str, token: &str) -> Result<(), String> {
    let parent = file.parent().ok_or("凭证路径无效")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temporary = file.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut handle = options.open(&temporary).map_err(|e| e.to_string())?;
    let payload = json!({ "origin": origin, "token": token }).to_string();
    let written = handle
        .write_all(payload.as_bytes())
        .and_then(|()| handle.sync_all())
        .and_then(|()| fs::rename(&temporary, file));
    if let Err(reason) = written {
        let _ = fs::remove_file(&temporary);
        return Err(reason.to_string());
    }
    Ok(())
}

async fn ensure_visitor_token(
    client: &reqwest::Client,
    origin: &Url,
    file: &Path,
) -> Result<String, String> {
    let origin_name = origin.origin().ascii_serialization();
    if let Some(token) = saved_visitor(file, &origin_name) {
        return Ok(token);
    }
    let url = origin
        .join("/v1/visitor-session")
        .map_err(|_| "匿名身份地址无效".to_string())?;
    let response = client
        .post(url)
        .header("X-Tau-Visitor", "1")
        .timeout(VISITOR_TIMEOUT)
        .json(&json!({ "client": "mobile" }))
        .send()
        .await
        .map_err(|_| OFFLINE_MESSAGE.to_string())?;
    let status = response.status();
    let body: Value = response.json().await.unwrap_or(Value::Null);
    let token = body["data"]["token"].as_str().unwrap_or_default();
    if !status.is_success() || !is_token_like(token, 64, 128) {
        return Err(body["error"]["message"]
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| format!("匿名身份申请失败（{}）", status.as_u16())));
    }
    save_visitor(file, &origin_name, token)?;
    Ok(token.to_string())
}

fn failure(reason: &str, message: &str) -> Value {
    json!({ "ok": false, "reason": reason, "message": message })
}

/// 服务端状态码归类：前端据 reason 决定文案与是否允许原样重试
fn read_response(status: u16, body: &Value) -> Value {
    if (200..300).contains(&status) {
        if let Some(id) = body["data"]["id"].as_str() {
            return json!({ "ok": true, "id": id });
        }
    }
    let reason = match status {
        429 => "limit",
        400 | 413 => "invalid",
        403 => "forbidden",
        _ => "server",
    };
    let fallback = format!("反馈服务暂时不可用（{status}）");
    failure(
        reason,
        body["error"]["message"].as_str().unwrap_or(&fallback),
    )
}

async fn post_feedback(
    client: &reqwest::Client,
    origin: &Url,
    token: &str,
    meta: Value,
    images: Vec<Attachment>,
    log: Option<Vec<u8>>,
) -> Result<Value, String> {
    let url = origin
        .join("/v1/app-feedback")
        .map_err(|_| "反馈地址无效".to_string())?;
    let mut form = Form::new().text("meta", meta.to_string());
    for (bytes, mime, extension) in images {
        let part = Part::bytes(bytes)
            .file_name(format!("screenshot.{extension}"))
            .mime_str(mime)
            .map_err(|e| e.to_string())?;
        form = form.part("image", part);
    }
    if let Some(bytes) = log {
        let part = Part::bytes(bytes)
            .file_name("app.log.gz")
            .mime_str("application/gzip")
            .map_err(|e| e.to_string())?;
        form = form.part("log", part);
    }
    let response = client
        .post(url)
        .bearer_auth(token)
        .header("X-Tau-Visitor", "1")
        .multipart(form)
        .send()
        .await
        .map_err(|_| OFFLINE_MESSAGE.to_string())?;
    let status = response.status().as_u16();
    let body: Value = response.json().await.unwrap_or(Value::Null);
    Ok(read_response(status, &body))
}

#[tauri::command]
pub async fn app_feedback_submit(
    app: AppHandle,
    input: FeedbackInput,
) -> Result<Value, FeedbackError> {
    let validated = validate(&input)?;
    let attachments = collect_images(&input.image_ids)?;
    let log = input.include_logs.then(crate::logger::collect_feedback_log);
    if log
        .as_ref()
        .is_some_and(|bytes| bytes.len() > LOG_BYTES_LIMIT)
    {
        return Err(error(
            413,
            "UPLOAD_TOO_LARGE",
            "日志过大，请取消勾选后再发送",
        ));
    }
    let origin = crate::plugin_center::center_origin()?;
    let visitor_file = visitor_path(&app)?;
    let client = http_client()?;
    let context = input
        .include_context
        .then(|| build_context(&app, &input.ui_context));
    let meta = json!({
        "kind": validated.kind,
        "message": validated.message,
        "contact": null,
        "context": context,
        "clientRequestId": validated.client_request_id,
    });
    let outcome = async {
        let token = ensure_visitor_token(&client, &origin, &visitor_file).await?;
        post_feedback(&client, &origin, &token, meta, attachments, log).await
    }
    .await;
    let result = outcome.unwrap_or_else(|message| failure("network", &message));
    if result["ok"] == true {
        let mut store = images();
        for id in &input.image_ids {
            store.remove(id);
        }
        crate::logger::info(format!(
            "[feedback] 已提交 id={} kind={} images={} logs={}",
            result["id"].as_str().unwrap_or(""),
            validated.kind,
            input.image_ids.len(),
            input.include_logs
        ));
    } else {
        crate::logger::warn(format!(
            "[feedback] 提交失败 reason={} message={}",
            result["reason"].as_str().unwrap_or(""),
            result["message"].as_str().unwrap_or("")
        ));
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};

    fn temp_file() -> PathBuf {
        std::env::temp_dir().join(format!(
            "tau-feedback-{}/visitor.json",
            uuid::Uuid::new_v4()
        ))
    }

    fn input(message: &str) -> FeedbackInput {
        FeedbackInput {
            kind: "bug".into(),
            message: message.into(),
            include_context: true,
            ui_context: UiContext::default(),
            client_request_id: "a".repeat(32),
            image_ids: Vec::new(),
            include_logs: false,
        }
    }

    /// 读完整请求：先到头部结束，再按 Content-Length 补齐正文
    fn read_request(stream: &mut TcpStream) -> (String, Vec<u8>) {
        let mut buffer = Vec::new();
        let mut chunk = [0u8; 8192];
        let header_end = loop {
            let read = stream.read(&mut chunk).unwrap();
            assert!(read > 0, "连接提前关闭");
            buffer.extend_from_slice(&chunk[..read]);
            if let Some(position) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
                break position + 4;
            }
        };
        let head = String::from_utf8_lossy(&buffer[..header_end]).to_string();
        let length = head
            .lines()
            .find_map(|line| {
                line.to_ascii_lowercase()
                    .strip_prefix("content-length:")
                    .map(|value| value.trim().parse::<usize>().unwrap())
            })
            .unwrap_or(0);
        while buffer.len() < header_end + length {
            let read = stream.read(&mut chunk).unwrap();
            assert!(read > 0, "正文不完整");
            buffer.extend_from_slice(&chunk[..read]);
        }
        (head, buffer[header_end..header_end + length].to_vec())
    }

    fn respond(stream: &mut TcpStream, status: &str, body: &str) {
        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        stream.write_all(response.as_bytes()).unwrap();
    }

    fn local_origin(listener: &TcpListener) -> Url {
        crate::plugin_center::validate_origin(
            &format!("http://{}", listener.local_addr().unwrap()),
            true,
        )
        .unwrap()
    }

    #[test]
    fn validates_fields_like_the_server() {
        assert!(validate(&input("有个问题")).is_ok());
        assert_eq!(validate(&input("   ")).unwrap_err().code, "INVALID_INPUT");
        assert!(validate(&input(&"字".repeat(MESSAGE_LIMIT + 1))).is_err());
        let mut bad_kind = input("x");
        bad_kind.kind = "praise".into();
        assert!(validate(&bad_kind).is_err());
        let mut bad_request = input("x");
        bad_request.client_request_id = "short".into();
        assert!(validate(&bad_request).is_err());
        let mut too_many = input("x");
        too_many.image_ids = vec!["a".into(), "b".into(), "c".into(), "d".into()];
        assert!(too_many.image_ids.len() > IMAGE_LIMIT && validate(&too_many).is_err());
    }

    #[test]
    fn detects_image_type_by_magic_bytes() {
        assert_eq!(
            image_mime(b"\x89PNG\r\n\x1a\n").map(|v| v.0),
            Some("image/png")
        );
        assert_eq!(image_mime(b"\xff\xd8\xff\xe0").map(|v| v.1), Some("jpg"));
        assert_eq!(
            image_mime(b"RIFF\0\0\0\0WEBPVP8 ").map(|v| v.0),
            Some("image/webp")
        );
        assert_eq!(image_mime(b"<svg"), None);
    }

    #[test]
    fn stages_images_in_order_and_enforces_limits() {
        images().clear();
        let id = format!("img-{}", uuid::Uuid::new_v4().simple());
        let png = STANDARD.encode(b"\x89PNG\r\n\x1a\n");
        assert_eq!(
            app_feedback_image_write(id.clone(), 0, png.clone()).unwrap(),
            8
        );
        assert_eq!(
            app_feedback_image_write(id.clone(), 8, STANDARD.encode(b"tail")).unwrap(),
            12
        );
        // 乱序写入丢弃该图
        assert!(app_feedback_image_write(id.clone(), 4, png.clone()).is_err());
        assert!(images().get(&id).is_none());
        assert!(app_feedback_image_write("bad id".into(), 0, png.clone()).is_err());
        assert!(app_feedback_image_write(id.clone(), 0, "***".into()).is_err());
        // 超过单张上限
        app_feedback_image_write(id.clone(), 0, png.clone()).unwrap();
        let oversized = STANDARD.encode(vec![0u8; IMAGE_BYTES_LIMIT]);
        assert_eq!(
            app_feedback_image_write(id.clone(), 8, oversized)
                .unwrap_err()
                .code,
            "UPLOAD_TOO_LARGE"
        );
        // 最多 3 张
        for index in 0..IMAGE_LIMIT {
            app_feedback_image_write(format!("slot-{index}"), 0, png.clone()).unwrap();
        }
        assert!(app_feedback_image_write("slot-extra".into(), 0, png.clone()).is_err());
        app_feedback_image_discard("slot-0".into());
        assert!(app_feedback_image_write("slot-extra".into(), 0, png).is_ok());
        images().clear();
    }

    #[test]
    fn maps_status_codes_to_retry_reasons() {
        let ok = read_response(200, &json!({"data":{"id":"fb-1"}}));
        assert_eq!(ok, json!({"ok":true,"id":"fb-1"}));
        assert_eq!(
            read_response(429, &json!({"error":{"message":"今天已经发了不少反馈"}}))["reason"],
            "limit"
        );
        assert_eq!(read_response(413, &Value::Null)["reason"], "invalid");
        assert_eq!(read_response(403, &Value::Null)["reason"], "forbidden");
        let server = read_response(500, &Value::Null);
        assert_eq!(server["reason"], "server");
        assert_eq!(server["message"], "反馈服务暂时不可用（500）");
        // 2xx 但没有 id 也按失败处理
        assert_eq!(read_response(200, &json!({"data":{}}))["ok"], false);
    }

    #[tokio::test]
    async fn requests_visitor_once_and_reuses_saved_token() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let origin = local_origin(&listener);
        let token = "t".repeat(64);
        let expected = token.clone();
        let thread = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let (head, body) = read_request(&mut stream);
            assert!(head.starts_with("POST /v1/visitor-session "));
            assert!(head.to_ascii_lowercase().contains("x-tau-visitor: 1"));
            assert!(!head.to_ascii_lowercase().contains("\norigin:"));
            assert_eq!(
                serde_json::from_slice::<Value>(&body).unwrap(),
                json!({"client":"mobile"})
            );
            respond(
                &mut stream,
                "200 OK",
                &json!({"data":{"visitorId":"v1","token":expected}}).to_string(),
            );
        });
        let file = temp_file();
        let client = http_client().unwrap();
        let first = ensure_visitor_token(&client, &origin, &file).await.unwrap();
        thread.join().unwrap();
        assert_eq!(first, token);
        let saved: Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
        assert_eq!(saved["origin"], origin.origin().ascii_serialization());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&file).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        // 监听已关闭，第二次只能来自本地文件
        let second = ensure_visitor_token(&client, &origin, &file).await.unwrap();
        assert_eq!(second, token);
        // 不同来源的凭证不复用
        let other = Url::parse("https://other.example/").unwrap();
        assert!(saved_visitor(&file, &other.origin().ascii_serialization()).is_none());
        fs::remove_dir_all(file.parent().unwrap()).unwrap();
    }

    #[tokio::test]
    async fn rejects_visitor_without_valid_token() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let origin = local_origin(&listener);
        let thread = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            read_request(&mut stream);
            respond(
                &mut stream,
                "400 Bad Request",
                r#"{"error":{"code":"INVALID_INPUT","message":"匿名会话客户端类型无效"}}"#,
            );
        });
        let file = temp_file();
        let result = ensure_visitor_token(&http_client().unwrap(), &origin, &file).await;
        thread.join().unwrap();
        assert_eq!(result.unwrap_err(), "匿名会话客户端类型无效");
        assert!(!file.exists());
    }

    #[tokio::test]
    async fn posts_multipart_with_meta_images_and_gzip_log() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let origin = local_origin(&listener);
        let thread = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let (head, body) = read_request(&mut stream);
            let lower = head.to_ascii_lowercase();
            assert!(head.starts_with("POST /v1/app-feedback "));
            assert!(lower.contains(&format!("authorization: bearer {}", "t".repeat(64))));
            assert!(lower.contains("x-tau-visitor: 1"));
            assert!(lower.contains("content-type: multipart/form-data; boundary="));
            let text = String::from_utf8_lossy(&body);
            assert!(text.contains("name=\"meta\""));
            assert!(text.contains(r#""kind":"bug""#));
            assert!(text.contains(r#""clientRequestId":"#));
            assert!(text.contains("name=\"image\"; filename=\"screenshot.png\""));
            assert!(text.contains("Content-Type: image/png"));
            assert!(text.contains("name=\"log\"; filename=\"app.log.gz\""));
            assert!(text.contains("Content-Type: application/gzip"));
            // gzip 魔数紧跟 log 部分的空行之后
            let log_start = body
                .windows(b"application/gzip\r\n\r\n".len())
                .position(|w| w == b"application/gzip\r\n\r\n")
                .unwrap()
                + b"application/gzip\r\n\r\n".len();
            assert_eq!(&body[log_start..log_start + 2], &[0x1f, 0x8b]);
            respond(
                &mut stream,
                "200 OK",
                r#"{"data":{"id":"fb-42","createdAt":"2026-10-26T00:00:00.000Z"}}"#,
            );
        });
        let meta = json!({"kind":"bug","message":"hi","contact":null,"context":null,"clientRequestId":"a".repeat(32)});
        let images = vec![(b"\x89PNG\r\n\x1a\nxx".to_vec(), "image/png", "png")];
        let log = Some(vec![0x1f, 0x8b, 0x08, 0x00]);
        let result = post_feedback(
            &http_client().unwrap(),
            &origin,
            &"t".repeat(64),
            meta,
            images,
            log,
        )
        .await
        .unwrap();
        thread.join().unwrap();
        assert_eq!(result, json!({"ok":true,"id":"fb-42"}));
    }

    #[tokio::test]
    async fn offline_submission_is_reported_as_network_failure() {
        // 绑定后立刻释放端口，连接必然失败
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let origin = local_origin(&listener);
        drop(listener);
        let result = post_feedback(
            &http_client().unwrap(),
            &origin,
            "token",
            json!({}),
            Vec::new(),
            None,
        )
        .await;
        assert_eq!(result.unwrap_err(), OFFLINE_MESSAGE);
    }
}
