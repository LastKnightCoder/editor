use std::time::{SystemTime, UNIX_EPOCH};

use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use sha1::{Digest, Sha1};

use crate::models::{ResourceSyncActionResponse, ResourceSyncProgress, SyncActionResponse};

use super::error::AppError;

pub(crate) const S3_OPERATION_TIMEOUT_SECS: u64 = 12;
pub(crate) const SYNC_CHECK_TIMEOUT_SECS: u64 = 30;
pub(crate) const RESOURCE_PREFIX: &str = "resources";
pub(crate) const STATUS_DIR_NAME: &str = "sync-status";
pub(crate) const DEFAULT_RESOURCE_SYNC_RETRY_COUNT: u32 = 3;
pub(crate) const DEFAULT_RESOURCE_SYNC_RETRY_DELAY_MS: u64 = 1_000;
pub(crate) const DEFAULT_RESOURCE_SYNC_RETRY_BACKOFF_MULTIPLIER: u64 = 2;
pub(crate) const DEFAULT_DB_NAME: &str = "data.db";

#[derive(Debug, Clone)]
pub(crate) struct ResourceSyncRateLimit {
    pub(crate) retry_count: u32,
    pub(crate) retry_delay_ms: u64,
    pub(crate) retry_backoff_multiplier: u64,
}

pub(crate) fn response_ok(
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

pub(crate) fn response_err(
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

pub(crate) fn resource_response_ok(message: &str) -> ResourceSyncActionResponse {
    ResourceSyncActionResponse {
        ok: true,
        code: None,
        message: message.to_string(),
    }
}

pub(crate) fn resource_response_err(error: AppError) -> ResourceSyncActionResponse {
    ResourceSyncActionResponse {
        ok: false,
        code: Some(error.code),
        message: error.message,
    }
}

pub(crate) fn empty_resource_progress() -> ResourceSyncProgress {
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

pub(crate) fn now_millis_u64() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub(crate) fn join_path(prefix: &str, file_name: &str) -> String {
    let normalized_prefix = prefix.trim().trim_matches('/');
    let normalized_file = file_name.trim().trim_start_matches('/');
    if normalized_prefix.is_empty() {
        normalized_file.to_string()
    } else {
        format!("{normalized_prefix}/{normalized_file}")
    }
}

pub(crate) fn encode_path_keep_slashes(value: &str) -> String {
    utf8_percent_encode(value, NON_ALPHANUMERIC)
        .to_string()
        .replace("%2F", "/")
}

pub(crate) fn short_hash(value: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(value.as_bytes());
    let digest = format!("{:x}", hasher.finalize());
    digest.chars().take(8).collect()
}

pub(crate) fn normalize_remote_path(path: &str) -> String {
    path.trim().replace('\\', "/").trim_matches('/').to_string()
}

pub(crate) fn strip_base_prefix(full_path: &str, base_prefix: &str) -> String {
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

pub(crate) fn file_name_from_path(path: &str) -> String {
    normalize_remote_path(path)
        .split('/')
        .filter(|v| !v.is_empty())
        .last()
        .unwrap_or_default()
        .to_string()
}

pub(crate) fn preview_text(value: &str, max_chars: usize) -> String {
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

#[cfg(test)]
mod tests {
    use super::join_path;

    #[test]
    fn join_path_handles_slashes() {
        assert_eq!(join_path("", "a.txt"), "a.txt");
        assert_eq!(join_path("root/", "/a.txt"), "root/a.txt");
        assert_eq!(join_path("/root/sub/", "a.txt"), "root/sub/a.txt");
    }
}
