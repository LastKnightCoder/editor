use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, Weak};
use std::time::Duration;

use base64::Engine;
use rusqlite::{params, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, WebviewWindow};

use crate::collaboration::{
    ensure_identity, normalize_server_url, session_store, CACHE_WRITE_LOCK,
};
use crate::setting::resolve_app_dir;

const ASSET: &str = "tau-collab-asset:";
const LOCAL: &str = "tau-collab-local:";
const MAX_BYTES: u64 = 25 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetContext {
    pub server_url: String,
    pub document_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AssetAction {
    Prepare,
    Resolve,
    Localize,
    Flush,
    Pending,
    Release,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRequest {
    #[serde(flatten)]
    context: AssetContext,
    action: AssetAction,
    #[serde(default)]
    references: Vec<String>,
    #[serde(default)]
    required: bool,
}

struct Resource {
    id: String,
    name: String,
    mime: String,
    path: String,
    uploaded: i64,
}

fn with_store<T>(
    app: &AppHandle,
    run: impl FnOnce(&rusqlite::Connection) -> Result<T, String>,
) -> Result<T, String> {
    let _guard = CACHE_WRITE_LOCK
        .lock()
        .map_err(|_| "协作资源缓存锁不可用")?;
    run(&session_store(app)?)
}

fn row(app: &AppHandle, document: &str, id: &str) -> Result<Option<Resource>, String> {
    with_store(app, |db| {
        db.query_row(
            "SELECT id,name,mime,path,uploaded FROM resources WHERE id=?1 AND document_id=?2",
            params![id, document],
            |r| {
                Ok(Resource {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    mime: r.get(2)?,
                    path: r.get(3)?,
                    uploaded: r.get(4)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())
    })
}

fn record(app: &AppHandle, document: &str, resource: &Resource) -> Result<(), String> {
    with_store(app, |db| record_in(db, document, resource))
}

fn record_in(db: &rusqlite::Connection, document: &str, resource: &Resource) -> Result<(), String> {
    let changed = db.execute("INSERT INTO resources(id,document_id,name,mime,path,uploaded) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET name=excluded.name,mime=excluded.mime,path=excluded.path,uploaded=excluded.uploaded WHERE resources.document_id=excluded.document_id", params![resource.id, document, resource.name, resource.mime, resource.path, resource.uploaded]).map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("协作资源不属于当前文档".into());
    }
    Ok(())
}

fn owned_key(document: &str, reference: &str) -> String {
    format!("owner-image:{document}:{reference}")
}

fn owned(app: &AppHandle, document: &str, reference: &str) -> Result<Option<String>, String> {
    let saved: Option<String> = with_store(app, |db| {
        db.query_row(
            "SELECT value FROM settings WHERE key=?1",
            [owned_key(document, reference)],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())
    })?;
    Ok(saved.filter(|reference| persistent_reference(app, reference)))
}

fn persistent_reference(app: &AppHandle, reference: &str) -> bool {
    if public_url(reference) {
        return true;
    }
    let Ok(path) = local_path(app, reference) else {
        return false;
    };
    let Ok(root) =
        resolve_app_dir(app).and_then(|root| root.canonicalize().map_err(|e| e.to_string()))
    else {
        return false;
    };
    !path.starts_with(root.join("remote-resources"))
        && !path.starts_with(root.join("collaboration"))
}

fn save_owned(app: &AppHandle, document: &str, reference: &str, saved: &str) -> Result<(), String> {
    with_store(app, |db| {
        db.execute(
            "INSERT OR REPLACE INTO settings(key,value) VALUES (?1,?2)",
            params![owned_key(document, reference), saved],
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
    })
}

fn cache_directory(app: &AppHandle, document: &str) -> Result<PathBuf, String> {
    Ok(resolve_app_dir(app)?
        .join("collaboration/assets")
        .join(format!("{:x}", Sha256::digest(document.as_bytes()))))
}

fn image_extension(mime: &str) -> &str {
    match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/avif" => "avif",
        "image/svg+xml" => "svg",
        "image/bmp" => "bmp",
        "audio/mpeg" => "mp3",
        "audio/wav" => "wav",
        "audio/ogg" => "ogg",
        "audio/mp4" => "m4a",
        "application/pdf" => "pdf",
        "text/html" => "html",
        _ => "bin",
    }
}

fn image_mime(bytes: &[u8]) -> Option<&'static str> {
    use image::ImageFormat;
    match image::guess_format(bytes).ok()? {
        ImageFormat::Png => Some("image/png"),
        ImageFormat::Jpeg => Some("image/jpeg"),
        ImageFormat::Gif => Some("image/gif"),
        ImageFormat::WebP => Some("image/webp"),
        ImageFormat::Avif => Some("image/avif"),
        ImageFormat::Bmp => Some("image/bmp"),
        _ => None,
    }
}

fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "m4a" => "audio/mp4",
        "pdf" => "application/pdf",
        "html" | "htm" => "text/html",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        _ => "application/octet-stream",
    }
}

fn is_video(path: &Path, mime: &str) -> bool {
    mime.starts_with("video/")
        || matches!(
            path.extension()
                .and_then(|v| v.to_str())
                .unwrap_or("")
                .to_ascii_lowercase()
                .as_str(),
            "mp4" | "webm" | "mov" | "mkv" | "m4v" | "avi" | "ogv"
        )
}

fn public_url(reference: &str) -> bool {
    url::Url::parse(reference).is_ok_and(|url| {
        matches!(url.scheme(), "http" | "https")
            && url.username().is_empty()
            && url.password().is_none()
    })
}

fn local_path(app: &AppHandle, reference: &str) -> Result<PathBuf, String> {
    let root = resolve_app_dir(app)?;
    local_path_in(&root, reference)
}

fn local_path_in(root: &Path, reference: &str) -> Result<PathBuf, String> {
    let reference = reference.replace('\\', "/");
    let path = if let Some(relative) = reference
        .strip_prefix("~/.editor/")
        .or_else(|| reference.strip_prefix("~.editor/"))
    {
        root.join(relative)
    } else if reference.starts_with("file:") {
        url::Url::parse(&reference)
            .map_err(|e| e.to_string())?
            .to_file_path()
            .map_err(|_| "本地资源地址无效")?
    } else {
        PathBuf::from(reference)
    };
    let path = path.canonicalize().map_err(|e| e.to_string())?;
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let relative = path
        .strip_prefix(&root)
        .map_err(|_| "资源路径超出应用目录")?;
    let segments: Vec<_> = relative
        .components()
        .map(|part| part.as_os_str().to_string_lossy().to_ascii_lowercase())
        .collect();
    if segments.len() < 2
        || matches!(
            segments[0].as_str(),
            "backup"
                | "databases"
                | "plugins"
                | "plugin-updates"
                | "logs"
                | "sessions"
                | "pi"
                | "memory"
                | "index"
        )
        || (segments[0] == "collaboration" && segments[1] != "assets")
    {
        return Err("应用私有文件不能作为协作附件读取".into());
    }
    if !path.is_file() {
        return Err("资源不是文件".into());
    }
    Ok(path)
}

fn lock_for(key: String) -> Result<Arc<tokio::sync::Mutex<()>>, String> {
    static LOCKS: OnceLock<Mutex<HashMap<String, Weak<tokio::sync::Mutex<()>>>>> = OnceLock::new();
    let mut locks = LOCKS
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| "资源任务锁不可用")?;
    locks.retain(|_, lock| lock.strong_count() > 0);
    if let Some(lock) = locks.get(&key).and_then(Weak::upgrade) {
        return Ok(lock);
    }
    let lock = Arc::new(tokio::sync::Mutex::new(()));
    locks.insert(key, Arc::downgrade(&lock));
    Ok(lock)
}

