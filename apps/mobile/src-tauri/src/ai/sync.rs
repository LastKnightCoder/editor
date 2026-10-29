use std::fs;
use std::path::PathBuf;

use serde_json::Value;
use tauri::AppHandle;

use super::store::{safe_file, Store};
use crate::plugin_provider::PluginProvider;

pub struct DownloadedSessions {
    pub path: PathBuf,
}
impl Drop for DownloadedSessions {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}
pub async fn upload(
    app: &AppHandle,
    database: &str,
    provider: &PluginProvider,
    files: &[String],
) -> Result<(), String> {
    let store = Store {
        root: crate::setting::resolve_app_dir(app)?,
        database: database.into(),
    };
    let directory = store.directory()?;
    for name in files {
        safe_file(name)?;
        let path = directory.join(name);
        let kind = path
            .symlink_metadata()
            .map_err(|error| error.to_string())?
            .file_type();
        if !kind.is_file() || kind.is_symlink() {
            return Err("AI_SESSION_INVALID:同步记录不允许符号链接或目录".into());
        }
        provider
            .upload_chunked(
                &crate::chunked_sync::database_session_object(database, name)?,
                name,
                &path,
            )
            .await?;
    }
    let manifest = serde_json::to_vec(&serde_json::json!({"files":files}))
        .map_err(|error| error.to_string())?;
    provider
        .upload(
            &crate::chunked_sync::database_sessions_object(database),
            &manifest,
        )
        .await
        .map_err(|error| format!("{}:{}", error.code, error.message))
}
pub fn decode_list(bytes: &[u8]) -> Result<Vec<String>, String> {
    let value: Value = serde_json::from_slice(bytes)
        .map_err(|error| format!("AI_SESSION_INVALID:清单解析失败：{error}"))?;
    let files = value["files"]
        .as_array()
        .ok_or("AI_SESSION_INVALID:清单缺少文件列表")?;
    let mut output = Vec::new();
    let mut names = std::collections::HashSet::new();
    for file in files {
        let name = file.as_str().ok_or("AI_SESSION_INVALID:清单文件名无效")?;
        safe_file(name)?;
        if !names.insert(name) {
            return Err("AI_SESSION_INVALID:清单文件名重复".into());
        }
        output.push(name.into());
    }
    Ok(output)
}
pub async fn download(
    app: &AppHandle,
    database: &str,
    provider: &PluginProvider,
) -> Result<Option<DownloadedSessions>, String> {
    let object = crate::chunked_sync::database_sessions_object(database);
    if !provider
        .exists(&object)
        .await
        .map_err(|error| format!("{}:{}", error.code, error.message))?
    {
        return Ok(None);
    }
    let bytes = provider
        .download(&object)
        .await
        .map_err(|error| format!("{}:{}", error.code, error.message))?;
    let files = decode_list(&bytes)?;
    let path = crate::setting::resolve_app_dir(app)?
        .join("ai-session-downloads")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    let result = DownloadedSessions { path };
    for file in files {
        let downloaded = provider
            .download_chunked(&crate::chunked_sync::database_session_object(
                database, &file,
            )?)
            .await?;
        fs::rename(&downloaded.path, result.path.join(file)).map_err(|error| error.to_string())?;
    }
    Ok(Some(result))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn manifest_does_not_silently_treat_invalid_or_missing_files_as_empty() {
        assert!(decode_list(br#"{}"#).is_err());
        assert!(decode_list(br#"{"files":["../escape.jsonl"]}"#).is_err());
        assert!(decode_list(br#"{"files":["a.jsonl","a.jsonl"]}"#).is_err());
        assert_eq!(
            decode_list(br#"{"files":[]}"#).unwrap(),
            Vec::<String>::new()
        );
        assert_eq!(
            decode_list(br#"{"files":["2026-10-29_id.jsonl"]}"#).unwrap(),
            vec!["2026-10-29_id.jsonl"]
        );
    }
}
