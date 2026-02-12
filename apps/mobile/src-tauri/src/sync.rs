use std::collections::{HashMap, HashSet, VecDeque};
use std::future::Future;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use aws_sdk_s3::config::{Credentials as S3Credentials, Region as S3Region};
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client as S3Client;
use base64::Engine;
use hmac::{Hmac, Mac};
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use tauri::AppHandle;

use crate::models::{
    ResourceFileSyncStatus, ResourceSyncActionResponse, ResourceSyncProgress, ResourceSyncStatus,
    ResourceSyncStatusFile, SyncActionResponse, SyncVersionResponse,
};
use crate::network_policy::{run_with_policy, NetworkPolicy};
use crate::provider_config::{is_empty_or_http_url, is_http_url, normalize_url_style};
use crate::setting::{
    get_active_database_name, get_database_version, load_or_init_setting, resolve_app_dir,
    resolve_database_path, save_setting_value, set_database_version,
};

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

fn extract_http_status(message: &str) -> Option<u16> {
    for token in message.split(|ch: char| !ch.is_ascii_digit()) {
        if token.len() != 3 {
            continue;
        }
        if let Ok(status) = token.parse::<u16>() {
            if (100..=599).contains(&status) {
                return Some(status);
            }
        }
    }
    None
}

fn should_retry_http_status(status: u16) -> bool {
    status == 408 || status == 429 || (500..=599).contains(&status)
}

fn is_retryable_sync_error(error: &AppError) -> bool {
    if matches!(
        error.code.as_str(),
        "REMOTE_FILE_NOT_FOUND"
            | "SYNC_CONFIG_MISSING"
            | "SETTING_INVALID"
            | "DB_OPEN_FAILED"
            | "REMOTE_VERSION_PARSE_FAILED"
    ) {
        return false;
    }
    if let Some(status) = extract_http_status(&error.message) {
        return should_retry_http_status(status);
    }
    true
}

fn summarize_sync_error(error: &AppError) -> String {
    format!("{}:{}", error.code, error.message)
}

async fn run_sync_policy<T, F, Fut>(
    provider: &'static str,
    op: &'static str,
    timeout_code: &'static str,
    timeout_message: &'static str,
    operation: F,
) -> Result<T, AppError>
where
    F: FnMut(u32) -> Fut,
    Fut: Future<Output = Result<T, AppError>>,
{
    run_with_policy(
        provider,
        op,
        NetworkPolicy::standard(),
        operation,
        |attempt, timeout_secs| {
            AppError::new(
                timeout_code,
                format!(
                    "{}超时（{} 秒） provider={} op={} attempt={}",
                    timeout_message, timeout_secs, provider, op, attempt
                ),
            )
        },
        is_retryable_sync_error,
        summarize_sync_error,
    )
    .await
}

#[derive(Debug, Clone)]
struct WebDavConfig {
    url: String,
    username: String,
    password: String,
    path_prefix: String,
}

#[derive(Debug, Clone)]
struct AliOssConfig {
    access_key_id: String,
    access_key_secret: String,
    bucket: String,
    region: String,
    path_prefix: String,
}

#[derive(Debug, Clone)]
struct GithubConfig {
    token: String,
    owner: String,
    repo: String,
    branch: String,
    path_prefix: String,
    committer_name: String,
    committer_email: String,
}

#[derive(Debug, Clone)]
struct S3Config {
    access_key_id: String,
    secret_access_key: String,
    bucket: String,
    region: String,
    endpoint: String,
    url_style: String,
    path_prefix: String,
}

#[derive(Debug, Clone)]
enum SyncProvider {
    WebDav(WebDavConfig),
    AliOss(AliOssConfig),
    Github(GithubConfig),
    S3(S3Config),
}

#[derive(Debug, Clone)]
struct SyncContext {
    setting: Value,
    provider: SyncProvider,
    database_name: String,
    local_version: u64,
    database_path: PathBuf,
    data_object_name: String,
    version_object_name: String,
}

const S3_OPERATION_TIMEOUT_SECS: u64 = 12;
const SYNC_CHECK_TIMEOUT_SECS: u64 = 30;
const RESOURCE_PREFIX: &str = "resources";
const STATUS_DIR_NAME: &str = "sync-status";
const DEFAULT_RESOURCE_SYNC_RETRY_COUNT: u32 = 3;
const DEFAULT_RESOURCE_SYNC_RETRY_DELAY_MS: u64 = 1_000;
const DEFAULT_RESOURCE_SYNC_RETRY_BACKOFF_MULTIPLIER: u64 = 2;

#[derive(Debug, Clone)]
struct ResourceSyncTask {
    name: String,
    direction: String,
    local_path: PathBuf,
    remote_path: String,
    size: u64,
}

#[derive(Debug, Clone)]
struct ResourceSyncState {
    running: bool,
    cancel_requested: bool,
    progress: ResourceSyncProgress,
    status_file: Option<ResourceSyncStatusFile>,
}

#[derive(Debug, Clone)]
struct ResourceStatusFileMeta {
    path: PathBuf,
    file: ResourceSyncStatusFile,
}

#[derive(Debug, Clone)]
struct ResourceRemoteFileInfo {
    name: String,
    path: String,
    size: u64,
}

#[derive(Debug, Clone)]
struct WebDavPropfindEntry {
    href: String,
    size: u64,
    is_collection: bool,
}

#[derive(Debug, Clone)]
struct ResourceSyncRateLimit {
    retry_count: u32,
    retry_delay_ms: u64,
    retry_backoff_multiplier: u64,
}

static RESOURCE_SYNC_RUNTIME: OnceLock<Mutex<ResourceSyncState>> = OnceLock::new();

fn response_ok(
    database_name: &str,
    local_version: u64,
    remote_version: u64,
    message: &str,
) -> SyncActionResponse {
    SyncActionResponse {
        ok: true,
        code: None,
        message: message.to_string(),
        database_name: database_name.to_string(),
        local_version,
        remote_version,
    }
}

fn response_err(
    database_name: &str,
    local_version: u64,
    remote_version: u64,
    error: AppError,
) -> SyncActionResponse {
    SyncActionResponse {
        ok: false,
        code: Some(error.code),
        message: error.message,
        database_name: database_name.to_string(),
        local_version,
        remote_version,
    }
}

fn resource_response_ok(message: &str) -> ResourceSyncActionResponse {
    ResourceSyncActionResponse {
        ok: true,
        code: None,
        message: message.to_string(),
    }
}

fn resource_response_err(error: AppError) -> ResourceSyncActionResponse {
    ResourceSyncActionResponse {
        ok: false,
        code: Some(error.code),
        message: error.message,
    }
}

fn empty_resource_progress() -> ResourceSyncProgress {
    ResourceSyncProgress {
        total_files: 0,
        processed_files: 0,
        current_file: None,
        status: "idle".to_string(),
        upload_count: 0,
        download_count: 0,
        skipped_count: 0,
        error_count: 0,
        start_time: None,
    }
}

fn resource_runtime() -> &'static Mutex<ResourceSyncState> {
    RESOURCE_SYNC_RUNTIME.get_or_init(|| {
        Mutex::new(ResourceSyncState {
            running: false,
            cancel_requested: false,
            progress: empty_resource_progress(),
            status_file: None,
        })
    })
}

fn now_millis_u64() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn as_string(value: Option<&Value>) -> String {
    value.and_then(|v| v.as_str()).unwrap_or("").to_string()
}

fn parse_sync_provider(setting: &Value) -> Result<SyncProvider, AppError> {
    let active = as_string(setting.pointer("/sync/active"));
    match active.as_str() {
        "webdav" => {
            let url = as_string(setting.pointer("/integration/webdav/url"));
            let username = as_string(setting.pointer("/integration/webdav/username"));
            let password = as_string(setting.pointer("/integration/webdav/password"));
            let path_prefix = as_string(setting.pointer("/sync/webdav/pathPrefix"));
            if url.is_empty() || username.is_empty() || password.is_empty() {
                return Err(AppError::new(
                    "SYNC_CONFIG_MISSING",
                    "WebDAV 同步配置不完整",
                ));
            }
            if !is_http_url(&url) {
                return Err(AppError::new(
                    "SYNC_CONFIG_MISSING",
                    "WebDAV URL 必须以 http:// 或 https:// 开头",
                ));
            }
            Ok(SyncProvider::WebDav(WebDavConfig {
                url,
                username,
                password,
                path_prefix,
            }))
        }
        "aliOSS" => {
            let access_key_id = as_string(setting.pointer("/integration/aliOSS/accessKeyId"));
            let access_key_secret =
                as_string(setting.pointer("/integration/aliOSS/accessKeySecret"));
            let bucket = as_string(setting.pointer("/sync/aliOSS/bucket"));
            let region = as_string(setting.pointer("/sync/aliOSS/region"));
            let path_prefix = {
                let path = as_string(setting.pointer("/sync/aliOSS/path"));
                if path.is_empty() {
                    as_string(setting.pointer("/sync/aliOSS/pathPrefix"))
                } else {
                    path
                }
            };
            if access_key_id.is_empty()
                || access_key_secret.is_empty()
                || bucket.is_empty()
                || region.is_empty()
            {
                return Err(AppError::new(
                    "SYNC_CONFIG_MISSING",
                    "AliOSS 同步配置不完整",
                ));
            }
            Ok(SyncProvider::AliOss(AliOssConfig {
                access_key_id,
                access_key_secret,
                bucket,
                region,
                path_prefix,
            }))
        }
        "github" => {
            let token = as_string(setting.pointer("/integration/github/token"));
            let owner = as_string(setting.pointer("/integration/github/user/name"));
            let repo = as_string(setting.pointer("/sync/github/repo"));
            let branch = as_string(setting.pointer("/sync/github/branch"));
            let path_prefix = as_string(setting.pointer("/sync/github/pathPrefix"));
            let committer_name = if owner.is_empty() {
                "tau-mobile".to_string()
            } else {
                owner.clone()
            };
            let committer_email = {
                let value = as_string(setting.pointer("/integration/github/user/email"));
                if value.is_empty() {
                    format!("{committer_name}@users.noreply.github.com")
                } else {
                    value
                }
            };
            if token.is_empty() || owner.is_empty() || repo.is_empty() || branch.is_empty() {
                return Err(AppError::new(
                    "SYNC_CONFIG_MISSING",
                    "Github 同步配置不完整",
                ));
            }
            Ok(SyncProvider::Github(GithubConfig {
                token,
                owner,
                repo,
                branch,
                path_prefix,
                committer_name,
                committer_email,
            }))
        }
        "s3" => {
            let access_key_id = as_string(setting.pointer("/integration/s3/accessKeyId"));
            let secret_access_key = as_string(setting.pointer("/integration/s3/secretAccessKey"));
            let endpoint = as_string(setting.pointer("/integration/s3/endpoint"));
            let url_style = as_string(setting.pointer("/integration/s3/urlStyle"));
            let bucket = as_string(setting.pointer("/sync/s3/bucket"));
            let region = as_string(setting.pointer("/sync/s3/region"));
            let path_prefix = as_string(setting.pointer("/sync/s3/pathPrefix"));
            if access_key_id.is_empty()
                || secret_access_key.is_empty()
                || bucket.is_empty()
                || region.is_empty()
            {
                return Err(AppError::new("SYNC_CONFIG_MISSING", "S3 同步配置不完整"));
            }
            if !is_empty_or_http_url(&endpoint) {
                return Err(AppError::new(
                    "SYNC_CONFIG_MISSING",
                    "S3 Endpoint 必须为空或以 http://、https:// 开头",
                ));
            }
            Ok(SyncProvider::S3(S3Config {
                access_key_id,
                secret_access_key,
                bucket,
                region,
                endpoint,
                url_style: normalize_url_style(&url_style),
                path_prefix,
            }))
        }
        _ => Err(AppError::new(
            "SYNC_CONFIG_MISSING",
            "当前仅支持 WebDAV、AliOSS、Github、S3 同步",
        )),
    }
}

