use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::AppHandle;

use crate::models::{SyncActionResponse, SyncVersionResponse};
use crate::plugin_files::TemporaryFile;
use crate::setting::{set_database_version, update_setting_value};

use super::common::{response_err, response_ok, DEFAULT_DB_NAME, SYNC_CHECK_TIMEOUT_SECS};
use super::context::{build_sync_context, build_sync_context_for, SyncProvider};
use super::error::AppError;
fn sync_model_version() -> u64 {
    crate::chunked_sync::protocol().model_version
}

fn validate_remote_metadata(info: &Value) -> Result<(), AppError> {
    let version = info["version"]
        .as_u64()
        .filter(|value| *value <= 9_007_199_254_740_991)
        .ok_or_else(|| AppError::new("REMOTE_VERSION_PARSE_FAILED", "远端版本号无效"))?;
    if version == 0
        && info.get("dataModelVersion").is_none()
        && info.get("databaseObject").is_none()
        && info.get("sessionsObject").is_none()
    {
        return Ok(());
    }
    if info["dataModelVersion"].as_u64() != Some(sync_model_version())
        || !info["databaseObject"]
            .as_str()
            .is_some_and(crate::chunked_sync::valid_snapshot)
        || info.get("sessionsObject").is_some_and(|value| {
            !value
                .as_str()
                .is_some_and(crate::chunked_sync::valid_snapshot)
        })
    {
        return Err(AppError::new(
            "DB_MODEL_INCOMPATIBLE",
            "同步格式不受支持，请确认存储目标和客户端版本",
        ));
    }
    Ok(())
}

async fn read_remote_info(
    provider: &SyncProvider,
    version_object_name: &str,
) -> Result<Value, AppError> {
    let exists = provider.exists(version_object_name).await?;
    let content = if exists {
        provider.download(version_object_name).await?
    } else {
        b"{\"version\":0}".to_vec()
    };
    let mut parsed = serde_json::from_slice::<Value>(&content).map_err(|e| {
        AppError::new(
            "REMOTE_VERSION_PARSE_FAILED",
            format!("远端版本文件 JSON 解析失败: {e}"),
        )
    })?;
    validate_remote_metadata(&parsed)?;
    for depth in 0..10000 {
        let version = parsed["version"]
            .as_u64()
            .ok_or_else(|| AppError::new("REMOTE_VERSION_PARSE_FAILED", "远端版本号无效"))?;
        let object = format!("{version_object_name}.next-{version}");
        if !provider.exists(&object).await? {
            break;
        }
        let next: Value = serde_json::from_slice(&provider.download(&object).await?)
            .map_err(|e| AppError::new("REMOTE_VERSION_PARSE_FAILED", e.to_string()))?;
        validate_remote_metadata(&next)?;
        if next["parentVersion"].as_u64() != Some(version)
            || next["version"].as_u64().is_none_or(|v| v <= version)
            || next["commitId"].as_str().is_none_or(|id| id.is_empty())
        {
            return Err(AppError::new(
                "REMOTE_VERSION_PARSE_FAILED",
                "远端版本链无效",
            ));
        }
        parsed = next;
        if depth == 9999 {
            return Err(AppError::new(
                "REMOTE_VERSION_PARSE_FAILED",
                "远端版本链过长",
            ));
        }
    }
    validate_remote_metadata(&parsed)?;
    Ok(parsed)
}

async fn read_remote_version(provider: &SyncProvider, object: &str) -> Result<u64, AppError> {
    Ok(read_remote_info(provider, object).await?["version"]
        .as_u64()
        .unwrap_or(0))
}

fn snapshot_version_payload(mut info: Value, version: u64, object: &str) -> Vec<u8> {
    info["parentVersion"] = info["version"].clone();
    info["commitId"] = json!(uuid::Uuid::new_v4().to_string());
    info["version"] = json!(version);
    info["dataModelVersion"] = json!(sync_model_version());
    info["databaseObject"] = json!(object);
    serde_json::to_vec(&info).expect("版本信息可序列化")
}

fn remember_session_base(setting: &mut Value, name: &str, info: &Value) {
    if !setting["chunkedSyncBases"].is_object() {
        setting["chunkedSyncBases"] = json!({});
    }
    setting["chunkedSyncBases"][name] = json!({
        "sessionsObject": info.get("sessionsObject"),
        "version": info["version"],
        "commitId": info.get("commitId"),
    });
}

