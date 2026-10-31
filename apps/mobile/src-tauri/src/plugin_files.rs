use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use tauri::{AppHandle, WebviewWindow};

use crate::plugin_transport::{window_allowed, with_host};
use crate::setting::resolve_app_dir;

pub(crate) const CHUNK_BYTES: usize = 256 * 1024;
pub(crate) const MAX_FILE_TRANSFERS: usize = 3;
pub(crate) async fn memory_permit() -> Result<tokio::sync::OwnedSemaphorePermit, String> {
    static LIMIT: OnceLock<Arc<tokio::sync::Semaphore>> = OnceLock::new();
    LIMIT
        .get_or_init(|| Arc::new(tokio::sync::Semaphore::new(MAX_FILE_TRANSFERS)))
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| "插件文件调度已结束".into())
}
pub(crate) fn encode_chunk(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}
pub(crate) fn decode_chunk(value: &str) -> Result<Vec<u8>, String> {
    if value.len() > CHUNK_BYTES.div_ceil(3) * 4 {
        return Err("插件传输块过大".into());
    }
    let bytes = STANDARD.decode(value).map_err(|_| "插件传输块编码无效")?;
    if bytes.len() > CHUNK_BYTES {
        return Err("插件传输块过大".into());
    }
    Ok(bytes)
}

