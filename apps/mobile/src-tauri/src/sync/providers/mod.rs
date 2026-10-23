use super::common::{
    ResourceSyncRateLimit, DEFAULT_RESOURCE_SYNC_RETRY_BACKOFF_MULTIPLIER,
    DEFAULT_RESOURCE_SYNC_RETRY_COUNT, DEFAULT_RESOURCE_SYNC_RETRY_DELAY_MS,
};
use super::context::SyncProvider;
use super::error::AppError;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct ResourceRemoteFileInfo {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) size: u64,
}
fn error(message: impl Into<String>) -> AppError {
    AppError::new("SYNC_PLUGIN_FAILED", message)
}
impl SyncProvider {
    pub(crate) async fn exists(&self, name: &str) -> Result<bool, AppError> {
        self.call("fileExists", Some(name), None)
            .await
            .map_err(error)?
            .as_bool()
            .ok_or_else(|| error("插件没有返回文件存在状态"))
    }
    pub(crate) async fn download(&self, name: &str) -> Result<Vec<u8>, AppError> {
        let result = self
            .call("downloadFile", Some(name), None)
            .await
            .map_err(error)?;
        STANDARD
            .decode(
                result
                    .as_str()
                    .ok_or_else(|| error("插件文件内容格式无效"))?,
            )
            .map_err(|_| error("插件文件编码无效"))
    }
    pub(crate) async fn upload(&self, name: &str, content: &[u8]) -> Result<(), AppError> {
        if self
            .call("uploadFile", Some(name), Some(content))
            .await
            .map_err(error)?
            == true
        {
            Ok(())
        } else {
            Err(error("插件文件上传失败"))
        }
    }
    pub(crate) async fn create_if_absent(
        &self,
        name: &str,
        content: &[u8],
    ) -> Result<(), AppError> {
        if self
            .call("createFileIfAbsent", Some(name), Some(content))
            .await
            .map_err(error)?
            == true
        {
            Ok(())
        } else {
            Err(error("远端已存在后继版本或无法确认创建结果"))
        }
    }
}
pub(crate) async fn list_remote_resources(
    provider: &SyncProvider,
    prefix: &str,
) -> Result<Vec<ResourceRemoteFileInfo>, AppError> {
    let files: Vec<ResourceRemoteFileInfo> = serde_json::from_value(
        provider
            .call("listFiles", Some(prefix), None)
            .await
            .map_err(error)?,
    )
    .map_err(|_| error("插件文件列表格式无效"))?;
    validate_files(&files, prefix)?;
    Ok(files)
}
pub(crate) fn sync_provider_name(_provider: &SyncProvider) -> String {
    "plugin".into()
}
pub(crate) fn sync_provider_rate_limit(_provider: &SyncProvider) -> ResourceSyncRateLimit {
    ResourceSyncRateLimit {
        retry_count: DEFAULT_RESOURCE_SYNC_RETRY_COUNT,
        retry_delay_ms: DEFAULT_RESOURCE_SYNC_RETRY_DELAY_MS,
        retry_backoff_multiplier: DEFAULT_RESOURCE_SYNC_RETRY_BACKOFF_MULTIPLIER,
    }
}
pub(crate) fn provider_status_file_name(
    provider: &SyncProvider,
) -> (String, HashMap<String, String>) {
    (
        crate::provider_settings::status_file_name(provider.id(), provider.config()),
        HashMap::from([("pluginId".into(), provider.id().into())]),
    )
}

fn validate_files(files: &[ResourceRemoteFileInfo], prefix: &str) -> Result<(), AppError> {
    let mut names = std::collections::HashSet::new();
    for file in files {
        if file.name.is_empty()
            || matches!(file.name.as_str(), "." | "..")
            || file
                .name
                .chars()
                .any(|ch| ch == '/' || ch == '\\' || ch.is_control())
            || !names.insert(&file.name)
            || (!file.path.is_empty()
                && (!file.path.starts_with(prefix)
                    || file.path.split('/').any(|part| part == "." || part == "..")
                    || file.path.contains('\\')))
        {
            return Err(error("插件资源路径越界或文件名重复"));
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remote_resource_paths_cannot_escape_local_directory() {
        let file = |name: &str, path: &str| ResourceRemoteFileInfo {
            name: name.into(),
            path: path.into(),
            size: 1,
        };
        assert!(
            validate_files(&[file("../setting.json", "resources/file")], "resources/").is_err()
        );
        assert!(
            validate_files(&[file("file", "resources/../setting.json")], "resources/").is_err()
        );
        assert!(validate_files(
            &[
                file("file", "resources/file"),
                file("file", "resources/other/file")
            ],
            "resources/"
        )
        .is_err());
        assert!(validate_files(&[file("图片.webp", "resources/图片.webp")], "resources/").is_ok());
    }
}