fn session_role(app: &AppHandle, context: &AssetContext) -> Result<Option<String>, String> {
    with_store(app, |db| {
        let metadata: Option<String> = db
            .query_row(
                "SELECT metadata FROM sessions WHERE id=?1",
                [&context.document_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some(metadata) = metadata else {
            return Ok(None);
        };
        let metadata: Value = serde_json::from_str(&metadata).map_err(|e| e.to_string())?;
        if metadata["serverUrl"].as_str() != Some(context.server_url.as_str()) {
            return Err("协作资源的服务器已变化".into());
        }
        Ok(metadata["role"].as_str().map(str::to_string))
    })
}

pub(crate) fn validate_upload(
    app: &AppHandle,
    context: &AssetContext,
    name: &str,
    mime: &str,
) -> Result<(), String> {
    let role = session_role(app, context)?;
    if role.as_deref() != Some("editor")
        && !(role.as_deref() == Some("owner") && is_video(Path::new(name), mime))
    {
        return Err("作者图片必须使用自己的存储配置".into());
    }
    Ok(())
}

pub(crate) fn enqueue_file(
    app: &AppHandle,
    context: &AssetContext,
    path: &Path,
    name: &str,
    mime: &str,
    original: Option<&str>,
) -> Result<String, String> {
    let mime = if mime.is_empty() || mime == "application/octet-stream" {
        mime_for(Path::new(name))
    } else {
        mime
    };
    let video = is_video(Path::new(name), mime);
    if !video && fs::metadata(path).map_err(|e| e.to_string())?.len() > MAX_BYTES {
        return Err("协作资源超过 25 MB".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let directory = cache_directory(app, &context.document_id)?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let target = if original.is_some() {
        path.to_path_buf()
    } else {
        let suffix = Path::new(name)
            .extension()
            .and_then(|v| v.to_str())
            .filter(|_| video)
            .unwrap_or(image_extension(mime));
        let target = directory.join(format!("{id}.{suffix}"));
        fs::copy(path, &target).map_err(|e| e.to_string())?;
        target
    };
    let reference = format!("{}{id}", if video { LOCAL } else { ASSET });
    record(
        app,
        &context.document_id,
        &Resource {
            id,
            name: Path::new(name)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            mime: mime.into(),
            path: target.to_string_lossy().into_owned(),
            uploaded: if video { 2 } else { 0 },
        },
    )?;
    if !video && mime.starts_with("image/") {
        if let Some(original) = original.filter(|reference| persistent_reference(app, reference)) {
            save_owned(app, &context.document_id, &reference, original)?;
        }
    }
    Ok(reference)
}

async fn prepare(
    app: &AppHandle,
    window: &WebviewWindow,
    context: &AssetContext,
    reference: &str,
    required: bool,
    owner: bool,
) -> Result<String, String> {
    if public_url(reference) || reference.starts_with(ASSET) || reference.starts_with(LOCAL) {
        return Ok(reference.into());
    }
    let path = if let Some(data) = reference.strip_prefix("data:") {
        let (header, data) = data.split_once(',').ok_or("内嵌图片编码无效")?;
        let mime = header.strip_suffix(";base64").ok_or("内嵌图片编码无效")?;
        if data.len() as u64 > MAX_BYTES * 4 / 3 + 8 {
            return Err("协作资源超过 25 MB".into());
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data)
            .map_err(|e| e.to_string())?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("协作资源超过 25 MB".into());
        }
        let file = crate::plugin_files::TemporaryFile::new(app)?;
        fs::write(&file.path, bytes).map_err(|e| e.to_string())?;
        if !owner {
            return enqueue_file(
                app,
                context,
                &file.path,
                &format!("embedded.{}", image_extension(mime)),
                mime,
                None,
            );
        }
        let saved = crate::resource_upload::upload_owned_resource(
            app,
            window,
            &file.path,
            &format!("embedded.{}", image_extension(mime)),
            mime,
        )
        .await?;
        if public_url(&saved) {
            return Ok(saved);
        }
        return enqueue_file(
            app,
            context,
            &local_path(app, &saved)?,
            &saved,
            mime,
            Some(&saved),
        );
    } else {
        local_path(app, reference)
    };
    match path {
        Ok(path) => enqueue_file(
            app,
            context,
            &path,
            &path.to_string_lossy(),
            mime_for(&path),
            if owner { Some(reference) } else { None },
        ),
        Err(error) if required => Err(error),
        Err(_) => {
            let id = uuid::Uuid::new_v4().to_string();
            record(
                app,
                &context.document_id,
                &Resource {
                    id: id.clone(),
                    name: String::new(),
                    mime: String::new(),
                    path: reference.into(),
                    uploaded: 2,
                },
            )?;
            Ok(format!("{LOCAL}{id}"))
        }
    }
}

fn asset_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(120))
            .build()
            .expect("collaboration asset client")
    })
}

