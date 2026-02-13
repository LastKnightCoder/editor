use std::fs;
use std::path::PathBuf;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};
use serde_json::{json, Value};
use tauri::AppHandle;

use super::migrator;
use crate::setting::{load_or_init_setting, resolve_app_dir};

pub const MIGRATION_STATE_KEY: &str = "migration_state";
pub const REBUILD_STATE_KEY: &str = "rebuild_state";
const MAIN_CONTENT_EMBEDDING_FINGERPRINT_KEY: &str = "main_content_embedding_fingerprint";
const DEFAULT_VEC_DIMENSION: i64 = 3072;

struct LegacyCopyResult {
    source_exists: bool,
    copied: bool,
    row_count: usize,
    error: Option<String>,
}

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

    let vec_dimensions =
        parse_positive_dimension(current_model.get("contextLength")).unwrap_or(DEFAULT_VEC_DIMENSION);
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

fn copy_legacy_fts(main_conn: &Connection, index_conn: &Connection) -> LegacyCopyResult {
    if !has_table(main_conn, "content_fts") {
        return LegacyCopyResult {
            source_exists: false,
            copied: false,
            row_count: 0,
            error: None,
        };
    }

    let rows = match main_conn.prepare(
        "
        SELECT prefixed_id, update_time, content, type, title, chunk_index
        FROM content_fts
        ",
    ) {
        Ok(mut stmt) => {
            let mapped = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, f64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                ))
            });
            match mapped {
                Ok(values) => {
                    let mut items = vec![];
                    for value in values {
                        match value {
                            Ok(item) => items.push(item),
                            Err(error) => {
                                return LegacyCopyResult {
                                    source_exists: true,
                                    copied: false,
                                    row_count: 0,
                                    error: Some(format!("failed to parse legacy fts row: {error}")),
                                };
                            }
                        }
                    }
                    items
                }
                Err(error) => {
                    return LegacyCopyResult {
                        source_exists: true,
                        copied: false,
                        row_count: 0,
                        error: Some(format!("failed to map legacy fts rows: {error}")),
                    };
                }
            }
        }
        Err(error) => {
            return LegacyCopyResult {
                source_exists: true,
                copied: false,
                row_count: 0,
                error: Some(format!("failed to prepare legacy fts query: {error}")),
            };
        }
    };

    if index_conn
        .execute("DELETE FROM content_fts", [])
        .map_err(|_| ())
        .is_err()
    {
        return LegacyCopyResult {
            source_exists: true,
            copied: false,
            row_count: 0,
            error: Some("failed to clear target content_fts".to_string()),
        };
    }

    for row in &rows {
        let inserted = index_conn.execute(
            "
            INSERT INTO content_fts (prefixed_id, update_time, content, type, title, chunk_index)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ",
            params![&row.0, row.1, &row.2, &row.3, &row.4, row.5],
        );
        if let Err(error) = inserted {
            return LegacyCopyResult {
                source_exists: true,
                copied: false,
                row_count: 0,
                error: Some(format!("failed to insert legacy fts row: {error}")),
            };
        }
    }

    LegacyCopyResult {
        source_exists: true,
        copied: true,
        row_count: rows.len(),
        error: None,
    }
}

fn drop_legacy_index_tables(main_conn: &Connection) -> Result<Vec<&'static str>, String> {
    let legacy_tables = ["content_fts", "vec_documents", "vec_index_meta"];
    let existing_tables = legacy_tables
        .iter()
        .copied()
        .filter(|table_name| has_table(main_conn, table_name))
        .collect::<Vec<_>>();
    main_conn
        .execute_batch(
            "
            DROP TABLE IF EXISTS content_fts;
            DROP TABLE IF EXISTS vec_documents;
            DROP TABLE IF EXISTS vec_index_meta;
            ",
        )
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to drop legacy index tables: {e}"))?;
    Ok(existing_tables)
}