fn join_path(prefix: &str, file_name: &str) -> String {
    let normalized_prefix = prefix.trim().trim_matches('/');
    let normalized_file = file_name.trim().trim_start_matches('/');
    if normalized_prefix.is_empty() {
        normalized_file.to_string()
    } else {
        format!("{normalized_prefix}/{normalized_file}")
    }
}

fn encode_path_keep_slashes(value: &str) -> String {
    utf8_percent_encode(value, NON_ALPHANUMERIC)
        .to_string()
        .replace("%2F", "/")
}

fn build_sync_context(app: &AppHandle) -> Result<SyncContext, AppError> {
    let setting = load_or_init_setting(app).map_err(|err| {
        AppError::new("SETTING_INVALID", format!("读取 setting.json 失败: {err}"))
    })?;
    let provider = parse_sync_provider(&setting)?;
    let database_name = get_active_database_name(&setting);
    let local_version = get_database_version(&setting, &database_name);
    let database_path = resolve_database_path(app, &database_name)
        .map_err(|err| AppError::new("DB_OPEN_FAILED", format!("数据库路径解析失败: {err}")))?;
    Ok(SyncContext {
        setting,
        provider,
        database_name: database_name.clone(),
        local_version,
        database_path,
        data_object_name: database_name.clone(),
        version_object_name: format!("database_{database_name}.json"),
    })
}

fn webdav_remote_path(path_prefix: &str, object_name: &str) -> String {
    let prefix = path_prefix.trim().trim_end_matches('/');
    let object = object_name.trim_start_matches('/');
    let mut merged = if prefix.is_empty() {
        format!("/{object}")
    } else {
        format!("{prefix}/{object}")
    };
    if !merged.starts_with('/') {
        merged.insert(0, '/');
    }
    merged
}

fn webdav_url(config: &WebDavConfig, object_name: &str) -> String {
    let path = webdav_remote_path(&config.path_prefix, object_name);
    webdav_url_from_remote_path(config, &path)
}

fn webdav_url_from_remote_path(config: &WebDavConfig, remote_path: &str) -> String {
    let base = config.url.trim_end_matches('/');
    let mut normalized = remote_path.trim().to_string();
    if !normalized.starts_with('/') {
        normalized.insert(0, '/');
    }
    format!("{base}{normalized}")
}

async fn ensure_webdav_directories(
    config: &WebDavConfig,
    object_name: &str,
) -> Result<(), AppError> {
    let remote_path = webdav_remote_path(&config.path_prefix, object_name);
    let parts: Vec<&str> = remote_path
        .trim_start_matches('/')
        .split('/')
        .filter(|part| !part.is_empty())
        .collect();

    if parts.len() <= 1 {
        return Ok(());
    }

    let client = reqwest::Client::new();
    let mkcol = reqwest::Method::from_bytes(b"MKCOL").map_err(|e| {
        AppError::new(
            "SYNC_UPLOAD_FAILED",
            format!("WebDAV MKCOL 方法创建失败: {e}"),
        )
    })?;
    let mut current = String::new();

    for part in parts.iter().take(parts.len() - 1) {
        current.push('/');
        current.push_str(part);
        let url = webdav_url_from_remote_path(config, &current);
        let response = run_sync_policy(
            "webdav",
            "mkcol_directory",
            "SYNC_UPLOAD_FAILED",
            "WebDAV 创建目录",
            |_| async {
                client
                    .request(mkcol.clone(), &url)
                    .basic_auth(&config.username, Some(&config.password))
                    .send()
                    .await
                    .map_err(|e| {
                        AppError::new("SYNC_UPLOAD_FAILED", format!("WebDAV 创建目录失败: {e}"))
                    })
            },
        )
        .await?;

        let status = response.status().as_u16();
        if !(response.status().is_success() || matches!(status, 301 | 302 | 405 | 409)) {
            return Err(AppError::new(
                "SYNC_UPLOAD_FAILED",
                format!("WebDAV 创建目录返回异常状态: {}", response.status()),
            ));
        }
    }

    Ok(())
}

async fn webdav_exists(config: &WebDavConfig, object_name: &str) -> Result<bool, AppError> {
    let url = webdav_url(config, object_name);
    let client = reqwest::Client::new();
    run_sync_policy(
        "webdav",
        "head_object",
        "SYNC_DOWNLOAD_FAILED",
        "WebDAV 检查文件",
        |_| async {
            let resp = client
                .head(&url)
                .basic_auth(&config.username, Some(&config.password))
                .send()
                .await
                .map_err(|err| {
                    AppError::new(
                        "SYNC_DOWNLOAD_FAILED",
                        format!("WebDAV 检查文件失败: {err}"),
                    )
                })?;
            match resp.status().as_u16() {
                200..=299 => Ok(true),
                404 => Ok(false),
                _ => Err(AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!("WebDAV 检查文件返回异常状态: HTTP {}", resp.status().as_u16()),
                )),
            }
        },
    )
    .await
}

async fn webdav_download(config: &WebDavConfig, object_name: &str) -> Result<Vec<u8>, AppError> {
    let url = webdav_url(config, object_name);
    let client = reqwest::Client::new();
    run_sync_policy(
        "webdav",
        "download_object",
        "SYNC_DOWNLOAD_FAILED",
        "WebDAV 下载",
        |_| async {
            let resp = client
                .get(&url)
                .basic_auth(&config.username, Some(&config.password))
                .send()
                .await
                .map_err(|e| AppError::new("SYNC_DOWNLOAD_FAILED", format!("WebDAV 下载失败: {e}")))?;
            if resp.status().as_u16() == 404 {
                return Err(AppError::new(
                    "REMOTE_FILE_NOT_FOUND",
                    format!("远端文件不存在: {object_name}"),
                ));
            }
            if !resp.status().is_success() {
                return Err(AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!("WebDAV 下载返回异常状态: HTTP {}", resp.status().as_u16()),
                ));
            }
            let bytes = resp.bytes().await.map_err(|e| {
                AppError::new("SYNC_DOWNLOAD_FAILED", format!("读取 WebDAV 响应失败: {e}"))
            })?;
            Ok(bytes.to_vec())
        },
    )
    .await
}

async fn webdav_upload(
    config: &WebDavConfig,
    object_name: &str,
    content: &[u8],
) -> Result<(), AppError> {
    ensure_webdav_directories(config, object_name).await?;
    let url = webdav_url(config, object_name);
    let client = reqwest::Client::new();
    run_sync_policy(
        "webdav",
        "upload_object",
        "SYNC_UPLOAD_FAILED",
        "WebDAV 上传",
        |_| async {
            let resp = client
                .put(&url)
                .basic_auth(&config.username, Some(&config.password))
                .body(content.to_vec())
                .send()
                .await
                .map_err(|e| AppError::new("SYNC_UPLOAD_FAILED", format!("WebDAV 上传失败: {e}")))?;
            if !resp.status().is_success() {
                return Err(AppError::new(
                    "SYNC_UPLOAD_FAILED",
                    format!("WebDAV 上传返回异常状态: HTTP {}", resp.status().as_u16()),
                ));
            }
            Ok(())
        },
    )
    .await
}

fn oss_object_path(path_prefix: &str, object_name: &str) -> String {
    let base = path_prefix.trim().trim_matches('/');
    let object = object_name.trim().trim_start_matches('/');
    if base.is_empty() {
        object.to_string()
    } else {
        format!("{base}/{object}")
    }
}

fn encode_oss_path(path: &str) -> String {
    utf8_percent_encode(path, NON_ALPHANUMERIC)
        .to_string()
        .replace("%2F", "/")
}

fn oss_signature(
    method: &str,
    content_type: &str,
    date: &str,
    canonical_resource: &str,
    access_key_secret: &str,
) -> Result<String, AppError> {
    let string_to_sign = format!("{method}\n\n{content_type}\n{date}\n{canonical_resource}");
    let mut mac = Hmac::<Sha1>::new_from_slice(access_key_secret.as_bytes())
        .map_err(|_| AppError::new("SYNC_CONFIG_MISSING", "AliOSS 密钥初始化失败"))?;
    mac.update(string_to_sign.as_bytes());
    let signature = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());
    Ok(signature)
}

fn build_oss_url(config: &AliOssConfig, object_path: &str) -> String {
    let encoded = encode_oss_path(object_path);
    format!(
        "https://{}.{}.aliyuncs.com/{}",
        config.bucket, config.region, encoded
    )
}

async fn alioss_exists(config: &AliOssConfig, object_name: &str) -> Result<bool, AppError> {
    let object_path = oss_object_path(&config.path_prefix, object_name);
    let canonical_resource = format!("/{}/{}", config.bucket, object_path);
    let date = httpdate::fmt_http_date(SystemTime::now());
    let signature = oss_signature(
        "HEAD",
        "",
        &date,
        &canonical_resource,
        &config.access_key_secret,
    )?;
    let authorization = format!("OSS {}:{}", config.access_key_id, signature);
    let url = build_oss_url(config, &object_path);
    let client = reqwest::Client::new();
    run_sync_policy(
        "alioss",
        "head_object",
        "SYNC_DOWNLOAD_FAILED",
        "AliOSS HEAD",
        |_| async {
            let resp = client
                .head(&url)
                .header("Date", date.clone())
                .header("Authorization", authorization.clone())
                .send()
                .await
                .map_err(|e| AppError::new("SYNC_DOWNLOAD_FAILED", format!("AliOSS HEAD 失败: {e}")))?;
            match resp.status().as_u16() {
                200 => Ok(true),
                404 => Ok(false),
                _ => Err(AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!("AliOSS HEAD 返回异常状态: HTTP {}", resp.status().as_u16()),
                )),
            }
        },
    )
    .await
}

async fn alioss_download(config: &AliOssConfig, object_name: &str) -> Result<Vec<u8>, AppError> {
    let object_path = oss_object_path(&config.path_prefix, object_name);
    let canonical_resource = format!("/{}/{}", config.bucket, object_path);
    let date = httpdate::fmt_http_date(SystemTime::now());
    let signature = oss_signature(
        "GET",
        "",
        &date,
        &canonical_resource,
        &config.access_key_secret,
    )?;
    let authorization = format!("OSS {}:{}", config.access_key_id, signature);
    let url = build_oss_url(config, &object_path);

    let client = reqwest::Client::new();
    run_sync_policy(
        "alioss",
        "download_object",
        "SYNC_DOWNLOAD_FAILED",
        "AliOSS 下载",
        |_| async {
            let resp = client
                .get(&url)
                .header("Date", date.clone())
                .header("Authorization", authorization.clone())
                .send()
                .await
                .map_err(|e| AppError::new("SYNC_DOWNLOAD_FAILED", format!("AliOSS 下载失败: {e}")))?;

            if resp.status().as_u16() == 404 {
                return Err(AppError::new(
                    "REMOTE_FILE_NOT_FOUND",
                    format!("远端文件不存在: {object_name}"),
                ));
            }
            if !resp.status().is_success() {
                return Err(AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!("AliOSS 下载返回异常状态: HTTP {}", resp.status().as_u16()),
                ));
            }
            let bytes = resp.bytes().await.map_err(|e| {
                AppError::new("SYNC_DOWNLOAD_FAILED", format!("AliOSS 读取响应失败: {e}"))
            })?;
            Ok(bytes.to_vec())
        },
    )
    .await
}

