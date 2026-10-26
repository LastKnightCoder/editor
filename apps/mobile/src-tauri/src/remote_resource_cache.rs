use std::collections::HashMap;
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use reqwest::header::CONTENT_TYPE;
use reqwest::{redirect::Policy, Client};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tokio::sync::{Mutex, Notify};
use url::Url;

use crate::setting::resolve_app_dir;

const REMOTE_RESOURCE_CACHE_DIR: &str = "remote-resources";
const REMOTE_RESOURCE_INDEX_FILE: &str = "remote_resource_index.json";
const MAX_CACHE_SIZE_BYTES: u64 = 524_288_000;

#[derive(Debug, Clone)]
struct AppError {
    code: String,
    message: String,
}

impl AppError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RemoteResourceMeta {
    url: String,
    local_path: String,
    size_bytes: u64,
    last_accessed_at: u64,
    created_at: u64,
    content_type: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct RemoteResourceIndexFile {
    entries: HashMap<String, RemoteResourceMeta>,
}

struct InFlightEntry {
    notify: Notify,
    result: Mutex<Option<Result<String, String>>>,
}

static INFLIGHT_DOWNLOADS: OnceLock<Mutex<HashMap<String, Arc<InFlightEntry>>>> = OnceLock::new();
static DOWNLOAD_CLIENT: OnceLock<Client> = OnceLock::new();

fn inflight_downloads() -> &'static Mutex<HashMap<String, Arc<InFlightEntry>>> {
    INFLIGHT_DOWNLOADS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn download_client() -> &'static Client {
    DOWNLOAD_CLIENT.get_or_init(|| {
        Client::builder()
            .redirect(Policy::limited(10))
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .build()
            .expect("failed to build remote resource http client")
    })
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or(0)
}

fn format_error(error: AppError) -> String {
    format!("{}:{}", error.code, error.message)
}

fn is_http_url(url: &str) -> bool {
    let value = url.trim();
    value.starts_with("http://") || value.starts_with("https://")
}

fn normalize_extension(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_start_matches('.');
    if trimmed.is_empty() {
        return None;
    }
    let mut normalized = String::new();
    for ch in trimmed.chars() {
        if ch.is_ascii_alphanumeric() {
            normalized.push(ch.to_ascii_lowercase());
        }
    }
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn extension_from_file_name(file_name: Option<&str>) -> Option<String> {
    file_name
        .and_then(|value| Path::new(value).extension().and_then(|ext| ext.to_str()))
        .and_then(normalize_extension)
}

fn extension_from_url(url: &str) -> Option<String> {
    let parsed = Url::parse(url).ok()?;
    let segment = parsed.path_segments()?.next_back()?;
    Path::new(segment)
        .extension()
        .and_then(|ext| ext.to_str())
        .and_then(normalize_extension)
}

fn extension_from_content_type(content_type: Option<&str>) -> Option<String> {
    let normalized = content_type
        .map(|value| {
            value
                .split(';')
                .next()
                .map(|part| part.trim().to_ascii_lowercase())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    if normalized.is_empty() {
        return None;
    }
    let extension = match normalized.as_str() {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        "image/svg+xml" => "svg",
        "audio/mpeg" => "mp3",
        "audio/mp4" => "m4a",
        "audio/wav" => "wav",
        "audio/ogg" => "ogg",
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        "video/quicktime" => "mov",
        _ => return None,
    };
    Some(extension.to_string())
}

fn choose_extension(url: &str, file_name: Option<&str>, content_type: Option<&str>) -> String {
    extension_from_file_name(file_name)
        .or_else(|| extension_from_url(url))
        .or_else(|| extension_from_content_type(content_type))
        .unwrap_or_else(|| "bin".to_string())
}

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let bytes = hasher.finalize();
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(&mut output, "{byte:02x}");
    }
    output
}

fn resolve_cache_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let app_dir = resolve_app_dir(app).map_err(|err| {
        AppError::new(
            "REMOTE_RESOURCE_CACHE_FAILED",
            format!("解析应用目录失败: {err}"),
        )
    })?;
    Ok(app_dir.join(REMOTE_RESOURCE_CACHE_DIR))
}

fn resolve_index_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let app_dir = resolve_app_dir(app).map_err(|err| {
        AppError::new(
            "REMOTE_RESOURCE_CACHE_FAILED",
            format!("解析应用目录失败: {err}"),
        )
    })?;
    Ok(app_dir.join(REMOTE_RESOURCE_INDEX_FILE))
}

