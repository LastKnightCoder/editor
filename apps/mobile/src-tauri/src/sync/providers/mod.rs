use std::collections::HashMap;

use super::common::{
    short_hash, ResourceSyncRateLimit, DEFAULT_RESOURCE_SYNC_RETRY_BACKOFF_MULTIPLIER,
    DEFAULT_RESOURCE_SYNC_RETRY_COUNT, DEFAULT_RESOURCE_SYNC_RETRY_DELAY_MS,
};
use super::context::SyncProvider;
use super::error::AppError;

mod alioss;
mod github;
mod s3;
mod webdav;

#[derive(Debug, Clone)]
pub(crate) struct ResourceRemoteFileInfo {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) size: u64,
}

impl SyncProvider {
    pub(crate) async fn exists(&self, object_name: &str) -> Result<bool, AppError> {
        match self {
            SyncProvider::WebDav(config) => webdav::webdav_exists(config, object_name).await,
            SyncProvider::AliOss(config) => alioss::alioss_exists(config, object_name).await,
            SyncProvider::Github(config) => github::github_exists(config, object_name).await,
            SyncProvider::S3(config) => s3::s3_exists(config, object_name).await,
        }
    }

    pub(crate) async fn download(&self, object_name: &str) -> Result<Vec<u8>, AppError> {
        match self {
            SyncProvider::WebDav(config) => webdav::webdav_download(config, object_name).await,
            SyncProvider::AliOss(config) => alioss::alioss_download(config, object_name).await,
            SyncProvider::Github(config) => github::github_download(config, object_name).await,
            SyncProvider::S3(config) => s3::s3_download(config, object_name).await,
        }
    }

    pub(crate) async fn upload(&self, object_name: &str, content: &[u8]) -> Result<(), AppError> {
        match self {
            SyncProvider::WebDav(config) => {
                webdav::webdav_upload(config, object_name, content).await
            }
            SyncProvider::AliOss(config) => {
                alioss::alioss_upload(config, object_name, content).await
            }
            SyncProvider::Github(config) => {
                github::github_upload(config, object_name, content).await
            }
            SyncProvider::S3(config) => s3::s3_upload(config, object_name, content).await,
        }
    }
}

pub(crate) async fn list_remote_resources(
    provider: &SyncProvider,
    prefix: &str,
) -> Result<Vec<ResourceRemoteFileInfo>, AppError> {
    match provider {
        SyncProvider::AliOss(config) => alioss::list_resources_from_alioss(config, prefix).await,
        SyncProvider::S3(config) => s3::list_resources_from_s3(config, prefix).await,
        SyncProvider::Github(config) => github::list_resources_from_github(config, prefix).await,
        SyncProvider::WebDav(config) => webdav::list_resources_from_webdav(config, prefix).await,
    }
}

pub(crate) fn sync_provider_name(provider: &SyncProvider) -> String {
    match provider {
        SyncProvider::WebDav(_) => "webdav".to_string(),
        SyncProvider::AliOss(_) => "alioss".to_string(),
        SyncProvider::Github(_) => "github".to_string(),
        SyncProvider::S3(_) => "s3".to_string(),
    }
}

pub(crate) fn sync_provider_rate_limit(provider: &SyncProvider) -> ResourceSyncRateLimit {
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

pub(crate) fn provider_status_file_name(
    provider: &SyncProvider,
) -> (String, HashMap<String, String>) {
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
            (format!("webdav-{}-{}.json", host_hash, path_hash), config)
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