async fn alioss_upload(
    config: &AliOssConfig,
    object_name: &str,
    content: &[u8],
) -> Result<(), AppError> {
    let object_path = oss_object_path(&config.path_prefix, object_name);
    let canonical_resource = format!("/{}/{}", config.bucket, object_path);
    let date = httpdate::fmt_http_date(SystemTime::now());
    let content_type = "application/octet-stream";
    let signature = oss_signature(
        "PUT",
        content_type,
        &date,
        &canonical_resource,
        &config.access_key_secret,
    )?;
    let authorization = format!("OSS {}:{}", config.access_key_id, signature);
    let url = build_oss_url(config, &object_path);

    let client = reqwest::Client::new();
    run_sync_policy(
        "alioss",
        "upload_object",
        "SYNC_UPLOAD_FAILED",
        "AliOSS 上传",
        |_| async {
            let resp = client
                .put(&url)
                .header("Date", date.clone())
                .header("Authorization", authorization.clone())
                .header("Content-Type", content_type)
                .body(content.to_vec())
                .send()
                .await
                .map_err(|e| AppError::new("SYNC_UPLOAD_FAILED", format!("AliOSS 上传失败: {e}")))?;

            if !resp.status().is_success() {
                return Err(AppError::new(
                    "SYNC_UPLOAD_FAILED",
                    format!("AliOSS 上传返回异常状态: HTTP {}", resp.status().as_u16()),
                ));
            }
            Ok(())
        },
    )
    .await
}

fn github_api_url(config: &GithubConfig, object_name: &str) -> String {
    let content_path = join_path(&config.path_prefix, object_name);
    let encoded_path = encode_path_keep_slashes(&content_path);
    format!(
        "https://api.github.com/repos/{}/{}/contents/{}",
        config.owner, config.repo, encoded_path
    )
}

fn parse_github_content(content: &str) -> Result<Vec<u8>, AppError> {
    let cleaned = content.replace('\n', "");
    base64::engine::general_purpose::STANDARD
        .decode(cleaned.as_bytes())
        .map(|bytes| bytes.to_vec())
        .map_err(|e| {
            AppError::new(
                "SYNC_DOWNLOAD_FAILED",
                format!("Github 内容 Base64 解码失败: {e}"),
            )
        })
}

async fn github_exists(config: &GithubConfig, object_name: &str) -> Result<bool, AppError> {
    let url = github_api_url(config, object_name);
    let client = reqwest::Client::new();
    run_sync_policy(
        "github",
        "exists_object",
        "SYNC_DOWNLOAD_FAILED",
        "Github 检查",
        |_| async {
            let response = client
                .get(&url)
                .header("Authorization", format!("token {}", config.token))
                .header("User-Agent", "tau-mobile")
                .header("Accept", "application/vnd.github+json")
                .query(&[("ref", config.branch.as_str())])
                .send()
                .await
                .map_err(|e| AppError::new("SYNC_DOWNLOAD_FAILED", format!("Github 检查失败: {e}")))?;

            match response.status().as_u16() {
                200 => Ok(true),
                404 => Ok(false),
                _ => Err(AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!("Github 检查返回异常状态: HTTP {}", response.status().as_u16()),
                )),
            }
        },
    )
    .await
}

async fn github_download(config: &GithubConfig, object_name: &str) -> Result<Vec<u8>, AppError> {
    let url = github_api_url(config, object_name);
    let client = reqwest::Client::new();
    run_sync_policy(
        "github",
        "download_object",
        "SYNC_DOWNLOAD_FAILED",
        "Github 下载",
        |_| async {
            let response = client
                .get(&url)
                .header("Authorization", format!("token {}", config.token))
                .header("User-Agent", "tau-mobile")
                .header("Accept", "application/vnd.github+json")
                .query(&[("ref", config.branch.as_str())])
                .send()
                .await
                .map_err(|e| AppError::new("SYNC_DOWNLOAD_FAILED", format!("Github 下载失败: {e}")))?;

            if response.status().as_u16() == 404 {
                return Err(AppError::new(
                    "REMOTE_FILE_NOT_FOUND",
                    format!("远端文件不存在: {object_name}"),
                ));
            }
            if !response.status().is_success() {
                return Err(AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!("Github 下载返回异常状态: HTTP {}", response.status().as_u16()),
                ));
            }

            let text = response.text().await.map_err(|e| {
                AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!("Github 响应读取失败: {e}"),
                )
            })?;
            let parsed = serde_json::from_str::<Value>(&text).map_err(|e| {
                AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!("Github 响应 JSON 解析失败: {e}"),
                )
            })?;
            let content = parsed
                .get("content")
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    AppError::new(
                        "SYNC_DOWNLOAD_FAILED",
                        "Github 响应缺少 content 字段",
                    )
                })?;
            parse_github_content(content)
        },
    )
    .await
}

async fn github_get_sha(config: &GithubConfig, object_name: &str) -> Result<Option<String>, AppError> {
    let url = github_api_url(config, object_name);
    let client = reqwest::Client::new();
    run_sync_policy(
        "github",
        "get_sha",
        "SYNC_UPLOAD_FAILED",
        "Github 查询 SHA",
        |_| async {
            let response = client
                .get(&url)
                .header("Authorization", format!("token {}", config.token))
                .header("User-Agent", "tau-mobile")
                .header("Accept", "application/vnd.github+json")
                .query(&[("ref", config.branch.as_str())])
                .send()
                .await
                .map_err(|e| AppError::new("SYNC_UPLOAD_FAILED", format!("Github 查询 SHA 失败: {e}")))?;

            if response.status().as_u16() == 404 {
                return Ok(None);
            }
            if !response.status().is_success() {
                return Err(AppError::new(
                    "SYNC_UPLOAD_FAILED",
                    format!("Github 查询 SHA 返回异常状态: HTTP {}", response.status().as_u16()),
                ));
            }
            let text = response.text().await.map_err(|e| {
                AppError::new(
                    "SYNC_UPLOAD_FAILED",
                    format!("Github SHA 响应读取失败: {e}"),
                )
            })?;
            let parsed = serde_json::from_str::<Value>(&text).map_err(|e| {
                AppError::new(
                    "SYNC_UPLOAD_FAILED",
                    format!("Github SHA 响应解析失败: {e}"),
                )
            })?;
            Ok(parsed
                .get("sha")
                .and_then(|v| v.as_str())
                .map(|v| v.to_string()))
        },
    )
    .await
}

async fn github_upload(
    config: &GithubConfig,
    object_name: &str,
    content: &[u8],
) -> Result<(), AppError> {
    let url = github_api_url(config, object_name);
    let sha = github_get_sha(config, object_name).await?;
    let mut body = json!({
        "message": format!("sync {}", object_name),
        "content": base64::engine::general_purpose::STANDARD.encode(content),
        "branch": config.branch,
        "committer": {
            "name": config.committer_name,
            "email": config.committer_email
        }
    });
    if let Some(value) = sha {
        body["sha"] = Value::String(value);
    }

    let client = reqwest::Client::new();
    run_sync_policy(
        "github",
        "upload_object",
        "SYNC_UPLOAD_FAILED",
        "Github 上传",
        |_| async {
            let response = client
                .put(&url)
                .header("Authorization", format!("token {}", config.token))
                .header("User-Agent", "tau-mobile")
                .header("Accept", "application/vnd.github+json")
                .json(&body)
                .send()
                .await
                .map_err(|e| AppError::new("SYNC_UPLOAD_FAILED", format!("Github 上传失败: {e}")))?;

            let status = response.status();
            if !status.is_success() {
                let raw = response.text().await.unwrap_or_default();
                return Err(AppError::new(
                    "SYNC_UPLOAD_FAILED",
                    format!("Github 上传返回异常状态 {}: {}", status, raw),
                ));
            }
            Ok(())
        },
    )
    .await
}

fn build_s3_client(config: &S3Config) -> S3Client {
    let credentials = S3Credentials::new(
        config.access_key_id.clone(),
        config.secret_access_key.clone(),
        None,
        None,
        "tau-mobile-sync",
    );
    let mut builder = aws_sdk_s3::config::Builder::new()
        .behavior_version_latest()
        .region(S3Region::new(config.region.clone()))
        .credentials_provider(credentials);
    #[cfg(target_os = "android")]
    {
        builder.set_http_client(Some(build_android_s3_http_client()));
    }
    if !config.endpoint.is_empty() {
        builder = builder.endpoint_url(config.endpoint.clone());
    }
    if config.url_style == "path" {
        builder = builder.force_path_style(true);
    }
    S3Client::from_conf(builder.build())
}

#[cfg(target_os = "android")]
fn build_android_s3_http_client() -> aws_sdk_s3::config::SharedHttpClient {
    use aws_smithy_http_client::hyper_014::HyperClientBuilder;
    use hyper_rustls::HttpsConnectorBuilder;

    let https_connector = HttpsConnectorBuilder::new()
        .with_webpki_roots()
        .https_or_http()
        .enable_http1()
        .enable_http2()
        .build();

    HyperClientBuilder::new().build(https_connector)
}

fn build_s3_object_url(config: &S3Config, object_name: &str) -> String {
    let key = join_path(&config.path_prefix, object_name);
    if config.url_style == "virtualHosted" {
        if !config.endpoint.is_empty() {
            if let Ok(url) = url::Url::parse(&config.endpoint) {
                let host = if let Some(port) = url.port() {
                    format!("{}:{}", url.host_str().unwrap_or_default(), port)
                } else {
                    url.host_str().unwrap_or_default().to_string()
                };
                return format!("{}://{}.{}{}", url.scheme(), config.bucket, host, format!("/{key}"));
            }
            let endpoint_host = config
                .endpoint
                .trim()
                .trim_end_matches('/')
                .trim_start_matches("https://")
                .trim_start_matches("http://");
            let protocol = if config.endpoint.starts_with("http://") {
                "http"
            } else {
                "https"
            };
            return format!("{protocol}://{}.{}{}", config.bucket, endpoint_host, format!("/{key}"));
        }
        return format!(
            "https://{}.s3.{}.amazonaws.com/{}",
            config.bucket, config.region, key
        );
    }

    let endpoint = if config.endpoint.is_empty() {
        format!("https://s3.{}.amazonaws.com", config.region)
    } else {
        config.endpoint.trim_end_matches('/').to_string()
    };
    format!("{endpoint}/{}/{}", config.bucket, key)
}

async fn s3_exists_via_http(config: &S3Config, object_name: &str) -> Result<bool, AppError> {
    let url = build_s3_object_url(config, object_name);
    let response = tokio::time::timeout(
        Duration::from_secs(S3_OPERATION_TIMEOUT_SECS),
        reqwest::Client::new().head(&url).send(),
    )
    .await
    .map_err(|_| {
        AppError::new(
            "SYNC_DOWNLOAD_FAILED",
            format!("S3 HTTP 回退检查超时（{} 秒）", S3_OPERATION_TIMEOUT_SECS),
        )
    })?
    .map_err(|e| AppError::new("SYNC_DOWNLOAD_FAILED", format!("S3 HTTP 回退检查失败: {e}")))?;

    match response.status().as_u16() {
        200..=399 => Ok(true),
        404 => Ok(false),
        status => Err(AppError::new(
            "SYNC_DOWNLOAD_FAILED",
            format!("S3 HTTP 回退检查返回异常状态: {status}"),
        )),
    }
}