fn ensure_parent_dir(path: &Path) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            AppError::new(
                "REMOTE_RESOURCE_CACHE_FAILED",
                format!("创建缓存目录失败: {err}"),
            )
        })?;
    }
    Ok(())
}

fn load_index(path: &Path) -> Result<RemoteResourceIndexFile, AppError> {
    if !path.exists() {
        return Ok(RemoteResourceIndexFile::default());
    }
    let raw = fs::read_to_string(path).map_err(|err| {
        AppError::new(
            "REMOTE_RESOURCE_CACHE_FAILED",
            format!("读取缓存索引失败: {err}"),
        )
    })?;
    if raw.trim().is_empty() {
        return Ok(RemoteResourceIndexFile::default());
    }
    serde_json::from_str::<RemoteResourceIndexFile>(&raw).map_err(|err| {
        AppError::new(
            "REMOTE_RESOURCE_CACHE_FAILED",
            format!("解析缓存索引失败: {err}"),
        )
    })
}

fn persist_index(path: &Path, index: &RemoteResourceIndexFile) -> Result<(), AppError> {
    ensure_parent_dir(path)?;
    let serialized = serde_json::to_string_pretty(index).map_err(|err| {
        AppError::new(
            "REMOTE_RESOURCE_CACHE_FAILED",
            format!("序列化缓存索引失败: {err}"),
        )
    })?;
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, serialized).map_err(|err| {
        AppError::new(
            "REMOTE_RESOURCE_CACHE_FAILED",
            format!("写入缓存索引失败: {err}"),
        )
    })?;
    fs::rename(&tmp_path, path).map_err(|err| {
        let _ = fs::remove_file(&tmp_path);
        AppError::new(
            "REMOTE_RESOURCE_CACHE_FAILED",
            format!("提交缓存索引失败: {err}"),
        )
    })?;
    Ok(())
}

fn file_exists(path: &str) -> bool {
    let target = Path::new(path);
    target.exists() && target.is_file()
}

fn prune_cache_with_limit(
    index: &mut RemoteResourceIndexFile,
    keep_url: Option<&str>,
    max_cache_size_bytes: u64,
) {
    let stale_urls: Vec<String> = index
        .entries
        .iter()
        .filter_map(|(url, meta)| (!file_exists(&meta.local_path)).then_some(url.clone()))
        .collect();
    for url in stale_urls {
        index.entries.remove(&url);
    }

    let mut total_size = index
        .entries
        .values()
        .map(|meta| meta.size_bytes)
        .fold(0_u64, |acc, size| acc.saturating_add(size));
    if total_size <= max_cache_size_bytes {
        return;
    }

    let mut candidates: Vec<(String, u64)> = index
        .entries
        .iter()
        .map(|(url, meta)| (url.clone(), meta.last_accessed_at))
        .collect();
    candidates.sort_by(|a, b| a.1.cmp(&b.1));

    for (url, _) in candidates {
        if total_size <= max_cache_size_bytes {
            break;
        }
        if keep_url.is_some_and(|value| value == url.as_str()) {
            continue;
        }
        let Some(meta) = index.entries.get(&url).cloned() else {
            continue;
        };
        if let Err(err) = fs::remove_file(&meta.local_path) {
            crate::logger::warn(format!(
                "[remote-resource-cache] 删除缓存文件失败 path={} err={}",
                meta.local_path, err
            ));
            continue;
        }
        total_size = total_size.saturating_sub(meta.size_bytes);
        index.entries.remove(&url);
    }
}

fn prune_cache(index: &mut RemoteResourceIndexFile, keep_url: Option<&str>) {
    prune_cache_with_limit(index, keep_url, MAX_CACHE_SIZE_BYTES);
}

async fn download_remote_resource(url: &str) -> Result<(Vec<u8>, Option<String>), AppError> {
    let response = download_client().get(url).send().await.map_err(|err| {
        AppError::new(
            "REMOTE_RESOURCE_DOWNLOAD_FAILED",
            format!("下载远程资源失败: {err}"),
        )
    })?;

    let status = response.status();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());

    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::new(
            "REMOTE_RESOURCE_DOWNLOAD_FAILED",
            format!("远程资源响应异常 status={} body={}", status.as_u16(), body),
        ));
    }

    let bytes = response.bytes().await.map_err(|err| {
        AppError::new(
            "REMOTE_RESOURCE_DOWNLOAD_FAILED",
            format!("读取远程资源响应失败: {err}"),
        )
    })?;
    Ok((bytes.to_vec(), content_type))
}

