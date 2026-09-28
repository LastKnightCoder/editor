use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use sha1::{Digest, Sha1};

const MAIN_SCHEMA_SQL: &str = include_str!("../../../../../packages/db-schema/schema/main.sql");
const INDEX_SCHEMA_SQL: &str = include_str!("../../../../../packages/db-schema/schema/index.sql");
const INDEX_VEC_TEMPLATE_SQL: &str =
    include_str!("../../../../../packages/db-schema/schema/index/20_vec_template.sql");

pub(super) const MAIN_SCHEMA_VERSION: i64 = 4;
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

pub(super) fn needs_main_upgrade(conn: &Connection) -> Result<bool, String> {
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='schema_meta' AND type='table')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !exists {
        return Ok(true);
    }
    Ok(get_meta(conn, "main_schema_version")?.as_deref()
        != Some(MAIN_SCHEMA_VERSION.to_string().as_str())
        || get_meta(conn, "main_schema_hash")?.as_deref()
            != Some(compute_hash(MAIN_SCHEMA_SQL).as_str()))
}

pub fn ensure_main_schema(conn: &Connection) -> Result<(), String> {
    let retired_tables_exist: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name IN ('read_later','rss_entry','rss_subscription','rss_feed'))",
        [], |row| row.get(0),
    ).map_err(|e| format!("SUBSCRIPTION_RETIREMENT_FAILED: {e}"))?;
    if retired_tables_exist {
        if let Some(path) = conn.path().filter(|path| !path.is_empty() && *path != ":memory:") {
            let backup = format!("{path}.pre-subscription-retirement-v1-{}.bak", uuid::Uuid::new_v4());
            conn.execute("VACUUM INTO ?1", [&backup])
                .map_err(|e| format!("SUBSCRIPTION_RETIREMENT_FAILED: 备份数据库失败: {e}"))?;
        }
    }
    // 下线功能的残留表（prompt / notion_sync 可能还有数据）：删前备份，与桌面同一文件名
    if super::main_upgrade::has_retired_features(conn)
        .map_err(|e| format!("FEATURE_TABLE_RETIREMENT_FAILED: {e}"))?
    {
        if let Some(path) = conn.path().filter(|path| !path.is_empty() && *path != ":memory:") {
            let backup = format!(
                "{path}.pre-feature-table-retirement-v1-{}.bak",
                uuid::Uuid::new_v4()
            );
            conn.execute("VACUUM INTO ?1", [&backup])
                .map_err(|e| format!("FEATURE_TABLE_RETIREMENT_FAILED: 备份数据库失败: {e}"))?;
        }
    }
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
        ",
    )
    .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: Failed to set main PRAGMA: {e}"))?;

    let baseline = Connection::open_in_memory().map_err(|e| e.to_string())?;
    baseline
        .execute_batch(MAIN_SCHEMA_SQL)
        .map_err(|e| e.to_string())?;
    // 立即取写锁：升级事务含全表扫描与 JSON 重写，避免延迟加锁时被并发写入打断成裸 BUSY 错误
    let tx = rusqlite::Transaction::new_unchecked(conn, TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    ensure_schema_meta(&tx)?;
    let stored = get_meta(&tx, "main_schema_version")?
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    if stored > MAIN_SCHEMA_VERSION {
        return Err("DB_SCHEMA_INCOMPATIBLE: 数据库来自更新的移动端，请先升级应用".into());
    }
    if stored < MAIN_SCHEMA_VERSION
        || get_meta(&tx, "main_schema_hash")?.as_deref()
            != Some(compute_hash(MAIN_SCHEMA_SQL).as_str())
    {
        super::main_upgrade::upgrade(&tx, &baseline, now_millis())?;
    }
    tx.execute_batch("DROP TABLE IF EXISTS read_later;
        DROP TABLE IF EXISTS rss_entry;
        DROP TABLE IF EXISTS rss_subscription;
        DROP TABLE IF EXISTS rss_feed;")
        .map_err(|e| format!("SUBSCRIPTION_RETIREMENT_FAILED: {e}"))?;
    // 桌面旧聊天链路的运行记录（pi 迁移 M8）：只存运行中状态，移动端从不读
    tx.execute_batch("DROP TABLE IF EXISTS chat_run;")
        .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: {e}"))?;
    super::main_upgrade::retire_feature_tables(&tx)
        .map_err(|e| format!("FEATURE_TABLE_RETIREMENT_FAILED: {e}"))?;
    super::knowledge_migration::migrate(&tx)?;
    super::main_upgrade::validate(&tx, &baseline)?;
    let broken_reference = tx
        .prepare("PRAGMA foreign_key_check")
        .map_err(|e| e.to_string())?
        .query_row([], |r| r.get::<_, String>(0))
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(table) = broken_reference {
        return Err(format!(
            "DB_SCHEMA_INCOMPATIBLE: {table} 存在无效外键引用，已停止升级"
        ));
    }
    if needs_main_upgrade(&tx)? {
        // 补列后再创建索引，避免旧表缺列导致整库打不开。
        let mut indexes = baseline
            .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL")
            .map_err(|e| e.to_string())?;
        for sql in indexes
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
        {
            let sql = sql.map_err(|e| e.to_string())?;
            // sqlite_master 会去掉 IF NOT EXISTS，重建索引只在升级时执行。
            let name: String = baseline
                .query_row("SELECT name FROM sqlite_master WHERE sql=?1", [&sql], |r| {
                    r.get(0)
                })
                .map_err(|e| e.to_string())?;
            tx.execute_batch(&format!(
                "DROP INDEX IF EXISTS \"{}\"",
                name.replace('"', "\"\"")
            ))
            .map_err(|e| e.to_string())?;
            tx.execute_batch(&sql).map_err(|e| e.to_string())?;
        }
    }
    set_meta(&tx, "main_schema_version", &MAIN_SCHEMA_VERSION.to_string())?;
    set_meta(&tx, "main_schema_hash", &compute_hash(MAIN_SCHEMA_SQL))?;
    tx.commit()
        .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: {e}"))?;
    super::editor_block_retirement::retire(conn)
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
