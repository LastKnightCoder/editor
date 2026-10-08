use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use sha1::{Digest, Sha1};

const MAIN_SCHEMA_SQL: &str = include_str!("../../../../../packages/db-schema/schema/main.sql");
const INDEX_SCHEMA_SQL: &str = include_str!("../../../../../packages/db-schema/schema/index.sql");
const INDEX_VEC_TEMPLATE_SQL: &str =
    include_str!("../../../../../packages/db-schema/schema/index/20_vec_template.sql");

pub(super) const MAIN_SCHEMA_VERSION: i64 = 6;
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

fn has_user_tables(conn: &Connection) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_meta')",
        [],
        |r| r.get(0),
    )
    .map_err(|e| e.to_string())
}

/// 数据基线门禁：低于 v4 且非空库的数据库来自未完成历史升级的旧版本，拒绝进入；
/// v4 → v5 走 FSRS 表迁移（migrate_v4_to_v5），v5 → v6 走卡片连接迁移（migrate_v5_to_v6）。
/// 后续 schema 演进 = 版本号递增 + 显式迁移代码；hash 变化只负责补建新表与新索引。
/// v4 → v5：闪卡调度从自研间隔阶梯迁移到 FSRS——flashcards/flashcard_reviews 表重建
/// （review_level/ease_factor 退役，新增 memory_stability/memory_difficulty 与历史快照列），
/// 存量卡片记忆状态由 fsrs memory_state_from_sm2 从旧 ease 与最近间隔回填。
/// 建表语句与 packages/db-schema/schema/main/50_learning.sql、90_indexes.sql 同步，
/// 桌面端等价实现在 apps/desktop/src-electron/main/modules/tables/flashcard.ts 的 upgradeTable；
/// migration_tests 校验迁移后列结构与全新建库完全一致。
fn migrate_v4_to_v5(conn: &Connection) -> Result<(), String> {
    const MIGRATE_SQL: &str = "
        CREATE TABLE flashcard_reviews_v5 (
          id INTEGER PRIMARY KEY,
          card_id INTEGER NOT NULL,
          deck_id INTEGER NOT NULL,
          rating TEXT NOT NULL,
          review_time INTEGER NOT NULL,
          interval INTEGER NOT NULL,
          stability REAL NOT NULL DEFAULT 0,
          difficulty REAL NOT NULL DEFAULT 0,
          notes TEXT,
          FOREIGN KEY(card_id) REFERENCES flashcards(id),
          FOREIGN KEY(deck_id) REFERENCES flashcard_decks(id)
        );
        INSERT INTO flashcard_reviews_v5 (id, card_id, deck_id, rating, review_time, interval, notes)
          SELECT id, card_id, deck_id, rating, review_time, interval, notes FROM flashcard_reviews;
        DROP TABLE flashcard_reviews;
        ALTER TABLE flashcard_reviews_v5 RENAME TO flashcard_reviews;

        CREATE TABLE flashcards_v5 (
          id INTEGER PRIMARY KEY,
          deck_id INTEGER NOT NULL,
          type TEXT NOT NULL,
          prompt TEXT NOT NULL,
          detail TEXT DEFAULT '',
          data TEXT NOT NULL,
          tags TEXT DEFAULT '[]',
          difficulty TEXT DEFAULT 'standard',
          due_time INTEGER NOT NULL,
          last_review_time INTEGER,
          review_count INTEGER DEFAULT 0,
          memory_stability REAL,
          memory_difficulty REAL,
          status TEXT DEFAULT 'new',
          reference_summary TEXT,
          create_time INTEGER NOT NULL,
          update_time INTEGER NOT NULL,
          FOREIGN KEY(deck_id) REFERENCES flashcard_decks(id)
        );
        INSERT INTO flashcards_v5 (id, deck_id, type, prompt, detail, data, tags, difficulty,
          due_time, last_review_time, review_count, status, reference_summary, create_time, update_time)
          SELECT id, deck_id, type, prompt, detail, data, tags, difficulty,
          due_time, last_review_time, review_count, status, reference_summary, create_time, update_time
          FROM flashcards;
        DROP TABLE flashcards;
        ALTER TABLE flashcards_v5 RENAME TO flashcards;

        CREATE INDEX IF NOT EXISTS idx_flashcards_deck ON flashcards(deck_id);
        CREATE INDEX IF NOT EXISTS idx_flashcards_due_time ON flashcards(due_time);
        CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_card ON flashcard_reviews(card_id);
        CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_time ON flashcard_reviews(review_time);
    ";

    // 自愈：上次迁移已提交但版本号未写入（表结构已无 ease_factor）时直接补版本号，
    // 避免重复迁移在读旧列时 no such column 而永久卡死
    let has_ease_factor: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('flashcards') WHERE name = 'ease_factor')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(false);
    if !has_ease_factor {
        // 写 v5 而非当前版本：cards.links 的 v5→v6 迁移仍需执行
        return set_meta(conn, "main_schema_version", "5");
    }

    // 迁移输入须在旧表重建前读取：旧 ease 与最近一次调度的间隔
    let mut stmt = conn
        .prepare(
            "SELECT f.id, f.ease_factor, COALESCE(\
             (SELECT r.interval FROM flashcard_reviews r WHERE r.card_id = f.id ORDER BY r.id DESC LIMIT 1), 0) \
             FROM flashcards f WHERE f.review_count > 0",
        )
        .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: prepare flashcard v4 input: {e}"))?;
    let inputs: Vec<(i64, f64, i64)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: query flashcard v4 input: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: parse flashcard v4 input: {e}"))?;

    conn.execute_batch("PRAGMA foreign_keys = OFF;")
        .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: disable foreign_keys: {e}"))?;
    // 表重建、回填与版本号写入同事务：消除「表已迁移、版本号未写」的中间态
    let migrate = || -> Result<(), String> {
        let tx = rusqlite::Transaction::new_unchecked(conn, TransactionBehavior::Immediate)
            .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: begin v4->v5: {e}"))?;
        tx.execute_batch(MIGRATE_SQL)
            .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: rebuild flashcard tables: {e}"))?;
        for (card_id, ease_factor, interval_ms) in &inputs {
            // memory_from_sm2 以常量参数构造，失败仅理论可能；None 时该卡保持 NULL（=新卡重学）
            if let Some((stability, difficulty)) =
                super::flashcard::memory_from_sm2(*ease_factor, *interval_ms)
            {
                tx.execute(
                    "UPDATE flashcards SET memory_stability = ?1, memory_difficulty = ?2 WHERE id = ?3",
                    params![stability, difficulty, card_id],
                )
                .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: backfill memory state: {e}"))?;
            }
        }
        set_meta(&tx, "main_schema_version", "5")?;
        tx.commit()
            .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: commit v4->v5: {e}"))
    };
    let result = migrate();
    // 失败路径同样恢复连接级外键约束，避免调用方复用连接时失去保护
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: restore foreign_keys: {e}"))?;
    result
}

