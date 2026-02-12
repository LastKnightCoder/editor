use std::path::PathBuf;

use serde_json::Value;
use tauri::AppHandle;

use crate::provider_config::{is_empty_or_http_url, is_http_url, normalize_url_style};
use crate::setting::{
    get_active_database_name, get_database_version, load_or_init_setting, resolve_database_path,
};

use super::error::AppError;

#[derive(Debug, Clone)]
pub(crate) struct WebDavConfig {
    pub(crate) url: String,
    pub(crate) username: String,
    pub(crate) password: String,
    pub(crate) path_prefix: String,
}

#[derive(Debug, Clone)]
pub(crate) struct AliOssConfig {
    pub(crate) access_key_id: String,
    pub(crate) access_key_secret: String,
    pub(crate) bucket: String,
    pub(crate) region: String,
    pub(crate) path_prefix: String,
}

#[derive(Debug, Clone)]
pub(crate) struct GithubConfig {
    pub(crate) token: String,
    pub(crate) owner: String,
    pub(crate) repo: String,
    pub(crate) branch: String,
    pub(crate) path_prefix: String,
    pub(crate) committer_name: String,
    pub(crate) committer_email: String,
}

#[derive(Debug, Clone)]
pub(crate) struct S3Config {
    pub(crate) access_key_id: String,
    pub(crate) secret_access_key: String,
    pub(crate) bucket: String,
    pub(crate) region: String,
    pub(crate) endpoint: String,
    pub(crate) url_style: String,
    pub(crate) path_prefix: String,
}

#[derive(Debug, Clone)]
pub(crate) enum SyncProvider {
    WebDav(WebDavConfig),
    AliOss(AliOssConfig),
    Github(GithubConfig),
    S3(S3Config),
}

#[derive(Debug, Clone)]
pub(crate) struct SyncContext {
    pub(crate) setting: Value,
    pub(crate) provider: SyncProvider,
    pub(crate) database_name: String,
    pub(crate) local_version: u64,
    pub(crate) database_path: PathBuf,
    pub(crate) data_object_name: String,
    pub(crate) version_object_name: String,
}

fn as_string(value: Option<&Value>) -> String {
    value.and_then(|v| v.as_str()).unwrap_or("").to_string()
}

pub(crate) fn parse_sync_provider(setting: &Value) -> Result<SyncProvider, AppError> {
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

pub(crate) fn build_sync_context(app: &AppHandle) -> Result<SyncContext, AppError> {
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

pub(crate) fn build_resource_provider(app: &AppHandle) -> Result<SyncProvider, AppError> {
    let setting = load_or_init_setting(app)
        .map_err(|e| AppError::new("SETTING_INVALID", format!("读取 setting.json 失败: {e}")))?;
    parse_sync_provider(&setting).map_err(|error| {
        if error.code == "SYNC_CONFIG_MISSING" {
            AppError::new("RESOURCE_SYNC_CONFIG_MISSING", error.message)
        } else {
            error
        }
    })
}
