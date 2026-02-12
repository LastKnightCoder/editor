use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use tauri::AppHandle;

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
    serde_json::to_vec(&json!({ "version": version }))
        .unwrap_or_else(|_| b"{\"version\":0}".to_vec())
}

#[tauri::command]
pub async fn sync_check_versions(app: AppHandle) -> Result<SyncVersionResponse, String> {
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
                    format!("数据库上传失败且版本回滚失败: {}", upload_err.message),
                ),
            );
        }
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            upload_err,
        );
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
        let backup_name = format!("version-{}-{}-{}", remote_version, now, ctx.database_name);
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

    crate::database::trigger_reconcile_for_database(&app, &ctx.database_name);

    response_ok(
        &ctx.database_name,
        remote_version,
        remote_version,
        "下载成功，数据库已更新",
    )
}
