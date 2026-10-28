use std::fs;
use std::path::PathBuf;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};
use serde_json::{json, Value};
use tauri::AppHandle;

use super::migrator;
use crate::setting::{load_or_init_setting, resolve_app_dir};

pub const REBUILD_STATE_KEY: &str = "rebuild_state";
const MAIN_CONTENT_EMBEDDING_FINGERPRINT_KEY: &str = "main_content_embedding_fingerprint";
const DEFAULT_VEC_DIMENSION: i64 = 3072;

struct EmbeddingSnapshot {
    vec_dimensions: i64,
    fingerprint: String,
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn parse_positive_dimension(value: Option<&Value>) -> Option<i64> {
    let raw = value?;
    if let Some(v) = raw.as_i64() {
        return (v > 0).then_some(v);
    }
    if let Some(v) = raw.as_u64() {
        return (v > 0 && v <= i64::MAX as u64).then_some(v as i64);
    }
    if let Some(v) = raw.as_f64() {
        return (v.is_finite() && v > 0.0).then_some(v.floor() as i64);
    }
    None
}

fn default_embedding_snapshot() -> EmbeddingSnapshot {
    let payload = json!({
        "providerType": "unknown",
        "configId": "",
        "model": "",
        "dimensions": DEFAULT_VEC_DIMENSION,
        "distance": 0.0,
        "devicePolicy": "auto",
        "baseUrl": "",
        "localModelDir": "",
    });
    EmbeddingSnapshot {
        vec_dimensions: DEFAULT_VEC_DIMENSION,
        fingerprint: serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string()),
    }
}

fn resolve_embedding_snapshot_from_setting(setting: &Value) -> EmbeddingSnapshot {
    let active = match setting.pointer("/embedding/active") {
        Some(value) if value.is_object() => value,
        _ => return default_embedding_snapshot(),
    };

    let model = active
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if model.is_empty() {
        return default_embedding_snapshot();
    }

    let vec_dimensions = match parse_positive_dimension(active.get("dimensions")) {
        Some(value) => value,
        None => return default_embedding_snapshot(),
    };

    let provider = active
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    let payload = if provider == "plugin" {
        let plugin_id = active
            .get("pluginId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if plugin_id.is_empty() {
            return default_embedding_snapshot();
        }
        json!({
            "provider": "plugin",
            "pluginId": plugin_id,
            "model": model,
            "dimensions": vec_dimensions,
        })
    } else {
        // 本地向量指纹沿用旧 embeddingProvider 时代的 payload 形状（providerType "local_python"
        // 等旧字段名），与桌面端本地指纹约定一致，避免跨端触发全量重建
        let device_policy = setting
            .pointer("/embedding/local/devicePolicy")
            .and_then(|v| v.as_str())
            .unwrap_or("auto")
            .trim()
            .to_string();
        json!({
            "providerType": "local_python",
            "configId": "embedding-default-local",
            "model": model,
            "dimensions": vec_dimensions,
            "distance": 0.6,
            "devicePolicy": device_policy,
            "baseUrl": "",
            "localModelDir": "",
        })
    };

    EmbeddingSnapshot {
        vec_dimensions,
        fingerprint: serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string()),
    }
}

fn resolve_embedding_snapshot_from_app_setting(app: &AppHandle) -> EmbeddingSnapshot {
    match load_or_init_setting(app) {
        Ok(setting) => resolve_embedding_snapshot_from_setting(&setting),
        Err(error) => {
            crate::logger::warn(format!(
                "[mobile-index-db] resolve embedding snapshot fallback: failed to load setting, error={}",
                error
            ));
            default_embedding_snapshot()
        }
    }
}

pub fn resolve_embedding_fingerprint_from_setting(setting: &Value) -> String {
    resolve_embedding_snapshot_from_setting(setting).fingerprint
}