async fn s3_download_via_http(config: &S3Config, object_name: &str) -> Result<Vec<u8>, AppError> {
    let url = build_s3_object_url(config, object_name);
    let response = tokio::time::timeout(
        Duration::from_secs(S3_OPERATION_TIMEOUT_SECS),
        reqwest::Client::new().get(&url).send(),
    )
    .await
    .map_err(|_| {
        AppError::new(
            "SYNC_DOWNLOAD_FAILED",
            format!("S3 HTTP 回退下载超时（{} 秒）", S3_OPERATION_TIMEOUT_SECS),
        )
    })?
    .map_err(|e| AppError::new("SYNC_DOWNLOAD_FAILED", format!("S3 HTTP 回退下载失败: {e}")))?;

    if response.status().as_u16() == 404 {
        return Err(AppError::new(
            "REMOTE_FILE_NOT_FOUND",
            format!("远端文件不存在: {object_name}"),
        ));
    }
    if !response.status().is_success() {
        return Err(AppError::new(
            "SYNC_DOWNLOAD_FAILED",
            format!("S3 HTTP 回退下载返回异常状态: {}", response.status()),
        ));
    }

    let bytes = tokio::time::timeout(
        Duration::from_secs(S3_OPERATION_TIMEOUT_SECS),
        response.bytes(),
    )
    .await
    .map_err(|_| {
        AppError::new(
            "SYNC_DOWNLOAD_FAILED",
            format!("S3 HTTP 回退响应读取超时（{} 秒）", S3_OPERATION_TIMEOUT_SECS),
        )
    })?
    .map_err(|e| AppError::new("SYNC_DOWNLOAD_FAILED", format!("S3 HTTP 回退响应读取失败: {e}")))?;

    Ok(bytes.to_vec())
}

fn is_not_found_error(err: &impl std::fmt::Display) -> bool {
    let message = err.to_string().to_ascii_lowercase();
    message.contains("notfound") || message.contains("not found") || message.contains("404")
}

async fn s3_exists(config: &S3Config, object_name: &str) -> Result<bool, AppError> {
    let key = join_path(&config.path_prefix, object_name);
    let client = build_s3_client(config);
    let sdk_result = tokio::time::timeout(
        Duration::from_secs(S3_OPERATION_TIMEOUT_SECS),
        client
            .head_object()
            .bucket(config.bucket.clone())
            .key(key)
            .send(),
    )
    .await;

    match sdk_result {
        Ok(Ok(_)) => Ok(true),
        Ok(Err(err)) => {
            if is_not_found_error(&err) {
                return Ok(false);
            }
            println!(
                "[sync][s3] HeadObject 失败，尝试 HTTP 回退检查。bucket={} region={} endpoint={} urlStyle={} err={}",
                config.bucket, config.region, config.endpoint, config.url_style, err
            );
            s3_exists_via_http(config, object_name).await.map_err(|fallback_err| {
                AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!("S3 检查文件失败: {err}；HTTP 回退失败: {}", fallback_err.message),
                )
            })
        }
        Err(_) => {
            println!(
                "[sync][s3] HeadObject 超时，尝试 HTTP 回退检查。bucket={} region={} endpoint={} urlStyle={}",
                config.bucket, config.region, config.endpoint, config.url_style
            );
            s3_exists_via_http(config, object_name).await.map_err(|fallback_err| {
                AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!(
                        "S3 检查文件超时（{} 秒）；HTTP 回退失败: {}",
                        S3_OPERATION_TIMEOUT_SECS, fallback_err.message
                    ),
                )
            })
        }
    }
}

async fn s3_download(config: &S3Config, object_name: &str) -> Result<Vec<u8>, AppError> {
    let key = join_path(&config.path_prefix, object_name);
    let client = build_s3_client(config);
    let output = match tokio::time::timeout(
        Duration::from_secs(S3_OPERATION_TIMEOUT_SECS),
        client
            .get_object()
            .bucket(config.bucket.clone())
            .key(key)
            .send(),
    )
    .await
    {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => {
            if is_not_found_error(&e) {
                return Err(AppError::new(
                    "REMOTE_FILE_NOT_FOUND",
                    format!("远端文件不存在: {object_name}"),
                ));
            }
            println!(
                "[sync][s3] GetObject 失败，尝试 HTTP 回退下载。bucket={} region={} endpoint={} urlStyle={} err={}",
                config.bucket, config.region, config.endpoint, config.url_style, e
            );
            return s3_download_via_http(config, object_name).await.map_err(|fallback_err| {
                AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!("S3 下载失败: {e}；HTTP 回退失败: {}", fallback_err.message),
                )
            });
        }
        Err(_) => {
            println!(
                "[sync][s3] GetObject 超时，尝试 HTTP 回退下载。bucket={} region={} endpoint={} urlStyle={}",
                config.bucket, config.region, config.endpoint, config.url_style
            );
            return s3_download_via_http(config, object_name).await.map_err(|fallback_err| {
                AppError::new(
                    "SYNC_DOWNLOAD_FAILED",
                    format!(
                        "S3 下载请求超时（{} 秒）；HTTP 回退失败: {}",
                        S3_OPERATION_TIMEOUT_SECS, fallback_err.message
                    ),
                )
            });
        }
    };

    let collected = tokio::time::timeout(Duration::from_secs(S3_OPERATION_TIMEOUT_SECS), output.body.collect())
        .await
        .map_err(|_| {
            AppError::new(
                "SYNC_DOWNLOAD_FAILED",
                format!("S3 响应读取超时（{} 秒）", S3_OPERATION_TIMEOUT_SECS),
            )
        })?
        .map_err(|e| {
            println!(
                "[sync][s3] S3 SDK 响应读取失败，尝试 HTTP 回退下载。bucket={} region={} endpoint={} urlStyle={} err={}",
                config.bucket, config.region, config.endpoint, config.url_style, e
            );
            AppError::new("SYNC_DOWNLOAD_FAILED", format!("S3 响应读取失败: {e}"))
        });
    let collected = match collected {
        Ok(data) => data,
        Err(err) => {
            return s3_download_via_http(config, object_name)
                .await
                .map_err(|fallback_err| {
                    AppError::new(
                        "SYNC_DOWNLOAD_FAILED",
                        format!("{}；HTTP 回退失败: {}", err.message, fallback_err.message),
                    )
                });
        }
    };
    Ok(collected.into_bytes().to_vec())
}

async fn s3_upload(config: &S3Config, object_name: &str, content: &[u8]) -> Result<(), AppError> {
    let key = join_path(&config.path_prefix, object_name);
    let client = build_s3_client(config);
    tokio::time::timeout(
        Duration::from_secs(S3_OPERATION_TIMEOUT_SECS),
        client
            .put_object()
            .bucket(config.bucket.clone())
            .key(key)
            .body(ByteStream::from(content.to_vec()))
            .send(),
    )
    .await
    .map_err(|_| {
        AppError::new(
            "SYNC_UPLOAD_FAILED",
            format!(
                "S3 上传超时（{} 秒），请检查 Endpoint、网络或 URL 风格",
                S3_OPERATION_TIMEOUT_SECS
            ),
        )
    })?
    .map_err(|e| AppError::new("SYNC_UPLOAD_FAILED", format!("S3 上传失败: {e}")))?;
    Ok(())
}

impl SyncProvider {
    async fn exists(&self, object_name: &str) -> Result<bool, AppError> {
        match self {
            SyncProvider::WebDav(config) => webdav_exists(config, object_name).await,
            SyncProvider::AliOss(config) => alioss_exists(config, object_name).await,
            SyncProvider::Github(config) => github_exists(config, object_name).await,
            SyncProvider::S3(config) => s3_exists(config, object_name).await,
        }
    }

    async fn download(&self, object_name: &str) -> Result<Vec<u8>, AppError> {
        match self {
            SyncProvider::WebDav(config) => webdav_download(config, object_name).await,
            SyncProvider::AliOss(config) => alioss_download(config, object_name).await,
            SyncProvider::Github(config) => github_download(config, object_name).await,
            SyncProvider::S3(config) => s3_download(config, object_name).await,
        }
    }

    async fn upload(&self, object_name: &str, content: &[u8]) -> Result<(), AppError> {
        match self {
            SyncProvider::WebDav(config) => webdav_upload(config, object_name, content).await,
            SyncProvider::AliOss(config) => alioss_upload(config, object_name, content).await,
            SyncProvider::Github(config) => github_upload(config, object_name, content).await,
            SyncProvider::S3(config) => s3_upload(config, object_name, content).await,
        }
    }
}

async fn read_remote_version(
    provider: &SyncProvider,
    version_object_name: &str,
) -> Result<u64, AppError> {
    let exists = provider.exists(version_object_name).await?;
    if !exists {
        return Ok(0);
    }
    let content = provider.download(version_object_name).await?;
    let parsed = serde_json::from_slice::<Value>(&content).map_err(|e| {
        AppError::new(
            "REMOTE_VERSION_PARSE_FAILED",
            format!("远端版本文件 JSON 解析失败: {e}"),
        )
    })?;
    parsed
        .get("version")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| {
            AppError::new(
                "REMOTE_VERSION_PARSE_FAILED",
                "远端版本文件缺少 version 字段",
            )
        })
}

fn version_payload(version: u64) -> Vec<u8> {
    serde_json::to_vec(&json!({ "version": version }))
        .unwrap_or_else(|_| b"{\"version\":0}".to_vec())
}

#[tauri::command]
pub async fn sync_check_versions(app: AppHandle) -> Result<SyncVersionResponse, String> {
    let ctx = build_sync_context(&app).map_err(|e| format!("{}:{}", e.code, e.message))?;
    let remote_version = tokio::time::timeout(
        Duration::from_secs(SYNC_CHECK_TIMEOUT_SECS),
        read_remote_version(&ctx.provider, &ctx.version_object_name),
    )
    .await
    .map_err(|_| {
        format!(
            "SYNC_CHECK_FAILED:同步状态刷新超时（{} 秒），请检查网络、Endpoint 或 URL 风格",
            SYNC_CHECK_TIMEOUT_SECS
        )
    })?
    .map_err(|e| format!("{}:{}", e.code, e.message))?;
    Ok(SyncVersionResponse {
        database_name: ctx.database_name,
        local_version: ctx.local_version,
        remote_version,
    })
}