#[derive(Debug)]
pub(crate) struct TemporaryFile {
    pub(crate) path: PathBuf,
}
impl TemporaryFile {
    pub(crate) fn new(app: &AppHandle) -> Result<Self, String> {
        static ROOT: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
        let mut root = ROOT
            .get_or_init(|| Mutex::new(None))
            .lock()
            .map_err(|_| "临时目录不可用")?;
        if root.is_none() {
            let dir = resolve_app_dir(app)?.join("plugin-transfers");
            if dir.exists() {
                fs::remove_dir_all(&dir).map_err(|e| format!("清理中断的插件传输失败: {e}"))?;
            }
            fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            *root = Some(dir);
        }
        Self::new_in(root.as_ref().unwrap())
    }
    pub(crate) fn new_in(dir: &Path) -> Result<Self, String> {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        let path = dir.join(format!("{}.transfer", uuid::Uuid::new_v4()));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        options.open(&path).map_err(|e| e.to_string())?;
        Ok(Self { path })
    }
}
impl Drop for TemporaryFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}
struct FileState {
    file: File,
    writing: bool,
    position: u64,
}
struct Handle {
    token: String,
    state: Mutex<FileState>,
}
fn handles() -> &'static Mutex<HashMap<String, Arc<Handle>>> {
    static STATE: OnceLock<Mutex<HashMap<String, Arc<Handle>>>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(HashMap::new()))
}
pub(crate) fn invalidate() {
    if let Ok(mut state) = handles().lock() {
        state.clear();
    }
}
#[derive(Clone, Serialize)]
pub(crate) struct FileDescriptor {
    pub(crate) id: String,
    pub(crate) size: u64,
}
pub(crate) struct FileLease {
    pub(crate) token: String,
    pub(crate) descriptor: FileDescriptor,
}
impl FileLease {
    pub(crate) fn open(token: &str, path: &Path, writing: bool) -> Result<Self, String> {
        let file = OpenOptions::new()
            .read(!writing)
            .write(writing)
            .open(path)
            .map_err(|e| e.to_string())?;
        let size = file.metadata().map_err(|e| e.to_string())?.len();
        with_host(token, || {
            let mut handles = handles().lock().map_err(|_| "插件文件状态不可用")?;
            if handles.len() >= 32 {
                return Err("插件文件任务过多".into());
            }
            let id = uuid::Uuid::new_v4().to_string();
            handles.insert(
                id.clone(),
                Arc::new(Handle {
                    token: token.into(),
                    state: Mutex::new(FileState {
                        file,
                        writing,
                        position: 0,
                    }),
                }),
            );
            Ok(Self {
                token: token.into(),
                descriptor: FileDescriptor { id, size },
            })
        })
    }
    pub(crate) fn finish(&self, expected: u64) -> Result<(), String> {
        let handle = get(&self.token, &self.descriptor.id)?;
        let state = handle.state.lock().map_err(|_| "插件文件状态不可用")?;
        if !state.writing || state.position != expected {
            return Err("插件文件长度不完整".into());
        }
        state.file.sync_all().map_err(|e| e.to_string())?;
        with_host(&self.token, || Ok(()))
    }
}
impl Drop for FileLease {
    fn drop(&mut self) {
        if let Ok(mut state) = handles().lock() {
            state.remove(&self.descriptor.id);
        }
    }
}
fn get(token: &str, id: &str) -> Result<Arc<Handle>, String> {
    with_host(token, || {
        handles()
            .lock()
            .map_err(|_| "插件文件状态不可用")?
            .get(id)
            .filter(|handle| handle.token == token)
            .cloned()
            .ok_or_else(|| "插件文件任务已结束".into())
    })
}
pub(crate) fn read_chunk(token: &str, id: &str, offset: u64) -> Result<Option<String>, String> {
    let handle = get(token, id)?;
    let mut state = handle.state.lock().map_err(|_| "插件文件状态不可用")?;
    if state.writing || state.position != offset {
        return Err("插件文件读取顺序无效".into());
    }
    let mut bytes = vec![0; CHUNK_BYTES];
    let size = state.file.read(&mut bytes).map_err(|e| e.to_string())?;
    state.position += size as u64;
    with_host(token, || {
        Ok((size != 0).then(|| encode_chunk(&bytes[..size])))
    })
}
pub(crate) fn write_chunk(token: &str, id: &str, offset: u64, chunk: &str) -> Result<(), String> {
    let bytes = decode_chunk(chunk)?;
    let handle = get(token, id)?;
    let mut state = handle.state.lock().map_err(|_| "插件文件状态不可用")?;
    if !state.writing || state.position != offset {
        return Err("插件文件写入顺序无效".into());
    }
    state.file.write_all(&bytes).map_err(|e| e.to_string())?;
    state.position += bytes.len() as u64;
    with_host(token, || Ok(()))
}
#[tauri::command]
pub async fn plugin_file_read(
    window: WebviewWindow,
    token: String,
    id: String,
    offset: u64,
) -> Result<Option<String>, String> {
    window_allowed(&window)?;
    tauri::async_runtime::spawn_blocking(move || read_chunk(&token, &id, offset))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn plugin_file_write(
    window: WebviewWindow,
    token: String,
    id: String,
    offset: u64,
    chunk: String,
) -> Result<(), String> {
    window_allowed(&window)?;
    tauri::async_runtime::spawn_blocking(move || write_chunk(&token, &id, offset, &chunk))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn file_transfer_permits_bound_concurrency_and_release_capacity() {
        let first = memory_permit().await.unwrap();
        let second = memory_permit().await.unwrap();
        let third = memory_permit().await.unwrap();
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(20), memory_permit())
                .await
                .is_err()
        );
        drop(first);
        let next = tokio::time::timeout(std::time::Duration::from_secs(1), memory_permit())
            .await
            .unwrap()
            .unwrap();
        drop((second, third, next));
    }

    #[test]
    fn large_file_handles_are_bounded_ordered_owned_and_cleaned() {
        let _guard = crate::plugin_transport::test_host("files");
        let dir = std::env::temp_dir().join(format!("tau-file-test-{}", uuid::Uuid::new_v4()));
        let source = TemporaryFile::new_in(&dir).unwrap();
        let target = TemporaryFile::new_in(&dir).unwrap();
        let length = 129 * 1024 * 1024 + 19;
        let mut file = File::create(&source.path).unwrap();
        let chunk = vec![7; CHUNK_BYTES];
        for offset in (0..length).step_by(CHUNK_BYTES) {
            file.write_all(&chunk[..(length - offset).min(CHUNK_BYTES)])
                .unwrap();
        }
        drop(file);
        let read = FileLease::open("files", &source.path, false).unwrap();
        let write = FileLease::open("files", &target.path, true).unwrap();
        assert_eq!(read.descriptor.size, length as u64);
        assert!(read_chunk("wrong", &read.descriptor.id, 0).is_err());
        assert!(read_chunk("files", &read.descriptor.id, 1).is_err());
        let mut offset = 0;
        while let Some(chunk) = read_chunk("files", &read.descriptor.id, offset).unwrap() {
            let decoded = decode_chunk(&chunk).unwrap();
            assert!(decoded.len() <= CHUNK_BYTES);
            assert!(decoded.iter().all(|byte| *byte == 7));
            write_chunk("files", &write.descriptor.id, offset, &chunk).unwrap();
            offset += decoded.len() as u64;
        }
        assert_eq!(offset, length as u64);
        assert!(write.finish(offset - 1).is_err());
        write.finish(offset).unwrap();
        assert_eq!(fs::metadata(&target.path).unwrap().len(), length as u64);
        assert!(decode_chunk(&encode_chunk(&vec![0; CHUNK_BYTES + 1])).is_err());
        invalidate();
        assert!(read_chunk("files", &read.descriptor.id, offset).is_err());
        drop(read);
        drop(write);
        drop(source);
        drop(target);
        assert!(fs::read_dir(&dir).unwrap().next().is_none());
        fs::remove_dir(dir).unwrap();
    }
}
