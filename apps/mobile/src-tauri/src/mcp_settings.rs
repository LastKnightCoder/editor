//! 用户自己添加的远程 MCP 服务器：只支持 Streamable HTTP。请求头可能带凭据，只在原生侧保存，
//! 页面看到的是去掉请求头值、只留请求头名称的公开视图。

use std::collections::BTreeMap;

use serde::Deserialize;
use serde_json::{json, Map, Value};
use tauri::{AppHandle, WebviewWindow};

const MAX_SERVERS: usize = 32;
const MAX_HEADERS: usize = 16;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpServerInput {
    id: String,
    name: String,
    url: String,
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum McpServersMutation {
    /// headers 为 None 时沿用已保存的请求头；Some 时整体替换（空表即清除）。
    Upsert {
        server: McpServerInput,
        headers: Option<BTreeMap<String, String>>,
    },
    Remove {
        id: String,
    },
    SetEnabled {
        id: String,
        enabled: bool,
    },
}

fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 64
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err("MCP 服务器身份无效".into());
    }
    Ok(())
}

fn validate_url(value: &str) -> Result<String, String> {
    let url = url::Url::parse(value.trim()).map_err(|_| "服务器地址格式无效".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("服务器地址只支持 http 或 https".into());
    }
    if !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
        return Err("服务器地址不能包含用户名、密码或 # 片段，凭据请放在请求头".into());
    }
    Ok(url.to_string())
}

fn validate_headers(headers: &BTreeMap<String, String>) -> Result<(), String> {
    if headers.len() > MAX_HEADERS {
        return Err(format!("请求头最多 {MAX_HEADERS} 个"));
    }
    for (name, value) in headers {
        let valid_name = !name.is_empty()
            && name.len() <= 128
            && name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&byte));
        if !valid_name {
            return Err(format!("请求头名称「{name}」无效"));
        }
        if value.len() > 8192 || value.chars().any(|char| char == '\r' || char == '\n') {
            return Err(format!("请求头「{name}」的值无效"));
        }
    }
    Ok(())
}

fn servers_mut(setting: &mut Value) -> &mut Vec<Value> {
    if !setting["mcpServers"].is_array() {
        setting["mcpServers"] = json!([]);
    }
    setting["mcpServers"]
        .as_array_mut()
        .expect("mcpServers 已确保为数组")
}

fn position(servers: &[Value], id: &str) -> Option<usize> {
    servers
        .iter()
        .position(|server| server["id"].as_str() == Some(id))
}

