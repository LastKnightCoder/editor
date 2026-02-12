use std::fs;
use std::path::PathBuf;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};
use tauri::AppHandle;

use crate::setting::resolve_app_dir;

pub const MIGRATION_STATE_KEY: &str = "migration_state";
pub const REBUILD_STATE_KEY: &str = "rebuild_state";

struct LegacyCopyResult {
    source_exists: bool,
    copied: bool,
    row_count: usize,
    error: Option<String>,
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

fn ensure_index_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
          prefixed_id,
          update_time,
          content,
          type,
          title,
          chunk_index,
          tokenize='porter unicode61'
        );
        CREATE TABLE IF NOT EXISTS index_meta (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at INTEGER
        );
        ",
    )
    .map_err(|e| format!("DB_OPEN_FAILED: Failed to initialize index schema: {e}"))?;

    if get_meta(conn, MIGRATION_STATE_KEY)?.is_none() {
        set_meta(conn, MIGRATION_STATE_KEY, "init")?;
    }
    if get_meta(conn, REBUILD_STATE_KEY)?.is_none() {
        set_meta(conn, REBUILD_STATE_KEY, "pending")?;
    }
    Ok(())
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
    ensure_index_schema(&conn)?;
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
    let next_rebuild_state = if copied_fts.copied {
        "ready"
    } else {
        "pending"
    };
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
