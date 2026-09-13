// 移动端协作运行时：设备身份管理 + 协作服务器 REST 网关。
//
// 网络出口收口在 Rust 侧的原因：移动端所有网络访问均已统一在 Rust（reqwest + rustls），
// 且 WebView 的 fetch 受同源策略约束会被协作服务器拒绝；WebSocket 无同源限制，
// 实时通道（/ws、/events）仍由 WebView 直连。
//
// 身份按服务器地址隔离，明文存于应用数据目录 `.editor/collaboration/identity.json`
// （与项目既有 setting.json 的存储策略一致）。

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::setting::resolve_app_dir;

const IDENTITY_FILE: &str = "collaboration/identity.json";
const DEFAULT_NICKNAME: &str = "Tau 用户";
const NICKNAME_MAX_CHARS: usize = 40;
const REQUEST_TIMEOUT_SECS: u64 = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdentity {
    pub id: String,
    pub secret: String,
    pub nickname: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetIdentityPayload {
    pub server_url: String,
    pub nickname: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNicknamePayload {
    pub server_url: String,
    pub nickname: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollabRequestPayload {
    pub server_url: String,
    pub path: String,
    pub method: Option<String>,
    pub body: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct IdentityFile {
    identities: HashMap<String, DeviceIdentity>,
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .expect("failed to build collaboration http client")
    })
}

/// 与 packages/collaboration/src/protocol.ts 的 normalizeServerUrl 对齐：
/// 强制 HTTPS（回环地址可用 HTTP），拒绝凭据、路径、查询与锚点。
fn normalize_server_url(value: &str) -> Result<String, String> {
    let parsed = url::Url::parse(value.trim())
        .map_err(|_| "COLLAB_INVALID_URL: 协作服务器地址无效".to_string())?;
    if !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err("COLLAB_INVALID_URL: 协作服务器地址不能包含凭据、查询参数或锚点".to_string());
    }
    let host = parsed.host_str().unwrap_or_default();
    let loopback = matches!(host, "localhost" | "127.0.0.1" | "::1");
    match parsed.scheme() {
        "https" => {}
        "http" if loopback => {}
        _ => {
            return Err(
                "COLLAB_INVALID_URL: 协作服务器必须使用 HTTPS，本机调试可使用 HTTP".to_string(),
            )
        }
    }
    if !matches!(parsed.path(), "" | "/") {
        return Err("COLLAB_INVALID_URL: 协作服务器地址不能包含路径".to_string());
    }
    Ok(parsed.origin().ascii_serialization())
}

fn validate_nickname(value: &str) -> Result<String, String> {
    let nickname = value.trim();
    let chars = nickname.chars().count();
    if chars == 0 || chars > NICKNAME_MAX_CHARS {
        return Err(format!(
            "COLLAB_INVALID_NICKNAME: 昵称需为 1-{NICKNAME_MAX_CHARS} 个字符"
        ));
    }
    Ok(nickname.to_string())
}

fn identity_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resolve_app_dir(app)?.join(IDENTITY_FILE))
}

fn read_identities(app: &AppHandle) -> Result<HashMap<String, DeviceIdentity>, String> {
    let path = identity_path(app)?;
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("COLLAB_IDENTITY_READ_FAILED: 读取协作身份失败：{e}"))?;
    // 文件损坏时视为无身份，走重新注册，避免阻塞协作功能可用性
    Ok(serde_json::from_str::<IdentityFile>(&raw)
        .map(|file| file.identities)
        .unwrap_or_default())
}

/// 进程内身份缓存（按服务器 URL）。Tauri 异步命令并发执行，「读盘→无→注册→写盘」
/// 若无串行化，首次注册窗口内并发请求会向服务器注册两个设备（其一即作废）。
/// 全局单锁足够：注册每服务器只发生一次（之后缓存命中），低频且无重入，
/// 不值得按 URL 分锁；缓存命中也免去了每次请求读盘。
fn identity_cache() -> &'static tokio::sync::Mutex<HashMap<String, DeviceIdentity>> {
    static CACHE: OnceLock<tokio::sync::Mutex<HashMap<String, DeviceIdentity>>> = OnceLock::new();
    CACHE.get_or_init(|| tokio::sync::Mutex::new(HashMap::new()))
}

fn write_identities(
    app: &AppHandle,
    identities: &HashMap<String, DeviceIdentity>,
) -> Result<(), String> {
    let path = identity_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("COLLAB_IDENTITY_WRITE_FAILED: 创建协作目录失败：{e}"))?;
    }
    let payload = serde_json::to_string_pretty(&json!({ "identities": identities }))
        .map_err(|e| format!("COLLAB_IDENTITY_WRITE_FAILED: 序列化协作身份失败：{e}"))?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, payload)
        .map_err(|e| format!("COLLAB_IDENTITY_WRITE_FAILED: 写入协作身份失败：{e}"))?;
    fs::rename(&temporary, &path)
        .map_err(|e| format!("COLLAB_IDENTITY_WRITE_FAILED: 保存协作身份失败：{e}"))?;
    Ok(())
}

