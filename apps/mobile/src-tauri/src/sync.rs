use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use hmac::{Hmac, Mac};
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde_json::{json, Value};
use sha1::Sha1;
use tauri::AppHandle;

use crate::models::{SyncActionResponse, SyncVersionResponse};
use crate::setting::{
    get_active_database_name, get_database_version, load_or_init_setting, resolve_database_path,
    resolve_app_dir, save_setting_value, set_database_version,
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
enum SyncProvider {
    WebDav(WebDavConfig),
    AliOss(AliOssConfig),
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
                return Err(AppError::new("SYNC_CONFIG_MISSING", "WebDAV 同步配置不完整"));
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
            let access_key_secret = as_string(setting.pointer("/integration/aliOSS/accessKeySecret"));
            let bucket = as_string(setting.pointer("/sync/aliOSS/bucket"));
            let region = as_string(setting.pointer("/sync/aliOSS/region"));
            let path_prefix = as_string(setting.pointer("/sync/aliOSS/path"));
            if access_key_id.is_empty()
                || access_key_secret.is_empty()
                || bucket.is_empty()
                || region.is_empty()
            {
                return Err(AppError::new("SYNC_CONFIG_MISSING", "AliOSS 同步配置不完整"));
            }
            Ok(SyncProvider::AliOss(AliOssConfig {
                access_key_id,
                access_key_secret,
                bucket,
                region,
                path_prefix,
            }))
        }
        _ => Err(AppError::new(
            "SYNC_CONFIG_MISSING",
            "当前仅支持 WebDAV 与 AliOSS 同步",
        )),
    }
}

fn build_sync_context(app: &AppHandle) -> Result<SyncContext, AppError> {
    let setting = load_or_init_setting(app)
        .map_err(|err| AppError::new("SETTING_INVALID", format!("读取 setting.json 失败: {err}")))?;
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
    let base = config.url.trim_end_matches('/');
    let path = webdav_remote_path(&config.path_prefix, object_name);
    format!("{base}{path}")
}

async fn webdav_exists(config: &WebDavConfig, object_name: &str) -> Result<bool, AppError> {
    let url = webdav_url(config, object_name);
    let resp = reqwest::Client::new()
        .head(url)
        .basic_auth(&config.username, Some(&config.password))
        .send()
        .await
        .map_err(|err| AppError::new("SYNC_DOWNLOAD_FAILED", format!("WebDAV 检查文件失败: {err}")))?;
    match resp.status().as_u16() {
        200..=299 => Ok(true),
        404 => Ok(false),
        _ => Err(AppError::new(
            "SYNC_DOWNLOAD_FAILED",
            format!("WebDAV 检查文件返回异常状态: {}", resp.status()),
        )),
    }
}

async fn webdav_download(config: &WebDavConfig, object_name: &str) -> Result<Vec<u8>, AppError> {
    let url = webdav_url(config, object_name);
    let resp = reqwest::Client::new()
        .get(url)
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
            format!("WebDAV 下载返回异常状态: {}", resp.status()),
        ));
    }
    let bytes = resp.bytes().await.map_err(|e| {
        AppError::new("SYNC_DOWNLOAD_FAILED", format!("读取 WebDAV 响应失败: {e}"))
    })?;
    Ok(bytes.to_vec())
}

