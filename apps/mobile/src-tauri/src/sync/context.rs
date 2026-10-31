use std::path::PathBuf;

use tauri::AppHandle;

use crate::setting::{
    get_active_database_name, get_database_version, load_or_init_setting, resolve_database_path,
};

use super::error::AppError;

pub(crate) use crate::plugin_provider::PluginProvider as SyncProvider;

#[derive(Debug, Clone)]
pub(crate) struct SyncContext {
    pub(crate) provider: SyncProvider,
    pub(crate) database_name: String,
    pub(crate) local_version: u64,
    pub(crate) database_path: PathBuf,
    pub(crate) version_object_name: String,
}

pub(crate) fn build_sync_context(app: &AppHandle) -> Result<SyncContext, AppError> {
    build_sync_context_for(app, None)
}

/// `provider_override` 只用于探测：按指定服务解析配置，不改写 setting.json 的 `sync.active`
pub(crate) fn build_sync_context_for(
    app: &AppHandle,
    provider_override: Option<&str>,
) -> Result<SyncContext, AppError> {
    let setting = load_or_init_setting(app).map_err(|err| {
        AppError::new("SETTING_INVALID", format!("读取 setting.json 失败: {err}"))
    })?;
    let provider = SyncProvider::from_setting(app, &setting, "sync", provider_override)
        .map(SyncProvider::with_transfer_retries)
        .map_err(|error| AppError::new("SYNC_CONFIG_MISSING", error))?;
    let database_name = get_active_database_name(&setting);
    let local_version = get_database_version(&setting, &database_name);
    let database_path = resolve_database_path(app, &database_name)
        .map_err(|err| AppError::new("DB_OPEN_FAILED", format!("数据库路径解析失败: {err}")))?;
    Ok(SyncContext {
        provider,
        database_name: database_name.clone(),
        local_version,
        database_path,
        version_object_name: crate::chunked_sync::database_version_object(&database_name),
    })
}

pub(crate) fn build_resource_provider(app: &AppHandle) -> Result<SyncProvider, AppError> {
    let setting = load_or_init_setting(app)
        .map_err(|e| AppError::new("SETTING_INVALID", format!("读取 setting.json 失败: {e}")))?;
    SyncProvider::from_setting(app, &setting, "sync", None)
        .map_err(|error| AppError::new("RESOURCE_SYNC_CONFIG_MISSING", error))
}