fn write_downloaded_file(path: &Path, content: &[u8]) -> Result<(), AppError> {
    ensure_parent_dir(path)?;
    fs::write(path, content).map_err(|err| {
        AppError::new(
            "REMOTE_RESOURCE_CACHE_FAILED",
            format!("写入缓存资源文件失败: {err}"),
        )
    })?;
    Ok(())
}

async fn resolve_remote_resource_to_local(
    app: &AppHandle,
    url: &str,
    file_name: Option<&str>,
) -> Result<String, AppError> {
    if !is_http_url(url) {
        return Err(AppError::new(
            "REMOTE_RESOURCE_UNSUPPORTED_SCHEME",
            "仅支持 http:// 或 https:// 资源",
        ));
    }

    let cache_dir = resolve_cache_dir(app)?;
    fs::create_dir_all(&cache_dir).map_err(|err| {
        AppError::new(
            "REMOTE_RESOURCE_CACHE_FAILED",
            format!("创建缓存目录失败: {err}"),
        )
    })?;
    let index_path = resolve_index_path(app)?;
    let mut index = load_index(&index_path)?;

    let mut hit_local_path: Option<String> = None;
    if let Some(cached) = index.entries.get_mut(url) {
        if file_exists(&cached.local_path) {
            cached.last_accessed_at = now_millis();
            hit_local_path = Some(cached.local_path.clone());
        } else {
            index.entries.remove(url);
        }
    }
    if let Some(local_path) = hit_local_path {
        persist_index(&index_path, &index)?;
        return Ok(local_path);
    }

    let (bytes, content_type) = download_remote_resource(url).await?;
    let extension = choose_extension(url, file_name, content_type.as_deref());
    let cache_key = sha256_hex(url);
    let target_path = cache_dir.join(format!("{cache_key}.{extension}"));
    let tmp_path = cache_dir.join(format!("{cache_key}.tmp-{}", now_millis()));

    write_downloaded_file(&tmp_path, &bytes)?;
    if target_path.exists() {
        fs::remove_file(&target_path).map_err(|err| {
            let _ = fs::remove_file(&tmp_path);
            AppError::new(
                "REMOTE_RESOURCE_CACHE_FAILED",
                format!("删除旧缓存文件失败: {err}"),
            )
        })?;
    }
    fs::rename(&tmp_path, &target_path).map_err(|err| {
        let _ = fs::remove_file(&tmp_path);
        AppError::new(
            "REMOTE_RESOURCE_CACHE_FAILED",
            format!("提交缓存文件失败: {err}"),
        )
    })?;

    let now = now_millis();
    let local_path = target_path.to_string_lossy().to_string();
    index.entries.insert(
        url.to_string(),
        RemoteResourceMeta {
            url: url.to_string(),
            local_path: local_path.clone(),
            size_bytes: bytes.len() as u64,
            last_accessed_at: now,
            created_at: now,
            content_type,
        },
    );
    prune_cache(&mut index, Some(url));
    persist_index(&index_path, &index)?;

    Ok(local_path)
}

