use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use sha1::{Digest, Sha1};

#[path = "main_row_ids.rs"]
mod row_ids;

const MAIN_SCHEMA_SQL: &str = include_str!("../../../../../packages/db-schema/schema/main.sql");
const INDEX_SCHEMA_SQL: &str = include_str!("../../../../../packages/db-schema/schema/index.sql");
const INDEX_VEC_TEMPLATE_SQL: &str =
    include_str!("../../../../../packages/db-schema/schema/index/20_vec_template.sql");

fn main_schema_version() -> i64 {
    include_str!("../../../../../packages/db-schema/schema/main-version.json")
        .trim()
        .parse()
        .expect("主库基线版本必须是整数")
}
const INDEX_SCHEMA_VERSION: i64 = 1;
const DEFAULT_VEC_DIMENSION: i64 = 3072;

#[cfg(test)]
#[path = "migration_tests.rs"]
mod tests;

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
    let bytes = upper.as_bytes();
    // 模板里 update_time FLOAT 等无维度列排在 vec_embedding FLOAT[N] 之前，
    // 必须遍历所有 FLOAT 出现位置，找到带 [维度] 的那一个；只匹配首个会永远解析失败，
    // 导致 vec 表在每次打开连接时都被误判为维度变化而 DROP+CREATE（写锁雪崩的根源）
    let mut search_from = 0;
    while let Some(relative) = upper[search_from..].find("FLOAT") {
        let float_pos = search_from + relative;
        let mut cursor = float_pos + "FLOAT".len();
        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }
        if cursor < bytes.len() && bytes[cursor] == b'[' {
            let digits_start = cursor + 1;
            cursor = digits_start;
            while cursor < bytes.len() && bytes[cursor].is_ascii_digit() {
                cursor += 1;
            }
            if cursor > digits_start && cursor < bytes.len() && bytes[cursor] == b']' {
                if let Some(dim) = upper[digits_start..cursor]
                    .parse::<i64>()
                    .ok()
                    .filter(|v| *v > 0)
                {
                    return Some(dim);
                }
            }
        }
        search_from = float_pos + "FLOAT".len();
    }
    None
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
        .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: Failed to drop vec_documents: {e}"))?;
    conn.execute_batch(&build_vec_table_sql(target))
        .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: Failed to create vec_documents: {e}"))?;
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

fn task_projection_complete(conn: &Connection) -> Result<bool, String> {
    conn.query_row("SELECT COUNT(*)=3 FROM sqlite_master WHERE type='table' AND name IN ('document_task_identities','document_task_projection_state','document_task_projection_errors')",[],|r|r.get(0)).map_err(|e|e.to_string())
}
fn needs_receipt_upgrade(conn: &Connection) -> Result<bool, String> {
    let sql: Option<String> = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='plugin_create_receipts'",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(sql.is_some_and(|s| !s.contains("'todo-list'")))
}
fn upgrade_create_receipts(conn: &Connection) -> Result<(), String> {
    if !needs_receipt_upgrade(conn)? {
        return Ok(());
    }
    let head = "CREATE TABLE IF NOT EXISTS plugin_create_receipts (";
    let body = MAIN_SCHEMA_SQL
        .split_once(head)
        .and_then(|(_, s)| s.split_once(") WITHOUT ROWID;"))
        .ok_or("创建回执 schema 缺失")?
        .0;
    conn.execute_batch(&format!(
        "{}{}) WITHOUT ROWID;",
        head.replace("plugin_create_receipts", "plugin_create_receipts_upgrade"),
        body
    ))
    .map_err(|e| e.to_string())?;
    conn.execute_batch(
        "INSERT INTO plugin_create_receipts_upgrade SELECT * FROM plugin_create_receipts;
      DROP TRIGGER IF EXISTS trg_plugin_create_todo_delete;
      DROP TRIGGER IF EXISTS trg_plugin_create_event_delete;
      DROP TRIGGER IF EXISTS trg_plugin_create_todo_list_delete;
      DROP TRIGGER IF EXISTS trg_plugin_create_calendar_delete;
      DROP TABLE plugin_create_receipts;
      ALTER TABLE plugin_create_receipts_upgrade RENAME TO plugin_create_receipts;",
    )
    .map_err(|e| e.to_string())
}

pub(super) fn needs_main_initialization(conn: &Connection) -> Result<bool, String> {
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='schema_meta' AND type='table')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !exists
        || !task_projection_complete(conn)?
        || needs_receipt_upgrade(conn)?
        || super::query_database_migration::needs_upgrade(conn)?
    {
        return Ok(true);
    }
    Ok(get_meta(conn, "main_schema_version")?.as_deref()
        != Some(main_schema_version().to_string().as_str())
        || get_meta(conn, "main_schema_hash")?.as_deref()
            != Some(compute_hash(MAIN_SCHEMA_SQL).as_str()))
}