async fn bearer(app: &AppHandle, context: &AssetContext) -> Result<String, String> {
    let identity = ensure_identity(app, &context.server_url, None).await?;
    Ok(format!("{}:{}", identity.id, identity.secret))
}

fn asset_endpoint(context: &AssetContext, id: Option<&str>) -> Result<url::Url, String> {
    let mut url = url::Url::parse(&context.server_url).map_err(|e| e.to_string())?;
    {
        let mut path = url.path_segments_mut().map_err(|_| "协作地址无效")?;
        path.clear()
            .extend(["v1", "documents", context.document_id.as_str(), "assets"]);
        if let Some(id) = id {
            path.push(id);
        }
    }
    Ok(url)
}

async fn flush(app: &AppHandle, context: &AssetContext) -> Result<(), String> {
    let lock = lock_for(format!(
        "flush:{}:{}",
        context.server_url, context.document_id
    ))?;
    let _guard = lock.lock().await;
    let ids: Vec<String> = with_store(app, |db| {
        let mut statement = db
            .prepare("SELECT id FROM resources WHERE document_id=?1 AND uploaded=0")
            .map_err(|e| e.to_string())?;
        let ids = statement
            .query_map([&context.document_id], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())?;
        Ok(ids)
    })?;
    for id in ids {
        let Some(mut resource) = row(app, &context.document_id, &id)? else {
            continue;
        };
        let path = local_path(app, &resource.path)?;
        let _memory = crate::plugin_files::memory_permit().await?;
        upload_file(context, &bearer(app, context).await?, &path, &resource).await?;
        resource.uploaded = 1;
        record(app, &context.document_id, &resource)?;
    }
    Ok(())
}