#[tauri::command]
pub async fn remote_resource_to_local(
    app: AppHandle,
    url: String,
    file_name: Option<String>,
) -> Result<String, String> {
    let normalized_url = url.trim().to_string();
    if normalized_url.is_empty() {
        return Err("REMOTE_RESOURCE_EMPTY_URL:远程资源 URL 不能为空".to_string());
    }

    let (entry, is_leader) = {
        let mut inflight = inflight_downloads().lock().await;
        if let Some(existing) = inflight.get(&normalized_url) {
            (existing.clone(), false)
        } else {
            let created = Arc::new(InFlightEntry {
                notify: Notify::new(),
                result: Mutex::new(None),
            });
            inflight.insert(normalized_url.clone(), created.clone());
            (created, true)
        }
    };

    if !is_leader {
        loop {
            if let Some(result) = entry.result.lock().await.clone() {
                return result;
            }
            entry.notify.notified().await;
        }
    }

    let started_at = Instant::now();
    let result = resolve_remote_resource_to_local(&app, &normalized_url, file_name.as_deref())
        .await
        .map_err(format_error);

    match &result {
        Ok(local_path) => {
            crate::logger::debug(format!(
                "[remote-resource-cache] success url={} local_path={} elapsed_ms={}",
                normalized_url,
                local_path,
                started_at.elapsed().as_millis()
            ));
        }
        Err(error) => {
            crate::logger::warn(format!(
                "[remote-resource-cache] failed url={} error={} elapsed_ms={}",
                normalized_url,
                error,
                started_at.elapsed().as_millis()
            ));
        }
    }

    {
        let mut shared_result = entry.result.lock().await;
        *shared_result = Some(result.clone());
    }
    entry.notify.notify_waiters();
    {
        let mut inflight = inflight_downloads().lock().await;
        inflight.remove(&normalized_url);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn create_temp_dir(suffix: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "tau-mobile-remote-resource-{}-{}",
            suffix,
            Uuid::new_v4()
        ));
        fs::create_dir_all(&path).expect("should create temp dir");
        path
    }

    #[test]
    fn should_validate_http_url() {
        assert!(is_http_url("http://example.com/a.png"));
        assert!(is_http_url("https://example.com/a.png"));
        assert!(!is_http_url("ftp://example.com/a.png"));
        assert!(!is_http_url("asset://example.com/a.png"));
    }

    #[test]
    fn should_choose_extension_by_priority() {
        assert_eq!(
            choose_extension(
                "https://example.com/assets/demo.png?size=2",
                Some("override.jpg"),
                Some("image/webp"),
            ),
            "jpg"
        );
        assert_eq!(
            choose_extension(
                "https://example.com/assets/demo.png?size=2",
                None,
                Some("image/webp"),
            ),
            "png"
        );
        assert_eq!(
            choose_extension("https://example.com/assets/demo", None, Some("image/webp")),
            "webp"
        );
        assert_eq!(
            choose_extension("https://example.com/assets/demo", None, None),
            "bin"
        );
    }

    #[test]
    fn should_persist_and_load_index() {
        let temp_dir = create_temp_dir("index-io");
        let index_path = temp_dir.join("remote_resource_index.json");
        let mut index = RemoteResourceIndexFile::default();
        index.entries.insert(
            "https://example.com/a.png".to_string(),
            RemoteResourceMeta {
                url: "https://example.com/a.png".to_string(),
                local_path: temp_dir.join("a.png").to_string_lossy().to_string(),
                size_bytes: 1024,
                last_accessed_at: 10,
                created_at: 9,
                content_type: Some("image/png".to_string()),
            },
        );

        persist_index(&index_path, &index).expect("should persist index");
        let loaded = load_index(&index_path).expect("should load index");

        assert_eq!(loaded.entries.len(), 1);
        assert_eq!(
            loaded
                .entries
                .get("https://example.com/a.png")
                .map(|item| item.size_bytes),
            Some(1024)
        );

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn should_prune_cache_by_lru() {
        let temp_dir = create_temp_dir("lru");
        let first = temp_dir.join("a.bin");
        let second = temp_dir.join("b.bin");
        let third = temp_dir.join("c.bin");

        fs::write(&first, vec![1_u8; 300]).expect("write first");
        fs::write(&second, vec![2_u8; 300]).expect("write second");
        fs::write(&third, vec![3_u8; 300]).expect("write third");

        let mut index = RemoteResourceIndexFile::default();
        index.entries.insert(
            "https://example.com/a".to_string(),
            RemoteResourceMeta {
                url: "https://example.com/a".to_string(),
                local_path: first.to_string_lossy().to_string(),
                size_bytes: 300,
                last_accessed_at: 1,
                created_at: 1,
                content_type: None,
            },
        );
        index.entries.insert(
            "https://example.com/b".to_string(),
            RemoteResourceMeta {
                url: "https://example.com/b".to_string(),
                local_path: second.to_string_lossy().to_string(),
                size_bytes: 300,
                last_accessed_at: 2,
                created_at: 2,
                content_type: None,
            },
        );
        index.entries.insert(
            "https://example.com/c".to_string(),
            RemoteResourceMeta {
                url: "https://example.com/c".to_string(),
                local_path: third.to_string_lossy().to_string(),
                size_bytes: 300,
                last_accessed_at: 3,
                created_at: 3,
                content_type: None,
            },
        );

        prune_cache_with_limit(&mut index, Some("https://example.com/c"), 500);

        assert_eq!(index.entries.len(), 1);
        assert!(index.entries.contains_key("https://example.com/c"));
        assert!(!Path::new(&first).exists());
        assert!(!Path::new(&second).exists());
        assert!(Path::new(&third).exists());

        let _ = fs::remove_dir_all(temp_dir);
    }
}
