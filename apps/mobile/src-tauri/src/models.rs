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
    pub create_time: i64,
    pub update_time: i64,
    pub category: String,
    pub tags: Vec<String>,
    pub links: Vec<String>,
    pub content: serde_json::Value,
    pub count: i64,
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
pub struct SettingWriteResponse {
    pub ok: bool,
    pub code: Option<String>,
    pub message: String,
}
