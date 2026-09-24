use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use tauri::AppHandle;

use crate::database::DATA_MODEL_VERSION;
use crate::models::{SyncActionResponse, SyncVersionResponse};
use crate::setting::{resolve_app_dir, save_setting_value, set_database_version};

use super::common::{response_err, response_ok, DEFAULT_DB_NAME, SYNC_CHECK_TIMEOUT_SECS};
use super::context::{build_sync_context, SyncProvider};
use super::error::AppError;

async fn read_remote_version(
    provider: &SyncProvider,
    version_object_name: &str,
) -> Result<u64, AppError> {
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
    if let Some(version) = parsed.get("dataModelVersion") {
        if version.as_u64().is_none_or(|v| v > DATA_MODEL_VERSION) {
            return Err(AppError::new(
                "DB_MODEL_INCOMPATIBLE",
                "远端数据库模型不受支持，请升级全部客户端",
            ));
        }
    }
    parsed
        .get("version")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| {
            AppError::new(
                "REMOTE_VERSION_PARSE_FAILED",
                "远端版本文件缺少 version 字段",
            )
        })
}

fn version_payload(version: u64) -> Vec<u8> {
    serde_json::to_vec(&json!({ "version": version, "dataModelVersion": DATA_MODEL_VERSION }))
        .unwrap_or_else(|_| {
            format!("{{\"version\":{version},\"dataModelVersion\":{DATA_MODEL_VERSION}}}")
                .into_bytes()
        })
}

/// WebView IPC（JavaBridge）线程栈很小，同步命令的 async 状态机会捕获
/// SyncContext、provider 配置等大量变量；胖 future 在该线程按值穿过 tauri
/// 的 respond 链会栈溢出（SIGSEGV 闪退）。命令只留薄壳，完整流程
/// 移入 spawn_blocking 的大栈线程执行。
#[tauri::command]
pub async fn sync_check_versions(app: AppHandle) -> Result<SyncVersionResponse, String> {
    let handle = tauri::async_runtime::handle();
    tauri::async_runtime::spawn_blocking(move || handle.block_on(sync_check_versions_impl(app)))
        .await
        .map_err(|err| format!("SYNC_INTERNAL:同步任务异常退出: {err}"))?
}

async fn sync_check_versions_impl(app: AppHandle) -> Result<SyncVersionResponse, String> {
    let ctx = build_sync_context(&app).map_err(|e| format!("{}:{}", e.code, e.message))?;
    let remote_version = tokio::time::timeout(
        Duration::from_secs(SYNC_CHECK_TIMEOUT_SECS),
        read_remote_version(&ctx.provider, &ctx.version_object_name),
    )
    .await
    .map_err(|_| {
        format!(
            "SYNC_CHECK_FAILED:同步状态刷新超时（{} 秒），请检查网络、Endpoint 或 URL 风格",
            SYNC_CHECK_TIMEOUT_SECS
        )
    })?
    .map_err(|e| format!("{}:{}", e.code, e.message))?;
    Ok(SyncVersionResponse {
        database_name: ctx.database_name,
        local_version: ctx.local_version,
        remote_version,
    })
}

#[tauri::command]
pub async fn sync_upload_database(app: AppHandle) -> SyncActionResponse {
    let handle = tauri::async_runtime::handle();
    match tauri::async_runtime::spawn_blocking(move || {
        handle.block_on(sync_upload_database_impl(app))
    })
    .await
    {
        Ok(response) => response,
        Err(err) => response_err(
            DEFAULT_DB_NAME,
            0,
            0,
            AppError::new("SYNC_INTERNAL", format!("同步任务异常退出: {err}")),
        ),
    }
}

