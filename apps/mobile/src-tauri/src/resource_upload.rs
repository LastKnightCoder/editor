use std::fs;
use std::future::Future;
use std::path::Path;
use std::time::SystemTime;

use aws_sdk_s3::config::{Credentials as S3Credentials, Region as S3Region};
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client as S3Client;
use base64::Engine;
use hmac::{Hmac, Mac};
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde::Deserialize;
use serde_json::{json, Value};
use sha1::Sha1;
use tauri::AppHandle;
use uuid::Uuid;

use crate::network_policy::{run_with_policy, NetworkPolicy};
use crate::provider_config::{is_empty_or_http_url, is_http_url, normalize_url_style};
use crate::setting::{load_or_init_setting, resolve_app_dir};

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

fn is_retryable_resource_error(error: &AppError) -> bool {
    if matches!(
        error.code.as_str(),
        "RESOURCE_CONFIG_MISSING" | "RESOURCE_WRITE_FAILED"
    ) {
        return false;
    }
    if let Some(status) = extract_http_status(&error.message) {
        return should_retry_http_status(status);
    }
    true
}

fn summarize_resource_error(error: &AppError) -> String {
    format!("{}:{}", error.code, error.message)
}

async fn run_resource_policy<T, F, Fut>(
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
        is_retryable_resource_error,
        summarize_resource_error,
    )
    .await
}