/// 页面可见的服务器列表：请求头只给名称。
pub(crate) fn public_servers(setting: &Value) -> Value {
    let servers = setting["mcpServers"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    Value::Array(
        servers
            .into_iter()
            .filter_map(|server| {
                let object = server.as_object()?;
                let header_names: Vec<Value> = object
                    .get("headers")
                    .and_then(Value::as_object)
                    .map(|headers| headers.keys().cloned().map(Value::String).collect())
                    .unwrap_or_default();
                Some(json!({
                    "id": object.get("id")?,
                    "name": object.get("name")?,
                    "url": object.get("url")?,
                    "enabled": object.get("enabled").and_then(Value::as_bool).unwrap_or(true),
                    "headerNames": header_names,
                }))
            })
            .collect(),
    )
}

/// 建立连接用：只返回启用中的服务器地址与完整请求头。
pub(crate) fn connection(
    setting: &Value,
    id: &str,
) -> Result<(String, Vec<(String, String)>), String> {
    let server = setting["mcpServers"]
        .as_array()
        .and_then(|servers| {
            servers
                .iter()
                .find(|server| server["id"].as_str() == Some(id))
        })
        .ok_or("AI_MCP_CONNECTION_FAILED:MCP 服务器不存在或已删除")?;
    if server["enabled"].as_bool() == Some(false) {
        return Err("AI_MCP_CONNECTION_FAILED:MCP 服务器已停用".into());
    }
    let url = server["url"]
        .as_str()
        .ok_or("AI_MCP_CONNECTION_FAILED:MCP 服务器地址缺失")?
        .to_string();
    let headers = server["headers"]
        .as_object()
        .map(|headers| {
            headers
                .iter()
                .filter_map(|(name, value)| Some((name.clone(), value.as_str()?.to_string())))
                .collect()
        })
        .unwrap_or_default();
    Ok((url, headers))
}

fn apply(setting: &mut Value, mutation: McpServersMutation) -> Result<Value, String> {
    match mutation {
        McpServersMutation::Upsert { server, headers } => {
            validate_id(&server.id)?;
            let name = server.name.trim();
            if name.is_empty() || name.chars().count() > 64 {
                return Err("名称不能为空，且不超过 64 个字符".into());
            }
            let url = validate_url(&server.url)?;
            if let Some(headers) = &headers {
                validate_headers(headers)?;
            }
            let servers = servers_mut(setting);
            let index = position(servers, &server.id);
            if index.is_none() && servers.len() >= MAX_SERVERS {
                return Err(format!("最多添加 {MAX_SERVERS} 个 MCP 服务器"));
            }
            let previous = index.map(|index| servers[index].clone());
            let headers = match headers {
                Some(headers) => Value::Object(
                    headers
                        .into_iter()
                        .map(|(name, value)| (name, Value::String(value)))
                        .collect::<Map<_, _>>(),
                ),
                None => previous
                    .as_ref()
                    .and_then(|previous| previous.get("headers").cloned())
                    .unwrap_or_else(|| json!({})),
            };
            let enabled = previous
                .as_ref()
                .and_then(|previous| previous["enabled"].as_bool())
                .unwrap_or(true);
            let next = json!({
                "id": server.id,
                "name": name,
                "url": url,
                "enabled": enabled,
                "headers": headers,
            });
            match index {
                Some(index) => servers[index] = next,
                None => servers.push(next),
            }
        }
        McpServersMutation::Remove { id } => {
            let servers = servers_mut(setting);
            let index = position(servers, &id).ok_or("MCP 服务器不存在或已删除")?;
            servers.remove(index);
        }
        McpServersMutation::SetEnabled { id, enabled } => {
            let servers = servers_mut(setting);
            let index = position(servers, &id).ok_or("MCP 服务器不存在或已删除")?;
            servers[index]["enabled"] = Value::Bool(enabled);
        }
    }
    Ok(public_servers(setting))
}

#[tauri::command]
pub fn ai_mcp_servers_mutate(
    app: AppHandle,
    window: WebviewWindow,
    mutation: McpServersMutation,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::setting::mutate_setting_value(&app, |setting| apply(setting, mutation))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mutate(setting: &mut Value, mutation: Value) -> Result<Value, String> {
        apply(setting, serde_json::from_value(mutation).unwrap())
    }

    fn upsert(headers: Option<Value>) -> Value {
        let mut mutation = json!({
            "kind": "upsert",
            "server": { "id": "kb", "name": " 团队知识库 ", "url": "https://kb.example.com/mcp" },
        });
        if let Some(headers) = headers {
            mutation["headers"] = headers;
        }
        mutation
    }

    #[test]
    fn public_view_hides_header_values_and_keeps_them_on_update() {
        let mut setting = json!({});
        let public = mutate(
            &mut setting,
            upsert(Some(json!({ "Authorization": "Bearer fixture-token" }))),
        )
        .unwrap();
        assert_eq!(public[0]["name"], "团队知识库");
        assert_eq!(public[0]["headerNames"], json!(["Authorization"]));
        assert!(!public.to_string().contains("fixture-token"));
        mutate(&mut setting, upsert(None)).unwrap();
        assert_eq!(
            setting["mcpServers"][0]["headers"]["Authorization"],
            "Bearer fixture-token"
        );
        let (url, headers) = connection(&setting, "kb").unwrap();
        assert_eq!(url, "https://kb.example.com/mcp");
        assert_eq!(headers.len(), 1);
    }

    #[test]
    fn disabled_or_removed_servers_cannot_connect() {
        let mut setting = json!({});
        mutate(&mut setting, upsert(None)).unwrap();
        mutate(
            &mut setting,
            json!({ "kind": "setEnabled", "id": "kb", "enabled": false }),
        )
        .unwrap();
        assert!(connection(&setting, "kb").is_err());
        mutate(&mut setting, upsert(None)).unwrap();
        assert_eq!(setting["mcpServers"][0]["enabled"], false);
        mutate(&mut setting, json!({ "kind": "remove", "id": "kb" })).unwrap();
        assert!(connection(&setting, "kb").is_err());
    }

    #[test]
    fn rejects_embedded_credentials_and_bad_headers() {
        let mut setting = json!({});
        let mut bad_url = upsert(None);
        bad_url["server"]["url"] = json!("https://user:pass@kb.example.com/mcp");
        assert!(mutate(&mut setting, bad_url).is_err());
        assert!(mutate(&mut setting, upsert(Some(json!({ "Bad Name": "x" })))).is_err());
        assert!(mutate(&mut setting, upsert(Some(json!({ "X-Token": "a\r\nb" })))).is_err());
        assert!(setting.get("mcpServers").is_none() || setting["mcpServers"] == json!([]));
    }
}
