//! 外部应用「用其他应用打开」交给 Tau 的 Markdown 文件。
//!
//! 原生侧只负责把文件落到本机路径并通知前端（`tau:incoming-file` 窗口事件）：
//! iOS 由系统复制进 Documents/Inbox 后经 `RunEvent::Opened` 送达；Android 由 MainActivity
//! 复制进缓存目录、经 JNI `takeIncomingFile` 取路径。前端启动时与收到事件时调用
//! `incoming_file_take` 取走文件，读取后即删除源文件，同一文件只交付一次。

use serde::Serialize;
use std::path::Path;
#[cfg(target_os = "ios")]
use std::path::PathBuf;
#[cfg(target_os = "ios")]
use std::sync::Mutex;
use tauri::AppHandle;

/// 与 Android MainActivity 的 INCOMING_MAX_BYTES 一致
const MAX_BYTES: u64 = 5 * 1024 * 1024;
const MARKDOWN_EXTENSIONS: [&str; 5] = ["md", "markdown", "mdown", "mkd", "mkdn"];

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IncomingFile {
    /// 文件名（不含扩展名），导入时作为文章 / 文档标题
    pub title: String,
    pub markdown: String,
}

#[cfg(target_os = "ios")]
#[derive(Default)]
pub struct PendingIncomingFile(Mutex<Option<PathBuf>>);

/// iOS：记录系统送达的文件并通知前端；同时送达多个时只保留最后一个
#[cfg(target_os = "ios")]
pub fn receive_opened(app: &AppHandle, urls: Vec<url::Url>) {
    use tauri::Manager;

    let Some(path) = urls
        .into_iter()
        .filter(|url| url.scheme() == "file")
        .filter_map(|url| url.to_file_path().ok())
        .next_back()
    else {
        return;
    };
    let state = app.state::<PendingIncomingFile>();
    if let Ok(mut pending) = state.0.lock() {
        if let Some(previous) = pending.replace(path) {
            let _ = std::fs::remove_file(previous);
        }
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval("window.dispatchEvent(new Event('tau:incoming-file'))");
    }
}

#[cfg(target_os = "ios")]
async fn take_pending_path(app: &AppHandle) -> Result<Option<String>, String> {
    use tauri::Manager;

    let state = app.state::<PendingIncomingFile>();
    let mut pending = state
        .0
        .lock()
        .map_err(|_| "INCOMING_FILE_READ_FAILED: pending state poisoned".to_string())?;
    Ok(pending
        .take()
        .map(|path| path.to_string_lossy().into_owned()))
}

#[cfg(target_os = "android")]
async fn take_pending_path(app: &AppHandle) -> Result<Option<String>, String> {
    use jni::objects::JString;
    use tauri::Manager;

    let Some(window) = app.get_webview_window("main") else {
        return Ok(None);
    };
    // exec 在 Activity 主线程执行，命令为 async 才不会与主线程互相等待
    let (sender, receiver) = tokio::sync::oneshot::channel::<Option<String>>();
    window
        .with_webview(move |webview| {
            webview.jni_handle().exec(move |env, activity, _webview| {
                let path = env
                    .call_method(activity, "takeIncomingFile", "()Ljava/lang/String;", &[])
                    .and_then(|value| value.l())
                    .ok()
                    .filter(|object| !object.is_null())
                    .and_then(|object| {
                        env.get_string(&JString::from(object))
                            .ok()
                            .map(String::from)
                    });
                let _ = sender.send(path);
            });
        })
        .map_err(|e| format!("INCOMING_FILE_READ_FAILED: {e}"))?;
    receiver
        .await
        .map_err(|e| format!("INCOMING_FILE_READ_FAILED: {e}"))
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
async fn take_pending_path(_app: &AppHandle) -> Result<Option<String>, String> {
    Ok(None)
}

#[tauri::command]
pub async fn incoming_file_take(app: AppHandle) -> Result<Option<IncomingFile>, String> {
    let Some(path) = take_pending_path(&app).await? else {
        return Ok(None);
    };
    let path = Path::new(&path);
    let result = read_incoming_file(path);
    let _ = std::fs::remove_file(path);
    result.map(Some)
}

fn read_incoming_file(path: &Path) -> Result<IncomingFile, String> {
    let is_markdown = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| MARKDOWN_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false);
    if !is_markdown {
        return Err("INCOMING_FILE_UNSUPPORTED: only markdown files are supported".to_string());
    }
    let size = std::fs::metadata(path)
        .map_err(|e| format!("INCOMING_FILE_READ_FAILED: {e}"))?
        .len();
    if size > MAX_BYTES {
        return Err("INCOMING_FILE_TOO_LARGE: file exceeds 5 MB".to_string());
    }
    let bytes = std::fs::read(path).map_err(|e| format!("INCOMING_FILE_READ_FAILED: {e}"))?;
    let text = String::from_utf8(bytes)
        .map_err(|_| "INCOMING_FILE_ENCODING: file is not valid UTF-8".to_string())?;
    let title = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().trim().to_string())
        .filter(|stem| !stem.is_empty())
        .unwrap_or_else(|| "未命名".to_string());
    Ok(IncomingFile {
        title,
        markdown: text.trim_start_matches('\u{feff}').to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_temp(name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("tau-incoming-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        std::fs::write(&path, bytes).unwrap();
        path
    }

    #[test]
    fn reads_markdown_with_title_from_file_stem_and_strips_bom() {
        let path = write_temp("读书笔记.MD", "\u{feff}# 标题\n正文".as_bytes());
        assert_eq!(
            read_incoming_file(&path).unwrap(),
            IncomingFile {
                title: "读书笔记".to_string(),
                markdown: "# 标题\n正文".to_string(),
            }
        );
    }

    #[test]
    fn rejects_non_markdown_extension() {
        let path = write_temp("photo.jpg", b"binary");
        assert!(read_incoming_file(&path)
            .unwrap_err()
            .starts_with("INCOMING_FILE_UNSUPPORTED"));
    }

    #[test]
    fn rejects_oversized_and_non_utf8_files() {
        let large = write_temp("large.md", &vec![b'a'; MAX_BYTES as usize + 1]);
        assert!(read_incoming_file(&large)
            .unwrap_err()
            .starts_with("INCOMING_FILE_TOO_LARGE"));
        let gbk = write_temp("gbk.md", &[0xc4, 0xe3, 0xba, 0xc3]);
        assert!(read_incoming_file(&gbk)
            .unwrap_err()
            .starts_with("INCOMING_FILE_ENCODING"));
    }
}
