// 移动端协作运行时：设备身份管理 + 协作服务器 REST 网关。
//
// 网络出口收口在 Rust 侧的原因：移动端所有网络访问均已统一在 Rust（reqwest + rustls），
// 且 WebView 的 fetch 受同源策略约束会被协作服务器拒绝；WebSocket 无同源限制，
// 实时通道（/ws、/events）仍由 WebView 直连。
//
// 身份按服务器地址隔离，明文存于应用数据目录 `.editor/collaboration/identity.json`
// （与项目既有 setting.json 的存储策略一致）。

use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
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
        other => return Err(format!("COLLAB_REQUEST_FAILED: 不支持的请求方法 {other}")),
    };
    request = request.header("x-tau-document-version", "2");
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

pub(crate) fn session_store(app: &AppHandle) -> Result<rusqlite::Connection, String> {
    let directory = resolve_app_dir(app)?.join("collaboration");
    fs::create_dir_all(&directory).map_err(|e| format!("COLLAB_CACHE_FAILED: {e}"))?;
    let conn = rusqlite::Connection::open(directory.join("collaboration.db"))
        .map_err(|e| format!("COLLAB_CACHE_FAILED: {e}"))?;
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if version > 2 {
        return Err("COLLAB_CACHE_VERSION: 本机文档格式较新".into());
    }
    let existing: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='sessions')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if existing && version != 2 {
        return Err("COLLAB_CACHE_VERSION: 本机协作缓存格式不受支持".into());
    }
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "synchronous", "FULL")
        .map_err(|e| e.to_string())?;
    conn.execute_batch(include_str!(
        "../../../../packages/db-schema/schema/collaboration.sql"
    ))
    .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "user_version", 2)
        .map_err(|e| e.to_string())?;
    Ok(conn)
}
fn session_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 256 || id.chars().any(char::is_control) {
        return Err("COLLAB_CACHE_ID: 文档身份无效".into());
    }
    Ok(())
}
fn last_sequence(conn: &rusqlite::Connection, id: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT coalesce(max(id),0) FROM updates WHERE document_id=?1",
        [id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn collab_cache_read(app: AppHandle, document_id: String) -> Result<Value, String> {
    use base64::Engine;
    use rusqlite::OptionalExtension;
    session_id(&document_id)?;
    let mut connection = session_store(&app)?;
    let conn = connection.transaction().map_err(|e| e.to_string())?;
    let row: Option<(String, Vec<u8>, Option<String>)> = conn
        .query_row(
            "SELECT metadata,state,state_hash FROM sessions WHERE id=?1",
            [&document_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((metadata, state, hash)) = row else {
        return Ok(Value::Null);
    };
    if hash.as_deref() != Some(format!("{:x}", Sha256::digest(&state)).as_str()) {
        return Err("COLLAB_CACHE_CORRUPT: 本机快照校验失败，原文件已保留".into());
    }
    let mut statement = conn
        .prepare("SELECT state,hash FROM updates WHERE document_id=?1 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let updates = statement
        .query_map([&document_id], |row| {
            Ok((row.get::<_, Vec<u8>>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut values = Vec::new();
    for update in updates {
        let (bytes, hash) = update.map_err(|e| e.to_string())?;
        if hash != format!("{:x}", Sha256::digest(&bytes)) {
            return Err("COLLAB_CACHE_CORRUPT: 本机增量校验失败，原文件已保留".into());
        }
        values.push(base64::engine::general_purpose::STANDARD.encode(bytes));
    }
    let metadata: Value = serde_json::from_str(&metadata).map_err(|e| e.to_string())?;
    let mut statement = conn.prepare("SELECT view_id,node_id,field,value,revision,sequence FROM input_drafts WHERE document_id=?1 AND baseline_id=?2 AND epoch=?3 AND applied=0").map_err(|e|e.to_string())?;
    let drafts = statement
        .query_map(
            rusqlite::params![
                document_id,
                metadata["baselineId"].as_str(),
                metadata["epoch"].as_i64()
            ],
            |row| {
                Ok(DraftConfirmation {
                    view_id: row.get(0)?,
                    node_id: row.get(1)?,
                    field: row.get(2)?,
                    value: row.get(3)?,
                    revision: row.get(4)?,
                    sequence: row.get(5)?,
                })
            },
        )
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(
        json!({"metadata":metadata,"state":base64::engine::general_purpose::STANDARD.encode(state),"updates":values,"revision":cache_revision(&conn,&document_id)?,"inputDrafts":drafts}),
    )
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftConfirmation {
    view_id: String,
    node_id: String,
    field: String,
    value: String,
    revision: String,
    sequence: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCacheWrite {
    #[serde(default)]
    confirmed_drafts: Vec<DraftConfirmation>,
    #[serde(default)]
    resources: Vec<String>,
    #[serde(default)]
    references: Vec<Value>,
    document_id: String,
    metadata: Value,
    state: String,
    expected_revision: Option<String>,
}
fn cache_bytes(input: &SessionCacheWrite) -> Result<Vec<u8>, String> {
    use base64::Engine;
    session_id(&input.document_id)?;
    if input.metadata["id"] != input.document_id
        || !input.metadata.is_object()
        || input.state.len() > 12 * 1024 * 1024
        || input.metadata.to_string().len() > 1024 * 1024
    {
        return Err("COLLAB_CACHE_INVALID: 本机文档记录无效".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&input.state)
        .map_err(|_| "COLLAB_CACHE_INVALID: 增量编码无效".to_string())?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("COLLAB_CACHE_CAPACITY: 文档超过容量".into());
    }
    Ok(bytes)
}
fn cache_metadata(tx: &rusqlite::Transaction, input: &SessionCacheWrite) -> Result<String, String> {
    use rusqlite::OptionalExtension;
    if input.resources.len() > 100_000 || input.references.len() > 150_000 {
        return Err("COLLAB_CACHE_CAPACITY: 持有关系超过容量".into());
    }
    let previous: Option<String> = tx
        .query_row(
            "SELECT metadata FROM sessions WHERE id=?1",
            [&input.document_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let mut resources = BTreeSet::new();
    if let Some(previous) = previous {
        let previous: Value = serde_json::from_str(&previous).map_err(|e| e.to_string())?;
        if let Some(entries) = previous["resources"].as_array() {
            for value in entries {
                if let Some(value) = value.as_str() {
                    resources.insert(value.to_string());
                }
            }
        }
    }
    for resource in &input.resources {
        if resource.len() > 8192 {
            return Err("COLLAB_CACHE_CAPACITY: 资源引用过长".into());
        }
        resources.insert(resource.clone());
    }
    let workspace = input.metadata["source"]["librarySourceId"]
        .as_str()
        .unwrap_or("application");
    for reference in &input.references {
        let source = reference["sourceId"]
            .as_str()
            .ok_or("COLLAB_REFERENCE_INVALID")?;
        let kind = reference["kind"]
            .as_str()
            .ok_or("COLLAB_REFERENCE_INVALID")?;
        let entity = reference["entityId"]
            .as_str()
            .ok_or("COLLAB_REFERENCE_INVALID")?;
        session_id(source)?;
        session_id(entity)?;
        if ![
            "whiteboard-content",
            "data-table",
            "project-item",
            "card",
            "article",
            "diary-moment",
            "whiteboard",
            "content",
            "video-note",
        ]
        .contains(&kind)
        {
            return Err("COLLAB_REFERENCE_INVALID".into());
        }
        tx.execute(
            "INSERT OR IGNORE INTO entity_holds VALUES (?1,?2,?3,?4,?5,?6)",
            rusqlite::params![
                workspace,
                format!("document:{}", input.document_id),
                if input.metadata["mode"] == "local" {
                    "undo"
                } else {
                    "shared-membership"
                },
                source,
                kind,
                entity
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    let mut metadata = input.metadata.clone();
    metadata["resources"] = json!(resources);
    let result = metadata.to_string();
    if result.len() > 1024 * 1024 {
        return Err("COLLAB_CACHE_CAPACITY: 缓存元数据超过容量".into());
    }
    Ok(result)
}

fn cache_baseline(tx: &rusqlite::Transaction, input: &SessionCacheWrite) -> Result<bool, String> {
    use rusqlite::OptionalExtension;
    let previous: Option<String> = tx
        .query_row(
            "SELECT metadata FROM sessions WHERE id=?1",
            [&input.document_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(previous) = previous else {
        return Ok(false);
    };
    let previous: Value = serde_json::from_str(&previous)
        .map_err(|_| "COLLAB_CACHE_CORRUPT: 本机元数据损坏".to_string())?;
    if previous["baselineId"] != input.metadata["baselineId"]
        || previous["epoch"] != input.metadata["epoch"]
    {
        return Err("COLLAB_BASELINE_CHANGED: 必须先保全原副本再接收新代次".into());
    }
    Ok(true)
}
fn cache_revision(conn: &rusqlite::Connection, id: &str) -> Result<String, String> {
    let (hash, metadata): (String, String) = conn
        .query_row(
            "SELECT state_hash,metadata FROM sessions WHERE id=?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    Ok(format!(
        "{}:{:x}:{}",
        hash,
        Sha256::digest(metadata.as_bytes()),
        last_sequence(conn, id)?
    ))
}

#[tauri::command]
pub fn collab_cache_snapshot(app: AppHandle, payload: SessionCacheWrite) -> Result<String, String> {
    let _lock = CACHE_WRITE_LOCK.lock().map_err(|_| "缓存保存锁不可用")?;
    let mut conn = session_store(&app)?;
    write_cache_snapshot(&mut conn, payload)
}
fn write_cache_snapshot(
    conn: &mut rusqlite::Connection,
    payload: SessionCacheWrite,
) -> Result<String, String> {
    let bytes = cache_bytes(&payload)?;
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    if cache_baseline(&tx, &payload)?
        && payload.expected_revision.as_deref()
            != Some(cache_revision(&tx, &payload.document_id)?.as_str())
    {
        return Err("COLLAB_CACHE_CONFLICT: 本机增量仍在变化".into());
    }
    let metadata = cache_metadata(&tx, &payload)?;
    tx.execute("INSERT INTO sessions(id,metadata,state,state_hash) VALUES (?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata,state=excluded.state,state_hash=excluded.state_hash", rusqlite::params![payload.document_id,metadata,bytes,format!("{:x}",Sha256::digest(&bytes))]).map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM updates WHERE document_id=?1",
        [&payload.document_id],
    )
    .map_err(|e| e.to_string())?;
    confirm_input_drafts(&tx, &payload)?;
    let revision = cache_revision(&tx, &payload.document_id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(revision)
}
#[tauri::command]
pub fn collab_cache_append(app: AppHandle, payload: SessionCacheWrite) -> Result<String, String> {
    let _lock = CACHE_WRITE_LOCK.lock().map_err(|_| "缓存保存锁不可用")?;
    let mut conn = session_store(&app)?;
    write_cache_update(&mut conn, payload)
}
fn write_cache_update(
    conn: &mut rusqlite::Connection,
    payload: SessionCacheWrite,
) -> Result<String, String> {
    let bytes = cache_bytes(&payload)?;
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    if !cache_baseline(&tx, &payload)? {
        return Err("COLLAB_CACHE_MISSING: 本机快照尚未建立".into());
    }
    if !bytes.is_empty() {
        tx.execute(
            "INSERT OR IGNORE INTO updates(document_id,state,hash) VALUES (?1,?2,?3)",
            rusqlite::params![
                payload.document_id,
                bytes,
                format!("{:x}", Sha256::digest(&bytes))
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    let metadata = cache_metadata(&tx, &payload)?;
    tx.execute(
        "UPDATE sessions SET metadata=?1 WHERE id=?2",
        rusqlite::params![metadata, payload.document_id],
    )
    .map_err(|e| e.to_string())?;
    confirm_input_drafts(&tx, &payload)?;
    let revision = cache_revision(&tx, &payload.document_id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(revision)
}

fn confirm_input_drafts(
    conn: &rusqlite::Connection,
    payload: &SessionCacheWrite,
) -> Result<(), String> {
    for draft in &payload.confirmed_drafts {
        for value in [&draft.view_id, &draft.node_id, &draft.field] {
            session_id(value)?;
        }
        if draft.sequence < 1 || draft.value.len() > 1024 * 1024 {
            return Err("输入草稿确认无效".into());
        }
        conn.execute("UPDATE input_drafts SET applied=1 WHERE document_id=?1 AND baseline_id=?2 AND epoch=?3 AND view_id=?4 AND node_id=?5 AND field=?6 AND sequence=?7 AND value=?8 AND revision=?9",rusqlite::params![payload.document_id,payload.metadata["baselineId"].as_str(),payload.metadata["epoch"].as_i64(),draft.view_id,draft.node_id,draft.field,draft.sequence,draft.value,draft.revision]).map_err(|e|e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
pub fn collab_cache_list(app: AppHandle) -> Result<Vec<Value>, String> {
    let conn = session_store(&app)?;
    let mut statement = conn.prepare("SELECT metadata FROM sessions WHERE coalesce(json_extract(metadata,'$.mode'),'shared')='shared' ORDER BY id").map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.map(|row| {
        serde_json::from_str(&row.map_err(|e| e.to_string())?)
            .map_err(|e| format!("COLLAB_CACHE_CORRUPT: {e}"))
    })
    .collect()
}

#[cfg(test)]
mod cache_tests {
    use super::*;
    use base64::Engine;
    fn database() -> rusqlite::Connection {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        db.execute_batch(include_str!(
            "../../../../packages/db-schema/schema/collaboration.sql"
        ))
        .unwrap();
        db
    }
    fn payload(bytes: &[u8], expected: Option<String>) -> SessionCacheWrite {
        SessionCacheWrite {
            confirmed_drafts: vec![],
            resources: vec![],
            references: vec![],
            document_id: "doc".into(),
            metadata: json!({"id":"doc","baselineId":"base","epoch":0}),
            state: base64::engine::general_purpose::STANDARD.encode(bytes),
            expected_revision: expected,
        }
    }
    #[test]
    fn drafts_are_confirmed_with_durable_state_and_late_receipts_keep_newer_input() {
        let mut db = database();
        write_cache_snapshot(&mut db, payload(&[1], None)).unwrap();
        let draft = |sequence, value: &str| InputDraft {
            document_id: "doc".into(),
            baseline_id: "base".into(),
            epoch: 0,
            view_id: "view".into(),
            node_id: "node".into(),
            field: "code".into(),
            value: value.into(),
            revision: format!("r{sequence}"),
            sequence,
        };
        let confirmation = |sequence, value: &str| DraftConfirmation {
            view_id: "view".into(),
            node_id: "node".into(),
            field: "code".into(),
            value: value.into(),
            revision: format!("r{sequence}"),
            sequence,
        };
        let applied = |db: &rusqlite::Connection| {
            db.query_row("SELECT applied FROM input_drafts", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap()
        };
        save_input_draft(&db, draft(1, "A")).unwrap();
        let mut failed = payload(&[2], None);
        failed.confirmed_drafts = vec![confirmation(1, "A")];
        failed.references = vec![json!({"bad":"reference"})];
        assert!(write_cache_update(&mut db, failed).is_err());
        assert_eq!(applied(&db), 0);
        assert_eq!(
            db.query_row("SELECT count(*) FROM updates", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        let mut saved = payload(&[2], None);
        saved.confirmed_drafts = vec![confirmation(1, "A")];
        write_cache_update(&mut db, saved).unwrap();
        assert_eq!(applied(&db), 1);
        save_input_draft(&db, draft(1, "A")).unwrap();
        assert_eq!(applied(&db), 1);
        save_input_draft(&db, draft(2, "AB")).unwrap();
        assert_eq!(applied(&db), 0);
        let mut late = payload(&[3], None);
        late.confirmed_drafts = vec![confirmation(1, "A")];
        write_cache_update(&mut db, late).unwrap();
        assert_eq!(applied(&db), 0);
        let mut wrong = payload(&[4], None);
        wrong.metadata["baselineId"] = json!("other");
        wrong.confirmed_drafts = vec![confirmation(2, "AB")];
        assert!(write_cache_update(&mut db, wrong).is_err());
        assert_eq!(applied(&db), 0);
        let mut saved = payload(&[5], Some(cache_revision(&db, "doc").unwrap()));
        saved.confirmed_drafts = vec![confirmation(2, "AB")];
        write_cache_snapshot(&mut db, saved).unwrap();
        assert_eq!(applied(&db), 1);
    }
    #[test]
    fn stale_compaction_cannot_delete_new_updates_or_new_snapshot() {
        let mut db = database();
        let original = write_cache_snapshot(&mut db, payload(&[1], None)).unwrap();
        write_cache_update(&mut db, payload(&[2], None)).unwrap();
        assert!(write_cache_snapshot(&mut db, payload(&[3], Some(original))).is_err());
        let observed = cache_revision(&db, "doc").unwrap();
        let installed =
            write_cache_snapshot(&mut db, payload(&[3], Some(observed.clone()))).unwrap();
        assert!(write_cache_snapshot(&mut db, payload(&[4], Some(observed))).is_err());
        assert_eq!(cache_revision(&db, "doc").unwrap(), installed);
        assert_eq!(last_sequence(&db, "doc").unwrap(), 0);
    }
    #[test]
    fn baseline_conflict_preserves_original_and_repeated_update_is_idempotent() {
        let mut db = database();
        write_cache_snapshot(&mut db, payload(&[1], None)).unwrap();
        write_cache_update(&mut db, payload(&[2], None)).unwrap();
        write_cache_update(&mut db, payload(&[2], None)).unwrap();
        assert_eq!(
            db.query_row("SELECT count(*) FROM updates", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        let before = cache_revision(&db, "doc").unwrap();
        let mut changed = payload(&[3], Some(before.clone()));
        changed.metadata["baselineId"] = json!("new");
        assert!(write_cache_snapshot(&mut db, changed).is_err());
        assert_eq!(cache_revision(&db, "doc").unwrap(), before);
    }
    #[test]
    fn replaced_references_and_resources_remain_held_for_undo() {
        let mut db = database();
        let mut first = payload(&[1], None);
        first.resources = vec!["tau-collab-local:first".into()];
        first.references =
            vec![json!({"sourceId":"source","kind":"data-table","entityId":"first"})];
        write_cache_snapshot(&mut db, first).unwrap();
        let mut second = payload(&[2], None);
        second.resources = vec!["tau-collab-local:second".into()];
        second.references =
            vec![json!({"sourceId":"source","kind":"data-table","entityId":"second"})];
        write_cache_update(&mut db, second).unwrap();
        assert_eq!(
            db.query_row("SELECT count(*) FROM entity_holds", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
        let metadata: String = db
            .query_row("SELECT metadata FROM sessions WHERE id='doc'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&metadata).unwrap()["resources"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        let mut bad = payload(&[3], None);
        bad.references = vec![json!({"sourceId":"source","kind":"unknown","entityId":"wrong"})];
        assert!(write_cache_update(&mut db, bad).is_err());
        assert_eq!(
            db.query_row("SELECT count(*) FROM updates", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
    #[test]
    fn metadata_only_update_invalidates_old_compaction() {
        let mut db = database();
        let before = write_cache_snapshot(&mut db, payload(&[1], None)).unwrap();
        let mut update = payload(&[], None);
        update.metadata["source"] = json!({"projectionRevision":"new"});
        write_cache_update(&mut db, update).unwrap();
        assert!(write_cache_snapshot(&mut db, payload(&[1], Some(before))).is_err());
    }
}

fn view_scope(conn: &rusqlite::Connection, document_id: &str) -> Result<(String, String), String> {
    session_id(document_id)?;
    let metadata: String = conn
        .query_row(
            "SELECT metadata FROM sessions WHERE id=?1",
            [document_id],
            |row| row.get(0),
        )
        .map_err(|_| "COLLAB_CACHE_MISSING: 本机文档尚未就绪".to_string())?;
    let value: Value = serde_json::from_str(&metadata).map_err(|e| e.to_string())?;
    Ok((
        value["source"]["librarySourceId"]
            .as_str()
            .unwrap_or("application")
            .to_string(),
        value["source"]["contentDocumentId"]
            .as_str()
            .unwrap_or(document_id)
            .to_string(),
    ))
}
#[tauri::command]
pub fn collab_node_views(app: AppHandle, document_id: String) -> Result<Value, String> {
    let conn = session_store(&app)?;
    let (workspace, document) = view_scope(&conn, &document_id)?;
    let mut query = conn
        .prepare("SELECT node_id,value FROM node_views WHERE workspace_id=?1 AND document_id=?2")
        .map_err(|e| e.to_string())?;
    let rows = query
        .query_map(rusqlite::params![workspace, document], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut result = serde_json::Map::new();
    for row in rows {
        let (id, value) = row.map_err(|e| e.to_string())?;
        result.insert(id, serde_json::from_str(&value).map_err(|e| e.to_string())?);
    }
    Ok(Value::Object(result))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeViewPatch {
    document_id: String,
    node_id: String,
    owner: String,
    patch: Value,
}
#[tauri::command]
pub fn collab_update_node_view(app: AppHandle, payload: NodeViewPatch) -> Result<Value, String> {
    use rusqlite::OptionalExtension;
    session_id(&payload.node_id)?;
    session_id(&payload.owner)?;
    let patch = payload
        .patch
        .as_object()
        .ok_or("COLLAB_VIEW_INVALID: 视图状态必须是对象")?;
    if payload.patch.to_string().len() > 65536
        || patch
            .keys()
            .any(|key| ["__proto__", "constructor", "prototype"].contains(&key.as_str()))
    {
        return Err("COLLAB_VIEW_INVALID: 视图状态超过限制或包含保留键".into());
    }
    let mut conn = session_store(&app)?;
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let (workspace, document) = view_scope(&tx, &payload.document_id)?;
    let old: Option<String> = tx.query_row("SELECT value FROM node_views WHERE workspace_id=?1 AND document_id=?2 AND node_id=?3 AND owner=?4", rusqlite::params![workspace,document,payload.node_id,payload.owner], |row| row.get(0)).optional().map_err(|e| e.to_string())?;
    let mut value: Value =
        serde_json::from_str(old.as_deref().unwrap_or("{}")).map_err(|e| e.to_string())?;
    let object = value
        .as_object_mut()
        .ok_or("COLLAB_VIEW_INVALID: 原视图状态损坏")?;
    object.extend(patch.clone());
    if value.to_string().len() > 65536 {
        return Err("COLLAB_VIEW_INVALID: 视图状态超过限制".into());
    }
    let json = value.to_string();
    tx.execute("INSERT INTO node_views(workspace_id,document_id,node_id,owner,value,revision) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(workspace_id,document_id,node_id,owner) DO UPDATE SET value=excluded.value,revision=excluded.revision", rusqlite::params![workspace,document,payload.node_id,payload.owner,json,format!("{:x}",Sha256::digest(json.as_bytes()))]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(value)
}

pub(crate) static CACHE_WRITE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// 整库被同步下载替换后，本库的正文缓存对应的是旧库：本地会话删除，共享会话解除来源。
pub(crate) fn release_library_sessions(
    conn: &rusqlite::Connection,
    database: &str,
) -> Result<(), String> {
    let stem = database.trim_end_matches(".db");
    let full = format!("{stem}.db");
    conn.execute_batch("BEGIN IMMEDIATE")
        .map_err(|e| e.to_string())?;
    let result = (|| {
        let owned = "json_extract(metadata,'$.source.databaseName') IN (?1,?2)";
        let local =
            format!("{owned} AND coalesce(json_extract(metadata,'$.mode'),'shared')='local'");
        for table in ["updates", "resources", "input_drafts", "document_drafts"] {
            conn.execute(
                &format!("DELETE FROM {table} WHERE document_id IN (SELECT id FROM sessions WHERE {local})"),
                rusqlite::params![stem, full],
            )
            .map_err(|e| e.to_string())?;
        }
        conn.execute(
            &format!("DELETE FROM entity_holds WHERE holder IN (SELECT 'document:' || id FROM sessions WHERE {local})"),
            rusqlite::params![stem, full],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            &format!("DELETE FROM sessions WHERE {local}"),
            rusqlite::params![stem, full],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            &format!("UPDATE sessions SET metadata=json_remove(metadata,'$.source') WHERE {owned}"),
            rusqlite::params![stem, full],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })();
    conn.execute_batch(if result.is_ok() { "COMMIT" } else { "ROLLBACK" })
        .map_err(|e| e.to_string())?;
    result
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputDraft {
    document_id: String,
    baseline_id: String,
    epoch: i64,
    view_id: String,
    node_id: String,
    field: String,
    value: String,
    revision: String,
    sequence: i64,
}
#[tauri::command]
pub fn collab_input_draft(app: AppHandle, payload: InputDraft) -> Result<(), String> {
    let _lock = CACHE_WRITE_LOCK.lock().map_err(|_| "缓存保存锁不可用")?;
    let mut conn = session_store(&app)?;
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    save_input_draft(&tx, payload)?;
    tx.commit().map_err(|e| e.to_string())
}
fn save_input_draft(conn: &rusqlite::Connection, payload: InputDraft) -> Result<(), String> {
    use rusqlite::OptionalExtension;
    for value in [
        &payload.document_id,
        &payload.view_id,
        &payload.node_id,
        &payload.field,
    ] {
        session_id(value)?;
    }
    if payload.value.len() > 1024 * 1024 || payload.sequence < 1 || payload.revision.len() > 256 {
        return Err("输入草稿超过容量".into());
    }
    let metadata: String = conn
        .query_row(
            "SELECT metadata FROM sessions WHERE id=?1",
            [&payload.document_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let metadata: Value = serde_json::from_str(&metadata).map_err(|e| e.to_string())?;
    if metadata["baselineId"] != payload.baseline_id || metadata["epoch"] != payload.epoch {
        return Err("输入草稿基线已变更".into());
    }
    let workspace = metadata["source"]["librarySourceId"]
        .as_str()
        .unwrap_or("application");
    let previous: Option<(String,String,i64,i64,String,String)> = conn.query_row("SELECT document_id,baseline_id,epoch,sequence,value,revision FROM input_drafts WHERE view_id=?1 AND node_id=?2 AND field=?3",rusqlite::params![payload.view_id,payload.node_id,payload.field],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?))).optional().map_err(|e|e.to_string())?;
    if let Some((document, baseline, epoch, sequence, value, revision)) = previous {
        if document != payload.document_id
            || baseline != payload.baseline_id
            || epoch != payload.epoch
        {
            return Err("输入草稿不能更换来源".into());
        }
        if sequence > payload.sequence {
            return Ok(());
        }
        if sequence == payload.sequence {
            if value != payload.value || revision != payload.revision {
                return Err("输入草稿批次冲突".into());
            }
            return Ok(());
        }
    }
    conn.execute("INSERT INTO input_drafts VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,0,?11) ON CONFLICT(view_id,node_id,field) DO UPDATE SET value=excluded.value,revision=excluded.revision,sequence=excluded.sequence,applied=0,updated_at=excluded.updated_at",rusqlite::params![workspace,payload.document_id,payload.baseline_id,payload.epoch,payload.view_id,payload.node_id,payload.field,payload.value,payload.revision,payload.sequence,chrono::Utc::now().timestamp_millis()]).map_err(|e|e.to_string())?;
    Ok(())
}
