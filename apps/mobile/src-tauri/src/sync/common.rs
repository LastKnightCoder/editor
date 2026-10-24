use std::time::{SystemTime, UNIX_EPOCH};

use crate::models::{ResourceSyncActionResponse, ResourceSyncProgress, SyncActionResponse};

use super::error::AppError;

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