async fn send_json(
    server_url: &str,
    path: &str,
    method: &str,
    body: Option<&Value>,
    bearer: Option<&str>,
) -> Result<Value, String> {
    let url = format!("{server_url}{path}");
    let mut request = match method.to_ascii_uppercase().as_str() {
        "GET" => client().get(&url),
        "POST" => client().post(&url),
        "PATCH" => client().patch(&url),
        "DELETE" => client().delete(&url),
        other => {
            return Err(format!(
                "COLLAB_REQUEST_FAILED: 不支持的请求方法 {other}"
            ))
        }
    };
    if let Some(token) = bearer {
        request = request.header("Authorization", format!("Bearer {token}"));
    }
    if let Some(payload) = body {
        request = request.json(payload);
    }
    let response = request.send().await.map_err(|error| {
        if error.is_timeout() {
            "COLLAB_TIMEOUT: 协作服务器响应超时，请检查网络后重试".to_string()
        } else {
            format!("COLLAB_NETWORK: 无法连接协作服务器：{error}")
        }
    })?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("COLLAB_REQUEST_FAILED: 读取协作服务器响应失败：{e}"))?;
    let parsed: Value = if text.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(&text).unwrap_or(Value::String(text))
    };
    if !status.is_success() {
        let message = parsed
            .get("message")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("协作请求失败（HTTP {}）", status.as_u16()));
        let code = parsed
            .get("code")
            .and_then(Value::as_str)
            .map(|value| value.to_ascii_uppercase().replace('-', "_"))
            .unwrap_or_else(|| format!("HTTP_{}", status.as_u16()));
        return Err(format!("COLLAB_{code}: {message}"));
    }
    Ok(parsed)
}

/// 取（必要时注册）指定服务器的设备身份。同一服务器的并发请求经缓存锁串行化，
/// 注册只发生一次。
async fn ensure_identity(
    app: &AppHandle,
    server_url: &str,
    nickname: Option<&str>,
) -> Result<DeviceIdentity, String> {
    let url = normalize_server_url(server_url)?;
    let mut cache = identity_cache().lock().await;
    if let Some(identity) = cache.get(&url) {
        return Ok(identity.clone());
    }
    let mut stored = read_identities(app)?;
    if let Some(identity) = stored.get(&url) {
        let identity = identity.clone();
        cache.insert(url, identity.clone());
        return Ok(identity);
    }
    let nickname = match nickname.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => validate_nickname(value)?,
        None => DEFAULT_NICKNAME.to_string(),
    };
    let created: DeviceIdentity = serde_json::from_value(
        send_json(
            &url,
            "/v1/devices",
            "POST",
            Some(&json!({ "nickname": nickname })),
            None,
        )
        .await?,
    )
    .map_err(|e| format!("COLLAB_IDENTITY_INVALID: 服务器返回的设备身份无效：{e}"))?;
    stored.insert(url.clone(), created.clone());
    write_identities(app, &stored)?;
    cache.insert(url, created.clone());
    Ok(created)
}

/// 获取本机在指定服务器的协作身份（不存在则自动注册并落盘）。
#[tauri::command]
pub async fn collab_get_identity(
    app: AppHandle,
    payload: GetIdentityPayload,
) -> Result<DeviceIdentity, String> {
    ensure_identity(&app, &payload.server_url, payload.nickname.as_deref()).await
}

/// 修改昵称：先同步服务器，成功后再落盘并更新缓存，避免本地与远端不一致。
#[tauri::command]
pub async fn collab_update_nickname(
    app: AppHandle,
    payload: UpdateNicknamePayload,
) -> Result<DeviceIdentity, String> {
    let url = normalize_server_url(&payload.server_url)?;
    let nickname = validate_nickname(&payload.nickname)?;
    let identity = ensure_identity(&app, &url, None).await?;
    let bearer = format!("{}:{}", identity.id, identity.secret);
    send_json(
        &url,
        "/v1/devices/me",
        "PATCH",
        Some(&json!({ "nickname": nickname })),
        Some(&bearer),
    )
    .await?;
    let mut updated = identity;
    updated.nickname = nickname;
    let mut stored = read_identities(&app)?;
    stored.insert(url.clone(), updated.clone());
    write_identities(&app, &stored)?;
    identity_cache().lock().await.insert(url, updated.clone());
    Ok(updated)
}

/// 协作服务器 REST 网关：自动附带 Bearer 身份，统一错误码前缀 COLLAB_。
#[tauri::command]
pub async fn collab_request(
    app: AppHandle,
    payload: CollabRequestPayload,
) -> Result<Value, String> {
    let server_url = normalize_server_url(&payload.server_url)?;
    if !payload.path.starts_with("/v1/") {
        return Err("COLLAB_REQUEST_FAILED: 非法接口路径".to_string());
    }
    let bearer = if payload.path == "/v1/devices" {
        None
    } else {
        let identity = ensure_identity(&app, &server_url, None).await?;
        Some(format!("{}:{}", identity.id, identity.secret))
    };
    let method = payload.method.unwrap_or_else(|| "GET".to_string());
    send_json(
        &server_url,
        &payload.path,
        &method,
        payload.body.as_ref(),
        bearer.as_deref(),
    )
    .await
}
