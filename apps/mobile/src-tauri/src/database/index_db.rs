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

fn has_table(conn: &Connection, table_name: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name=?1",
        params![table_name],
        |row| row.get::<_, i64>(0),
    )
    .map(|v| v > 0)
    .unwrap_or(false)
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

fn normalize_url(raw: Option<&str>) -> String {
    let value = raw.unwrap_or("").trim().trim_end_matches('/').to_string();
    if value == "/" {
        String::new()
    } else {
        value
    }
}

fn normalize_path(raw: Option<&str>) -> String {
    raw.unwrap_or("").trim().to_string()
}

fn parse_distance(value: Option<&Value>) -> f64 {
    let raw = value.and_then(|v| v.as_f64()).unwrap_or(0.0);
    if raw.is_finite() && raw >= 0.0 {
        raw
    } else {
        0.0
    }
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
    let current_config_id = setting
        .pointer("/embeddingProvider/currentConfigId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if current_config_id.is_empty() {
        return default_embedding_snapshot();
    }

    let configs = match setting
        .pointer("/embeddingProvider/configs")
        .and_then(|v| v.as_array())
    {
        Some(value) => value,
        None => return default_embedding_snapshot(),
    };

    let current_config = match configs.iter().find(|item| {
        item.get("id")
            .and_then(|v| v.as_str())
            .map(|id| id == current_config_id.as_str())
            .unwrap_or(false)
    }) {
        Some(value) => value,
        None => return default_embedding_snapshot(),
    };

    let current_model_name = current_config
        .get("currentModel")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if current_model_name.is_empty() {
        return default_embedding_snapshot();
    }

    let models = match current_config.get("models").and_then(|v| v.as_array()) {
        Some(value) => value,
        None => return default_embedding_snapshot(),
    };

    let current_model = match models.iter().find(|item| {
        item.get("name")
            .and_then(|v| v.as_str())
            .map(|name| name == current_model_name.as_str())
            .unwrap_or(false)
    }) {
        Some(value) => value,
        None => return default_embedding_snapshot(),
    };

    let vec_dimensions = parse_positive_dimension(current_model.get("contextLength"))
        .unwrap_or(DEFAULT_VEC_DIMENSION);
    let provider_type = current_config
        .get("providerType")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .trim()
        .to_string();
    let device_policy = current_config
        .get("devicePolicy")
        .and_then(|v| v.as_str())
        .unwrap_or("auto")
        .trim()
        .to_string();
    let base_url = normalize_url(current_config.get("baseUrl").and_then(|v| v.as_str()));
    let local_model_dir =
        normalize_path(current_config.get("localModelDir").and_then(|v| v.as_str()));
    let distance = parse_distance(current_model.get("distance"));

    let payload = json!({
        "providerType": provider_type,
        "configId": current_config_id,
        "model": current_model_name,
        "dimensions": vec_dimensions,
        "distance": distance,
        "devicePolicy": device_policy,
        "baseUrl": base_url,
        "localModelDir": local_model_dir,
    });

    EmbeddingSnapshot {
        vec_dimensions,
        fingerprint: serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string()),
    }
}

fn resolve_embedding_snapshot_from_app_setting(app: &AppHandle) -> EmbeddingSnapshot {
    match load_or_init_setting(app) {
        Ok(setting) => resolve_embedding_snapshot_from_setting(&setting),
        Err(error) => {
            eprintln!(
                "[mobile-index-db] resolve embedding snapshot fallback: failed to load setting, error={}",
                error
            );
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
    eprintln!(
        "[mobile-index-db] reset index database done: main_db={}",
        main_db_name
    );
    Ok(())
}

pub fn open_index_database(app: &AppHandle, main_db_name: &str) -> Result<Connection, String> {
    let path = resolve_index_database_path(app, main_db_name)?;
    eprintln!(
        "[mobile-index-db] open index database start: main_db={}, path={}",
        main_db_name,
        path.display()
    );
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
        eprintln!(
            "[mobile-index-db] embedding schema changed: main_db={}, vec_dimensions={}, vec_recreated={}, fingerprint_changed={}",
            main_db_name,
            embedding_snapshot.vec_dimensions,
            vec_recreated,
            fingerprint_changed
        );
    }
    eprintln!(
        "[mobile-index-db] open index database done: main_db={}",
        main_db_name
    );
    Ok(conn)
}

pub fn ensure_index_database(
    app: &AppHandle,
    main_db_name: &str,
    _main_conn: &Connection,
) -> Result<(), String> {
    let started_at = Instant::now();
    eprintln!(
        "[mobile-index-db] ensure index database start: main_db={}",
        main_db_name
    );
    open_index_database(app, main_db_name)?;
    eprintln!(
        "[mobile-index-db] ensure index database done: main_db={}, elapsed_ms={}",
        main_db_name,
        started_at.elapsed().as_millis()
    );
    Ok(())
}

pub fn set_rebuild_state(conn: &Connection, state: &str) -> Result<(), String> {
    set_meta(conn, REBUILD_STATE_KEY, state)
}
