use rusqlite::{params, Connection, OptionalExtension};
use sha1::{Digest, Sha1};

const MAIN_SCHEMA_SQL: &str = include_str!("../../../../../packages/db-schema/schema/main.sql");
const INDEX_SCHEMA_SQL: &str = include_str!("../../../../../packages/db-schema/schema/index.sql");
const INDEX_VEC_TEMPLATE_SQL: &str =
    include_str!("../../../../../packages/db-schema/schema/index/20_vec_template.sql");

const MAIN_SCHEMA_VERSION: i64 = 1;
const INDEX_SCHEMA_VERSION: i64 = 1;
const DEFAULT_VEC_DIMENSION: i64 = 3072;

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn compute_hash(sql: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(sql.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn normalize_vec_dimension(vec_dimension: i64) -> i64 {
    if vec_dimension > 0 {
        vec_dimension
    } else {
        DEFAULT_VEC_DIMENSION
    }
}

fn build_vec_table_sql(vec_dimension: i64) -> String {
    INDEX_VEC_TEMPLATE_SQL.replace(
        "__VEC_DIMENSION__",
        &normalize_vec_dimension(vec_dimension).to_string(),
    )
}

fn parse_vec_dimension_from_sql(create_sql: &str) -> Option<i64> {
    let upper = create_sql.to_ascii_uppercase();
    let float_pos = upper.find("FLOAT")?;
    let bytes = upper.as_bytes();

    let mut cursor = float_pos + "FLOAT".len();
    while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
        cursor += 1;
    }
    if cursor >= bytes.len() || bytes[cursor] != b'[' {
        return None;
    }
    cursor += 1;

    let digits_start = cursor;
    while cursor < bytes.len() && bytes[cursor].is_ascii_digit() {
        cursor += 1;
    }
    if cursor == digits_start || cursor >= bytes.len() || bytes[cursor] != b']' {
        return None;
    }

    upper[digits_start..cursor].parse::<i64>().ok().filter(|v| *v > 0)
}

fn get_current_vec_dimension(conn: &Connection) -> Result<Option<i64>, String> {
    let sql = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vec_documents'",
            [],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(|e| {
            format!("DB_SCHEMA_MIGRATION_FAILED: Failed to read vec_documents schema: {e}")
        })?
        .flatten();
    Ok(sql.and_then(|value| parse_vec_dimension_from_sql(&value)))
}

fn ensure_vec_documents(conn: &Connection, vec_dimension: i64) -> Result<bool, String> {
    let target = normalize_vec_dimension(vec_dimension);
    let current = get_current_vec_dimension(conn)?;
    if current == Some(target) {
        return Ok(false);
    }

    conn.execute_batch("DROP TABLE IF EXISTS vec_documents;")
        .map_err(|e| {
            format!("DB_SCHEMA_MIGRATION_FAILED: Failed to drop vec_documents: {e}")
        })?;
    conn.execute_batch(&build_vec_table_sql(target))
        .map_err(|e| {
            format!("DB_SCHEMA_MIGRATION_FAILED: Failed to create vec_documents: {e}")
        })?;
    Ok(true)
}

fn ensure_schema_meta(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schema_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        ",
    )
    .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: Failed to create schema_meta: {e}"))?;
    Ok(())
}

pub fn get_meta(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    let value = conn
        .query_row(
            "SELECT value FROM schema_meta WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: Failed to query schema_meta: {e}"))?;
    Ok(value)
}

pub fn set_meta(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    let now = now_millis();
    conn.execute(
        "
        INSERT INTO schema_meta (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
        ",
        params![key, value, now],
    )
    .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: Failed to write schema_meta: {e}"))?;
    Ok(())
}

pub fn ensure_main_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        ",
    )
    .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: Failed to set main PRAGMA: {e}"))?;

    ensure_schema_meta(conn)?;
    conn.execute_batch(MAIN_SCHEMA_SQL).map_err(|e| {
        format!("DB_SCHEMA_MIGRATION_FAILED: Failed to initialize main schema: {e}")
    })?;

    set_meta(
        conn,
        "main_schema_version",
        &MAIN_SCHEMA_VERSION.to_string(),
    )?;
    set_meta(conn, "main_schema_hash", &compute_hash(MAIN_SCHEMA_SQL))?;
    Ok(())
}

pub fn ensure_index_schema(conn: &Connection, vec_dimension: i64) -> Result<bool, String> {
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        ",
    )
    .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: Failed to set index PRAGMA: {e}"))?;

    ensure_schema_meta(conn)?;
    conn.execute_batch(INDEX_SCHEMA_SQL).map_err(|e| {
        format!("DB_SCHEMA_MIGRATION_FAILED: Failed to initialize index schema: {e}")
    })?;
    let vec_recreated = ensure_vec_documents(conn, vec_dimension)?;

    set_meta(
        conn,
        "index_schema_version",
        &INDEX_SCHEMA_VERSION.to_string(),
    )?;
    set_meta(conn, "index_schema_hash", &compute_hash(INDEX_SCHEMA_SQL))?;
    Ok(vec_recreated)
}
