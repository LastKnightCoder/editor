use std::path::PathBuf;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::AppHandle;

use crate::models::{SyncActionResponse, SyncVersionResponse};
use crate::plugin_files::TemporaryFile;
use crate::setting::{set_database_version, update_setting_value};

use super::common::{response_err, response_ok, DEFAULT_DB_NAME, SYNC_CHECK_TIMEOUT_SECS};
use super::context::{build_sync_context, build_sync_context_for, SyncContext, SyncProvider};
use super::error::AppError;

/// 云端版本文件 `{version, updatedAt}`；不存在时视为 0（尚未上传）。
async fn read_remote_version(provider: &SyncProvider, object: &str) -> Result<u64, AppError> {
    if !provider.exists(object).await? {
        return Ok(0);
    }
    let info: Value = serde_json::from_slice(&provider.download(object).await?).map_err(|e| {
        AppError::new(
            "REMOTE_VERSION_PARSE_FAILED",
            format!("云端版本文件解析失败: {e}"),
        )
    })?;
    Ok(info["version"].as_u64().unwrap_or(0))
}

fn version_payload(version: u64) -> Vec<u8> {
    serde_json::to_vec(&json!({
        "version": version,
        "updatedAt": chrono::Utc::now().timestamp_millis(),
    }))
    .expect("版本信息可序列化")
}

fn save_local_version(app: &AppHandle, ctx: &SyncContext, version: u64) -> Result<(), AppError> {
    update_setting_value(app, |setting| {
        set_database_version(setting, &ctx.database_name, version)
    })
    .map_err(|err| AppError::new("SETTING_INVALID", format!("更新本地版本失败: {err}")))
}

/// WebView IPC（JavaBridge）线程栈很小，同步命令的 async 状态机会捕获
/// SyncContext、provider 配置等大量变量；胖 future 在该线程按值穿过 tauri
/// 的 respond 链会栈溢出（SIGSEGV 闪退）。命令只留薄壳，完整流程
/// 移入 spawn_blocking 的大栈线程执行。
#[tauri::command]
pub async fn sync_check_versions(
    app: AppHandle,
    provider: Option<String>,
) -> Result<SyncVersionResponse, String> {
    let handle = tauri::async_runtime::handle();
    tauri::async_runtime::spawn_blocking(move || {
        handle.block_on(sync_check_versions_impl(app, provider))
    })
    .await
    .map_err(|err| format!("SYNC_INTERNAL:同步任务异常退出: {err}"))?
}

