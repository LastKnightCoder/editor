use std::fs;

use rusqlite::Connection;
use tauri::AppHandle;

use super::index_db;
use super::migrator;
use crate::setting::{get_active_database_name, load_or_init_setting, resolve_database_path};

fn should_backup_before_migration(conn: &Connection) -> bool {
    let has_schema_meta = conn
        .query_row(
            "SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name='schema_meta'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count > 0)
        .unwrap_or(false);
    if !has_schema_meta {
        return true;
    }

    migrator::get_meta(conn, "main_schema_version")
        .ok()
        .flatten()
        .is_none()
}

fn backup_before_migration(database_path: &std::path::Path) -> Result<(), String> {
    let backup_path = database_path.with_extension("db.pre-schema-v1.bak");
    if backup_path.exists() {
        return Ok(());
    }
    if database_path.exists() {
        fs::copy(database_path, &backup_path)
            .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: Failed to backup database: {e}"))?;
    }
    Ok(())
}

pub fn force_checkpoint(app: &AppHandle, db_name: &str) -> Result<(), String> {
    let path = resolve_database_path(app, db_name)
        .map_err(|e| format!("DB_CHECKPOINT_FAILED: Failed to resolve database path: {e}"))?;
    let conn = Connection::open(path)
        .map_err(|e| format!("DB_CHECKPOINT_FAILED: Failed to open database: {e}"))?;
    let (busy, log) = conn
        .query_row("PRAGMA wal_checkpoint(FULL)", [], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| format!("DB_CHECKPOINT_FAILED: Failed to checkpoint database: {e}"))?;
    if busy != 0 || log != 0 {
        return Err(format!(
            "DB_CHECKPOINT_FAILED: busy={busy}, log={log}, wal file is not fully checkpointed"
        ));
    }
    Ok(())
}

pub fn ensure_database_file(app: &AppHandle, db_name: &str) -> Result<(), String> {
    let database_path = resolve_database_path(app, db_name)
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to resolve database path: {e}"))?;
    if !database_path.exists() {
        if let Some(parent) = database_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("DB_OPEN_FAILED: Failed to create database directory: {e}"))?;
        }
    }
    let conn = Connection::open(&database_path)
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to open database: {e}"))?;
    if should_backup_before_migration(&conn) {
        backup_before_migration(&database_path)?;
    }
    migrator::ensure_main_schema(&conn)?;
    index_db::ensure_index_database(app, db_name, &conn)?;
    Ok(())
}

pub fn open_database_by_name(app: &AppHandle, db_name: &str) -> Result<Connection, String> {
    ensure_database_file(app, db_name)?;
    let path = resolve_database_path(app, db_name)
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to resolve database path: {e}"))?;
    Connection::open(path).map_err(|e| format!("DB_OPEN_FAILED: {e}"))
}

pub fn open_active_database(app: &AppHandle) -> Result<Connection, String> {
    let setting = load_or_init_setting(app)?;
    let db_name = get_active_database_name(&setting);
    open_database_by_name(app, &db_name)
}