async fn upload_file(
    context: &AssetContext,
    token: &str,
    path: &Path,
    resource: &Resource,
) -> Result<(), String> {
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > MAX_BYTES {
        return Err("协作资源超过 25 MB".into());
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(resource.name.clone())
        .mime_str(&resource.mime)
        .map_err(|e| e.to_string())?;
    let response = asset_client()
        .post(asset_endpoint(context, None)?)
        .bearer_auth(token)
        .header("X-Asset-Id", &resource.id)
        .multipart(reqwest::multipart::Form::new().part("file", part))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("协作图片上传失败（{}）", response.status()));
    }
    let result: Value = response.json().await.map_err(|e| e.to_string())?;
    if result["id"].as_str() != Some(resource.id.as_str()) {
        return Err("协作图片上传回执不匹配".into());
    }
    Ok(())
}

async fn resolve(
    app: &AppHandle,
    context: &AssetContext,
    reference: &str,
) -> Result<PathBuf, String> {
    let (id, local) = if let Some(id) = reference.strip_prefix(ASSET) {
        (id, false)
    } else if let Some(id) = reference.strip_prefix(LOCAL) {
        (id, true)
    } else {
        return local_path(app, reference);
    };
    uuid::Uuid::parse_str(id).map_err(|_| "协作资源编号无效")?;
    let lock = lock_for(format!("resolve:{}:{reference}", context.document_id))?;
    let _guard = lock.lock().await;
    if let Some(resource) = row(app, &context.document_id, id)? {
        if let Ok(path) = local_path(app, &resource.path) {
            return Ok(path);
        }
    }
    if local {
        return Err("资源仅在添加它的设备上可用".into());
    }
    let mut response = asset_client()
        .get(asset_endpoint(context, Some(id))?)
        .bearer_auth(bearer(app, context).await?)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("协作图片下载失败（{}）", response.status()));
    }
    if response
        .content_length()
        .is_some_and(|size| size > MAX_BYTES)
    {
        return Err("协作资源超过 25 MB".into());
    }
    let mime = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .split(';')
        .next()
        .unwrap_or_default()
        .to_string();
    let _memory = crate::plugin_files::memory_permit().await?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if bytes.len() as u64 + chunk.len() as u64 > MAX_BYTES {
            return Err("协作资源超过 25 MB".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let mime = image_mime(&bytes).unwrap_or(&mime).to_string();
    let directory = cache_directory(app, &context.document_id)?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let name = format!("{id}.{}", image_extension(&mime));
    let path = directory.join(&name);
    let temporary = directory.join(uuid::Uuid::new_v4().to_string());
    fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
    fs::rename(&temporary, &path).map_err(|e| e.to_string())?;
    record(
        app,
        &context.document_id,
        &Resource {
            id: id.into(),
            name,
            mime,
            path: path.to_string_lossy().into_owned(),
            uploaded: 1,
        },
    )?;
    Ok(path)
}

async fn localize(
    app: &AppHandle,
    window: &WebviewWindow,
    context: &AssetContext,
    reference: &str,
) -> Result<String, String> {
    if !reference.starts_with(ASSET) && !reference.starts_with(LOCAL) {
        return Ok(reference.into());
    }
    if let Some(saved) = owned(app, &context.document_id, reference)? {
        return Ok(saved);
    }
    let lock = lock_for(format!("owned:{}:{reference}", context.document_id))?;
    let _guard = lock.lock().await;
    if let Some(saved) = owned(app, &context.document_id, reference)? {
        return Ok(saved);
    }
    let path = match resolve(app, context, reference).await {
        Ok(path) => path,
        Err(_) if reference.starts_with(LOCAL) => return Ok(reference.into()),
        Err(error) => return Err(error),
    };
    let id = reference
        .split_once(':')
        .map(|(_, id)| id)
        .unwrap_or_default();
    let mut resource = row(app, &context.document_id, id)?.ok_or("协作资源记录缺失")?;
    if !resource.mime.starts_with("image/") {
        let mut header = Vec::new();
        fs::File::open(&path)
            .map_err(|e| e.to_string())?
            .take(64)
            .read_to_end(&mut header)
            .map_err(|e| e.to_string())?;
        if let Some(mime) = image_mime(&header) {
            resource.mime = mime.into();
            resource.name = format!("{id}.{}", image_extension(mime));
            record(app, &context.document_id, &resource)?;
        }
    }
    let saved = if resource.mime.starts_with("image/")
        && session_role(app, context)?.as_deref() == Some("owner")
    {
        crate::resource_upload::upload_owned_resource(
            app,
            window,
            &path,
            &resource.name,
            &resource.mime,
        )
        .await?
    } else if !path.starts_with(cache_directory(app, &context.document_id)?) {
        return Ok(path.to_string_lossy().into_owned());
    } else {
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        let name = format!(
            "{:x}.{}",
            Sha256::digest(&bytes),
            path.extension().and_then(|v| v.to_str()).unwrap_or("bin")
        );
        let directory = resolve_app_dir(app)?.join("resources/collaboration");
        fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        fs::write(directory.join(&name), bytes).map_err(|e| e.to_string())?;
        format!("~/.editor/resources/collaboration/{name}")
    };
    if !persistent_reference(app, &saved) {
        return Err("图片尚未保存到持久存储".into());
    }
    save_owned(app, &context.document_id, reference, &saved)?;
    Ok(saved)
}

#[tauri::command]
pub async fn collab_resource(
    app: AppHandle,
    window: WebviewWindow,
    payload: AssetRequest,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    let mut context = payload.context;
    context.server_url = normalize_server_url(&context.server_url)?;
    if context.document_id.is_empty()
        || context.document_id.len() > 256
        || context.document_id.chars().any(char::is_control)
        || payload.references.len() > 100_000
    {
        return Err("协作资源请求无效".into());
    }
    if payload
        .references
        .iter()
        .any(|reference| reference.len() > 40 * 1024 * 1024)
    {
        return Err("协作资源超过容量".into());
    }
    session_role(&app, &context)?;
    match payload.action {
        AssetAction::Prepare => {
            let owner = session_role(&app, &context)?.as_deref() != Some("editor");
            let mut mapped = serde_json::Map::new();
            for reference in payload.references {
                let prepared =
                    prepare(&app, &window, &context, &reference, payload.required, owner).await?;
                mapped.insert(reference, json!(prepared));
            }
            Ok(Value::Object(mapped))
        }
        AssetAction::Resolve => Ok(json!(resolve(
            &app,
            &context,
            payload.references.first().ok_or("缺少资源地址")?
        )
        .await?
        .to_string_lossy())),
        AssetAction::Localize => {
            let mut mapped = serde_json::Map::new();
            for reference in payload.references {
                let saved = localize(&app, &window, &context, &reference).await?;
                mapped.insert(reference, json!(saved));
            }
            Ok(Value::Object(mapped))
        }
        AssetAction::Flush => {
            flush(&app, &context).await?;
            Ok(Value::Null)
        }
        AssetAction::Pending => with_store(&app, |db| {
            db.query_row(
                "SELECT EXISTS(SELECT 1 FROM resources WHERE document_id=?1 AND uploaded=0)",
                [&context.document_id],
                |r| r.get::<_, bool>(0),
            )
            .map(Value::Bool)
            .map_err(|e| e.to_string())
        }),
        AssetAction::Release => {
            with_store(&app, |db| {
                db.execute(
                    "DELETE FROM resources WHERE document_id=?1",
                    [&context.document_id],
                )
                .map_err(|e| e.to_string())?;
                let prefix = format!("owner-image:{}:", context.document_id);
                db.execute(
                    "DELETE FROM settings WHERE substr(key,1,?1)=?2",
                    params![prefix.chars().count(), prefix],
                )
                .map_err(|e| e.to_string())?;
                Ok(())
            })?;
            let directory = cache_directory(&app, &context.document_id)?;
            if directory.exists() {
                fs::remove_dir_all(directory).map_err(|e| e.to_string())?;
            }
            Ok(Value::Null)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    #[test]
    fn generic_mime_images_are_detected_from_bytes() {
        let mut bmp = vec![0; 58];
        bmp[0] = b'B';
        bmp[1] = b'M';
        assert_eq!(image_mime(&bmp), Some("image/bmp"));
        assert_eq!(image_extension(image_mime(&bmp).unwrap()), "bmp");
        assert_eq!(image_mime(b"\x89PNG\r\n\x1a\n"), Some("image/png"));
        assert_eq!(image_mime(b"%PDF-1.0"), None);
    }

    #[test]
    fn local_resources_are_portable_and_cannot_escape_app_directory() {
        let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(root.join("resources")).unwrap();
        fs::write(root.join("resources/image.png"), b"image").unwrap();
        fs::write(root.join("setting.json"), b"private settings").unwrap();
        fs::create_dir_all(root.join("collaboration")).unwrap();
        fs::write(
            root.join("collaboration/identity.json"),
            b"private identity",
        )
        .unwrap();
        for reference in [
            "~/.editor/resources/image.png",
            "~.editor/resources/image.png",
            "~\\.editor\\resources\\image.png",
        ] {
            assert_eq!(
                local_path_in(&root, reference).unwrap(),
                root.join("resources/image.png").canonicalize().unwrap()
            );
        }
        assert!(local_path_in(&root, "~/.editor/../").is_err());
        assert!(local_path_in(&root, "~/.editor/setting.json").is_err());
        assert!(local_path_in(&root, "~/.editor/collaboration/identity.json").is_err());
        assert!(public_url("https://images.example/image.png?signature=abc"));
        assert!(!public_url("https://user:secret@images.example/image.png"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn asset_record_cannot_replace_another_documents_resource() {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        db.execute_batch(include_str!(
            "../../../../packages/db-schema/schema/collaboration.sql"
        ))
        .unwrap();
        let mut resource = Resource {
            id: uuid::Uuid::new_v4().to_string(),
            name: "image.webp".into(),
            mime: "image/webp".into(),
            path: "original".into(),
            uploaded: 0,
        };
        record_in(&db, "author", &resource).unwrap();
        resource.path = "foreign".into();
        assert!(record_in(&db, "member", &resource).is_err());
        let path: String = db
            .query_row("SELECT path FROM resources", [], |r| r.get(0))
            .unwrap();
        assert_eq!(path, "original");
        resource.uploaded = 1;
        record_in(&db, "author", &resource).unwrap();
    }

    #[tokio::test]
    async fn queued_image_upload_uses_file_bytes_mime_and_matching_receipt() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let expected_id = id.clone();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = Vec::new();
            loop {
                let mut buffer = [0; 4096];
                let length = socket.read(&mut buffer).unwrap();
                assert_ne!(length, 0);
                request.extend_from_slice(&buffer[..length]);
                if let Some(end) = request.windows(4).position(|v| v == b"\r\n\r\n") {
                    let header = String::from_utf8_lossy(&request[..end]).to_ascii_lowercase();
                    let size: usize = header
                        .lines()
                        .find_map(|line| line.strip_prefix("content-length: "))
                        .unwrap()
                        .trim()
                        .parse()
                        .unwrap();
                    if request.len() < end + 4 + size {
                        continue;
                    }
                    assert!(header.contains("authorization: bearer device:test"));
                    assert!(header.contains(&format!("x-asset-id: {expected_id}")));
                    let body = String::from_utf8_lossy(&request[end + 4..]);
                    assert!(body.contains("image/webp"));
                    assert!(body.contains("OWNER_COMPRESSED_BYTES"));
                    break;
                }
            }
            let body = json!({ "id": expected_id }).to_string();
            write!(socket, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
        });
        let path = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::write(&path, b"OWNER_COMPRESSED_BYTES").unwrap();
        let resource = Resource {
            id,
            name: "compressed.webp".into(),
            mime: "image/webp".into(),
            path: path.to_string_lossy().into_owned(),
            uploaded: 0,
        };
        upload_file(
            &AssetContext {
                server_url: format!("http://{address}"),
                document_id: "document".into(),
            },
            "device:test",
            &path,
            &resource,
        )
        .await
        .unwrap();
        server.join().unwrap();
        fs::remove_file(path).unwrap();
    }
}
