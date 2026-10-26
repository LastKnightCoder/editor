use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use url::Url;

const ORIGIN: &str = "https://plugins-api.taunote.app";
const JSON_LIMIT: usize = 8 * 1024 * 1024;
const ZIP_LIMIT: usize = 16 * 1024 * 1024;

#[derive(Debug, Serialize)]
pub struct CenterError {
    pub(crate) status: u16,
    pub(crate) code: String,
    pub(crate) message: String,
}
fn error(status: u16, code: &str, message: &str) -> CenterError {
    CenterError {
        status,
        code: code.into(),
        message: message.into(),
    }
}
fn invalid(message: &str) -> CenterError {
    error(400, "INVALID_INPUT", message)
}
fn identifier(value: &str) -> Result<(), CenterError> {
    if value.is_empty()
        || value.len() > 128
        || !value.as_bytes()[0].is_ascii_alphanumeric()
        || !value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
    {
        return Err(invalid("插件或版本标识无效"));
    }
    Ok(())
}
pub(crate) fn center_origin() -> Result<Url, CenterError> {
    let configured = if cfg!(debug_assertions) {
        std::env::var("TAU_PLUGIN_CENTER_API")
            .ok()
            .or_else(|| option_env!("TAU_PLUGIN_CENTER_API").map(str::to_string))
    } else {
        None
    };
    validate_origin(
        configured.as_deref().unwrap_or(ORIGIN),
        cfg!(debug_assertions),
    )
}
pub(crate) fn validate_origin(value: &str, development: bool) -> Result<Url, CenterError> {
    let url = Url::parse(value).map_err(|_| invalid("中心地址无效"))?;
    let local = url.scheme() == "http"
        && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
        || (url.scheme() != "https" && !(development && local))
    {
        return Err(invalid("中心只允许 HTTPS 源；调试可使用本机 HTTP"));
    }
    Ok(url)
}
pub(crate) fn platform() -> &'static str {
    if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "ios") {
        "ios"
    } else {
        "unknown"
    }
}
pub(crate) fn installation_enabled() -> bool {
    cfg!(any(target_os = "android", target_os = "ios"))
}
pub(crate) fn trusted_source(source: &Value) -> bool {
    let Ok(origin) = center_origin() else {
        return false;
    };
    let origin = origin.origin().ascii_serialization();
    let Some(release) = source["center"]["releaseId"].as_str() else {
        return false;
    };
    identifier(release).is_ok()
        && source["center"]["origin"] == origin
        && source["url"] == format!("{origin}/v2/releases/{release}/download")
}
fn host(platform: &str, version: &str) -> Value {
    json!({"platform":platform,"appVersion":version,"apiVersions":[1],"formatVersions":[3],"profiles":["web-v1"]})
}
#[tauri::command]
pub fn plugin_center_config(app: AppHandle) -> Result<Value, CenterError> {
    let browsing_enabled = cfg!(debug_assertions) || installation_enabled();
    Ok(
        json!({"origin":center_origin()?.origin().ascii_serialization(),"host":if platform()=="unknown" { Value::Null } else {host(platform(),&app.package_info().version.to_string())},"browsingEnabled":browsing_enabled,"installationEnabled":installation_enabled()}),
    )
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CenterRequest {
    Catalog {
        input: Value,
    },
    Release {
        #[serde(rename = "releaseId")]
        release_id: String,
    },
    Versions {
        #[serde(rename = "pluginId")]
        plugin_id: String,
        #[serde(default)]
        platform: Option<String>,
        #[serde(default)]
        cursor: Option<String>,
    },
    Resolve {
        #[serde(rename = "pluginId")]
        plugin_id: String,
        #[serde(rename = "releaseId", default)]
        release_id: Option<String>,
    },
    Statuses {
        #[serde(rename = "releaseIds")]
        release_ids: Vec<String>,
    },
    Download {
        #[serde(rename = "releaseId")]
        release_id: String,
    },
}
fn request_parts(
    operation: &CenterRequest,
    current_host: &Value,
) -> Result<(String, Option<Value>), CenterError> {
    match operation {
        CenterRequest::Catalog { input } => {
            let fields = input
                .as_object()
                .ok_or_else(|| invalid("目录条件必须是对象"))?;
            let mut query: serde_json::Map<String, Value> =
                ["platform", "q", "category", "sort", "limit", "cursor"]
                    .into_iter()
                    .filter_map(|key| {
                        fields
                            .get(key)
                            .map(|value| (key.to_string(), value.clone()))
                    })
                    .collect();
            let selected = query
                .get("platform")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if !["all", "desktop", "android", "ios"].contains(&selected.as_str()) {
                return Err(invalid("目录平台无效"));
            }
            if selected == current_host["platform"].as_str().unwrap_or("") {
                query.insert("host".into(), current_host.clone());
            }
            Ok(("/v2/catalog/query".into(), Some(Value::Object(query))))
        }
        CenterRequest::Release { release_id } => {
            identifier(release_id)?;
            Ok((format!("/v2/releases/{release_id}"), None))
        }
        CenterRequest::Download { release_id } => {
            identifier(release_id)?;
            Ok((format!("/v2/releases/{release_id}/download"), None))
        }
        CenterRequest::Resolve {
            plugin_id,
            release_id,
        } => {
            identifier(plugin_id)?;
            if !["android", "ios"].contains(&current_host["platform"].as_str().unwrap_or("")) {
                return Err(invalid("当前原生平台不能安装移动插件"));
            }
            let mut input = json!({"host":current_host});
            if let Some(id) = release_id {
                identifier(id)?;
                input["releaseId"] = json!(id);
            }
            Ok((format!("/v2/plugins/{plugin_id}/resolve"), Some(input)))
        }
        CenterRequest::Versions {
            plugin_id,
            platform,
            cursor,
        } => {
            identifier(plugin_id)?;
            let selected = platform.as_deref().unwrap_or("all");
            if !["all", "desktop", "android", "ios"].contains(&selected) {
                return Err(invalid("版本平台无效"));
            }
            let mut query = url::form_urlencoded::Serializer::new(String::new());
            query.append_pair("platform", selected);
            if let Some(value) = cursor {
                if value.is_empty() || value.len() > 4096 {
                    return Err(invalid("版本游标无效"));
                }
                query.append_pair("cursor", value);
            }
            Ok((
                format!("/v2/plugins/{plugin_id}/releases?{}", query.finish()),
                None,
            ))
        }
        CenterRequest::Statuses { release_ids } => {
            if release_ids.len() > 100 {
                return Err(invalid("每次最多查询 100 个版本"));
            }
            for id in release_ids {
                identifier(id)?;
            }
            Ok((
                "/v2/releases/status".into(),
                Some(json!({"releaseIds":release_ids})),
            ))
        }
    }
}
async fn response_bytes(
    origin: &Url,
    path: &str,
    input: Option<Value>,
    limit: usize,
) -> Result<Vec<u8>, CenterError> {
    let url = origin.join(path).map_err(|_| invalid("中心请求路径无效"))?;
    if url.origin() != origin.origin() || !path.starts_with("/v2/") {
        return Err(invalid("拒绝跨来源中心请求"));
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(
            if path == "/v2/releases/status" { 5 } else { 30 },
        ))
        .build()
        .map_err(|_| error(0, "NETWORK_ERROR", "无法创建中心连接"))?;
    let builder = if let Some(value) = input {
        if serde_json::to_vec(&value)
            .map_err(|_| invalid("请求无效"))?
            .len()
            > 100000
        {
            return Err(invalid("中心请求过大"));
        }
        client.post(url).json(&value)
    } else {
        client.get(url)
    };
    let mut response = builder
        .send()
        .await
        .map_err(|_| error(0, "NETWORK_ERROR", "暂时连不上插件中心"))?;
    let status = response.status();
    if status.is_redirection() {
        return Err(error(
            status.as_u16(),
            "BAD_RESPONSE",
            "插件中心不允许重定向",
        ));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| error(0, "NETWORK_ERROR", "中心响应读取中断"))?
    {
        if bytes.len() + chunk.len() > limit {
            return Err(error(413, "LIMIT_EXCEEDED", "中心响应超过大小限制"));
        }
        bytes.extend_from_slice(&chunk);
    }
    if !status.is_success() {
        let issue: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        return Err(error(
            status.as_u16(),
            issue["error"]["code"]
                .as_str()
                .unwrap_or("SERVICE_UNAVAILABLE"),
            issue["error"]["message"].as_str().unwrap_or("中心请求失败"),
        ));
    }
    Ok(bytes)
}
async fn request_json(
    origin: &Url,
    operation: &CenterRequest,
    current_host: &Value,
) -> Result<Value, CenterError> {
    let (path, input) = request_parts(operation, current_host)?;
    let bytes = response_bytes(origin, &path, input, JSON_LIMIT).await?;
    let envelope: Value = serde_json::from_slice(&bytes)
        .map_err(|_| error(502, "BAD_RESPONSE", "中心响应不是 JSON"))?;
    envelope
        .get("data")
        .cloned()
        .ok_or_else(|| error(502, "BAD_RESPONSE", "中心响应缺少 data"))
}
fn install_source(
    origin: &Url,
    record: &Value,
    plugin_id: &str,
    release_id: &str,
) -> Result<crate::plugins::InstallSource, CenterError> {
    identifier(plugin_id)?;
    identifier(release_id)?;
    let expected = origin
        .join(&format!("/v2/releases/{release_id}/download"))
        .map_err(|_| invalid("下载地址无效"))?;
    if record["releaseId"] != release_id
        || record["pluginId"] != plugin_id
        || record["downloadUrl"].as_str() != Some(expected.as_str())
        || record["content"]["manifest"]["id"] != plugin_id
        || record["content"]["manifest"]["version"] != record["version"]
    {
        return Err(error(502, "BAD_RESPONSE", "发布记录身份或下载来源不一致"));
    }
    let size = record["size"]
        .as_u64()
        .filter(|size| *size > 0 && *size <= ZIP_LIMIT as u64)
        .ok_or_else(|| error(502, "BAD_RESPONSE", "发布包大小无效"))?;
    let hash = record["sha256"]
        .as_str()
        .filter(|value| {
            value.len() == 64
                && value
                    .bytes()
                    .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        })
        .ok_or_else(|| error(502, "BAD_RESPONSE", "发布摘要无效"))?;
    serde_json::from_value(json!({"id":plugin_id,"version":record["version"],"url":expected.as_str(),"sha256":hash,"size":size})).map_err(|_|error(502,"BAD_RESPONSE","发布描述无效"))
}
#[tauri::command]
pub async fn plugin_center_request(
    app: AppHandle,
    request: CenterRequest,
) -> Result<Value, CenterError> {
    let origin = center_origin()?;
    let current = host(platform(), &app.package_info().version.to_string());
    if let CenterRequest::Download { release_id } = &request {
        let record = request_json(
            &origin,
            &CenterRequest::Release {
                release_id: release_id.clone(),
            },
            &current,
        )
        .await?;
        let plugin_id = record["pluginId"]
            .as_str()
            .ok_or_else(|| error(502, "BAD_RESPONSE", "发布记录缺少插件身份"))?;
        install_source(&origin, &record, plugin_id, release_id)?;
        let (path, _) = request_parts(&request, &current)?;
        let bytes = response_bytes(&origin, &path, None, ZIP_LIMIT).await?;
        if Some(bytes.len() as u64) != record["size"].as_u64()
            || format!("{:x}", Sha256::digest(&bytes)) != record["sha256"].as_str().unwrap_or("")
        {
            return Err(error(502, "BAD_RESPONSE", "下载大小或摘要不匹配"));
        }
        return Ok(json!({"base64":STANDARD.encode(bytes)}));
    }
    request_json(&origin, &request, &current).await
}
#[tauri::command]
pub async fn plugin_center_stage(
    app: AppHandle,
    plugin_id: String,
    release_id: String,
) -> Result<Value, CenterError> {
    if !installation_enabled() {
        return Err(error(
            403,
            "DISTRIBUTION_UNAVAILABLE",
            "当前平台不支持移动插件中心安装",
        ));
    }
    let origin = center_origin()?;
    let current = host(platform(), &app.package_info().version.to_string());
    let resolved = request_json(
        &origin,
        &CenterRequest::Resolve {
            plugin_id: plugin_id.clone(),
            release_id: Some(release_id.clone()),
        },
        &current,
    )
    .await?;
    if resolved["compatibility"]["status"] != "compatible" {
        return Err(error(409, "INCOMPATIBLE", "该版本不兼容或分发未开放"));
    }
    let record = &resolved["release"];
    let source = install_source(&origin, record, &plugin_id, &release_id)?;
    let mut result=crate::plugins::stage_package(app,source,Some(json!({"origin":origin.origin().ascii_serialization(),"releaseId":release_id,"manifest":record["content"]["manifest"]}))).await.map_err(|message|error(400,"INVALID_PACKAGE",&message))?;
    result["release"] = record.clone();
    Ok(result)
}
#[tauri::command]
pub async fn plugin_center_commit(
    app: AppHandle,
    plugin_id: String,
    release_id: String,
    sha256: String,
) -> Result<(), CenterError> {
    if !installation_enabled() {
        return Err(error(
            403,
            "DISTRIBUTION_UNAVAILABLE",
            "当前平台不支持移动插件中心安装",
        ));
    }
    let origin = center_origin()?;
    let current = host(platform(), &app.package_info().version.to_string());
    let resolved = request_json(
        &origin,
        &CenterRequest::Resolve {
            plugin_id: plugin_id.clone(),
            release_id: Some(release_id.clone()),
        },
        &current,
    )
    .await?;
    if resolved["compatibility"]["status"] != "compatible"
        || resolved["release"]["sha256"] != sha256
    {
        return Err(error(409, "INCOMPATIBLE", "发布状态或版本已变化"));
    }
    install_source(&origin, &resolved["release"], &plugin_id, &release_id)?;
    crate::plugins::commit_center_package(
        app,
        plugin_id,
        sha256,
        &origin.origin().ascii_serialization(),
        &release_id,
    )
    .map_err(|message| error(409, "INVALID_PACKAGE", &message))
}

#[tauri::command]
pub async fn plugin_center_refresh(app: AppHandle) -> Result<Value, CenterError> {
    let origin = center_origin()?;
    let origin_name = origin.origin().ascii_serialization();
    let installations = crate::plugins::center_installations(&app)
        .map_err(|message| error(500, "STORAGE_ERROR", &message))?;
    let mut ids = std::collections::BTreeSet::new();
    for item in &installations {
        if item["origin"] == origin_name {
            if let Some(id) = item["releaseId"].as_str() {
                ids.insert(id.to_string());
            }
        }
    }
    let ids: Vec<String> = ids.into_iter().collect();
    for chunk in ids.chunks(100) {
        let response = request_json(
            &origin,
            &CenterRequest::Statuses {
                release_ids: chunk.to_vec(),
            },
            &host(platform(), &app.package_info().version.to_string()),
        )
        .await?;
        let items = response["items"]
            .as_array()
            .ok_or_else(|| error(502, "BAD_RESPONSE", "中心状态响应无效"))?;
        if items.len() != chunk.len()
            || items
                .iter()
                .filter_map(|item| item["releaseId"].as_str())
                .collect::<std::collections::HashSet<_>>()
                .len()
                != chunk.len()
            || items.iter().any(|item| {
                !chunk.iter().any(|id| item["releaseId"] == *id)
                    || !["available", "revoked", "disabled", "not_found"]
                        .contains(&item["status"].as_str().unwrap_or(""))
            })
        {
            return Err(error(502, "BAD_RESPONSE", "中心状态响应与请求不匹配"));
        }
        crate::plugins::save_center_statuses(&app, &origin_name, items)
            .map_err(|message| error(500, "STORAGE_ERROR", &message))?;
    }
    let inventory = crate::plugins::plugin_packages(app)
        .map_err(|message| error(500, "STORAGE_ERROR", &message))?;
    Ok(
        json!({"origin":origin_name,"blockedPluginIds":inventory["packages"].as_array().into_iter().flatten().filter(|item|item["blocked"]==true).map(|item|item["id"].clone()).collect::<Vec<_>>()}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stored_center_source_requires_exact_origin_and_release_url() {
        let mut source = json!({"url":format!("{ORIGIN}/v2/releases/release-1/download"),"center":{"origin":ORIGIN,"releaseId":"release-1"}});
        assert!(trusted_source(&source));
        source["url"] = json!("https://evil.example/package.zip");
        assert!(!trusted_source(&source));
        source["url"] = json!(format!("{ORIGIN}/v2/releases/release-2/download"));
        assert!(!trusted_source(&source));
        assert!(!trusted_source(&json!({"center":null})));
    }
    #[test]
    fn rejects_remote_http_and_credentials() {
        for value in [
            "http://example.com",
            "https://a:b@example.com",
            "https://example.com/path",
            "https://example.com?token=x",
        ] {
            assert!(validate_origin(value, true).is_err());
        }
        assert!(validate_origin("http://127.0.0.1:8787", true).is_ok());
        assert!(validate_origin("http://127.0.0.1:8787", false).is_err());
    }
    #[test]
    fn native_host_overrides_frontend_claims() {
        let current = host("ios", "0.2.0");
        let (_,input)=request_parts(&CenterRequest::Catalog{input:json!({"platform":"ios","host":{"platform":"desktop","appVersion":"99.0.0"}})},&current).unwrap();
        assert_eq!(input.unwrap()["host"], current);
        assert!(request_parts(
            &CenterRequest::Release {
                release_id: "../secret".into()
            },
            &current
        )
        .is_err());
    }
    #[test]
    fn fixed_origin_and_identity_for_install() {
        let origin = validate_origin(ORIGIN, false).unwrap();
        let mut record = json!({"pluginId":"test.plugin","releaseId":"release-1","version":"1.0.0","downloadUrl":format!("{ORIGIN}/v2/releases/release-1/download"),"size":10,"sha256":"a".repeat(64),"content":{"manifest":{"id":"test.plugin","version":"1.0.0"}}});
        assert!(install_source(&origin, &record, "test.plugin", "release-1").is_ok());
        record["downloadUrl"] = json!("https://evil.example/file.zip");
        assert!(install_source(&origin, &record, "test.plugin", "release-1").is_err());
    }
    #[tokio::test]
    async fn rejects_redirect_and_preserves_errors() {
        use std::io::{Read, Write};
        for (status, body, code) in [
            ("302 Found", "", "BAD_RESPONSE"),
            (
                "404 Not Found",
                r#"{"error":{"code":"NOT_FOUND","message":"未发布"}}"#,
                "NOT_FOUND",
            ),
            ("200 OK", r#"{"wrong":1}"#, "BAD_RESPONSE"),
        ] {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let addr = listener.local_addr().unwrap();
            let response=format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\nLocation: https://evil.example\r\n\r\n{body}",body.len());
            let thread = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut buffer = [0; 4096];
                let _ = stream.read(&mut buffer);
                stream.write_all(response.as_bytes()).unwrap();
            });
            let result = request_json(
                &validate_origin(&format!("http://{addr}"), true).unwrap(),
                &CenterRequest::Release {
                    release_id: "test".into(),
                },
                &host("ios", "0.2.0"),
            )
            .await;
            assert_eq!(result.unwrap_err().code, code);
            thread.join().unwrap();
        }
    }

    #[tokio::test]
    async fn reads_local_center_and_limits_response_bytes() {
        use std::io::{Read, Write};
        for limit in [JSON_LIMIT, 3] {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let thread = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut buffer = [0; 4096];
                let length = stream.read(&mut buffer).unwrap();
                assert!(
                    String::from_utf8_lossy(&buffer[..length]).starts_with("GET /v2/releases/r1 ")
                );
                let body = r#"{"data":{"releaseId":"r1"}}"#;
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                stream.write_all(response.as_bytes()).unwrap();
            });
            let result = response_bytes(
                &validate_origin(&format!("http://{address}"), true).unwrap(),
                "/v2/releases/r1",
                None,
                limit,
            )
            .await;
            if limit == JSON_LIMIT {
                let value: Value = serde_json::from_slice(&result.unwrap()).unwrap();
                assert_eq!(value["data"]["releaseId"], "r1");
            } else {
                assert_eq!(result.unwrap_err().code, "LIMIT_EXCEEDED");
            }
            thread.join().unwrap();
        }
    }
}