fn bind_session_base(
    setting: &Value,
    name: &str,
    local_version: u64,
    info: &mut Value,
) -> Result<(), AppError> {
    if let Some(base) = setting
        .get("chunkedSyncBases")
        .and_then(|bases| bases.get(name))
    {
        if let Some(object) = base["sessionsObject"].as_str() {
            if !crate::chunked_sync::valid_snapshot(object) {
                return Err(AppError::new(
                    "SESSION_BASE_UNKNOWN",
                    "会话文件清单无效，请从数据完整的桌面端重新发布快照",
                ));
            }
            info["sessionsObject"] = json!(object);
        } else {
            info.as_object_mut().unwrap().remove("sessionsObject");
        }
    } else if info.get("sessionsObject").is_some()
        && info["version"].as_u64() != Some(local_version)
    {
        return Err(AppError::new(
            "SESSION_BASE_UNKNOWN",
            "无法确认本地聊天目录对应的会话包，请先通过桌面端核对并同步此库",
        ));
    }
    Ok(())
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

async fn sync_upload_database_impl(app: AppHandle) -> SyncActionResponse {
    let ctx = match build_sync_context(&app) {
        Ok(ctx) => ctx,
        Err(error) => {
            return response_err(DEFAULT_DB_NAME, 0, 0, error);
        }
    };

    let mut remote_info = match read_remote_info(&ctx.provider, &ctx.version_object_name).await {
        Ok(info) => info,
        Err(error) => {
            return response_err(&ctx.database_name, ctx.local_version, 0, error);
        }
    };
    let remote_version = remote_info["version"].as_u64().unwrap_or(0);

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

    if let Err(error) = bind_session_base(
        &ctx.setting,
        &ctx.database_name,
        ctx.local_version,
        &mut remote_info,
    ) {
        return response_err(&ctx.database_name, ctx.local_version, remote_version, error);
    }
    if let Some(object) = remote_info.get("sessionsObject").and_then(Value::as_str) {
        match ctx.provider.exists(object).await {
            Ok(true) => {}
            Ok(false) => {
                return response_err(
                    &ctx.database_name,
                    ctx.local_version,
                    remote_version,
                    AppError::new("SESSION_ARCHIVE_MISSING", "对应的会话包不存在，停止上传"),
                )
            }
            Err(error) => {
                return response_err(&ctx.database_name, ctx.local_version, remote_version, error)
            }
        }
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

    let snapshot = match TemporaryFile::new(&app)
        .and_then(|snapshot| create_database_snapshot(&ctx.database_path, snapshot))
    {
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

    if let Err(error) = assert_session_content_available(&snapshot.path, &remote_info) {
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            AppError::new("SESSION_BASE_UNKNOWN", error),
        );
    }
    let next_version = ctx.local_version + 1;
    let data_object = crate::chunked_sync::snapshot_object();
    // 移动端不修改聊天内容，沿用下载版本的会话对象。
    let next_version_payload = snapshot_version_payload(remote_info, next_version, &data_object);
    if let Err(err) = publish_snapshot(
        async {
            ctx.provider
                .upload_chunked(&data_object, &ctx.database_name, &snapshot.path)
                .await
                .map_err(|e| AppError::new("SYNC_UPLOAD_FAILED", e))
        },
        publish_version_commit(
            &ctx.provider,
            &ctx.version_object_name,
            &next_version_payload,
        ),
    )
    .await
    {
        return response_err(&ctx.database_name, ctx.local_version, remote_version, err);
    }

    if let Err(err) = update_setting_value(&app, |setting| {
        set_database_version(setting, &ctx.database_name, next_version);
        remember_session_base(
            setting,
            &ctx.database_name,
            &serde_json::from_slice(&next_version_payload).expect("版本信息可解析"),
        );
    }) {
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

async fn publish_version_commit(
    provider: &SyncProvider,
    pointer: &str,
    bytes: &[u8],
) -> Result<(), AppError> {
    let next: Value = serde_json::from_slice(bytes)
        .map_err(|e| AppError::new("SYNC_UPLOAD_FAILED", e.to_string()))?;
    validate_remote_metadata(&next)?;
    let parent = next["parentVersion"]
        .as_u64()
        .ok_or_else(|| AppError::new("SYNC_UPLOAD_FAILED", "缺少父版本"))?;
    let object = format!("{pointer}.next-{parent}");
    if let Err(error) = provider.create_if_absent(&object, bytes).await {
        let committed: Value =
            serde_json::from_slice(&provider.download(&object).await.map_err(|_| {
                AppError::new(
                    "SYNC_COMMIT_UNKNOWN",
                    format!("无法确认提交结果，请检查同步状态：{}", error.message),
                )
            })?)
            .map_err(|e| AppError::new("SYNC_COMMIT_UNKNOWN", e.to_string()))?;
        if committed != next {
            return Err(AppError::new(
                "SYNC_CONFLICT",
                "远端已被其他设备更新，本次快照未发布",
            ));
        }
    }
    // 不可变后继记录已提交，指针失败或迟到不改变提交事实。
    let _ = provider.upload(pointer, bytes).await;
    Ok(())
}

fn assert_session_content_available(path: &std::path::Path, info: &Value) -> Result<(), String> {
    if info["sessionsObject"].is_string() {
        return Ok(());
    }
    let conn =
        rusqlite::Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| e.to_string())?;
    let table: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='chat_session')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let has_content = table
        && conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM chat_session WHERE message_count>0)",
                [],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|e| e.to_string())?;
    if has_content {
        return Err("手机没有对应会话文件，请从保有完整会话内容的客户端首次发布快照".into());
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[test]
    fn snapshot_version_preserves_session_manifest() {
        let payload = snapshot_version_payload(
            json!({ "version": 7, "sessionsObject": "tau-sync-v1/snapshots/sessions.json" }),
            8,
            "tau-sync-v1/snapshots/database.json",
        );
        let info: Value = serde_json::from_slice(&payload).unwrap();
        assert_eq!(info["version"], 8);
        assert_eq!(info["dataModelVersion"], sync_model_version());
        assert_eq!(
            info["databaseObject"],
            "tau-sync-v1/snapshots/database.json"
        );
        assert_eq!(
            info["sessionsObject"],
            "tau-sync-v1/snapshots/sessions.json"
        );
        assert_eq!(info["parentVersion"], 7);
        assert!(info["commitId"].as_str().is_some_and(|id| !id.is_empty()));
    }

    #[test]
    fn mobile_upload_keeps_its_downloaded_session_base() {
        let mut setting = json!({});
        remember_session_base(
            &mut setting,
            "data",
            &json!({ "version": 7, "sessionsObject": "tau-sync-v1/snapshots/my-base.json" }),
        );
        let mut remote =
            json!({ "version": 8, "sessionsObject": "tau-sync-v1/snapshots/other-device.json" });
        bind_session_base(&setting, "data", 9, &mut remote).unwrap();
        assert_eq!(
            remote["sessionsObject"],
            "tau-sync-v1/snapshots/my-base.json"
        );
        assert_eq!(remote["version"], 8);
        assert!(bind_session_base(&json!({}), "data", 9, &mut remote).is_err());
    }

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
    fn remote_metadata_requires_current_format_and_safe_versions() {
        assert!(validate_remote_metadata(&json!({"version":0})).is_ok());
        assert!(validate_remote_metadata(&json!({"version":0,"databaseObject":"old.db"})).is_err());
        for object in [
            "old.db",
            "tau-sync-v1/snapshots/../bad.json",
            "tau-sync-v1/snapshots/nested/bad.json",
        ] {
            assert!(validate_remote_metadata(
                &json!({"version":1,"dataModelVersion":6,"databaseObject":object})
            )
            .is_err());
        }
        assert!(validate_remote_metadata(&json!({"version":9007199254740992u64,"dataModelVersion":6,"databaseObject":"tau-sync-v1/snapshots/a.json"})).is_err());
        assert!(validate_remote_metadata(&json!({"version":1,"dataModelVersion":5,"databaseObject":"tau-sync-v1/snapshots/a.json"})).is_err());
    }

    #[test]
    fn mobile_cannot_publish_chat_references_without_session_content() {
        let dir = std::env::temp_dir().join(format!("tau-session-base-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("data.db");
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE chat_session(message_count INTEGER);INSERT INTO chat_session VALUES(1);",
        )
        .unwrap();
        assert!(assert_session_content_available(&path, &json!({})).is_err());
        assert!(assert_session_content_available(
            &path,
            &json!({"sessionsObject":"tau-sync-v1/snapshots/sessions.json"})
        )
        .is_ok());
        conn.execute("UPDATE chat_session SET message_count=0", [])
            .unwrap();
        assert!(assert_session_content_available(&path, &json!({})).is_ok());
        drop(conn);
        fs::remove_dir_all(dir).unwrap();
    }

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
    let ctx = match build_sync_context(&app) {
        Ok(ctx) => ctx,
        Err(error) => {
            return response_err(DEFAULT_DB_NAME, 0, 0, error);
        }
    };

    let remote_info = match read_remote_info(&ctx.provider, &ctx.version_object_name).await {
        Ok(info) => info,
        Err(error) => {
            return response_err(&ctx.database_name, ctx.local_version, 0, error);
        }
    };
    let remote_version = remote_info["version"].as_u64().unwrap_or(0);

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

    let data_object = remote_info["databaseObject"]
        .as_str()
        .expect("快照文件清单已校验");

    let exists = match ctx.provider.exists(data_object).await {
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
                format!("远端数据库文件不存在: {}", data_object),
            ),
        );
    }

    let downloaded = match ctx.provider.download_chunked(data_object).await {
        Ok(file) => file,
        Err(error) => {
            return response_err(
                &ctx.database_name,
                ctx.local_version,
                remote_version,
                AppError::new("SYNC_DOWNLOAD_FAILED", error),
            )
        }
    };
    let tmp_path = &downloaded.path;

    if let Err(err) = crate::database::validate_download(tmp_path) {
        let _ = fs::remove_file(tmp_path);
        remove_wal_shm_files(tmp_path);
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
    if let Err(err) =
        crate::database::install_preserved_download(&app, &ctx.database_name, tmp_path)
    {
        return response_err(
            &ctx.database_name,
            ctx.local_version,
            remote_version,
            AppError::new(
                "SYNC_DOWNLOAD_FAILED",
                format!("未完成保全或安装，原数据已保留: {err}"),
            ),
        );
    }
    // 主库已被远端内容替换，本地索引的 ID 空间整体失效，重置后按需全量重建
    if let Err(err) = crate::database::reset_index_database(&app, &ctx.database_name) {
        eprintln!("[sync] reset index database failed: {}", err);
    }

    if let Err(err) = update_setting_value(&app, |setting| {
        set_database_version(setting, &ctx.database_name, remote_version);
        remember_session_base(setting, &ctx.database_name, &remote_info);
    }) {
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