async fn sync_upload_database_impl(app: AppHandle) -> SyncActionResponse {
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

    if let Err(err) = crate::database::ensure_database_file(&app, &ctx.database_name) {
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            AppError::new(
                "DB_SCHEMA_MIGRATION_FAILED",
                format!("数据库升级失败: {err}"),
            ),
        );
    }

    let db_bytes = match read_database_snapshot(&ctx.database_path) {
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
    if let Err(err) = publish_snapshot(
        ctx.provider.upload(&ctx.data_object_name, &db_bytes),
        upload_version(
            &ctx.provider,
            &ctx.version_object_name,
            &next_version_payload,
        ),
    )
    .await
    {
        return response_err(&ctx.database_name, ctx.local_version, remote_version, err);
    }

    set_database_version(&mut ctx.setting, &ctx.database_name, next_version);
    if let Err(err) = save_setting_value(&app, &ctx.setting) {
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            AppError::new(
                "SETTING_INVALID",
                format!("更新本地 setting.json 失败: {err}"),
            ),
        );
    }

    response_ok(
        &ctx.database_name,
        next_version,
        next_version,
        "上传成功，版本已更新",
    )
}

async fn publish_snapshot(
    data: impl std::future::Future<Output = Result<(), AppError>>,
    version: impl std::future::Future<Output = Result<(), AppError>>,
) -> Result<(), AppError> {
    data.await?;
    version.await
}

async fn upload_version(
    provider: &SyncProvider,
    object_name: &str,
    payload: &[u8],
) -> Result<(), AppError> {
    let mut last_error = None;
    for attempt in 0..3 {
        match provider.upload(object_name, payload).await {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = Some(error);
                if attempt < 2 {
                    tokio::time::sleep(std::time::Duration::from_millis(250 * (attempt + 1))).await;
                }
            }
        }
    }
    Err(last_error.expect("版本上传至少执行一次"))
}