/// v5 → v6：卡片显式连接从 cards.links（JSON 卡片 id 数组，双边冗余写）迁到 content_links
/// （无向边、一行一条、绑定 contents.id）——共用正文的身份（如从卡片创建的项目文档）自此
/// 共享同一组连接。cards.links 列退役不再读写，但物理保留（避免核心表重建）。
/// 建表与索引语句同 packages/db-schema/schema/main/20_content.sql、90_indexes.sql；
/// 桌面端等价实现在 apps/desktop/src-electron/main/modules/tables/content-link.ts 的 migrateCardsLinks。
fn migrate_v5_to_v6(conn: &Connection) -> Result<(), String> {
    // 自愈：上次迁移已提交但版本号未写入（cards.links 已全部清空）时直接补版本号
    let pending: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM cards WHERE links IS NOT NULL AND links NOT IN ('[]', '', 'null'))",
            [],
            |r| r.get(0),
        )
        .unwrap_or(false);
    if !pending {
        return set_meta(conn, "main_schema_version", &MAIN_SCHEMA_VERSION.to_string());
    }

    let tx = rusqlite::Transaction::new_unchecked(conn, TransactionBehavior::Immediate)
        .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: begin v5->v6: {e}"))?;
    tx.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS content_links (
          content_id INTEGER NOT NULL,
          target_content_id INTEGER NOT NULL,
          create_time INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_content_links_pair
          ON content_links(content_id, target_content_id);
        CREATE INDEX IF NOT EXISTS idx_content_links_target ON content_links(target_content_id);

        INSERT OR IGNORE INTO content_links (content_id, target_content_id, create_time)
        SELECT MIN(c.content_id, t.content_id), MAX(c.content_id, t.content_id),
               CAST(strftime('%s', 'now') AS INTEGER) * 1000
        FROM cards c, json_each(CASE WHEN json_valid(c.links) THEN c.links ELSE '[]' END) je
        JOIN cards t ON t.id = CAST(je.value AS INTEGER) AND t.content_id IS NOT NULL
        WHERE c.content_id IS NOT NULL AND c.content_id != t.content_id;

        UPDATE cards SET links = '[]';
        ",
    )
    .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: migrate cards.links to content_links: {e}"))?;
    set_meta(&tx, "main_schema_version", &MAIN_SCHEMA_VERSION.to_string())?;
    tx.commit()
        .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: commit v5->v6: {e}"))
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

    ensure_schema_meta(conn)?;
    let stored_version = get_meta(conn, "main_schema_version")?
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    if stored_version > MAIN_SCHEMA_VERSION {
        return Err("DB_SCHEMA_INCOMPATIBLE: 数据库来自更新的移动端，请先升级应用".into());
    }
    if stored_version == 4 && has_user_tables(conn)? {
        migrate_v4_to_v5(conn)?;
        migrate_v5_to_v6(conn)?;
    } else if stored_version == MAIN_SCHEMA_VERSION - 1 && has_user_tables(conn)? {
        migrate_v5_to_v6(conn)?;
    } else if stored_version < MAIN_SCHEMA_VERSION && has_user_tables(conn)? {
        return Err(
            "DB_LEGACY_SCHEMA: 数据库尚未完成历史数据升级（schema 版本低于当前基线）。请先用最后升级版本打开该库完成升级，再更新到当前版本。"
                .into(),
        );
    }
    if !needs_main_upgrade(conn)? {
        return Ok(());
    }

    // 全新空库，或 schema 演进（同版本号内的新表/新索引）：按当前 schema 补齐
    let baseline = Connection::open_in_memory().map_err(|e| e.to_string())?;
    baseline
        .execute_batch(MAIN_SCHEMA_SQL)
        .map_err(|e| e.to_string())?;
    let tx = rusqlite::Transaction::new_unchecked(conn, TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    tx.execute_batch(MAIN_SCHEMA_SQL)
        .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: Failed to apply main schema: {e}"))?;
    let mut indexes = baseline
        .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL")
        .map_err(|e| e.to_string())?;
    for sql in indexes
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
    {
        let sql = sql.map_err(|e| e.to_string())?;
        // sqlite_master 会去掉 IF NOT EXISTS，直接重建保证旧定义的索引被替换
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
    tx.execute(
        "INSERT INTO diary_tag_settings(name,color,sort,create_time,update_time)
         VALUES(?1,'#52c41a',0,?2,?2),('月记','#fa8c16',1,?2,?2)
         ON CONFLICT(name) DO NOTHING",
        params!["周记", now_millis()],
    )
    .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: Failed to seed diary tag settings: {e}"))?;
    set_meta(&tx, "main_schema_version", &MAIN_SCHEMA_VERSION.to_string())?;
    set_meta(&tx, "main_schema_hash", &compute_hash(MAIN_SCHEMA_SQL))?;
    tx.commit()
        .map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: Failed to commit schema update: {e}"))?;
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