async fn webdav_upload(
    config: &WebDavConfig,
    object_name: &str,
    content: &[u8],
) -> Result<(), AppError> {
    let url = webdav_url(config, object_name);
    let resp = reqwest::Client::new()
        .put(url)
        .basic_auth(&config.username, Some(&config.password))
        .body(content.to_vec())
        .send()
        .await
        .map_err(|e| AppError::new("SYNC_UPLOAD_FAILED", format!("WebDAV 上传失败: {e}")))?;
    if !resp.status().is_success() {
        return Err(AppError::new(
            "SYNC_UPLOAD_FAILED",
            format!("WebDAV 上传返回异常状态: {}", resp.status()),
        ));
    }
    Ok(())
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
    let resp = reqwest::Client::new()
        .head(url)
        .header("Date", date)
        .header("Authorization", authorization)
        .send()
        .await
        .map_err(|e| AppError::new("SYNC_DOWNLOAD_FAILED", format!("AliOSS HEAD 失败: {e}")))?;
    match resp.status().as_u16() {
        200 => Ok(true),
        404 => Ok(false),
        _ => Err(AppError::new(
            "SYNC_DOWNLOAD_FAILED",
            format!("AliOSS HEAD 返回异常状态: {}", resp.status()),
        )),
    }
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

    let resp = reqwest::Client::new()
        .get(url)
        .header("Date", date)
        .header("Authorization", authorization)
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
            format!("AliOSS 下载返回异常状态: {}", resp.status()),
        ));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::new("SYNC_DOWNLOAD_FAILED", format!("AliOSS 读取响应失败: {e}")))?;
    Ok(bytes.to_vec())
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

    let resp = reqwest::Client::new()
        .put(url)
        .header("Date", date)
        .header("Authorization", authorization)
        .header("Content-Type", content_type)
        .body(content.to_vec())
        .send()
        .await
        .map_err(|e| AppError::new("SYNC_UPLOAD_FAILED", format!("AliOSS 上传失败: {e}")))?;

    if !resp.status().is_success() {
        return Err(AppError::new(
            "SYNC_UPLOAD_FAILED",
            format!("AliOSS 上传返回异常状态: {}", resp.status()),
        ));
    }
    Ok(())
}

impl SyncProvider {
    async fn exists(&self, object_name: &str) -> Result<bool, AppError> {
        match self {
            SyncProvider::WebDav(config) => webdav_exists(config, object_name).await,
            SyncProvider::AliOss(config) => alioss_exists(config, object_name).await,
        }
    }

    async fn download(&self, object_name: &str) -> Result<Vec<u8>, AppError> {
        match self {
            SyncProvider::WebDav(config) => webdav_download(config, object_name).await,
            SyncProvider::AliOss(config) => alioss_download(config, object_name).await,
        }
    }

    async fn upload(&self, object_name: &str, content: &[u8]) -> Result<(), AppError> {
        match self {
            SyncProvider::WebDav(config) => webdav_upload(config, object_name, content).await,
            SyncProvider::AliOss(config) => alioss_upload(config, object_name, content).await,
        }
    }
}

async fn read_remote_version(provider: &SyncProvider, version_object_name: &str) -> Result<u64, AppError> {
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
        .ok_or_else(|| AppError::new("REMOTE_VERSION_PARSE_FAILED", "远端版本文件缺少 version 字段"))
}

fn version_payload(version: u64) -> Vec<u8> {
    serde_json::to_vec(&json!({ "version": version })).unwrap_or_else(|_| b"{\"version\":0}".to_vec())
}

#[tauri::command]
pub async fn sync_check_versions(app: AppHandle) -> Result<SyncVersionResponse, String> {
    let ctx = build_sync_context(&app).map_err(|e| format!("{}:{}", e.code, e.message))?;
    let remote_version = read_remote_version(&ctx.provider, &ctx.version_object_name)
        .await
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
                    format!(
                        "数据库上传失败且版本回滚失败: {}",
                        upload_err.message
                    ),
                ),
            );
        }
        return response_err(&ctx.database_name, ctx.local_version, remote_version, upload_err);
    }

    set_database_version(&mut ctx.setting, &ctx.database_name, next_version);
    if let Err(err) = save_setting_value(&app, &ctx.setting) {
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            AppError::new("SETTING_INVALID", format!("更新本地 setting.json 失败: {err}")),
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
        let backup_name = format!(
            "version-{}-{}-{}",
            remote_version, now, ctx.database_name
        );
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

    response_ok(
        &ctx.database_name,
        remote_version,
        remote_version,
        "下载成功，数据库已更新",
    )
}

const DEFAULT_DB_NAME: &str = "data.db";