#[tauri::command]
pub async fn sync_upload_database(app: AppHandle) -> SyncActionResponse {
    let mut ctx = match build_sync_context(&app) {
        Ok(ctx) => ctx,
        Err(error) => {
            return response_err(DEFAULT_DB_NAME, 0, 0, error);
        }
    };

    let remote_version = match read_remote_version(&ctx.provider, &ctx.version_object_name).await {
        Ok(version) => version,
        Err(error) => {
            return response_err(&ctx.database_name, ctx.local_version, 0, error);
        }
    };

    if remote_version > ctx.local_version {
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            AppError::new(
                "VERSION_CONFLICT_UPLOAD",
                "远端版本高于本地版本，请先下载远端数据库",
            ),
        );
    }

    if !ctx.database_path.exists() {
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            AppError::new("DB_OPEN_FAILED", "本地数据库文件不存在"),
        );
    }

    let db_bytes = match fs::read(&ctx.database_path) {
        Ok(bytes) => bytes,
        Err(err) => {
            return response_err(
                &ctx.database_name,
                ctx.local_version,
                remote_version,
                AppError::new("DB_OPEN_FAILED", format!("读取本地数据库失败: {err}")),
            );
        }
    };

    let next_version = ctx.local_version + 1;
    let next_version_payload = version_payload(next_version);
    if let Err(err) = ctx
        .provider
        .upload(&ctx.version_object_name, &next_version_payload)
        .await
    {
        return response_err(&ctx.database_name, ctx.local_version, remote_version, err);
    }

    if let Err(upload_err) = ctx.provider.upload(&ctx.data_object_name, &db_bytes).await {
        let rollback = ctx
            .provider
            .upload(&ctx.version_object_name, &version_payload(remote_version))
            .await;
        if rollback.is_err() {
            return response_err(
                &ctx.database_name,
                ctx.local_version,
                remote_version,
                AppError::new(
                    "SYNC_UPLOAD_FAILED",
                    format!("数据库上传失败且版本回滚失败: {}", upload_err.message),
                ),
            );
        }
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            upload_err,
        );
    }

    set_database_version(&mut ctx.setting, &ctx.database_name, next_version);
    if let Err(err) = save_setting_value(&app, &ctx.setting) {
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            AppError::new(
                "SETTING_INVALID",
                format!("更新本地 setting.json 失败: {err}"),
            ),
        );
    }

    response_ok(
        &ctx.database_name,
        next_version,
        next_version,
        "上传成功，版本已更新",
    )
}

fn remove_wal_shm_files(db_path: &PathBuf) {
    let db = db_path.to_string_lossy().to_string();
    let wal_path = PathBuf::from(format!("{db}-wal"));
    let shm_path = PathBuf::from(format!("{db}-shm"));
    let _ = fs::remove_file(wal_path);
    let _ = fs::remove_file(shm_path);
}

#[tauri::command]
pub async fn sync_download_database(app: AppHandle) -> SyncActionResponse {
    let mut ctx = match build_sync_context(&app) {
        Ok(ctx) => ctx,
        Err(error) => {
            return response_err(DEFAULT_DB_NAME, 0, 0, error);
        }
    };

    let remote_version = match read_remote_version(&ctx.provider, &ctx.version_object_name).await {
        Ok(version) => version,
        Err(error) => {
            return response_err(&ctx.database_name, ctx.local_version, 0, error);
        }
    };

    if ctx.local_version > remote_version {
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            AppError::new(
                "VERSION_CONFLICT_DOWNLOAD",
                "本地版本高于远端版本，请先上传本地数据库",
            ),
        );
    }

    if ctx.local_version == remote_version {
        return response_ok(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            "本地已是最新版本，无需下载",
        );
    }

    let exists = match ctx.provider.exists(&ctx.data_object_name).await {
        Ok(value) => value,
        Err(error) => {
            return response_err(&ctx.database_name, ctx.local_version, remote_version, error);
        }
    };
    if !exists {
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            AppError::new(
                "REMOTE_FILE_NOT_FOUND",
                format!("远端数据库文件不存在: {}", ctx.data_object_name),
            ),
        );
    }

    let downloaded = match ctx.provider.download(&ctx.data_object_name).await {
        Ok(bytes) => bytes,
        Err(error) => {
            return response_err(&ctx.database_name, ctx.local_version, remote_version, error);
        }
    };

    let backup_dir = match resolve_app_dir(&app) {
        Ok(dir) => dir.join("backup"),
        Err(err) => {
            return response_err(
                &ctx.database_name,
                ctx.local_version,
                remote_version,
                AppError::new("SYNC_DOWNLOAD_FAILED", format!("解析备份目录失败: {err}")),
            );
        }
    };
    if let Err(err) = fs::create_dir_all(&backup_dir) {
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            AppError::new("SYNC_DOWNLOAD_FAILED", format!("创建备份目录失败: {err}")),
        );
    }

    if ctx.database_path.exists() {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let backup_name = format!("version-{}-{}-{}", remote_version, now, ctx.database_name);
        let backup_path = backup_dir.join(backup_name);
        if let Err(err) = fs::copy(&ctx.database_path, backup_path) {
            return response_err(
                &ctx.database_name,
                ctx.local_version,
                remote_version,
                AppError::new("SYNC_DOWNLOAD_FAILED", format!("备份数据库失败: {err}")),
            );
        }
    }

    let tmp_path = ctx
        .database_path
        .with_file_name(format!("{}.download.tmp", ctx.database_name));
    if let Err(err) = fs::write(&tmp_path, downloaded) {
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            AppError::new("SYNC_DOWNLOAD_FAILED", format!("写入临时文件失败: {err}")),
        );
    }
    if let Err(err) = fs::rename(&tmp_path, &ctx.database_path) {
        let _ = fs::remove_file(&tmp_path);
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            AppError::new("SYNC_DOWNLOAD_FAILED", format!("替换数据库文件失败: {err}")),
        );
    }
    remove_wal_shm_files(&ctx.database_path);

    set_database_version(&mut ctx.setting, &ctx.database_name, remote_version);
    if let Err(err) = save_setting_value(&app, &ctx.setting) {
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            AppError::new("SETTING_INVALID", format!("更新本地版本失败: {err}")),
        );
    }

    crate::database::trigger_reconcile_for_database(&app, &ctx.database_name);

    response_ok(
        &ctx.database_name,
        remote_version,
        remote_version,
        "下载成功，数据库已更新",
    )
}

const DEFAULT_DB_NAME: &str = "data.db";

fn sync_provider_name(provider: &SyncProvider) -> String {
    match provider {
        SyncProvider::WebDav(_) => "webdav".to_string(),
        SyncProvider::AliOss(_) => "alioss".to_string(),
        SyncProvider::Github(_) => "github".to_string(),
        SyncProvider::S3(_) => "s3".to_string(),
    }
}

fn sync_provider_rate_limit(provider: &SyncProvider) -> ResourceSyncRateLimit {
    match provider {
        SyncProvider::Github(_) => ResourceSyncRateLimit {
            retry_count: 5,
            retry_delay_ms: 5_000,
            retry_backoff_multiplier: 3,
        },
        SyncProvider::WebDav(_) => ResourceSyncRateLimit {
            retry_count: 3,
            retry_delay_ms: 2_000,
            retry_backoff_multiplier: 2,
        },
        _ => ResourceSyncRateLimit {
            retry_count: DEFAULT_RESOURCE_SYNC_RETRY_COUNT,
            retry_delay_ms: DEFAULT_RESOURCE_SYNC_RETRY_DELAY_MS,
            retry_backoff_multiplier: DEFAULT_RESOURCE_SYNC_RETRY_BACKOFF_MULTIPLIER,
        },
    }
}

fn short_hash(value: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(value.as_bytes());
    let digest = format!("{:x}", hasher.finalize());
    digest.chars().take(8).collect()
}

fn normalize_remote_path(path: &str) -> String {
    path.trim().replace('\\', "/").trim_matches('/').to_string()
}

fn strip_base_prefix(full_path: &str, base_prefix: &str) -> String {
    let normalized = normalize_remote_path(full_path);
    let base = normalize_remote_path(base_prefix);
    if base.is_empty() {
        return normalized;
    }
    if normalized == base {
        return String::new();
    }
    if normalized.starts_with(&format!("{base}/")) {
        return normalized[base.len() + 1..].to_string();
    }
    normalized
}

fn file_name_from_path(path: &str) -> String {
    normalize_remote_path(path)
        .split('/')
        .filter(|v| !v.is_empty())
        .last()
        .unwrap_or_default()
        .to_string()
}

fn provider_status_file_name(provider: &SyncProvider) -> (String, HashMap<String, String>) {
    let mut config = HashMap::new();
    match provider {
        SyncProvider::AliOss(options) => {
            let path_hash = short_hash(&options.path_prefix);
            config.insert("bucket".to_string(), options.bucket.clone());
            config.insert("region".to_string(), options.region.clone());
            config.insert("path".to_string(), options.path_prefix.clone());
            (
                format!("alioss-{}-{}.json", options.bucket, path_hash),
                config,
            )
        }
        SyncProvider::S3(options) => {
            let prefix_hash = short_hash(&options.path_prefix);
            config.insert("bucket".to_string(), options.bucket.clone());
            config.insert("region".to_string(), options.region.clone());
            config.insert("pathPrefix".to_string(), options.path_prefix.clone());
            (
                format!("s3-{}-{}.json", options.bucket, prefix_hash),
                config,
            )
        }
        SyncProvider::WebDav(options) => {
            let host = url::Url::parse(&options.url)
                .ok()
                .and_then(|u| u.host_str().map(|v| v.to_string()))
                .unwrap_or_else(|| options.url.clone());
            let host_hash = short_hash(&host);
            let path_hash = short_hash(&options.path_prefix);
            config.insert("host".to_string(), host);
            config.insert("pathPrefix".to_string(), options.path_prefix.clone());
            (
                format!("webdav-{}-{}.json", host_hash, path_hash),
                config,
            )
        }
        SyncProvider::Github(options) => {
            config.insert("repo".to_string(), options.repo.clone());
            config.insert("branch".to_string(), options.branch.clone());
            config.insert("pathPrefix".to_string(), options.path_prefix.clone());
            (
                format!("github-{}-{}.json", options.repo, options.branch),
                config,
            )
        }
    }
}

fn resource_local_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let app_dir = resolve_app_dir(app)
        .map_err(|e| AppError::new("RESOURCE_SYNC_FAILED", format!("解析应用目录失败: {e}")))?;
    Ok(app_dir.join(RESOURCE_PREFIX))
}

fn resource_status_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let app_dir = resolve_app_dir(app)
        .map_err(|e| AppError::new("RESOURCE_SYNC_FAILED", format!("解析应用目录失败: {e}")))?;
    Ok(app_dir.join(STATUS_DIR_NAME))
}

fn normalize_resource_status_files(statuses: &mut HashMap<String, ResourceFileSyncStatus>) {
    for status in statuses.values_mut() {
        if status.sync_status == ResourceSyncStatus::Syncing {
            status.sync_status = ResourceSyncStatus::Pending;
            status.error_message = None;
        }
    }
}

fn load_resource_status_meta(
    app: &AppHandle,
    provider: &SyncProvider,
) -> Result<ResourceStatusFileMeta, AppError> {
    let status_dir = resource_status_dir(app)?;
    fs::create_dir_all(&status_dir)
        .map_err(|e| AppError::new("RESOURCE_SYNC_FAILED", format!("创建状态目录失败: {e}")))?;
    let (file_name, config) = provider_status_file_name(provider);
    let status_path = status_dir.join(file_name);
    let provider_name = sync_provider_name(provider);
    let mut status_file = ResourceSyncStatusFile {
        provider: provider_name,
        config,
        last_sync_time: None,
        files: HashMap::new(),
    };

    if status_path.exists() {
        if let Ok(content) = fs::read_to_string(&status_path) {
            if let Ok(parsed) = serde_json::from_str::<ResourceSyncStatusFile>(&content) {
                status_file.last_sync_time = parsed.last_sync_time;
                status_file.files = parsed.files;
            }
        }
    }

    normalize_resource_status_files(&mut status_file.files);
    Ok(ResourceStatusFileMeta {
        path: status_path,
        file: status_file,
    })
}