async fn sync_check_versions_impl(
    app: AppHandle,
    provider: Option<String>,
) -> Result<SyncVersionResponse, String> {
    let ctx = build_sync_context_for(&app, provider.as_deref())
        .map_err(|e| format!("{}:{}", e.code, e.message))?;
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

/// 把本机库文件覆盖到云端固定位置，版本号最后写入；云端比本机新时由界面先确认。
async fn sync_upload_database_impl(app: AppHandle) -> SyncActionResponse {
    let ctx = match build_sync_context(&app) {
        Ok(ctx) => ctx,
        Err(error) => return response_err(DEFAULT_DB_NAME, 0, 0, error),
    };
    let fail = |remote: u64, error: AppError| {
        response_err(&ctx.database_name, ctx.local_version, remote, error)
    };
    let remote_version = match read_remote_version(&ctx.provider, &ctx.version_object_name).await {
        Ok(version) => version,
        Err(error) => return fail(0, error),
    };
    if !ctx.database_path.exists() {
        return fail(
            remote_version,
            AppError::new("DB_OPEN_FAILED", "本地数据库文件不存在"),
        );
    }
    let snapshot = match TemporaryFile::new(&app)
        .and_then(|snapshot| create_database_snapshot(&ctx.database_path, snapshot))
    {
        Ok(file) => file,
        Err(err) => {
            return fail(
                remote_version,
                AppError::new("DB_OPEN_FAILED", format!("读取本地数据库失败: {err}")),
            )
        }
    };
    let data_object = crate::chunked_sync::database_file_object(&ctx.database_name);
    if let Err(error) = ctx
        .provider
        .upload_chunked(&data_object, &ctx.database_name, &snapshot.path)
        .await
    {
        return fail(remote_version, AppError::new("SYNC_UPLOAD_FAILED", error));
    }
    let next_version = ctx.local_version.max(remote_version) + 1;
    if let Err(error) = ctx
        .provider
        .upload(&ctx.version_object_name, &version_payload(next_version))
        .await
    {
        return fail(remote_version, error);
    }
    if let Err(error) = save_local_version(&app, &ctx, next_version) {
        return fail(next_version, error);
    }
    response_ok(
        &ctx.database_name,
        next_version,
        next_version,
        "上传成功，版本已更新",
    )
}

fn create_database_snapshot(
    path: &PathBuf,
    snapshot: TemporaryFile,
) -> Result<TemporaryFile, String> {
    let conn = rusqlite::Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute("VACUUM INTO ?1", [snapshot.path.to_string_lossy().as_ref()])
        .map_err(|e| e.to_string())?;
    Ok(snapshot)
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

/// 下载云端库文件覆盖本机，覆盖前旧库复制进 backup/；本机比云端新时由界面先确认。
async fn sync_download_database_impl(app: AppHandle) -> SyncActionResponse {
    let ctx = match build_sync_context(&app) {
        Ok(ctx) => ctx,
        Err(error) => return response_err(DEFAULT_DB_NAME, 0, 0, error),
    };
    let fail = |remote: u64, error: AppError| {
        response_err(&ctx.database_name, ctx.local_version, remote, error)
    };
    let remote_version = match read_remote_version(&ctx.provider, &ctx.version_object_name).await {
        Ok(version) => version,
        Err(error) => return fail(0, error),
    };
    if remote_version == 0 {
        return fail(
            0,
            AppError::new(
                "REMOTE_FILE_NOT_FOUND",
                "云端还没有这个数据库，请先在另一台设备上传",
            ),
        );
    }
    let data_object = crate::chunked_sync::database_file_object(&ctx.database_name);
    let downloaded = match ctx.provider.download_chunked(&data_object).await {
        Ok(file) => file,
        Err(error) => return fail(remote_version, AppError::new("SYNC_DOWNLOAD_FAILED", error)),
    };
    if let Err(err) = crate::database::install_download(
        &app,
        &ctx.database_name,
        ctx.local_version,
        &downloaded.path,
    ) {
        return fail(
            remote_version,
            AppError::new("SYNC_INSTALL_FAILED", format!("替换本地数据库失败: {err}")),
        );
    }
    // 主库已被远端内容替换，本地索引的 ID 空间整体失效，重置后按需全量重建
    if let Err(err) = crate::database::reset_index_database(&app, &ctx.database_name) {
        eprintln!("[sync] reset index database failed: {}", err);
    }
    if let Err(error) = save_local_version(&app, &ctx, remote_version) {
        return fail(remote_version, error);
    }
    crate::database::trigger_reconcile_for_database(&app, &ctx.database_name);
    response_ok(
        &ctx.database_name,
        remote_version,
        remote_version,
        "下载成功，数据库已更新",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn large_database_snapshot_stays_on_disk() {
        let dir = std::env::temp_dir().join(format!("tau-large-snapshot-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("large.db");
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE large(payload BLOB);").unwrap();
        let length = 129_i64 * 1024 * 1024;
        conn.execute("INSERT INTO large VALUES(zeroblob(?1))", [length])
            .unwrap();
        let snapshot =
            create_database_snapshot(&path, TemporaryFile::new_in(&dir).unwrap()).unwrap();
        assert!(fs::metadata(&snapshot.path).unwrap().len() > 128 * 1024 * 1024);
        let check = rusqlite::Connection::open(&snapshot.path).unwrap();
        assert_eq!(
            check
                .query_row("SELECT length(payload) FROM large", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            length
        );
        drop(check);
        drop(conn);
        drop(snapshot);
        assert_eq!(
            fs::read_dir(&dir)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry
                    .path()
                    .extension()
                    .is_some_and(|ext| ext == "transfer"))
                .count(),
            0
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn upload_snapshot_includes_committed_wal_records() {
        let dir = std::env::temp_dir().join(format!("tau-snapshot-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("data.db");
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES('committed');").unwrap();
        let file = create_database_snapshot(&path, TemporaryFile::new_in(&dir).unwrap()).unwrap();
        let snapshot = rusqlite::Connection::open(&file.path).unwrap();
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
