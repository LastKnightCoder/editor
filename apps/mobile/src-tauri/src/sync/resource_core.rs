use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use tauri::AppHandle;

use crate::models::{
    ResourceFileSyncStatus, ResourceSyncProgress, ResourceSyncStatus, ResourceSyncStatusFile,
};
use crate::setting::resolve_app_dir;

use super::common::{empty_resource_progress, now_millis_u64, RESOURCE_PREFIX, STATUS_DIR_NAME};
use super::context::SyncProvider;
use super::error::AppError;
use super::providers::{
    list_remote_resources, provider_status_file_name, sync_provider_name, sync_provider_rate_limit,
    ResourceRemoteFileInfo,
};

#[derive(Debug, Clone)]
pub(crate) struct ResourceSyncTask {
    name: String,
    direction: String,
    local_path: PathBuf,
    remote_path: String,
    size: u64,
}

#[derive(Debug, Clone)]
pub(crate) struct ResourceSyncState {
    pub(crate) running: bool,
    pub(crate) cancel_requested: bool,
    pub(crate) progress: ResourceSyncProgress,
    pub(crate) status_file: Option<ResourceSyncStatusFile>,
}

#[derive(Debug, Clone)]
struct ResourceStatusFileMeta {
    path: PathBuf,
    file: ResourceSyncStatusFile,
}

static RESOURCE_SYNC_RUNTIME: OnceLock<Mutex<ResourceSyncState>> = OnceLock::new();

pub(crate) fn resource_runtime() -> &'static Mutex<ResourceSyncState> {
    RESOURCE_SYNC_RUNTIME.get_or_init(|| {
        Mutex::new(ResourceSyncState {
            running: false,
            cancel_requested: false,
            progress: empty_resource_progress(),
            status_file: None,
        })
    })
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

fn scan_local_resource_files(
    resources_dir: &Path,
) -> Result<Vec<(String, PathBuf, u64)>, AppError> {
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
        // 缩略图是本地派生缓存（由原图随时可重建），不参与云同步
        if name.ends_with(crate::resource_upload::THUMB_SUFFIX) {
            continue;
        }
        let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        files.push((name, path, size));
    }
    Ok(files)
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
) -> Result<
    (
        Vec<ResourceSyncTask>,
        HashMap<String, ResourceFileSyncStatus>,
    ),
    AppError,
> {
    let resources_dir = resource_local_dir(app)?;
    let local_files = scan_local_resource_files(&resources_dir)?;
    let remote_files = list_remote_resources(provider, &format!("{RESOURCE_PREFIX}/")).await?;
    let mut remote_map: HashMap<String, ResourceRemoteFileInfo> = HashMap::new();
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
        let status =
            init_resource_file_status(previous_statuses.get(&name), "download", remote.size);
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

pub(crate) fn update_resource_runtime_snapshot(
    progress: ResourceSyncProgress,
    status_file: Option<ResourceSyncStatusFile>,
) {
    let mut runtime = resource_runtime().lock().unwrap();
    runtime.progress = progress;
    runtime.status_file = status_file;
}

pub(crate) fn should_cancel_resource_sync() -> bool {
    let runtime = resource_runtime().lock().unwrap();
    runtime.cancel_requested
}

pub(crate) fn set_resource_sync_running(running: bool) {
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

pub(crate) async fn run_resource_sync_job(
    app: AppHandle,
    provider: SyncProvider,
    retry_failed_only: bool,
) -> Result<(), AppError> {
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
        let previous = statuses
            .get(&task.name)
            .cloned()
            .unwrap_or(ResourceFileSyncStatus {
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

pub(crate) async fn refresh_resource_status(
    app: &AppHandle,
    provider: &SyncProvider,
) -> Result<ResourceSyncStatusFile, AppError> {
    let mut status_meta = load_resource_status_meta(app, provider)?;
    let previous = status_meta.file.files.clone();
    let (_tasks, statuses) = build_resource_sync_plan(app, provider, &previous, None).await?;
    persist_resource_status_meta(&mut status_meta, statuses.clone())?;

    let mut progress = empty_resource_progress();
    progress.status = "idle".to_string();
    recalculate_resource_progress(&mut progress, &statuses);
    update_resource_runtime_snapshot(progress, Some(status_meta.file.clone()));
    Ok(status_meta.file)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::models::{ResourceFileSyncStatus, ResourceSyncStatus};

    use super::normalize_resource_status_files;

    #[test]
    fn normalize_resource_status_files_turns_syncing_into_pending() {
        let mut statuses = HashMap::new();
        statuses.insert(
            "a".to_string(),
            ResourceFileSyncStatus {
                sync_status: ResourceSyncStatus::Syncing,
                sync_direction: Some("upload".to_string()),
                file_size: Some(1),
                last_sync_time: None,
                error_message: Some("x".to_string()),
                retry_count: 0,
            },
        );
        normalize_resource_status_files(&mut statuses);
        let status = statuses.get("a").expect("status should exist");
        assert_eq!(status.sync_status, ResourceSyncStatus::Pending);
        assert!(status.error_message.is_none());
    }
}