#[derive(Debug, Clone)]
struct ProcessedUploadFile {
    file_name: String,
    mime_type: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
struct LocalConfig {
    path: String,
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
struct AliOssConfig {
    access_key_id: String,
    access_key_secret: String,
    bucket: String,
    region: String,
    path_prefix: String,
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
struct WebDavConfig {
    url: String,
    username: String,
    password: String,
    path_prefix: String,
}

#[derive(Debug, Clone)]
enum ResourceProvider {
    Local(LocalConfig),
    Github(GithubConfig),
    AliOss(AliOssConfig),
    S3(S3Config),
    WebDav(WebDavConfig),
}

fn as_string(value: Option<&Value>) -> String {
    value.and_then(|v| v.as_str()).unwrap_or("").to_string()
}

fn as_bool(value: Option<&Value>) -> bool {
    value.and_then(|v| v.as_bool()).unwrap_or(false)
}

fn format_error(error: AppError) -> String {
    format!("{}:{}", error.code, error.message)
}

fn normalized_file_name(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        "resource.bin".to_string()
    } else {
        trimmed.replace('\\', "/")
    }
}

fn sanitize_local_path(path: &str) -> String {
    let mut normalized = path.trim().replace('\\', "/");
    normalized = normalized.trim_matches('/').to_string();

    if normalized == ".editor" {
        return "resources".to_string();
    }
    if let Some(stripped) = normalized.strip_prefix(".editor/") {
        normalized = stripped.to_string();
    }

    if normalized.is_empty() {
        return "resources".to_string();
    }

    let mut segments = Vec::new();
    for segment in normalized.split('/') {
        let item = segment.trim();
        if item.is_empty() {
            continue;
        }
        if item == "." || item == ".." || item.contains(':') {
            return "resources".to_string();
        }
        segments.push(item);
    }

    if segments.is_empty() {
        "resources".to_string()
    } else {
        segments.join("/")
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

fn extension_from_file_name(file_name: &str) -> String {
    Path::new(file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn replace_extension(file_name: &str, extension: &str) -> String {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|part| part.to_str())
        .unwrap_or("resource");
    format!("{stem}.{extension}")
}

fn sanitize_file_stem(file_name: &str) -> String {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|part| part.to_str())
        .unwrap_or("resource");
    let cleaned = stem.trim().replace(['/', '\\'], "_");
    if cleaned.is_empty() {
        "resource".to_string()
    } else {
        cleaned
    }
}

fn build_object_name(file_name: &str) -> String {
    let stem = sanitize_file_stem(file_name);
    let extension = extension_from_file_name(file_name);
    let id = Uuid::new_v4().simple().to_string();
    if extension.is_empty() {
        format!("{stem}_{id}")
    } else {
        format!("{stem}_{id}.{extension}")
    }
}

fn should_compress_image(mime_type: &str, file_name: &str) -> bool {
    let normalized_mime = mime_type.to_ascii_lowercase();
    if matches!(
        normalized_mime.as_str(),
        "image/png" | "image/jpeg" | "image/jpg"
    ) {
        return true;
    }
    matches!(
        extension_from_file_name(file_name).as_str(),
        "png" | "jpeg" | "jpg"
    )
}

fn compress_image_if_needed(
    file_name: &str,
    mime_type: &str,
    bytes: &[u8],
    enable_compression: bool,
) -> ProcessedUploadFile {
    let original = ProcessedUploadFile {
        file_name: file_name.to_string(),
        mime_type: mime_type.to_string(),
        bytes: bytes.to_vec(),
    };

    if !enable_compression || !should_compress_image(mime_type, file_name) {
        return original;
    }

    match try_compress_to_webp(file_name, bytes) {
        Ok(processed) => processed,
        Err(error) => {
            eprintln!("[resource-upload] 图片压缩失败，使用原始文件: {error}");
            original
        }
    }
}

fn try_compress_to_webp(file_name: &str, bytes: &[u8]) -> Result<ProcessedUploadFile, String> {
    let decoded = image::load_from_memory(bytes).map_err(|e| format!("图片解码失败: {e}"))?;
    let rgba = decoded.to_rgba8();
    let (width, height) = rgba.dimensions();
    if width == 0 || height == 0 {
        return Err("图片尺寸无效".to_string());
    }

    let encoder = webp::Encoder::from_rgba(rgba.as_raw(), width, height);
    let compressed = encoder.encode(80.0);
    let compressed_bytes = compressed.to_vec();
    if compressed_bytes.is_empty() {
        return Err("压缩结果为空".to_string());
    }

    Ok(ProcessedUploadFile {
        file_name: replace_extension(file_name, "webp"),
        mime_type: "image/webp".to_string(),
        bytes: compressed_bytes,
    })
}

fn parse_resource_provider(setting: &Value) -> Result<ResourceProvider, AppError> {
    let active = as_string(setting.pointer("/imageBed/active"));
    match active.as_str() {
        "local" => Ok(ResourceProvider::Local(LocalConfig {
            path: sanitize_local_path(&as_string(setting.pointer("/imageBed/local/path"))),
        })),
        "github" => {
            let token = as_string(setting.pointer("/integration/github/token"));
            let owner = as_string(setting.pointer("/integration/github/user/name"));
            let repo = as_string(setting.pointer("/imageBed/github/repo"));
            let branch = as_string(setting.pointer("/imageBed/github/branch"));
            let path_prefix = as_string(setting.pointer("/imageBed/github/pathPrefix"));
            let committer_name = if owner.is_empty() {
                "tau-mobile".to_string()
            } else {
                owner.clone()
            };
            let committer_email = as_string(setting.pointer("/integration/github/user/email"));
            let committer_email = if committer_email.is_empty() {
                format!("{}@users.noreply.github.com", committer_name)
            } else {
                committer_email
            };

            if token.is_empty() || owner.is_empty() || repo.is_empty() || branch.is_empty() {
                return Err(AppError::new(
                    "RESOURCE_CONFIG_MISSING",
                    "Github 资源存储配置不完整",
                ));
            }

            Ok(ResourceProvider::Github(GithubConfig {
                token,
                owner,
                repo,
                branch,
                path_prefix,
                committer_name,
                committer_email,
            }))
        }
        "aliOSS" => {
            let access_key_id = as_string(setting.pointer("/integration/aliOSS/accessKeyId"));
            let access_key_secret =
                as_string(setting.pointer("/integration/aliOSS/accessKeySecret"));
            let bucket = as_string(setting.pointer("/imageBed/aliOSS/bucket"));
            let region = as_string(setting.pointer("/imageBed/aliOSS/region"));
            let path_prefix = as_string(setting.pointer("/imageBed/aliOSS/pathPrefix"));

            if access_key_id.is_empty()
                || access_key_secret.is_empty()
                || bucket.is_empty()
                || region.is_empty()
            {
                return Err(AppError::new(
                    "RESOURCE_CONFIG_MISSING",
                    "AliOSS 资源存储配置不完整",
                ));
            }

            Ok(ResourceProvider::AliOss(AliOssConfig {
                access_key_id,
                access_key_secret,
                bucket,
                region,
                path_prefix,
            }))
        }
        "s3" => {
            let access_key_id = as_string(setting.pointer("/integration/s3/accessKeyId"));
            let secret_access_key = as_string(setting.pointer("/integration/s3/secretAccessKey"));
            let endpoint = as_string(setting.pointer("/integration/s3/endpoint"));
            let url_style = as_string(setting.pointer("/integration/s3/urlStyle"));
            let bucket = as_string(setting.pointer("/imageBed/s3/bucket"));
            let region = as_string(setting.pointer("/imageBed/s3/region"));
            let path_prefix = as_string(setting.pointer("/imageBed/s3/pathPrefix"));

            if access_key_id.is_empty()
                || secret_access_key.is_empty()
                || bucket.is_empty()
                || region.is_empty()
            {
                return Err(AppError::new(
                    "RESOURCE_CONFIG_MISSING",
                    "S3 资源存储配置不完整",
                ));
            }
            if !is_empty_or_http_url(&endpoint) {
                return Err(AppError::new(
                    "RESOURCE_CONFIG_MISSING",
                    "S3 Endpoint 必须为空或以 http://、https:// 开头",
                ));
            }
            Ok(ResourceProvider::S3(S3Config {
                access_key_id,
                secret_access_key,
                bucket,
                region,
                endpoint,
                url_style: normalize_url_style(&url_style),
                path_prefix,
            }))
        }
        "webdav" => {
            let url = as_string(setting.pointer("/integration/webdav/url"));
            let username = as_string(setting.pointer("/integration/webdav/username"));
            let password = as_string(setting.pointer("/integration/webdav/password"));
            let path_prefix = as_string(setting.pointer("/imageBed/webdav/pathPrefix"));

            if url.is_empty() || username.is_empty() || password.is_empty() {
                return Err(AppError::new(
                    "RESOURCE_CONFIG_MISSING",
                    "WebDAV 资源存储配置不完整",
                ));
            }
            if !is_http_url(&url) {
                return Err(AppError::new(
                    "RESOURCE_CONFIG_MISSING",
                    "WebDAV URL 必须以 http:// 或 https:// 开头",
                ));
            }

            Ok(ResourceProvider::WebDav(WebDavConfig {
                url,
                username,
                password,
                path_prefix,
            }))
        }
        _ => Err(AppError::new(
            "RESOURCE_CONFIG_MISSING",
            "当前资源存储类型不受支持",
        )),
    }
}

fn upload_to_local(
    app: &AppHandle,
    config: &LocalConfig,
    object_name: &str,
    content: &[u8],
) -> Result<String, AppError> {
    let app_dir = resolve_app_dir(app).map_err(|e| {
        AppError::new(
            "RESOURCE_WRITE_FAILED",
            format!("解析本地资源目录失败: {e}"),
        )
    })?;
    let local_path = sanitize_local_path(&config.path);
    let resource_dir = app_dir.join(&local_path);
    fs::create_dir_all(&resource_dir).map_err(|e| {
        AppError::new(
            "RESOURCE_WRITE_FAILED",
            format!("创建本地资源目录失败: {e}"),
        )
    })?;
    let target_path = resource_dir.join(object_name);
    fs::write(&target_path, content).map_err(|e| {
        AppError::new(
            "RESOURCE_WRITE_FAILED",
            format!("写入本地资源文件失败: {e}"),
        )
    })?;

    Ok(format!("~/.editor/{local_path}/{object_name}"))
}

async fn upload_to_github(
    config: &GithubConfig,
    object_name: &str,
    file: &ProcessedUploadFile,
) -> Result<String, AppError> {
    let content_path = join_path(&config.path_prefix, object_name);
    let encoded_path = encode_path_keep_slashes(&content_path);
    let url = format!(
        "https://api.github.com/repos/{}/{}/contents/{}",
        config.owner, config.repo, encoded_path
    );
    let body = json!({
        "message": format!("upload resource {}", file.file_name),
        "content": base64::engine::general_purpose::STANDARD.encode(&file.bytes),
        "branch": config.branch,
        "committer": {
            "name": config.committer_name,
            "email": config.committer_email
        }
    });
    let client = reqwest::Client::new();
    let raw_text = run_resource_policy(
        "github",
        "upload_resource",
        "RESOURCE_UPLOAD_FAILED",
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
                .map_err(|e| {
                    AppError::new("RESOURCE_UPLOAD_FAILED", format!("Github 上传失败: {e}"))
                })?;

            let status = response.status();
            let raw_text = response.text().await.map_err(|e| {
                AppError::new(
                    "RESOURCE_UPLOAD_FAILED",
                    format!("Github 响应读取失败: {e}"),
                )
            })?;

            if !status.is_success() {
                return Err(AppError::new(
                    "RESOURCE_UPLOAD_FAILED",
                    format!(
                        "Github 上传返回异常状态 HTTP {}: {}",
                        status.as_u16(),
                        raw_text
                    ),
                ));
            }
            Ok(raw_text)
        },
    )
    .await?;

    let parsed = serde_json::from_str::<Value>(&raw_text).unwrap_or_else(|_| json!({}));
    let download_url = as_string(parsed.pointer("/content/download_url"));
    if !download_url.is_empty() {
        return Ok(download_url);
    }

    let raw_path = encode_path_keep_slashes(&content_path);
    Ok(format!(
        "https://raw.githubusercontent.com/{}/{}/{}/{}",
        config.owner, config.repo, config.branch, raw_path
    ))
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
        .map_err(|_| AppError::new("RESOURCE_CONFIG_MISSING", "AliOSS 密钥初始化失败"))?;
    mac.update(string_to_sign.as_bytes());
    Ok(base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes()))
}

fn build_oss_url(config: &AliOssConfig, object_path: &str) -> String {
    let encoded = encode_oss_path(object_path);
    format!(
        "https://{}.{}.aliyuncs.com/{}",
        config.bucket, config.region, encoded
    )
}

async fn upload_to_alioss(
    config: &AliOssConfig,
    object_name: &str,
    file: &ProcessedUploadFile,
) -> Result<String, AppError> {
    let object_path = oss_object_path(&config.path_prefix, object_name);
    let canonical_resource = format!("/{}/{}", config.bucket, object_path);
    let date = httpdate::fmt_http_date(SystemTime::now());
    let content_type = if file.mime_type.is_empty() {
        "application/octet-stream".to_string()
    } else {
        file.mime_type.clone()
    };
    let signature = oss_signature(
        "PUT",
        &content_type,
        &date,
        &canonical_resource,
        &config.access_key_secret,
    )?;
    let authorization = format!("OSS {}:{}", config.access_key_id, signature);
    let url = build_oss_url(config, &object_path);

    let client = reqwest::Client::new();
    run_resource_policy(
        "alioss",
        "upload_resource",
        "RESOURCE_UPLOAD_FAILED",
        "AliOSS 上传",
        |_| async {
            let response = client
                .put(&url)
                .header("Date", date.clone())
                .header("Authorization", authorization.clone())
                .header("Content-Type", content_type.clone())
                .body(file.bytes.clone())
                .send()
                .await
                .map_err(|e| {
                    AppError::new("RESOURCE_UPLOAD_FAILED", format!("AliOSS 上传失败: {e}"))
                })?;

            if !response.status().is_success() {
                return Err(AppError::new(
                    "RESOURCE_UPLOAD_FAILED",
                    format!(
                        "AliOSS 上传返回异常状态: HTTP {}",
                        response.status().as_u16()
                    ),
                ));
            }
            Ok(())
        },
    )
    .await?;

    Ok(url)
}

fn build_s3_url(config: &S3Config, key: &str) -> String {
    if config.url_style == "virtualHosted" {
        if !config.endpoint.is_empty() {
            if let Ok(url) = url::Url::parse(&config.endpoint) {
                let host = if let Some(port) = url.port() {
                    format!("{}:{}", url.host_str().unwrap_or_default(), port)
                } else {
                    url.host_str().unwrap_or_default().to_string()
                };
                return format!(
                    "{}://{}.{}{}",
                    url.scheme(),
                    config.bucket,
                    host,
                    format!("/{key}")
                );
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
            return format!(
                "{protocol}://{}.{}{}",
                config.bucket,
                endpoint_host,
                format!("/{key}")
            );
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

async fn upload_to_s3(
    config: &S3Config,
    object_name: &str,
    file: &ProcessedUploadFile,
) -> Result<String, AppError> {
    let key = join_path(&config.path_prefix, object_name);
    let credentials = S3Credentials::new(
        config.access_key_id.clone(),
        config.secret_access_key.clone(),
        None,
        None,
        "tau-mobile",
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

    let client = S3Client::from_conf(builder.build());
    let content_type = if file.mime_type.is_empty() {
        None
    } else {
        Some(file.mime_type.clone())
    };
    let body_bytes = file.bytes.clone();

    run_resource_policy(
        "s3",
        "upload_resource",
        "RESOURCE_UPLOAD_FAILED",
        "S3 上传",
        |_| async {
            let mut request = client
                .put_object()
                .bucket(config.bucket.clone())
                .key(key.clone())
                .body(ByteStream::from(body_bytes.clone()));
            if let Some(value) = content_type.clone() {
                request = request.content_type(value);
            }
            request.send().await.map_err(|e| {
                AppError::new("RESOURCE_UPLOAD_FAILED", format!("S3 上传失败: {e}"))
            })?;
            Ok(())
        },
    )
    .await?;

    Ok(build_s3_url(config, &key))
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

fn webdav_url(config: &WebDavConfig, remote_path: &str) -> String {
    let base = config.url.trim_end_matches('/');
    format!("{base}{remote_path}")
}

async fn ensure_webdav_directories(
    config: &WebDavConfig,
    remote_path: &str,
) -> Result<(), AppError> {
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
            "RESOURCE_UPLOAD_FAILED",
            format!("WebDAV MKCOL 方法创建失败: {e}"),
        )
    })?;
    let mut current = String::new();

    for part in parts.iter().take(parts.len() - 1) {
        current.push('/');
        current.push_str(part);
        let url = webdav_url(config, &current);
        let response = run_resource_policy(
            "webdav",
            "mkcol_directory",
            "RESOURCE_UPLOAD_FAILED",
            "WebDAV 创建目录",
            |_| async {
                client
                    .request(mkcol.clone(), &url)
                    .basic_auth(&config.username, Some(&config.password))
                    .send()
                    .await
                    .map_err(|e| {
                        AppError::new(
                            "RESOURCE_UPLOAD_FAILED",
                            format!("WebDAV 创建目录失败: {e}"),
                        )
                    })
            },
        )
        .await?;

        let status = response.status().as_u16();
        if !(response.status().is_success() || matches!(status, 301 | 302 | 405 | 409)) {
            return Err(AppError::new(
                "RESOURCE_UPLOAD_FAILED",
                format!("WebDAV 创建目录返回异常状态: {}", response.status()),
            ));
        }
    }

    Ok(())
}

async fn upload_to_webdav(
    config: &WebDavConfig,
    object_name: &str,
    file: &ProcessedUploadFile,
) -> Result<String, AppError> {
    let remote_path = webdav_remote_path(&config.path_prefix, object_name);
    ensure_webdav_directories(config, &remote_path).await?;

    let url = webdav_url(config, &remote_path);
    let content_type = if file.mime_type.is_empty() {
        "application/octet-stream".to_string()
    } else {
        file.mime_type.clone()
    };

    let client = reqwest::Client::new();
    run_resource_policy(
        "webdav",
        "upload_resource",
        "RESOURCE_UPLOAD_FAILED",
        "WebDAV 上传",
        |_| async {
            let response = client
                .put(&url)
                .basic_auth(&config.username, Some(&config.password))
                .header("Content-Type", content_type.clone())
                .body(file.bytes.clone())
                .send()
                .await
                .map_err(|e| {
                    AppError::new("RESOURCE_UPLOAD_FAILED", format!("WebDAV 上传失败: {e}"))
                })?;

            if !response.status().is_success() {
                return Err(AppError::new(
                    "RESOURCE_UPLOAD_FAILED",
                    format!(
                        "WebDAV 上传返回异常状态: HTTP {}",
                        response.status().as_u16()
                    ),
                ));
            }
            Ok(())
        },
    )
    .await?;

    Ok(url)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadResourcePayload {
    pub file_name: String,
    pub mime_type: String,
    pub base64: String,
}

#[tauri::command]
pub async fn upload_resource(
    app: AppHandle,
    payload: UploadResourcePayload,
) -> Result<String, String> {
    // Android 的 raw IPC 会把二进制包装成逐字节的 JSON 对象（tauri#10573），不可用；
    // 移动端统一 base64 字符串通道（前端已预压缩，负载为原始大小的 1/10 以下）
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload.base64.as_bytes())
        .map_err(|e| format!("RESOURCE_UPLOAD_FAILED: base64 解码失败: {e}"))?;
    println!(
        "[upload_resource] invoked: {} bytes, file={}, mime={}",
        bytes.len(),
        payload.file_name,
        payload.mime_type
    );

    if bytes.is_empty() {
        return Err(format_error(AppError::new(
            "RESOURCE_UPLOAD_FAILED",
            "上传文件内容为空",
        )));
    }

    let setting = load_or_init_setting(&app)
        .map_err(|e| format!("SETTING_INVALID:读取 setting.json 失败: {e}"))?;
    let provider = parse_resource_provider(&setting).map_err(format_error)?;
    let file_name = normalized_file_name(&payload.file_name);
    let enable_compression = as_bool(setting.pointer("/imageBed/enableCompression"));
    let processed =
        compress_image_if_needed(&file_name, &payload.mime_type, &bytes, enable_compression);
    let object_name = build_object_name(&processed.file_name);

    let result = match provider {
        ResourceProvider::Local(config) => {
            upload_to_local(&app, &config, &object_name, &processed.bytes)
        }
        ResourceProvider::Github(config) => {
            upload_to_github(&config, &object_name, &processed).await
        }
        ResourceProvider::AliOss(config) => {
            upload_to_alioss(&config, &object_name, &processed).await
        }
        ResourceProvider::S3(config) => upload_to_s3(&config, &object_name, &processed).await,
        ResourceProvider::WebDav(config) => {
            upload_to_webdav(&config, &object_name, &processed).await
        }
    };

    match &result {
        Ok(url) => println!("[upload_resource] done: {}", url),
        Err(error) => println!(
            "[upload_resource] failed: {}",
            summarize_resource_error(error)
        ),
    }
    result.map_err(format_error)
}

/// 读取 .editor 内的资源文件并以 base64 返回。
/// Android 的 asset protocol 存在无法加载图片的官方未决缺陷（tauri#12364），
/// raw response 亦不可靠（tauri#10573），统一 base64 字符串 + 前端 blob URL
#[tauri::command]
pub fn read_resource_bytes(app: AppHandle, path: String) -> Result<String, String> {
    let app_dir = resolve_app_dir(&app).and_then(|dir| {
        dir.canonicalize()
            .map_err(|e| format!("RESOURCE_READ_FAILED: {e}"))
    })?;
    let canonical = std::path::Path::new(&path)
        .canonicalize()
        .map_err(|e| format!("RESOURCE_READ_FAILED: 路径无效: {e}"))?;
    if !canonical.starts_with(&app_dir) {
        return Err("RESOURCE_READ_FAILED: 路径超出 .editor 范围".to_string());
    }
    let bytes = fs::read(&canonical).map_err(|e| format!("RESOURCE_READ_FAILED: 读取失败: {e}"))?;
    println!(
        "[read_resource_bytes] {} -> {} bytes",
        canonical.display(),
        bytes.len()
    );
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}