pub fn resolve_index_database_name(main_db_name: &str) -> String {
    let base = main_db_name.trim_end_matches(".db");
    format!("{base}.index.db")
}

pub fn resolve_index_database_path(app: &AppHandle, main_db_name: &str) -> Result<PathBuf, String> {
    Ok(resolve_app_dir(app)?.join(resolve_index_database_name(main_db_name)))
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
    let embedding_snapshot = resolve_embedding_snapshot_from_app_setting(app);
    let vec_recreated = migrator::ensure_index_schema(&conn, embedding_snapshot.vec_dimensions)?;
    if get_meta(&conn, MIGRATION_STATE_KEY)?.is_none() {
        set_meta(&conn, MIGRATION_STATE_KEY, "init")?;
    }
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
    main_conn: &Connection,
) -> Result<(), String> {
    let started_at = Instant::now();
    eprintln!(
        "[mobile-index-db] ensure index database start: main_db={}",
        main_db_name
    );
    let index_conn = open_index_database(app, main_db_name)?;
    let state = get_meta(&index_conn, MIGRATION_STATE_KEY)?.unwrap_or_else(|| "init".to_string());
    let rebuild_state =
        get_meta(&index_conn, REBUILD_STATE_KEY)?.unwrap_or_else(|| "pending".to_string());
    eprintln!(
        "[mobile-index-db] ensure state: main_db={}, migration_state={}, rebuild_state={}",
        main_db_name, state, rebuild_state
    );
    if state == "done" {
        eprintln!(
            "[mobile-index-db] ensure index database skip: main_db={}, migration_state=done, rebuild_state={}, elapsed_ms={}",
            main_db_name,
            rebuild_state,
            started_at.elapsed().as_millis()
        );
        return Ok(());
    }

    set_meta(&index_conn, MIGRATION_STATE_KEY, "copying")?;
    set_meta(&index_conn, REBUILD_STATE_KEY, "building")?;
    eprintln!(
        "[mobile-index-db] migration state update: main_db={}, migration_state=copying, rebuild_state=building",
        main_db_name
    );

    let copy_started_at = Instant::now();
    let copied_fts = copy_legacy_fts(main_conn, &index_conn);
    eprintln!(
        "[mobile-index-db] legacy fts copy result: main_db={}, source_exists={}, copied={}, rows={}, elapsed_ms={}",
        main_db_name,
        copied_fts.source_exists,
        copied_fts.copied,
        copied_fts.row_count,
        copy_started_at.elapsed().as_millis()
    );
    if let Some(error) = copied_fts.error.as_ref() {
        eprintln!(
            "[mobile-index-db] legacy fts copy error: main_db={}, error={}",
            main_db_name, error
        );
    }

    set_meta(&index_conn, MIGRATION_STATE_KEY, "cutover")?;
    eprintln!(
        "[mobile-index-db] migration state update: main_db={}, migration_state=cutover",
        main_db_name
    );
    let dropped_tables = drop_legacy_index_tables(main_conn)?;
    eprintln!(
        "[mobile-index-db] drop legacy tables done: main_db={}, existing_before_drop={}",
        main_db_name,
        if dropped_tables.is_empty() {
            "none".to_string()
        } else {
            dropped_tables.join(",")
        }
    );

    set_meta(&index_conn, MIGRATION_STATE_KEY, "done")?;
    let next_rebuild_state = "pending";
    set_meta(&index_conn, REBUILD_STATE_KEY, next_rebuild_state)?;
    eprintln!(
        "[mobile-index-db] ensure index database done: main_db={}, migration_state=done, rebuild_state={}, elapsed_ms={}",
        main_db_name,
        next_rebuild_state,
        started_at.elapsed().as_millis()
    );
    Ok(())
}

pub fn set_rebuild_state(conn: &Connection, state: &str) -> Result<(), String> {
    set_meta(conn, REBUILD_STATE_KEY, state)
}