pub fn ensure_main_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
        ",
    )
    .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: Failed to set main PRAGMA: {e}"))?;

    if !needs_main_initialization(conn)? {
        return super::document_task_identities::prepare(conn);
    }

    let projection_missing = !task_projection_complete(conn)?;
    let tables = row_ids::tables(MAIN_SCHEMA_SQL);
    conn.pragma_update(None, "foreign_keys", false)
        .map_err(|e| e.to_string())?;
    let result = (|| {
        let tx = rusqlite::Transaction::new_unchecked(conn, TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let foreign_keys = row_ids::foreign_key_errors(&tx)?;
        row_ids::migrate(&tx, &tables)?;
        upgrade_create_receipts(&tx)?;
        let columns: Vec<String> = tx
            .prepare("PRAGMA table_info(calendar_event)")
            .map_err(|e| e.to_string())?
            .query_map([], |r| r.get(1))
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;
        if !columns.is_empty() {
            for (name, kind) in [
                ("start_utc_ms", "INTEGER"),
                ("end_utc_ms", "INTEGER"),
                ("start_time_zone", "TEXT"),
                ("end_time_zone", "TEXT"),
            ] {
                if !columns.iter().any(|col| col == name) {
                    tx.execute_batch(&format!(
                        "ALTER TABLE calendar_event ADD COLUMN {name} {kind}"
                    ))
                    .map_err(|e| e.to_string())?;
                }
            }
        }
        let log_exists:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='data_change_log')",[],|r|r.get(0)).map_err(|e|e.to_string())?;
        if log_exists {
            let names = tx
                .prepare("PRAGMA table_info(data_change_log)")
                .map_err(|e| e.to_string())?
                .query_map([], |r| r.get::<_, String>(1))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            if !names.iter().any(|name| name == "action") {
                tx.execute_batch("ALTER TABLE data_change_log ADD COLUMN action TEXT CHECK(action IN ('created','updated','deleted'))").map_err(|e|e.to_string())?;
            }
        }
        for trigger in [
            "calendar_time_legacy_edit",
            "calendar_time_reader_version",
            "calendar_time_first_insert",
            "calendar_time_first_update",
            "dc_todo_item_insert",
            "dc_todo_item_update",
            "dc_calendar_event_insert",
            "dc_calendar_event_update",
            "dc_todo_group_insert",
            "dc_todo_group_update",
            "dc_calendar_insert",
            "dc_calendar_update",
            "dc_document_task_identity_insert",
            "dc_content_documents_insert",
            "dc_content_documents_update",
            "dc_content_documents_delete",
            "dc_contents_update",
            "dc_contents_delete",
            "dc_content_document_blocks_insert",
            "dc_content_document_blocks_update",
            "dc_content_document_blocks_delete",
        ] {
            tx.execute_batch(&format!("DROP TRIGGER IF EXISTS {trigger}"))
                .map_err(|e| e.to_string())?;
        }
        tx.execute_batch(MAIN_SCHEMA_SQL)
            .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: Failed to apply main schema: {e}"))?;
        super::query_database_migration::upgrade(&tx, now_millis())?;
        if projection_missing {
            tx.execute("UPDATE document_task_projection_state SET ready=0,after_content_id=0,epoch=lower(hex(randomblob(16))) WHERE id='main'",[]).map_err(|e|e.to_string())?;
        }
        row_ids::seed_sequences(&tx, &tables)?;
        if !row_ids::foreign_key_errors(&tx)?.is_subset(&foreign_keys) {
            return Err("主库编号升级引入了外键不一致".into());
        }
        tx.execute(
            "INSERT INTO diary_tag_settings(name,color,sort,create_time,update_time)
         VALUES(?1,'#52c41a',0,?2,?2),('月记','#fa8c16',1,?2,?2)
         ON CONFLICT(name) DO NOTHING",
            params!["周记", now_millis()],
        )
        .map_err(|e| {
            format!("DB_SCHEMA_MIGRATION_FAILED: Failed to seed diary tag settings: {e}")
        })?;
        set_meta(
            &tx,
            "main_schema_version",
            &main_schema_version().to_string(),
        )?;
        set_meta(&tx, "main_schema_hash", &compute_hash(MAIN_SCHEMA_SQL))?;
        tx.commit().map_err(|e| {
            format!("DB_SCHEMA_MIGRATION_FAILED: Failed to commit schema update: {e}")
        })?;
        Ok::<(), String>(())
    })();
    conn.pragma_update(None, "foreign_keys", true)
        .map_err(|e| e.to_string())?;
    result?;
    super::document_task_identities::prepare(conn)
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
