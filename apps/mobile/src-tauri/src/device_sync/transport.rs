use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::PathBuf,
    time::Duration,
};
use tauri::AppHandle;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairCode {
    protocol: u32,
    addresses: Vec<String>,
    port: u16,
    certificate: String,
    secret: String,
    library: String,
    expires: u64,
}
#[derive(Clone, Serialize, Deserialize)]
pub(super) struct Peer {
    pub database: String,
    pub library: String,
    pub node: String,
    addresses: Vec<String>,
    port: u16,
    certificate: String,
    token: String,
}
fn directory(app: &AppHandle) -> Result<PathBuf, String> {
    let path = crate::setting::resolve_app_dir(app)?.join("device-sync");
    std::fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}
fn atomic(path: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temporary)
        .map_err(|error| error.to_string())?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| error.to_string())?;
    std::fs::rename(temporary, path).map_err(|error| error.to_string())
}
pub(super) fn peer(app: &AppHandle) -> Result<Peer, String> {
    serde_json::from_slice(
        &std::fs::read(directory(app)?.join("peer.json"))
            .map_err(|_| "DEVICE_SYNC_UNPAIRED: 设备尚未配对")?,
    )
    .map_err(|_| "DEVICE_SYNC_IDENTITY: 设备信任记录不可读，请重新配对".into())
}
fn local_ip(value: &str) -> Result<Ipv4Addr, String> {
    let ip = value
        .parse::<Ipv4Addr>()
        .map_err(|_| "DEVICE_SYNC_ADDRESS: 配对地址不是局域网 IPv4 地址")?;
    if !(ip.is_private() || ip.is_loopback() || ip.is_link_local()) {
        return Err("DEVICE_SYNC_ADDRESS: 仅连接局域网设备".into());
    }
    Ok(ip)
}
pub(super) async fn request(
    addresses: &[String],
    port: u16,
    certificate: &str,
    token: Option<&str>,
    body: &Value,
) -> Result<Value, String> {
    if addresses.is_empty() || addresses.len() > 16 || port == 0 || certificate.len() > 8192 {
        return Err("DEVICE_SYNC_ADDRESS: 配对地址无效".into());
    }
    let certificate = reqwest::Certificate::from_pem(certificate.as_bytes())
        .map_err(|_| "DEVICE_SYNC_CERTIFICATE: 配对证书无效")?;
    let bytes = serde_json::to_vec(body).map_err(|error| error.to_string())?;
    if bytes.len() > 64 * 1024 * 1024 {
        return Err("DEVICE_SYNC_BUDGET: 同步内容超过当前传输预算".into());
    }
    let mut last = "DEVICE_SYNC_OFFLINE: 配对设备暂不可达".to_string();
    for address in addresses {
        let candidates = if let Ok(ip) = local_ip(address) {
            vec![ip]
        } else {
            if !regex::Regex::new(r"^[a-zA-Z0-9-]{1,63}(\.local)?$")
                .unwrap()
                .is_match(address)
            {
                return Err("DEVICE_SYNC_ADDRESS: 仅接受局域网地址与本机主机名".into());
            }
            let hostname = address.clone();
            tokio::time::timeout(
                Duration::from_secs(3),
                tokio::task::spawn_blocking(move || {
                    use std::net::ToSocketAddrs;
                    (hostname.as_str(), port)
                        .to_socket_addrs()
                        .map(|values| {
                            values
                                .filter_map(|value| match value.ip() {
                                    IpAddr::V4(ip)
                                        if ip.is_private()
                                            || ip.is_loopback()
                                            || ip.is_link_local() =>
                                    {
                                        Some(ip)
                                    }
                                    _ => None,
                                })
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_default()
                }),
            )
            .await
            .ok()
            .and_then(Result::ok)
            .unwrap_or_default()
        };
        for ip in candidates {
            let client = reqwest::Client::builder()
                .no_proxy()
                .https_only(true)
                .tls_built_in_root_certs(false)
                .add_root_certificate(certificate.clone())
                .resolve("tau-device.local", SocketAddr::new(IpAddr::V4(ip), port))
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(3))
                .timeout(Duration::from_secs(30))
                .build()
                .map_err(|error| format!("DEVICE_SYNC_TLS: {error}"))?;
            let mut request = client
                .post(format!("https://tau-device.local:{port}/device-sync/v1"))
                .header("Content-Type", "application/json")
                .body(bytes.clone());
            if let Some(token) = token {
                request = request.bearer_auth(token);
            }
            match request.send().await {
                Err(_) => {
                    last = "DEVICE_SYNC_OFFLINE: 设备离线、局域网权限未开启或证书校验失败".into();
                    continue;
                }
                Ok(response) => {
                    let status = response.status();
                    let mut result = Vec::new();
                    let mut stream = response.bytes_stream();
                    while let Some(chunk) = stream.next().await {
                        let chunk = chunk.map_err(|_| "DEVICE_SYNC_OFFLINE: 接收中断")?;
                        if result.len() + chunk.len() > 64 * 1024 * 1024 {
                            return Err("DEVICE_SYNC_BUDGET: 响应超过当前传输预算".into());
                        }
                        result.extend_from_slice(&chunk);
                    }
                    let value: Value = serde_json::from_slice(&result)
                        .map_err(|_| "DEVICE_SYNC_RESPONSE: 响应格式无效")?;
                    if !status.is_success() {
                        return Err(value["error"]
                            .as_str()
                            .unwrap_or("DEVICE_SYNC_FAILED: 同步失败")
                            .to_string());
                    }
                    return Ok(value);
                }
            }
        }
    }
    Err(last)
}
#[tauri::command]
pub async fn device_sync_pair(app: AppHandle, code: String, name: String) -> Result<Value, String> {
    if code.len() > 16 * 1024 {
        return Err("DEVICE_SYNC_PAIR: 配对信息过长".into());
    }
    let raw = URL_SAFE_NO_PAD
        .decode(
            code.trim()
                .strip_prefix("tau-pair:v1:")
                .ok_or("DEVICE_SYNC_PAIR: 配对信息格式无效")?,
        )
        .map_err(|_| "DEVICE_SYNC_PAIR: 配对信息格式无效")?;
    let code: PairCode =
        serde_json::from_slice(&raw).map_err(|_| "DEVICE_SYNC_PAIR: 配对信息格式无效")?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis() as u64;
    if code.protocol != 3 {
        return Err("DEVICE_SYNC_VERSION: 请将配对设备更新到支持稳定身份归并的版本".into());
    }
    if code.expires < now
        || code.expires > now + 6 * 60_000
        || code.secret.len() < 40
        || code.library.len() > 256
    {
        return Err("DEVICE_SYNC_PAIR_EXPIRED: 请在电脑上重新生成配对信息".into());
    }
    let directory = directory(&app)?;
    let path = directory.join("node-id");
    let node = if path.exists() {
        std::fs::read_to_string(path).map_err(|error| error.to_string())?
    } else {
        let node = uuid::Uuid::new_v4().to_string();
        atomic(&path, node.as_bytes())?;
        node
    };
    use sha2::{Digest, Sha256};
    let mut database = peer(&app)
        .ok()
        .filter(|peer| peer.library == code.library)
        .map(|peer| peer.database)
        .unwrap_or_else(|| format!("device-{:x}.db", Sha256::digest(code.library.as_bytes())));
    let database_path = crate::setting::resolve_database_path(&app, &database)?;
    let existing = if database_path.exists() {
        rusqlite::Connection::open_with_flags(
            &database_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .ok()
        .and_then(|conn| {
            conn.query_row(
                "SELECT payload FROM _tau_device_state WHERE id=1",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok()
        })
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .is_some_and(|state| state["library"].as_str() == Some(code.library.as_str()))
    } else {
        false
    };
    if database_path.exists() && !existing {
        database = format!(
            "device-{:x}-{}.db",
            Sha256::digest(code.library.as_bytes()),
            uuid::Uuid::new_v4()
        );
    }
    let result=request(&code.addresses,code.port,&code.certificate,None,&json!({"kind":"pair","secret":code.secret,"node":node,"name":name.chars().take(80).collect::<String>(),"existing":existing})).await?;
    if result["reply"]["state"]["library"].as_str() != Some(code.library.as_str()) {
        return Err("DEVICE_SYNC_IDENTITY: 配对资料库不同".into());
    }
    let peer = Peer {
        database: database.clone(),
        library: code.library,
        node: node.clone(),
        addresses: code.addresses,
        port: code.port,
        certificate: code.certificate,
        token: result["token"]
            .as_str()
            .filter(|token| token.len() >= 40)
            .ok_or("DEVICE_SYNC_PAIR: 设备凭据无效")?
            .to_string(),
    };
    atomic(
        &directory.join("peer.json"),
        &serde_json::to_vec(&peer).map_err(|error| error.to_string())?,
    )?;
    Ok(json!({"reply":result["reply"],"node":node,"database":database,"existing":existing}))
}
#[tauri::command]
pub async fn device_sync_request(
    app: AppHandle,
    kind: String,
    payload: Value,
) -> Result<Value, String> {
    if ![
        "head",
        "download",
        "sync",
        "asset-has",
        "asset-read",
        "asset-write",
    ]
    .contains(&kind.as_str())
    {
        return Err("DEVICE_SYNC_REQUEST: 未知传输操作".into());
    }
    let peer = peer(&app)?;
    let mut body = payload
        .as_object()
        .cloned()
        .ok_or("DEVICE_SYNC_REQUEST: 请求格式无效")?;
    body.insert("kind".into(), json!(kind));
    request(
        &peer.addresses,
        peer.port,
        &peer.certificate,
        Some(&peer.token),
        &Value::Object(body),
    )
    .await
}
