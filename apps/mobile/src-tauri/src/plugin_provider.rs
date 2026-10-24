use std::sync::Arc;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::plugin_files::{FileLease, TemporaryFile};
use crate::plugin_transport;
use crate::setting::get_active_database_name;
use std::path::Path;

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
        if let Some(bytes) = bytes {
            let temp = TemporaryFile::new(&self.0.app)?;
            std::fs::write(&temp.path, bytes).map_err(|e| e.to_string())?;
            return self.call_file(method, name, &temp.path, false).await;
        }
        plugin_transport::request(
            &self.0.app,
            &self.0.token,
            json!({
                "kind": "sync", "session": self.0.session, "pluginId": self.0.id,
                "config": self.0.config, "method": method, "name": name,
            }),
        )
        .await
    }
    async fn call_file(
        &self,
        method: &str,
        name: Option<&str>,
        path: &Path,
        writing: bool,
    ) -> Result<Value, String> {
        let _memory = crate::plugin_files::memory_permit().await?;
        let file = FileLease::open(&self.0.token, path, writing)?;
        if !writing && file.descriptor.size > crate::chunked_sync::protocol().chunk_bytes as u64 {
            return Err("同步对象超过协议分块大小".into());
        }
        let result = plugin_transport::request(
            &self.0.app,
            &self.0.token,
            json!({
                "kind": "sync", "session": self.0.session, "pluginId": self.0.id,
                "config": self.0.config, "method": method, "name": name, "file": file.descriptor,
            }),
        )
        .await?;
        if writing {
            file.finish(result["fileSize"].as_u64().ok_or("插件没有返回文件长度")?)?;
        }
        Ok(result)
    }
    pub(crate) async fn download_raw_path(&self, name: &str, path: &Path) -> Result<(), String> {
        self.call_file("downloadFile", Some(name), path, true)
            .await
            .map(|_| ())
    }
    pub(crate) async fn download_raw_temporary(&self, name: &str) -> Result<TemporaryFile, String> {
        let temp = TemporaryFile::new(&self.0.app)?;
        self.download_raw_path(name, &temp.path).await?;
        Ok(temp)
    }
    pub(crate) fn new_temporary(&self) -> Result<TemporaryFile, String> {
        TemporaryFile::new(&self.0.app)
    }
    pub(crate) async fn download_object(&self, name: &str, limit: u64) -> Result<Vec<u8>, String> {
        let temp = self.download_raw_temporary(name).await?;
        if std::fs::metadata(&temp.path)
            .map_err(|e| e.to_string())?
            .len()
            > limit
        {
            return Err("同步对象超过协议分块大小".into());
        }
        std::fs::read(&temp.path).map_err(|e| e.to_string())
    }
    pub(crate) async fn download_bytes(&self, name: &str) -> Result<Vec<u8>, String> {
        self.download_object(name, crate::chunked_sync::protocol().manifest_bytes as u64)
            .await
    }
    pub(crate) async fn upload_resource_path(
        &self,
        name: &str,
        mime_type: &str,
        path: &Path,
    ) -> Result<String, String> {
        let _memory = crate::plugin_files::memory_permit().await?;
        let file = FileLease::open(&self.0.token, path, false)?;
        let result = plugin_transport::request(
            &self.0.app,
            &self.0.token,
            json!({
                "kind": "upload", "pluginId": self.0.id, "config": self.0.config,
                "name": name, "mimeType": mime_type, "file": file.descriptor,
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
    pub(crate) async fn upload_resource(
        &self,
        name: &str,
        mime_type: &str,
        content: &[u8],
    ) -> Result<String, String> {
        let temp = TemporaryFile::new(&self.0.app)?;
        std::fs::write(&temp.path, content).map_err(|e| e.to_string())?;
        self.upload_resource_path(name, mime_type, &temp.path).await
    }
}
