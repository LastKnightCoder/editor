use std::fs;
use std::future::Future;
use std::path::PathBuf;

use futures_util::{stream::FuturesUnordered, StreamExt};
use serde_json::Value;
use tauri::AppHandle;

use super::store::{safe_file, Store};
use crate::plugin_provider::PluginProvider;

pub struct DownloadedSessions {
    pub path: PathBuf,
    pub files: Vec<String>,
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
    plan: &super::sync_cache::UploadPlan,
) -> Result<(), String> {
    let store = Store {
        root: crate::setting::resolve_app_dir(app)?,
        database: database.into(),
    };
    let directory = store.directory()?;
    crate::logger::info(format!(
        "[sync] sessions-upload db={database} total={} pending={} skipped={} concurrency={}",
        files.len(),
        plan.pending.len(),
        files.len() - plan.pending.len(),
        crate::plugin_files::MAX_FILE_TRANSFERS,
    ));
    let directory = &directory;
    transfer_files(plan.pending.clone(), |name| async move {
        safe_file(&name)?;
        let path = directory.join(&name);
        let kind = path
            .symlink_metadata()
            .map_err(|error| error.to_string())?
            .file_type();
        if !kind.is_file() || kind.is_symlink() {
            return Err("AI_SESSION_INVALID:同步记录不允许符号链接或目录".into());
        }
        provider
            .upload_chunked(
                &crate::chunked_sync::database_session_object(database, &name)?,
                &name,
                &path,
            )
            .await
    })
    .await?;
    plan.verify()?;
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
    let root = crate::setting::resolve_app_dir(app)?;
    let local = Store {
        root: root.clone(),
        database: database.into(),
    }
    .directory()?;
    let path = root
        .join("ai-session-downloads")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    let result = DownloadedSessions {
        path,
        files: files.clone(),
    };
    let directory = &result.path;
    let local = &local;
    transfer_files(files, |file| async move {
        let downloaded = provider
            .download_session_chunked(
                &crate::chunked_sync::database_session_object(database, &file)?,
                &file,
                &local.join(&file),
            )
            .await?;
        fs::rename(&downloaded.path, directory.join(file)).map_err(|error| error.to_string())
    })
    .await?;
    Ok(Some(result))
}

async fn transfer_files<F, Fut>(files: Vec<String>, transfer: F) -> Result<(), String>
where
    F: Fn(String) -> Fut,
    Fut: Future<Output = Result<(), String>>,
{
    let mut files = files.into_iter();
    let mut pending = FuturesUnordered::new();
    let mut error = None;
    loop {
        while error.is_none() && pending.len() < crate::plugin_files::MAX_FILE_TRANSFERS {
            let Some(file) = files.next() else { break };
            pending.push(transfer(file));
        }
        let Some(result) = pending.next().await else {
            break;
        };
        if let Err(issue) = result {
            error.get_or_insert(issue);
        }
    }
    // 先等待在途传输结束，避免清理临时目录后仍有迟到写入。
    error.map_or(Ok(()), Err)
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};

    #[tokio::test]
    async fn session_transfers_run_concurrently_with_a_limit_of_three() {
        let active = Cell::new(0);
        let peak = Cell::new(0);
        let completed = RefCell::new(vec![]);
        transfer_files((0..10).map(|index| index.to_string()).collect(), |file| {
            let active = &active;
            let peak = &peak;
            let completed = &completed;
            async move {
                active.set(active.get() + 1);
                peak.set(peak.get().max(active.get()));
                tokio::task::yield_now().await;
                completed.borrow_mut().push(file);
                active.set(active.get() - 1);
                Ok(())
            }
        })
        .await
        .unwrap();
        assert_eq!(peak.get(), 3);
        assert_eq!(active.get(), 0);
        assert_eq!(completed.borrow().len(), 10);
    }

    #[tokio::test]
    async fn failed_transfer_stops_new_files_and_drains_in_flight_files() {
        let started = RefCell::new(vec![]);
        let completed = RefCell::new(vec![]);
        let error = transfer_files((0..10).map(|index| index.to_string()).collect(), |file| {
            let started = &started;
            let completed = &completed;
            async move {
                started.borrow_mut().push(file.clone());
                if file == "0" {
                    return Err("断网".into());
                }
                tokio::task::yield_now().await;
                completed.borrow_mut().push(file);
                Ok(())
            }
        })
        .await
        .unwrap_err();
        assert_eq!(error, "断网");
        started.borrow_mut().sort();
        completed.borrow_mut().sort();
        assert_eq!(*started.borrow(), vec!["0", "1", "2"]);
        assert_eq!(*completed.borrow(), vec!["1", "2"]);
    }

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