fn persist_resource_status_meta(
    meta: &mut ResourceStatusFileMeta,
    statuses: HashMap<String, ResourceFileSyncStatus>,
) -> Result<(), AppError> {
    meta.file.files = statuses;
    let content = serde_json::to_string_pretty(&meta.file)
        .map_err(|e| AppError::new("RESOURCE_SYNC_FAILED", format!("序列化状态失败: {e}")))?;
    fs::write(&meta.path, content)
        .map_err(|e| AppError::new("RESOURCE_SYNC_FAILED", format!("写入状态文件失败: {e}")))?;
    Ok(())
}

fn scan_local_resource_files(resources_dir: &Path) -> Result<Vec<(String, PathBuf, u64)>, AppError> {
    fs::create_dir_all(resources_dir)
        .map_err(|e| AppError::new("RESOURCE_SYNC_FAILED", format!("创建资源目录失败: {e}")))?;
    let mut files = Vec::new();
    let entries = fs::read_dir(resources_dir)
        .map_err(|e| AppError::new("RESOURCE_SYNC_FAILED", format!("扫描资源目录失败: {e}")))?;
    for entry in entries {
        let entry = match entry {
            Ok(value) => value,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.trim().is_empty() {
            continue;
        }
        let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        files.push((name, path, size));
    }
    Ok(files)
}

fn extract_xml_tag_values(xml: &str, tag_name: &str) -> Vec<String> {
    let mut values = Vec::new();
    let open = format!("<{tag_name}>");
    let close = format!("</{tag_name}>");
    let mut cursor = 0;
    while let Some(start_pos) = xml[cursor..].find(&open) {
        let start_index = cursor + start_pos + open.len();
        if let Some(end_pos) = xml[start_index..].find(&close) {
            let end_index = start_index + end_pos;
            values.push(xml[start_index..end_index].trim().to_string());
            cursor = end_index + close.len();
        } else {
            break;
        }
    }
    values
}

fn extract_xml_tag_value(xml: &str, tag_name: &str) -> Option<String> {
    extract_xml_tag_values(xml, tag_name).into_iter().next()
}

fn preview_text(value: &str, max_chars: usize) -> String {
    let mut collected = String::new();
    for ch in value.chars().take(max_chars) {
        collected.push(ch);
    }
    if value.chars().count() > max_chars {
        format!("{collected}...")
    } else {
        collected
    }
}

async fn list_resources_from_alioss(
    config: &AliOssConfig,
    prefix: &str,
) -> Result<Vec<ResourceRemoteFileInfo>, AppError> {
    let mut files = Vec::new();
    let mut marker = String::new();
    let full_prefix = oss_object_path(&config.path_prefix, prefix);
    let endpoint = format!("https://{}.{}.aliyuncs.com/", config.bucket, config.region);
    let client = reqwest::Client::new();

    loop {
        let xml = run_sync_policy(
            "alioss",
            "list_resources",
            "RESOURCE_SYNC_REMOTE_LIST_FAILED",
            "AliOSS 列表请求",
            |_| async {
                let date = httpdate::fmt_http_date(SystemTime::now());
                // OSS V1 Header 签名在 Bucket 列表接口不应包含 prefix/max-keys/marker 等普通查询参数。
                let canonical_resource = format!("/{}/", config.bucket);
                let signature = oss_signature(
                    "GET",
                    "",
                    &date,
                    &canonical_resource,
                    &config.access_key_secret,
                )?;
                let authorization = format!("OSS {}:{}", config.access_key_id, signature);
                let mut request = client
                    .get(&endpoint)
                    .header("Date", date)
                    .header("Authorization", authorization)
                    .query(&[
                        ("max-keys", "1000"),
                        ("prefix", full_prefix.as_str()),
                        ("encoding-type", "url"),
                    ]);
                if !marker.is_empty() {
                    request = request.query(&[("marker", marker.as_str())]);
                }
                let response = request.send().await.map_err(|e| {
                    AppError::new(
                        "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                        format!("AliOSS 列表请求失败: {e}"),
                    )
                })?;
                let status = response.status();
                let xml = response.text().await.map_err(|e| {
                    AppError::new(
                        "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                        format!("AliOSS 列表响应读取失败: {e}"),
                    )
                })?;
                if !status.is_success() {
                    println!(
                        "[resource-sync] AliOSS 列表失败 status={} prefix={} marker={} body={}",
                        status,
                        full_prefix,
                        marker,
                        preview_text(&xml, 240)
                    );
                    return Err(AppError::new(
                        "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                        format!("AliOSS 列表返回异常状态: HTTP {}", status.as_u16()),
                    ));
                }
                Ok(xml)
            },
        )
        .await?;

        let keys = extract_xml_tag_values(&xml, "Key");
        let sizes = extract_xml_tag_values(&xml, "Size");
        for (idx, key) in keys.iter().enumerate() {
            let decoded_key = percent_encoding::percent_decode_str(key)
                .decode_utf8_lossy()
                .to_string();
            if decoded_key.ends_with('/') {
                continue;
            }
            let relative_path = strip_base_prefix(&decoded_key, &config.path_prefix);
            let normalized = normalize_remote_path(&relative_path);
            if !normalized.starts_with(&format!("{}/", RESOURCE_PREFIX)) {
                continue;
            }
            let name = file_name_from_path(&normalized);
            if name.is_empty() {
                continue;
            }
            let size = sizes
                .get(idx)
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(0);
            files.push(ResourceRemoteFileInfo {
                name,
                path: normalized,
                size,
            });
        }

        let is_truncated = extract_xml_tag_value(&xml, "IsTruncated")
            .map(|v| v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        if !is_truncated {
            break;
        }
        marker = extract_xml_tag_value(&xml, "NextMarker").unwrap_or_default();
        if marker.is_empty() {
            break;
        }
    }

    Ok(files)
}

async fn list_resources_from_s3(
    config: &S3Config,
    prefix: &str,
) -> Result<Vec<ResourceRemoteFileInfo>, AppError> {
    let key_prefix = join_path(&config.path_prefix, prefix);
    let client = build_s3_client(config);
    let mut files = Vec::new();
    let mut continuation: Option<String> = None;

    loop {
        let mut request = client
            .list_objects_v2()
            .bucket(config.bucket.clone())
            .prefix(key_prefix.clone());
        if let Some(token) = continuation.clone() {
            request = request.continuation_token(token);
        }
        let output = tokio::time::timeout(Duration::from_secs(S3_OPERATION_TIMEOUT_SECS), request.send())
            .await
            .map_err(|_| {
                AppError::new(
                    "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                    format!("S3 列表请求超时（{} 秒）", S3_OPERATION_TIMEOUT_SECS),
                )
            })?
            .map_err(|e| {
                AppError::new(
                    "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                    format!("S3 列表请求失败: {e}"),
                )
            })?;

        if let Some(contents) = output.contents {
            for item in contents {
                let key = item.key.unwrap_or_default();
                if key.ends_with('/') || key.is_empty() {
                    continue;
                }
                let relative_path = strip_base_prefix(&key, &config.path_prefix);
                let normalized = normalize_remote_path(&relative_path);
                if !normalized.starts_with(&format!("{}/", RESOURCE_PREFIX)) {
                    continue;
                }
                let name = file_name_from_path(&normalized);
                if name.is_empty() {
                    continue;
                }
                files.push(ResourceRemoteFileInfo {
                    name,
                    path: normalized,
                    size: item.size.unwrap_or_default().max(0) as u64,
                });
            }
        }

        let truncated = output.is_truncated.unwrap_or(false);
        if !truncated {
            break;
        }
        continuation = output.next_continuation_token;
        if continuation.is_none() {
            break;
        }
    }

    Ok(files)
}

async fn list_resources_from_github(
    config: &GithubConfig,
    prefix: &str,
) -> Result<Vec<ResourceRemoteFileInfo>, AppError> {
    let mut queue = VecDeque::new();
    let mut files = Vec::new();
    let start_path = join_path(&config.path_prefix, prefix).trim_matches('/').to_string();
    queue.push_back(start_path);

    while let Some(current) = queue.pop_front() {
        let endpoint = if current.is_empty() {
            format!(
                "https://api.github.com/repos/{}/{}/contents",
                config.owner, config.repo
            )
        } else {
            format!(
                "https://api.github.com/repos/{}/{}/contents/{}",
                config.owner,
                config.repo,
                encode_path_keep_slashes(&current)
            )
        };
        let client = reqwest::Client::new();
        let payload = run_sync_policy(
            "github",
            "list_resources",
            "RESOURCE_SYNC_REMOTE_LIST_FAILED",
            "Github 列表请求",
            |_| async {
                let response = client
                    .get(&endpoint)
                    .header("Authorization", format!("token {}", config.token))
                    .header("User-Agent", "tau-mobile")
                    .header("Accept", "application/vnd.github+json")
                    .query(&[("ref", config.branch.as_str())])
                    .send()
                    .await
                    .map_err(|e| {
                        AppError::new(
                            "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                            format!("Github 列表请求失败: {e}"),
                        )
                    })?;

                if response.status().as_u16() == 404 {
                    return Ok(None);
                }
                if !response.status().is_success() {
                    return Err(AppError::new(
                        "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                        format!("Github 列表返回异常状态: HTTP {}", response.status().as_u16()),
                    ));
                }

                let payload = response.text().await.map_err(|e| {
                    AppError::new(
                        "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                        format!("Github 列表响应读取失败: {e}"),
                    )
                })?;
                Ok(Some(payload))
            },
        )
        .await?;

        let payload = match payload {
            Some(value) => value,
            None => continue,
        };
        let parsed = serde_json::from_str::<Value>(&payload).map_err(|e| {
            AppError::new(
                "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                format!("Github 列表响应解析失败: {e}"),
            )
        })?;
        let entries = if let Some(array) = parsed.as_array() {
            array.clone()
        } else {
            vec![parsed]
        };

        for entry in entries {
            let entry_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or_default();
            let path = entry
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            if path.is_empty() {
                continue;
            }
            if entry_type == "dir" {
                queue.push_back(path);
                continue;
            }
            if entry_type != "file" {
                continue;
            }
            let relative_path = strip_base_prefix(&path, &config.path_prefix);
            let normalized = normalize_remote_path(&relative_path);
            if !normalized.starts_with(&format!("{}/", RESOURCE_PREFIX)) {
                continue;
            }
            let name = file_name_from_path(&normalized);
            if name.is_empty() {
                continue;
            }
            let size = entry.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
            files.push(ResourceRemoteFileInfo {
                name,
                path: normalized,
                size,
            });
        }
    }

    Ok(files)
}

fn parse_webdav_propfind_entries(content: &str) -> Result<Vec<WebDavPropfindEntry>, AppError> {
    let doc = roxmltree::Document::parse(content).map_err(|e| {
        AppError::new(
            "RESOURCE_SYNC_REMOTE_LIST_FAILED",
            format!("WebDAV XML 解析失败: {e}"),
        )
    })?;
    let mut entries = Vec::new();

    for response in doc.descendants().filter(|node| {
        node.is_element() && node.tag_name().name().eq_ignore_ascii_case("response")
    }) {
        let href = response
            .descendants()
            .find(|node| node.is_element() && node.tag_name().name().eq_ignore_ascii_case("href"))
            .and_then(|node| node.text())
            .map(|text| text.trim().to_string())
            .unwrap_or_default();
        if href.is_empty() {
            continue;
        }
        let is_collection = response.descendants().any(|node| {
            node.is_element() && node.tag_name().name().eq_ignore_ascii_case("collection")
        });
        let size = response
            .descendants()
            .find(|node| {
                node.is_element()
                    && node
                        .tag_name()
                        .name()
                        .eq_ignore_ascii_case("getcontentlength")
            })
            .and_then(|node| node.text())
            .and_then(|text| text.trim().parse::<u64>().ok())
            .unwrap_or(0);
        entries.push(WebDavPropfindEntry {
            href,
            size,
            is_collection,
        });
    }

    Ok(entries)
}

fn webdav_href_path(href: &str) -> String {
    let raw = if let Ok(parsed_url) = url::Url::parse(href) {
        parsed_url.path().to_string()
    } else {
        href.to_string()
    };
    percent_encoding::percent_decode_str(&raw)
        .decode_utf8_lossy()
        .to_string()
}

fn extract_resource_relative_path(
    decoded_path: &str,
    base_url_path: &str,
    path_prefix: &str,
) -> Option<String> {
    let relative_without_base_url = strip_base_prefix(decoded_path, base_url_path);
    let relative_without_prefix = strip_base_prefix(&relative_without_base_url, path_prefix);
    let normalized = normalize_remote_path(&relative_without_prefix);
    if normalized.is_empty() {
        return None;
    }
    if normalized == RESOURCE_PREFIX || normalized.starts_with(&format!("{RESOURCE_PREFIX}/")) {
        return Some(normalized);
    }

    let parts: Vec<&str> = normalized.split('/').filter(|part| !part.is_empty()).collect();
    if let Some(index) = parts.iter().position(|part| *part == RESOURCE_PREFIX) {
        let tail = parts[index..].join("/");
        if !tail.is_empty() {
            return Some(tail);
        }
    }
    None
}

async fn list_resources_from_webdav(
    config: &WebDavConfig,
    prefix: &str,
) -> Result<Vec<ResourceRemoteFileInfo>, AppError> {
    let root_object = normalize_remote_path(prefix);
    if root_object.is_empty() {
        return Ok(Vec::new());
    }
    let method = reqwest::Method::from_bytes(b"PROPFIND").map_err(|e| {
        AppError::new(
            "RESOURCE_SYNC_REMOTE_LIST_FAILED",
            format!("WebDAV 方法初始化失败: {e}"),
        )
    })?;
    let body = r#"<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype />
    <d:getcontentlength />
  </d:prop>
</d:propfind>"#;
    let client = reqwest::Client::new();
    let base_url_path = url::Url::parse(&config.url)
        .ok()
        .map(|parsed| normalize_remote_path(parsed.path()))
        .unwrap_or_default();
    let mut queue = VecDeque::new();
    let mut visited_dirs: HashSet<String> = HashSet::new();
    queue.push_back(root_object.clone());
    let mut files = Vec::new();

    while let Some(current_object) = queue.pop_front() {
        if !visited_dirs.insert(current_object.clone()) {
            continue;
        }
        let current_remote = webdav_remote_path(&config.path_prefix, &current_object);
        let current_remote = if current_remote.ends_with('/') {
            current_remote
        } else {
            format!("{current_remote}/")
        };
        let url = webdav_url_from_remote_path(config, &current_remote);
        let xml = run_sync_policy(
            "webdav",
            "list_resources",
            "RESOURCE_SYNC_REMOTE_LIST_FAILED",
            "WebDAV 列表请求",
            |_| async {
                let response = client
                    .request(method.clone(), url.clone())
                    .basic_auth(&config.username, Some(&config.password))
                    .header("Depth", "1")
                    .header("Content-Type", "application/xml")
                    .body(body.to_string())
                    .send()
                    .await
                    .map_err(|e| {
                        AppError::new(
                            "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                            format!("WebDAV 列表请求失败: {e}"),
                        )
                    })?;
                let status = response.status();
                let xml = response.text().await.map_err(|e| {
                    AppError::new(
                        "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                        format!("WebDAV 列表响应读取失败: {e}"),
                    )
                })?;
                if status.as_u16() == 404 {
                    return Ok(None);
                }
                if !status.is_success() {
                    println!(
                        "[resource-sync] WebDAV 列表失败 status={} path={} body={}",
                        status,
                        current_remote,
                        preview_text(&xml, 240)
                    );
                    return Err(AppError::new(
                        "RESOURCE_SYNC_REMOTE_LIST_FAILED",
                        format!("WebDAV 列表返回异常状态: HTTP {}", status.as_u16()),
                    ));
                }
                Ok(Some(xml))
            },
        )
        .await?;
        let xml = match xml {
            Some(value) => value,
            None => continue,
        };

        let entries = parse_webdav_propfind_entries(&xml)?;
        for entry in entries {
            let decoded = webdav_href_path(&entry.href);
            let normalized = match extract_resource_relative_path(
                &decoded,
                &base_url_path,
                &config.path_prefix,
            ) {
                Some(value) => value,
                None => continue,
            };
            if normalized == current_object {
                continue;
            }
            if normalized == RESOURCE_PREFIX {
                continue;
            }
            if !normalized.starts_with(&format!("{RESOURCE_PREFIX}/")) {
                continue;
            }
            if entry.is_collection {
                queue.push_back(normalized);
                continue;
            }
            let name = file_name_from_path(&normalized);
            if name.is_empty() {
                continue;
            }
            files.push(ResourceRemoteFileInfo {
                name,
                path: normalized,
                size: entry.size,
            });
        }
    }
    println!(
        "[resource-sync] WebDAV 列表完成 root={} dirs={} files={}",
        root_object,
        visited_dirs.len(),
        files.len()
    );
    Ok(files)
}

async fn list_remote_resources(
    provider: &SyncProvider,
    prefix: &str,
) -> Result<Vec<ResourceRemoteFileInfo>, AppError> {
    match provider {
        SyncProvider::AliOss(config) => list_resources_from_alioss(config, prefix).await,
        SyncProvider::S3(config) => list_resources_from_s3(config, prefix).await,
        SyncProvider::Github(config) => list_resources_from_github(config, prefix).await,
        SyncProvider::WebDav(config) => list_resources_from_webdav(config, prefix).await,
    }
}

fn init_resource_file_status(
    existing: Option<&ResourceFileSyncStatus>,
    direction: &str,
    size: u64,
) -> ResourceFileSyncStatus {
    let mut status = existing.cloned().unwrap_or(ResourceFileSyncStatus {
        sync_status: ResourceSyncStatus::Pending,
        sync_direction: Some(direction.to_string()),
        file_size: Some(size),
        last_sync_time: None,
        error_message: None,
        retry_count: 0,
    });
    status.sync_direction = Some(direction.to_string());
    status.file_size = Some(size);
    if status.sync_status != ResourceSyncStatus::Error {
        status.sync_status = ResourceSyncStatus::Pending;
        status.error_message = None;
    }
    status
}

fn recalculate_resource_progress(
    progress: &mut ResourceSyncProgress,
    statuses: &HashMap<String, ResourceFileSyncStatus>,
) {
    let mut total_files = 0_u64;
    let mut upload_count = 0_u64;
    let mut download_count = 0_u64;
    let mut skipped_count = 0_u64;
    let mut error_count = 0_u64;
    let mut processed_files = 0_u64;

    for status in statuses.values() {
        total_files += 1;
        match status.sync_direction.as_deref() {
            Some("upload") => upload_count += 1,
            Some("download") => download_count += 1,
            _ => skipped_count += 1,
        }
        if status.sync_status == ResourceSyncStatus::Error {
            error_count += 1;
        }
        if status.sync_status == ResourceSyncStatus::Synced
            || status.sync_status == ResourceSyncStatus::Error
        {
            processed_files += 1;
        }
    }

    progress.total_files = total_files;
    progress.upload_count = upload_count;
    progress.download_count = download_count;
    progress.skipped_count = skipped_count;
    progress.error_count = error_count;
    progress.processed_files = processed_files;
}

fn mark_failed_resource_statuses_pending(
    statuses: &mut HashMap<String, ResourceFileSyncStatus>,
) -> HashMap<String, bool> {
    let mut retry_targets = HashMap::new();
    for (name, status) in statuses.iter_mut() {
        if status.sync_status == ResourceSyncStatus::Error
            || status.sync_status == ResourceSyncStatus::Syncing
        {
            status.sync_status = ResourceSyncStatus::Pending;
            status.error_message = None;
            retry_targets.insert(name.clone(), true);
        }
    }
    retry_targets
}

async fn build_resource_sync_plan(
    app: &AppHandle,
    provider: &SyncProvider,
    previous_statuses: &HashMap<String, ResourceFileSyncStatus>,
    retry_targets: Option<&HashMap<String, bool>>,
) -> Result<(Vec<ResourceSyncTask>, HashMap<String, ResourceFileSyncStatus>), AppError> {
    let resources_dir = resource_local_dir(app)?;
    let local_files = scan_local_resource_files(&resources_dir)?;
    let remote_files = match list_remote_resources(provider, &format!("{RESOURCE_PREFIX}/")).await {
        Ok(files) => files,
        Err(error) => {
            println!(
                "[resource-sync] 远端列表拉取失败，降级为仅本地计划: {}",
                error.message
            );
            Vec::new()
        }
    };
    let mut remote_map = HashMap::new();
    for item in remote_files {
        remote_map.insert(item.name.clone(), item);
    }

    let limit_to_retry = retry_targets.is_some();
    let mut new_statuses = HashMap::new();
    let mut tasks = Vec::new();

    for (name, local_path, size) in local_files {
        if remote_map.remove(&name).is_some() {
            let previous = previous_statuses.get(&name);
            new_statuses.insert(
                name,
                ResourceFileSyncStatus {
                    sync_status: ResourceSyncStatus::Synced,
                    sync_direction: None,
                    file_size: Some(size),
                    last_sync_time: previous
                        .and_then(|v| v.last_sync_time)
                        .or(Some(now_millis_u64())),
                    error_message: None,
                    retry_count: previous.map(|v| v.retry_count).unwrap_or(0),
                },
            );
            continue;
        }

        let status = init_resource_file_status(previous_statuses.get(&name), "upload", size);
        if status.sync_status == ResourceSyncStatus::Pending
            && (!limit_to_retry
                || retry_targets
                    .and_then(|targets| targets.get(&name))
                    .copied()
                    .unwrap_or(false))
        {
            tasks.push(ResourceSyncTask {
                name: name.clone(),
                direction: "upload".to_string(),
                local_path,
                remote_path: format!("{RESOURCE_PREFIX}/{name}"),
                size,
            });
        }
        new_statuses.insert(name, status);
    }

    for (name, remote) in remote_map {
        let status = init_resource_file_status(previous_statuses.get(&name), "download", remote.size);
        if status.sync_status == ResourceSyncStatus::Pending
            && (!limit_to_retry
                || retry_targets
                    .and_then(|targets| targets.get(&name))
                    .copied()
                    .unwrap_or(false))
        {
            tasks.push(ResourceSyncTask {
                name: name.clone(),
                direction: "download".to_string(),
                local_path: resources_dir.join(&name),
                remote_path: if remote.path.trim().is_empty() {
                    format!("{RESOURCE_PREFIX}/{name}")
                } else {
                    remote.path
                },
                size: remote.size,
            });
        }
        new_statuses.insert(name, status);
    }

    Ok((tasks, new_statuses))
}

fn update_resource_runtime_snapshot(
    progress: ResourceSyncProgress,
    status_file: Option<ResourceSyncStatusFile>,
) {
    let mut runtime = resource_runtime().lock().unwrap();
    runtime.progress = progress;
    runtime.status_file = status_file;
}

fn should_cancel_resource_sync() -> bool {
    let runtime = resource_runtime().lock().unwrap();
    runtime.cancel_requested
}

fn set_resource_sync_running(running: bool) {
    let mut runtime = resource_runtime().lock().unwrap();
    runtime.running = running;
    if !running {
        runtime.cancel_requested = false;
    }
}

async fn execute_resource_sync_task_with_retry(
    provider: &SyncProvider,
    task: &ResourceSyncTask,
) -> Result<(), AppError> {
    let policy = sync_provider_rate_limit(provider);
    let mut last_error: Option<AppError> = None;

    for attempt in 0..=policy.retry_count {
        if should_cancel_resource_sync() {
            return Err(AppError::new("RESOURCE_SYNC_CANCELLED", "同步已取消"));
        }
        let result = if task.direction == "upload" {
            let content = fs::read(&task.local_path).map_err(|e| {
                AppError::new(
                    "RESOURCE_SYNC_LOCAL_IO_FAILED",
                    format!("读取本地文件失败: {e}"),
                )
            })?;
            provider.upload(&task.remote_path, &content).await
        } else {
            let content = provider.download(&task.remote_path).await?;
            if let Some(parent_dir) = task.local_path.parent() {
                fs::create_dir_all(parent_dir).map_err(|e| {
                    AppError::new(
                        "RESOURCE_SYNC_LOCAL_IO_FAILED",
                        format!("创建本地资源目录失败: {e}"),
                    )
                })?;
            }
            fs::write(&task.local_path, content).map_err(|e| {
                AppError::new(
                    "RESOURCE_SYNC_LOCAL_IO_FAILED",
                    format!("写入本地资源文件失败: {e}"),
                )
            })?;
            Ok(())
        };

        match result {
            Ok(_) => return Ok(()),
            Err(error) => {
                last_error = Some(error);
                if attempt < policy.retry_count {
                    let delay = policy
                        .retry_delay_ms
                        .saturating_mul(policy.retry_backoff_multiplier.pow(attempt));
                    tokio::time::sleep(Duration::from_millis(delay)).await;
                }
            }
        }
    }

    Err(last_error.unwrap_or_else(|| AppError::new("RESOURCE_SYNC_FAILED", "资源同步失败")))
}

fn build_resource_provider(app: &AppHandle) -> Result<SyncProvider, AppError> {
    let setting = load_or_init_setting(app).map_err(|e| {
        AppError::new("SETTING_INVALID", format!("读取 setting.json 失败: {e}"))
    })?;
    parse_sync_provider(&setting).map_err(|error| {
        if error.code == "SYNC_CONFIG_MISSING" {
            AppError::new("RESOURCE_SYNC_CONFIG_MISSING", error.message)
        } else {
            error
        }
    })
}

async fn run_resource_sync_job(app: AppHandle, retry_failed_only: bool) -> Result<(), AppError> {
    let provider = build_resource_provider(&app)?;
    let mut status_meta = load_resource_status_meta(&app, &provider)?;
    let mut statuses = status_meta.file.files.clone();
    let retry_targets = if retry_failed_only {
        Some(mark_failed_resource_statuses_pending(&mut statuses))
    } else {
        None
    };
    let (tasks, mut statuses) =
        build_resource_sync_plan(&app, &provider, &statuses, retry_targets.as_ref()).await?;

    status_meta.file.files = statuses.clone();
    persist_resource_status_meta(&mut status_meta, statuses.clone())?;

    let mut progress = {
        let runtime = resource_runtime().lock().unwrap();
        runtime.progress.clone()
    };
    recalculate_resource_progress(&mut progress, &statuses);

    if tasks.is_empty() {
        progress.status = if progress.error_count > 0 {
            "error".to_string()
        } else {
            "completed".to_string()
        };
        if progress.status == "completed" {
            status_meta.file.last_sync_time = Some(now_millis_u64());
            persist_resource_status_meta(&mut status_meta, statuses.clone())?;
        }
        update_resource_runtime_snapshot(progress, Some(status_meta.file.clone()));
        return Ok(());
    }

    progress.status = "syncing".to_string();
    update_resource_runtime_snapshot(progress.clone(), Some(status_meta.file.clone()));

    for task in tasks {
        if should_cancel_resource_sync() {
            progress.status = "cancelled".to_string();
            break;
        }

        statuses.insert(
            task.name.clone(),
            ResourceFileSyncStatus {
                sync_status: ResourceSyncStatus::Syncing,
                sync_direction: Some(task.direction.clone()),
                file_size: Some(task.size),
                last_sync_time: statuses.get(&task.name).and_then(|v| v.last_sync_time),
                error_message: None,
                retry_count: statuses.get(&task.name).map(|v| v.retry_count).unwrap_or(0),
            },
        );
        progress.current_file = Some(task.name.clone());
        recalculate_resource_progress(&mut progress, &statuses);
        persist_resource_status_meta(&mut status_meta, statuses.clone())?;
        update_resource_runtime_snapshot(progress.clone(), Some(status_meta.file.clone()));

        let task_result = execute_resource_sync_task_with_retry(&provider, &task).await;
        let previous = statuses.get(&task.name).cloned().unwrap_or(ResourceFileSyncStatus {
            sync_status: ResourceSyncStatus::Pending,
            sync_direction: Some(task.direction.clone()),
            file_size: Some(task.size),
            last_sync_time: None,
            error_message: None,
            retry_count: 0,
        });

        match task_result {
            Ok(_) => {
                statuses.insert(
                    task.name.clone(),
                    ResourceFileSyncStatus {
                        sync_status: ResourceSyncStatus::Synced,
                        sync_direction: Some(task.direction.clone()),
                        file_size: Some(task.size),
                        last_sync_time: Some(now_millis_u64()),
                        error_message: None,
                        retry_count: 0,
                    },
                );
            }
            Err(error) => {
                if error.code == "RESOURCE_SYNC_CANCELLED" {
                    statuses.insert(
                        task.name.clone(),
                        ResourceFileSyncStatus {
                            sync_status: ResourceSyncStatus::Pending,
                            sync_direction: Some(task.direction.clone()),
                            file_size: Some(task.size),
                            last_sync_time: previous.last_sync_time,
                            error_message: None,
                            retry_count: previous.retry_count,
                        },
                    );
                    progress.status = "cancelled".to_string();
                    break;
                }
                statuses.insert(
                    task.name.clone(),
                    ResourceFileSyncStatus {
                        sync_status: ResourceSyncStatus::Error,
                        sync_direction: Some(task.direction.clone()),
                        file_size: Some(task.size),
                        last_sync_time: previous.last_sync_time,
                        error_message: Some(error.message),
                        retry_count: previous.retry_count.saturating_add(1),
                    },
                );
            }
        }

        progress.current_file = None;
        recalculate_resource_progress(&mut progress, &statuses);
        persist_resource_status_meta(&mut status_meta, statuses.clone())?;
        update_resource_runtime_snapshot(progress.clone(), Some(status_meta.file.clone()));
    }

    if progress.status != "cancelled" {
        progress.status = if progress.error_count > 0 {
            "error".to_string()
        } else {
            "completed".to_string()
        };
    }
    if progress.status == "completed" {
        status_meta.file.last_sync_time = Some(now_millis_u64());
    }
    progress.current_file = None;
    persist_resource_status_meta(&mut status_meta, statuses.clone())?;
    recalculate_resource_progress(&mut progress, &statuses);
    update_resource_runtime_snapshot(progress, Some(status_meta.file.clone()));
    Ok(())
}

#[tauri::command]
pub async fn resource_sync_start(app: AppHandle) -> ResourceSyncActionResponse {
    if let Err(error) = build_resource_provider(&app) {
        return resource_response_err(error);
    }
    {
        let mut runtime = resource_runtime().lock().unwrap();
        if runtime.running {
            return resource_response_err(AppError::new(
                "RESOURCE_SYNC_ALREADY_RUNNING",
                "资源同步正在进行中",
            ));
        }
        runtime.running = true;
        runtime.cancel_requested = false;
        runtime.progress = empty_resource_progress();
        runtime.progress.status = "scanning".to_string();
        runtime.progress.start_time = Some(now_millis_u64());
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = run_resource_sync_job(app_handle, false).await;
        if let Err(error) = result {
            let mut runtime = resource_runtime().lock().unwrap();
            runtime.progress.status = "error".to_string();
            runtime.progress.current_file = None;
            println!("[resource-sync] start failed: {}:{}", error.code, error.message);
        }
        set_resource_sync_running(false);
    });
    resource_response_ok("资源同步已启动")
}

#[tauri::command]
pub async fn resource_sync_retry_failed(app: AppHandle) -> ResourceSyncActionResponse {
    if let Err(error) = build_resource_provider(&app) {
        return resource_response_err(error);
    }
    {
        let mut runtime = resource_runtime().lock().unwrap();
        if runtime.running {
            return resource_response_err(AppError::new(
                "RESOURCE_SYNC_ALREADY_RUNNING",
                "资源同步正在进行中",
            ));
        }
        runtime.running = true;
        runtime.cancel_requested = false;
        runtime.progress = empty_resource_progress();
        runtime.progress.status = "scanning".to_string();
        runtime.progress.start_time = Some(now_millis_u64());
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = run_resource_sync_job(app_handle, true).await;
        if let Err(error) = result {
            let mut runtime = resource_runtime().lock().unwrap();
            runtime.progress.status = "error".to_string();
            runtime.progress.current_file = None;
            println!(
                "[resource-sync] retry failed start failed: {}:{}",
                error.code, error.message
            );
        }
        set_resource_sync_running(false);
    });
    resource_response_ok("失败文件重试已启动")
}

