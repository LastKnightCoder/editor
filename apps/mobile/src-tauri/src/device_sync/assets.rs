use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::AppHandle;

fn directory(app: &AppHandle) -> Result<PathBuf, String> {
    let path = crate::setting::resolve_app_dir(app)?.join("resources/device-sync");
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}
fn path(directory: &Path, name: &str) -> Result<PathBuf, String> {
    if !regex::Regex::new(r"^[a-f0-9]{64}\.(png|jpg|gif|webp|bin)$")
        .unwrap()
        .is_match(name)
    {
        return Err("DEVICE_SYNC_ASSET_PATH: 资源路径无效".into());
    }
    Ok(directory.join(name))
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn bytes(path: &Path) -> Result<Vec<u8>, String> {
    let meta = fs::symlink_metadata(path).map_err(|_| "DEVICE_SYNC_ASSET_MISSING: 资源尚未就绪")?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 25 * 1024 * 1024 {
        return Err("DEVICE_SYNC_ASSET: 资源必须为不超过 25 MiB 的普通文件".into());
    }
    fs::read(path).map_err(|error| error.to_string())
}
fn valid(path: &Path, name: &str) -> bool {
    use std::sync::{Mutex, OnceLock};
    static CACHE: OnceLock<
        Mutex<std::collections::HashMap<PathBuf, (u64, std::time::SystemTime)>>,
    > = OnceLock::new();
    let Ok(meta) = fs::symlink_metadata(path) else {
        return false;
    };
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 25 * 1024 * 1024 {
        return false;
    }
    let Ok(modified) = meta.modified() else {
        return false;
    };
    let fingerprint = (meta.len(), modified);
    let cache = CACHE.get_or_init(|| Mutex::new(std::collections::HashMap::new()));
    if cache
        .lock()
        .ok()
        .and_then(|values| values.get(path).cloned())
        == Some(fingerprint)
    {
        return true;
    }
    let verified = bytes(path)
        .map(|bytes| hash(&bytes) == name[..64])
        .unwrap_or(false);
    if verified {
        if let Ok(mut values) = cache.lock() {
            if values.len() >= 256 {
                values.clear();
            }
            values.insert(path.to_path_buf(), fingerprint);
        }
    }
    verified
}

#[tauri::command]
pub async fn device_sync_asset(
    app: AppHandle,
    action: String,
    payload: Value,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let directory = directory(&app)?;
        let root = crate::setting::resolve_app_dir(&app)?;
        operate(&directory, &root, &action, payload)
    })
    .await
    .map_err(|error| format!("DEVICE_SYNC_WORKER: {error}"))?
}
pub(super) fn operate(
    directory: &Path,
    root: &Path,
    action: &str,
    payload: Value,
) -> Result<Value, String> {
    if action == "import" {
        let source = payload["path"]
            .as_str()
            .ok_or("DEVICE_SYNC_ASSET_PATH: 文件路径无效")?;
        let source = if let Some(relative) = source.strip_prefix("~/.editor/") {
            root.join(relative)
        } else {
            PathBuf::from(source)
        };
        let canonical = source
            .canonicalize()
            .map_err(|_| "DEVICE_SYNC_ASSET_MISSING: 图片尚未就绪")?;
        if !canonical.starts_with(root.canonicalize().map_err(|error| error.to_string())?) {
            return Err("DEVICE_SYNC_ASSET_PATH: 仅同步应用内的图片与附件".into());
        }
        let content = bytes(&source)?;
        let extension = if content.starts_with(&[137, 80, 78, 71, 13, 10, 26, 10]) {
            "png"
        } else if content.starts_with(&[255, 216]) {
            "jpg"
        } else if content.starts_with(b"GIF") {
            "gif"
        } else if content.starts_with(b"RIFF") && content.get(8..12) == Some(b"WEBP") {
            "webp"
        } else {
            "bin"
        };
        let name = format!("{}.{}", hash(&content), extension);
        let target = path(&directory, &name)?;
        if !valid(&target, &name) {
            let temporary = target.with_extension("import.part");
            fs::write(&temporary, &content).map_err(|error| error.to_string())?;
            fs::rename(temporary, target).map_err(|error| error.to_string())?;
        }
        return Ok(json!(format!("~/.editor/resources/device-sync/{name}")));
    }
    let name = payload["name"]
        .as_str()
        .ok_or("DEVICE_SYNC_ASSET_PATH: 资源名称无效")?;
    let target = path(&directory, name)?;
    match action {
        "has" => Ok(json!({"exists":valid(&target,name)})),
        "read" => {
            let offset = payload["offset"]
                .as_u64()
                .ok_or("DEVICE_SYNC_ASSET_OFFSET: 位置无效")? as usize;
            if offset % (256 * 1024) != 0 {
                return Err("DEVICE_SYNC_ASSET_OFFSET: 位置无效".into());
            }
            if !valid(&target, name) {
                return Err("DEVICE_SYNC_ASSET_HASH: 图片校验失败".into());
            }
            let size = fs::symlink_metadata(&target)
                .map_err(|error| error.to_string())?
                .len() as usize;
            if offset > size {
                return Err("DEVICE_SYNC_ASSET_HASH: 图片校验失败".into());
            }
            use std::io::{Read, Seek, SeekFrom};
            let mut file = fs::File::open(&target).map_err(|error| error.to_string())?;
            file.seek(SeekFrom::Start(offset as u64))
                .map_err(|error| error.to_string())?;
            let mut content = vec![0; (size - offset).min(256 * 1024)];
            file.read_exact(&mut content)
                .map_err(|error| error.to_string())?;
            Ok(json!({"size":size,"bytes":STANDARD.encode(&content),"sha256":hash(&content)}))
        }
        "write" => {
            let offset = payload["offset"]
                .as_u64()
                .ok_or("DEVICE_SYNC_ASSET_OFFSET: 位置无效")?;
            let size = payload["size"]
                .as_u64()
                .ok_or("DEVICE_SYNC_ASSET_SIZE: 大小无效")?;
            let content = STANDARD
                .decode(
                    payload["bytes"]
                        .as_str()
                        .ok_or("DEVICE_SYNC_ASSET_CHUNK: 分块无效")?,
                )
                .map_err(|_| "DEVICE_SYNC_ASSET_CHUNK: 分块无效")?;
            if size > 25 * 1024 * 1024
                || offset % (256 * 1024) != 0
                || content.len() > 256 * 1024
                || offset + content.len() as u64 > size
                || (offset + (content.len() as u64) < size && content.len() != 256 * 1024)
            {
                return Err("DEVICE_SYNC_ASSET_CHUNK: 分块无效".into());
            }
            if payload["sha256"].as_str() != Some(hash(&content).as_str()) {
                return Err("DEVICE_SYNC_ASSET_CHUNK_HASH: 分块校验失败".into());
            }
            let temporary = target.with_extension("download.part");
            if offset == 0 {
                fs::write(&temporary, &content).map_err(|error| error.to_string())?;
            } else {
                use std::io::Write;
                if fs::symlink_metadata(&temporary)
                    .map_err(|error| error.to_string())?
                    .len()
                    != offset
                {
                    return Err("DEVICE_SYNC_ASSET_RETRY: 分块需要重传".into());
                }
                fs::OpenOptions::new()
                    .append(true)
                    .open(&temporary)
                    .and_then(|mut file| file.write_all(&content))
                    .map_err(|error| error.to_string())?;
            }
            if offset + content.len() as u64 == size {
                if hash(&bytes(&temporary)?) != name[..64] {
                    return Err("DEVICE_SYNC_ASSET_HASH: 图片校验失败".into());
                }
                fs::File::open(&temporary)
                    .and_then(|file| file.sync_all())
                    .map_err(|error| error.to_string())?;
                fs::rename(&temporary, target).map_err(|error| error.to_string())?;
            }
            Ok(json!({"ok":true}))
        }
        _ => Err("DEVICE_SYNC_ASSET: 未知资源操作".into()),
    }
}
