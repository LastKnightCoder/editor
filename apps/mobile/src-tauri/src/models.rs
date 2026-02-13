use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseItem {
    pub name: String,
    pub version: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapResponse {
    pub app_dir: String,
    pub setting_path: String,
    pub active_database: String,
    pub databases: Vec<DatabaseItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseListResponse {
    pub active_database: String,
    pub databases: Vec<DatabaseItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveDatabaseResponse {
    pub active_database: String,
    pub created: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardListItem {
    pub id: i64,
    pub content_id: i64,
    pub update_time: i64,
    pub category: String,
    pub tags: Vec<String>,
    pub excerpt: String,
    pub content: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardDetailResponse {
    pub id: i64,
    pub content_id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub category: String,
    pub tags: Vec<String>,
    pub links: Vec<i64>,
    pub content: serde_json::Value,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentCardMeta {
    pub id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub category: String,
    pub tags: Vec<String>,
    pub links: Vec<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentDetailResponse {
    pub content_id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub content: serde_json::Value,
    pub count: i64,
    pub card: Option<ContentCardMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardsOverviewResponse {
    pub total: u64,
    pub page: u32,
    pub page_size: u32,
    pub query: String,
    pub category: String,
    pub search_mode: String,
    pub items: Vec<CardListItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncVersionResponse {
    pub database_name: String,
    pub local_version: u64,
    pub remote_version: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncActionResponse {
    pub ok: bool,
    pub code: Option<String>,
    pub message: String,
    pub database_name: String,
    pub local_version: u64,
    pub remote_version: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseSchemaStatusResponse {
    pub database_name: String,
    pub main_schema_version: i64,
    pub index_schema_version: i64,
    pub main_schema_hash: String,
    pub index_schema_hash: String,
    pub main_table_count: i64,
    pub index_table_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ResourceSyncStatus {
    Pending,
    Syncing,
    Synced,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceFileSyncStatus {
    pub sync_status: ResourceSyncStatus,
    pub sync_direction: Option<String>,
    pub file_size: Option<u64>,
    pub last_sync_time: Option<u64>,
    pub error_message: Option<String>,
    pub retry_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSyncStatusFile {
    pub provider: String,
    pub config: HashMap<String, String>,
    pub last_sync_time: Option<u64>,
    pub files: HashMap<String, ResourceFileSyncStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSyncProgress {
    pub total_files: u64,
    pub processed_files: u64,
    pub current_file: Option<String>,
    pub status: String,
    pub upload_count: u64,
    pub download_count: u64,
    pub skipped_count: u64,
    pub error_count: u64,
    pub start_time: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSyncActionResponse {
    pub ok: bool,
    pub code: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingWriteResponse {
    pub ok: bool,
    pub code: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubUserInfoResponse {
    pub name: String,
    pub email: String,
}
