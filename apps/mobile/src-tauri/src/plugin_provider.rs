use std::future::Future;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::plugin_files::{FileLease, TemporaryFile};
use crate::plugin_transport;
use crate::setting::get_active_database_name;
use std::path::Path;

#[derive(Clone)]
pub(crate) struct PluginProvider {
    inner: Arc<Session>,
    retry_transfers: bool,
}
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
            .field("id", &self.inner.id)
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
        Ok(Self {
            inner: Arc::new(Session {
                app: app.clone(),
                token: plugin_transport::host_token(&database)?,
                id: id.into(),
                config,
                session: uuid::Uuid::new_v4().to_string(),
            }),
            retry_transfers: false,
        })
    }
    pub(crate) fn with_transfer_retries(mut self) -> Self {
        self.retry_transfers = true;
        self
    }
    fn retry_delays(&self, method: &str) -> &'static [Duration] {
        if self.retry_transfers && method != "createFileIfAbsent" {
            &RETRY_DELAYS
        } else {
            &[]
        }
    }
    pub(crate) fn id(&self) -> &str {
        &self.inner.id
    }
    pub(crate) fn config(&self) -> &Value {
        &self.inner.config
    }
    pub(crate) async fn call(
        &self,
        method: &str,
        name: Option<&str>,
        bytes: Option<&[u8]>,
    ) -> Result<Value, String> {
        if let Some(bytes) = bytes {
            let temp = TemporaryFile::new(&self.inner.app)?;
            std::fs::write(&temp.path, bytes).map_err(|e| e.to_string())?;
            return self.call_file(method, name, &temp.path, false).await;
        }
        let label = self.transfer_label(method, name, 0);
        let delays = self.retry_delays(method);
        retry_transfer(&label, delays, || async {
            plugin_transport::request(
                &self.inner.app,
                &self.inner.token,
                json!({
                    "kind": "sync", "session": self.inner.session, "pluginId": self.inner.id,
                    "config": self.inner.config, "method": method, "name": name,
                }),
            )
            .await
        })
        .await
    }

    fn transfer_label(&self, method: &str, name: Option<&str>, size: u64) -> String {
        format!(
            "session={} plugin={} operation={method} object={:?} bytes={size}",
            self.inner.session,
            self.inner.id,
            name.unwrap_or("")
        )
    }
    async fn call_file(
        &self,
        method: &str,
        name: Option<&str>,
        path: &Path,
        writing: bool,
    ) -> Result<Value, String> {
        let size = std::fs::metadata(path)
            .map_err(|error| error.to_string())?
            .len();
        let label = self.transfer_label(method, name, size);
        let delays = self.retry_delays(method);
        retry_transfer(&label, delays, || {
            self.call_file_once(method, name, path, writing)
        })
        .await
    }

    async fn call_file_once(
        &self,
        method: &str,
        name: Option<&str>,
        path: &Path,
        writing: bool,
    ) -> Result<Value, String> {
        let _memory = crate::plugin_files::memory_permit().await?;
        plugin_transport::with_host(&self.inner.token, || Ok(()))?;
        if writing {
            std::fs::OpenOptions::new()
                .write(true)
                .open(path)
                .and_then(|file| file.set_len(0))
                .map_err(|error| error.to_string())?;
        }
        let file = FileLease::open(&self.inner.token, path, writing)?;
        if !writing && file.descriptor.size > crate::chunked_sync::protocol().chunk_bytes as u64 {
            return Err("同步对象超过协议分块大小".into());
        }
        let result = plugin_transport::request(
            &self.inner.app,
            &self.inner.token,
            json!({
                "kind": "sync", "session": self.inner.session, "pluginId": self.inner.id,
                "config": self.inner.config, "method": method, "name": name, "file": file.descriptor,
            }),
        )
        .await?;
        if writing {
            file.finish(result["fileSize"].as_u64().ok_or("插件没有返回文件长度")?)?;
        }
        if method == "uploadFile" && result == false {
            return Err("同步对象上传失败".into());
        }
        Ok(result)
    }
    pub(crate) async fn download_raw_path(&self, name: &str, path: &Path) -> Result<(), String> {
        self.call_file("downloadFile", Some(name), path, true)
            .await
            .map(|_| ())
    }
    pub(crate) async fn download_raw_temporary(&self, name: &str) -> Result<TemporaryFile, String> {
        let temp = TemporaryFile::new(&self.inner.app)?;
        self.download_raw_path(name, &temp.path).await?;
        Ok(temp)
    }
    pub(crate) fn new_temporary(&self) -> Result<TemporaryFile, String> {
        TemporaryFile::new(&self.inner.app)
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
        let file = FileLease::open(&self.inner.token, path, false)?;
        let result = plugin_transport::request(
            &self.inner.app,
            &self.inner.token,
            json!({
                "kind": "upload", "pluginId": self.inner.id, "config": self.inner.config,
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
        let temp = TemporaryFile::new(&self.inner.app)?;
        std::fs::write(&temp.path, content).map_err(|e| e.to_string())?;
        self.upload_resource_path(name, mime_type, &temp.path).await
    }
}

const RETRY_DELAYS: [Duration; 3] = [
    Duration::from_secs(1),
    Duration::from_secs(2),
    Duration::from_secs(4),
];

fn retry_reason(error: &str) -> Option<&'static str> {
    let error = error.to_lowercase();
    if [
        "401",
        "403",
        "invalid",
        "无效",
        "不允许",
        "已结束",
        "未就绪",
        "已失效",
        "已断开",
        "已停用",
        "已取消",
        "cancel",
        "not allowed",
        "认证",
        "凭证",
    ]
    .iter()
    .any(|part| error.contains(part))
    {
        return None;
    }
    if error.contains("timeout") || error.contains("timed out") || error.contains("超时") {
        Some("timeout")
    } else if ["network", "connection", "网络", "断网", "长时间没有进展"]
        .iter()
        .any(|part| error.contains(part))
    {
        Some("network")
    } else if ["429", "500", "502", "503", "504"]
        .iter()
        .any(|status| error.contains(status))
    {
        Some("server")
    } else if error == "同步对象上传失败" {
        Some("upload-rejected")
    } else {
        None
    }
}

async fn retry_transfer<T, F, Fut>(
    label: &str,
    delays: &[Duration],
    mut transfer: F,
) -> Result<T, String>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, String>>,
{
    let started = Instant::now();
    for attempt in 0..=delays.len() {
        let request_started = Instant::now();
        crate::logger::info(format!(
            "[sync-transfer] start {label} attempt={}",
            attempt + 1
        ));
        match transfer().await {
            Ok(value) => {
                crate::logger::info(format!(
                    "[sync-transfer] done {label} attempt={} elapsed_ms={} total_ms={}",
                    attempt + 1,
                    request_started.elapsed().as_millis(),
                    started.elapsed().as_millis()
                ));
                return Ok(value);
            }
            Err(error) => {
                let reason = retry_reason(&error);
                let delay = reason.and_then(|_| delays.get(attempt));
                crate::logger::warn(format!("[sync-transfer] failed {label} attempt={} elapsed_ms={} total_ms={} reason={} retry_ms={}",
                    attempt + 1, request_started.elapsed().as_millis(), started.elapsed().as_millis(),
                    reason.unwrap_or("permanent"), delay.map_or(0, Duration::as_millis)));
                let Some(delay) = delay else {
                    return Err(format!(
                        "同步请求失败（{label} attempts={}）: {error}",
                        attempt + 1
                    ));
                };
                tokio::time::sleep(*delay).await;
            }
        }
    }
    unreachable!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[tokio::test]
    async fn transient_timeout_retries_only_the_failed_operation_and_recovers() {
        let attempts = Cell::new(0);
        let value = retry_transfer(
            "operation=uploadFile object=chunk bytes=8",
            &[Duration::ZERO; 3],
            || async {
                attempts.set(attempts.get() + 1);
                if attempts.get() < 3 {
                    Err("The operation timed out.".into())
                } else {
                    Ok(42)
                }
            },
        )
        .await
        .unwrap();
        assert_eq!(value, 42);
        assert_eq!(attempts.get(), 3);
    }

    #[tokio::test]
    async fn retries_are_bounded_and_permanent_failures_are_not_retried() {
        for (message, count) in [
            ("The operation timed out.", 4),
            ("同步对象上传失败", 4),
            ("OSS读取失败：403", 1),
            ("插件宿主会话已结束", 1),
            ("同步分块内容校验失败", 1),
        ] {
            let attempts = Cell::new(0);
            let result: Result<(), String> = retry_transfer(
                "operation=fileExists object=chunk",
                &[Duration::ZERO; 3],
                || async {
                    attempts.set(attempts.get() + 1);
                    Err(message.into())
                },
            )
            .await;
            let error = result.unwrap_err();
            assert_eq!(attempts.get(), count);
            assert!(error.contains("operation=fileExists object=chunk"));
            assert!(error.contains(&format!("attempts={count}")));
        }
    }
}
