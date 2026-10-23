use std::sync::Arc;

use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::plugin_transport;
use crate::setting::get_active_database_name;

#[derive(Clone)]
pub(crate) struct PluginProvider(Arc<Session>);
struct Session {
    app: AppHandle,
    token: String,
    id: String,
    config: Value,
    session: String,
}
impl std::fmt::Debug for PluginProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PluginProvider")
            .field("id", &self.0.id)
            .finish_non_exhaustive()
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.app.emit_to(
            "main",
            "plugin-provider-request",
            json!({
                "token": self.token, "kind": "close", "session": self.session,
            }),
        );
    }
}
impl PluginProvider {
    pub(crate) fn from_setting(
        app: &AppHandle,
        setting: &Value,
        section: &str,
        selected: Option<&str>,
    ) -> Result<Self, String> {
        let source = &setting[section];
        if selected.is_none() && source["active"] != "plugin" {
            return Err("请先配置并选择存储插件".into());
        }
        let id = selected
            .or_else(|| source["plugin"]["id"].as_str())
            .filter(|id| !id.is_empty())
            .ok_or("请先选择存储插件")?;
        let config = source["plugin"]["configurations"]
            .get(id)
            .cloned()
            .ok_or("请先保存插件配置")?;
        let database = get_active_database_name(setting);
        Ok(Self(Arc::new(Session {
            app: app.clone(),
            token: plugin_transport::host_token(&database)?,
            id: id.into(),
            config,
            session: uuid::Uuid::new_v4().to_string(),
        })))
    }
    pub(crate) fn id(&self) -> &str {
        &self.0.id
    }
    pub(crate) fn config(&self) -> &Value {
        &self.0.config
    }
    pub(crate) async fn call(
        &self,
        method: &str,
        name: Option<&str>,
        bytes: Option<&[u8]>,
    ) -> Result<Value, String> {
        plugin_transport::request(
            &self.0.app,
            &self.0.token,
            json!({
                "kind": "sync", "session": self.0.session, "pluginId": self.0.id,
                "config": self.0.config, "method": method, "name": name,
                "bytes": bytes.map(|bytes| STANDARD.encode(bytes)),
            }),
        )
        .await
    }
    pub(crate) async fn upload_resource(
        &self,
        name: &str,
        mime_type: &str,
        content: &[u8],
    ) -> Result<String, String> {
        let result = plugin_transport::request(
            &self.0.app,
            &self.0.token,
            json!({
                "kind": "upload", "pluginId": self.0.id, "config": self.0.config,
                "name": name, "mimeType": mime_type, "bytes": STANDARD.encode(content),
            }),
        )
        .await?;
        let url = result.as_str().ok_or("上传插件没有返回资源地址")?;
        let parsed = url::Url::parse(url).map_err(|_| "上传插件返回无效资源地址")?;
        if !matches!(parsed.scheme(), "http" | "https") {
            return Err("上传插件必须返回 HTTP(S) 资源地址".into());
        }
        Ok(url.into())
    }
}
