use std::fs;

use rusqlite::Connection;
use tauri::AppHandle;

use super::index_db;
use crate::setting::{get_active_database_name, load_or_init_setting, resolve_database_path};

fn create_minimal_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS contents (
          id INTEGER PRIMARY KEY,
          create_time INTEGER NOT NULL,
          update_time INTEGER NOT NULL,
          content TEXT,
          count INTEGER DEFAULT 0,
          ref_count INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS cards (
          id INTEGER PRIMARY KEY,
          create_time INTEGER NOT NULL,
          update_time INTEGER NOT NULL,
          tags TEXT,
          links TEXT,
          content_id INTEGER,
          category TEXT DEFAULT 'permanent',
          is_top INTEGER DEFAULT 0,
          podcast_id INTEGER DEFAULT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cards_create_time ON cards(create_time);
        CREATE INDEX IF NOT EXISTS idx_cards_content_id ON cards(content_id);
        ",
    )
    .map_err(|e| format!("DB_OPEN_FAILED: Failed to initialize schema: {e}"))?;
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
    create_minimal_schema(&conn)?;
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