fn get_meta(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    let value = conn
        .query_row(
            "SELECT value FROM index_meta WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .ok();
    Ok(value)
}

fn set_meta(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    let now = now_millis();
    conn.execute(
        "
        INSERT INTO index_meta (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
        ",
        params![key, value, now],
    )
    .map_err(|e| format!("DB_OPEN_FAILED: Failed to update index meta: {e}"))?;
    Ok(())
}

fn get_vec_meta(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    let value = conn
        .query_row(
            "SELECT value FROM vec_index_meta WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .ok();
    Ok(value)
}

fn set_vec_meta(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    let now = now_millis();
    conn.execute(
        "
        INSERT INTO vec_index_meta (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
        ",
        params![key, value, now],
    )
    .map_err(|e| format!("DB_OPEN_FAILED: Failed to update vec_index_meta: {e}"))?;
    Ok(())
}

pub fn resolve_index_database_name(main_db_name: &str) -> String {
    let base = main_db_name.trim_end_matches(".db");
    format!("{base}.index.db")
}

pub fn resolve_index_database_path(app: &AppHandle, main_db_name: &str) -> Result<PathBuf, String> {
    Ok(resolve_app_dir(app)?.join(resolve_index_database_name(main_db_name)))
}

/// 同步替换主库后本地索引的 ID 空间整体失效，删除索引文件令其按需全量重建。
pub fn reset_index_database(app: &AppHandle, main_db_name: &str) -> Result<(), String> {
    let path = resolve_index_database_path(app, main_db_name)?;
    // 先标记待重建再删文件：删除失败（如 Windows 文件锁）时，残留索引也会在下次开库触发全量重建
    if path.exists() {
        match Connection::open(&path) {
            Ok(conn) => {
                let marked = conn
                    .execute_batch("PRAGMA busy_timeout=5000;")
                    .map_err(|e| e.to_string())
                    .and_then(|()| set_meta(&conn, REBUILD_STATE_KEY, "pending"));
                let closed = conn.close().map_err(|(_, e)| e.to_string());
                marked.map_err(|e| {
                    format!("DB_OPEN_FAILED: Failed to mark index rebuild pending: {e}")
                })?;
                closed.map_err(|e| format!("DB_OPEN_FAILED: Failed to close index: {e}"))?;
            }
            Err(_) => {
                // 打不开（如文件损坏）则交由下方删除路径处理；删除也失败时最终报错
            }
        }
    }
    for suffix in ["", "-wal", "-shm"] {
        let file = format!("{}{suffix}", path.to_string_lossy());
        if std::path::Path::new(&file).exists() {
            fs::remove_file(&file)
                .map_err(|e| format!("DB_OPEN_FAILED: Failed to reset index database: {e}"))?;
        }
    }
    crate::logger::info(format!(
        "[mobile-index-db] reset index database done: main_db={}",
        main_db_name
    ));
    Ok(())
}

pub fn open_index_database(app: &AppHandle, main_db_name: &str) -> Result<Connection, String> {
    let path = resolve_index_database_path(app, main_db_name)?;
    crate::logger::debug(format!(
        "[mobile-index-db] open index database start: main_db={}, path={}",
        main_db_name,
        path.display()
    ));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!("DB_OPEN_FAILED: Failed to create index database directory: {e}")
        })?;
    }
    let conn = Connection::open(path)
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to open index database: {e}"))?;
    // 迁移写入可能与后台 reconcile 的索引写入并发，对齐主库连接的等待策略
    conn.execute_batch("PRAGMA busy_timeout=5000;")
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to set index busy_timeout: {e}"))?;
    let embedding_snapshot = resolve_embedding_snapshot_from_app_setting(app);
    let vec_recreated = migrator::ensure_index_schema(&conn, embedding_snapshot.vec_dimensions)?;
    if get_meta(&conn, REBUILD_STATE_KEY)?.is_none() {
        set_meta(&conn, REBUILD_STATE_KEY, "pending")?;
    }

    let stored_fingerprint = get_vec_meta(&conn, MAIN_CONTENT_EMBEDDING_FINGERPRINT_KEY)?;
    let fingerprint_changed =
        stored_fingerprint.as_deref() != Some(embedding_snapshot.fingerprint.as_str());
    if fingerprint_changed {
        set_vec_meta(
            &conn,
            MAIN_CONTENT_EMBEDDING_FINGERPRINT_KEY,
            &embedding_snapshot.fingerprint,
        )?;
    }

    if vec_recreated || fingerprint_changed {
        set_meta(&conn, REBUILD_STATE_KEY, "pending")?;
        crate::logger::info(format!(
            "[mobile-index-db] embedding schema changed: main_db={}, vec_dimensions={}, vec_recreated={}, fingerprint_changed={}",
            main_db_name,
            embedding_snapshot.vec_dimensions,
            vec_recreated,
            fingerprint_changed
        ));
    }
    crate::logger::debug(format!(
        "[mobile-index-db] open index database done: main_db={}",
        main_db_name
    ));
    Ok(conn)
}

pub fn ensure_index_database(
    app: &AppHandle,
    main_db_name: &str,
    _main_conn: &Connection,
) -> Result<(), String> {
    let started_at = Instant::now();
    crate::logger::debug(format!(
        "[mobile-index-db] ensure index database start: main_db={}",
        main_db_name
    ));
    open_index_database(app, main_db_name)?;
    crate::logger::debug(format!(
        "[mobile-index-db] ensure index database done: main_db={}, elapsed_ms={}",
        main_db_name,
        started_at.elapsed().as_millis()
    ));
    Ok(())
}

pub fn set_rebuild_state(conn: &Connection, state: &str) -> Result<(), String> {
    set_meta(conn, REBUILD_STATE_KEY, state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_missing_or_incomplete_falls_back_to_default_snapshot() {
        for setting in [
            json!({}),
            json!({ "embedding": { "active": null } }),
            json!({ "embedding": { "active": { "provider": "local", "model": "", "dimensions": 1024 } } }),
            json!({ "embedding": { "active": { "provider": "local", "model": "bge-m3", "dimensions": 0 } } }),
            json!({ "embedding": { "active": { "provider": "plugin", "model": "m", "dimensions": 3 } } }),
        ] {
            let snapshot = resolve_embedding_snapshot_from_setting(&setting);
            let fallback = default_embedding_snapshot();
            assert_eq!(snapshot.fingerprint, fallback.fingerprint, "{setting}");
            assert_eq!(snapshot.vec_dimensions, DEFAULT_VEC_DIMENSION);
        }
    }

    #[test]
    fn local_active_keeps_legacy_payload_shape() {
        let setting = json!({
            "embedding": {
                "active": { "provider": "local", "model": "bge-m3", "dimensions": 1024 },
                "local": { "source": "modelscope", "devicePolicy": "cpu", "batchSize": 8 },
                "plugins": {}
            }
        });
        let snapshot = resolve_embedding_snapshot_from_setting(&setting);
        assert_eq!(snapshot.vec_dimensions, 1024);
        let payload: Value = serde_json::from_str(&snapshot.fingerprint).unwrap();
        assert_eq!(payload["providerType"], json!("local_python"));
        assert_eq!(payload["configId"], json!("embedding-default-local"));
        assert_eq!(payload["model"], json!("bge-m3"));
        assert_eq!(payload["dimensions"], json!(1024));
        assert_eq!(payload["distance"], json!(0.6));
        assert_eq!(payload["devicePolicy"], json!("cpu"));
        assert_eq!(payload["baseUrl"], json!(""));
        assert_eq!(payload["localModelDir"], json!(""));
    }

    #[test]
    fn plugin_active_payload_contains_provider_identity_only() {
        let setting = json!({
            "embedding": {
                "active": { "provider": "plugin", "pluginId": "test.embedding", "model": "m", "dimensions": 3 },
                "local": { "source": "modelscope", "devicePolicy": "auto", "batchSize": 8 },
                "plugins": { "test.embedding": { "config": { "apiKey": "secret" } } }
            }
        });
        let snapshot = resolve_embedding_snapshot_from_setting(&setting);
        assert_eq!(snapshot.vec_dimensions, 3);
        let payload: Value = serde_json::from_str(&snapshot.fingerprint).unwrap();
        assert_eq!(
            payload,
            json!({ "provider": "plugin", "pluginId": "test.embedding", "model": "m", "dimensions": 3 })
        );
        assert!(!snapshot.fingerprint.contains("secret"));
    }
}