#[tauri::command]
pub async fn resource_sync_cancel() -> ResourceSyncActionResponse {
    let mut runtime = resource_runtime().lock().unwrap();
    if !runtime.running {
        return resource_response_ok("当前没有运行中的资源同步任务");
    }
    runtime.cancel_requested = true;
    resource_response_ok("已发送停止信号")
}

#[tauri::command]
pub async fn resource_sync_get_progress() -> ResourceSyncProgress {
    let runtime = resource_runtime().lock().unwrap();
    runtime.progress.clone()
}

#[tauri::command]
pub async fn resource_sync_get_status() -> Option<ResourceSyncStatusFile> {
    let runtime = resource_runtime().lock().unwrap();
    runtime.status_file.clone()
}

#[tauri::command]
pub async fn resource_sync_refresh(app: AppHandle) -> Result<Option<ResourceSyncStatusFile>, String> {
    let provider = build_resource_provider(&app).map_err(|e| format!("{}:{}", e.code, e.message))?;
    let mut status_meta =
        load_resource_status_meta(&app, &provider).map_err(|e| format!("{}:{}", e.code, e.message))?;
    let previous = status_meta.file.files.clone();
    let (_tasks, statuses) = build_resource_sync_plan(&app, &provider, &previous, None)
        .await
        .map_err(|e| format!("{}:{}", e.code, e.message))?;
    persist_resource_status_meta(&mut status_meta, statuses.clone())
        .map_err(|e| format!("{}:{}", e.code, e.message))?;

    let mut progress = empty_resource_progress();
    progress.status = "idle".to_string();
    recalculate_resource_progress(&mut progress, &statuses);
    update_resource_runtime_snapshot(progress, Some(status_meta.file.clone()));
    Ok(Some(status_meta.file))
}