fn read_database_snapshot(path: &PathBuf) -> Result<Vec<u8>, String> {
    let snapshot = path.with_extension(format!("db.{}.upload", uuid::Uuid::new_v4()));
    let result = (|| {
        let conn = rusqlite::Connection::open(path).map_err(|e| e.to_string())?;
        conn.execute("VACUUM INTO ?1", [snapshot.to_string_lossy().as_ref()])
            .map_err(|e| e.to_string())?;
        fs::read(&snapshot).map_err(|e| e.to_string())
    })();
    let _ = fs::remove_file(snapshot);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[tokio::test]
    async fn failed_data_upload_never_publishes_version() {
        let calls = RefCell::new(Vec::new());
        let result = publish_snapshot(
            async {
                calls.borrow_mut().push("data");
                Err(AppError::new("FAILED", "offline"))
            },
            async {
                calls.borrow_mut().push("version");
                Ok(())
            },
        )
        .await;
        assert!(result.is_err());
        assert_eq!(*calls.borrow(), vec!["data"]);
    }

    #[tokio::test]
    async fn version_is_published_after_data_and_failure_is_propagated() {
        let calls = RefCell::new(Vec::new());
        let result = publish_snapshot(
            async {
                calls.borrow_mut().push("data");
                Ok(())
            },
            async {
                calls.borrow_mut().push("version");
                Err(AppError::new("FAILED", "version offline"))
            },
        )
        .await;
        assert!(result.is_err());
        assert_eq!(*calls.borrow(), vec!["data", "version"]);
    }

    #[test]
    fn replacement_failure_restores_original_file() {
        let dir = std::env::temp_dir().join(format!("tau-replace-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let original = dir.join("data.db");
        fs::write(&original, b"original").unwrap();
        assert!(replace_database_file(&dir.join("missing.db"), &original).is_err());
        assert_eq!(fs::read(&original).unwrap(), b"original");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn upload_snapshot_includes_committed_wal_records() {
        let dir = std::env::temp_dir().join(format!("tau-snapshot-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("data.db");
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES('committed');").unwrap();
        let bytes = read_database_snapshot(&path).unwrap();
        let snapshot_path = dir.join("snapshot.db");
        fs::write(&snapshot_path, bytes).unwrap();
        let snapshot = rusqlite::Connection::open(snapshot_path).unwrap();
        assert_eq!(
            snapshot
                .query_row("SELECT value FROM sample", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "committed"
        );
        drop(snapshot);
        drop(conn);
        fs::remove_dir_all(dir).unwrap();
    }
}

fn replace_database_file(download: &PathBuf, destination: &PathBuf) -> std::io::Result<()> {
    let previous = destination.with_extension(format!("db.{}.previous", uuid::Uuid::new_v4()));
    let existed = destination.exists();
    if existed {
        fs::rename(destination, &previous)?;
    }
    if let Err(error) = fs::rename(download, destination) {
        if existed {
            fs::rename(&previous, destination)?;
        }
        return Err(error);
    }
    if existed {
        let _ = fs::remove_file(previous);
    }
    Ok(())
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
    let handle = tauri::async_runtime::handle();
    match tauri::async_runtime::spawn_blocking(move || {
        handle.block_on(sync_download_database_impl(app))
    })
    .await
    {
        Ok(response) => response,
        Err(err) => response_err(
            DEFAULT_DB_NAME,
            0,
            0,
            AppError::new("SYNC_INTERNAL", format!("同步任务异常退出: {err}")),
        ),
    }
}

async fn sync_download_database_impl(app: AppHandle) -> SyncActionResponse {
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
            "version-{}-{}-{}-{}",
            ctx.local_version,
            now,
            uuid::Uuid::new_v4(),
            ctx.database_name
        );
        let backup_path = backup_dir.join(backup_name);
        let backup = rusqlite::Connection::open(&ctx.database_path).and_then(|conn| {
            conn.execute("VACUUM INTO ?1", [backup_path.to_string_lossy().as_ref()])
        });
        if let Err(err) = backup {
            return response_err(
                &ctx.database_name,
                ctx.local_version,
                remote_version,
                AppError::new("SYNC_DOWNLOAD_FAILED", format!("备份数据库失败: {err}")),
            );
        }
    }

    let tmp_path = ctx.database_path.with_file_name(format!(
        "{}.{}.download.tmp",
        ctx.database_name,
        uuid::Uuid::new_v4()
    ));
    if let Err(err) = fs::write(&tmp_path, downloaded) {
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            AppError::new("SYNC_DOWNLOAD_FAILED", format!("写入临时文件失败: {err}")),
        );
    }
    if let Err(err) = crate::database::validate_download(&tmp_path) {
        let _ = fs::remove_file(&tmp_path);
        remove_wal_shm_files(&tmp_path);
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            AppError::new(
                "DB_SCHEMA_MIGRATION_FAILED",
                format!("下载库校验或升级失败，已保留本地数据库: {err}"),
            ),
        );
    }
    if ctx.database_path.exists() {
        if let Err(err) = crate::database::force_checkpoint_database(&app, &ctx.database_name) {
            let _ = fs::remove_file(&tmp_path);
            return response_err(
                &ctx.database_name,
                ctx.local_version,
                remote_version,
                AppError::new("DB_CHECKPOINT_FAILED", err),
            );
        }
    }
    if let Err(err) = replace_database_file(&tmp_path, &ctx.database_path) {
        let _ = fs::remove_file(&tmp_path);
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            AppError::new("SYNC_DOWNLOAD_FAILED", format!("替换数据库文件失败: {err}")),
        );
    }
    // 替换后的文件与缓存连接指向不同内容，必须丢弃；同名库的名字比对无法感知
    crate::database::invalidate_cached_connection();
    // 主库已被远端内容替换，本地索引的 ID 空间整体失效，重置后按需全量重建
    if let Err(err) = crate::database::reset_index_database(&app, &ctx.database_name) {
        eprintln!("[sync] reset index database failed: {}", err);
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

    crate::database::trigger_reconcile_for_database(&app, &ctx.database_name);

    response_ok(
        &ctx.database_name,
        remote_version,
        remote_version,
        "下载成功，数据库已更新",
    )
}
