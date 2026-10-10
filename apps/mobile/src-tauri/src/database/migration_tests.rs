use super::*;

#[test]
fn fresh_database_is_initialized_at_current_schema_version() {
    let conn = Connection::open_in_memory().unwrap();
    ensure_main_schema(&conn).unwrap();
    assert_eq!(
        get_meta(&conn, "main_schema_version").unwrap(),
        Some(MAIN_SCHEMA_VERSION.to_string())
    );
    let tables: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='contents'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(tables, 1);
    // 重复打开幂等，不再触发任何写
    ensure_main_schema(&conn).unwrap();
    assert_eq!(
        get_meta(&conn, "main_schema_version").unwrap(),
        Some(MAIN_SCHEMA_VERSION.to_string())
    );
}

#[test]
fn legacy_database_below_baseline_is_rejected_without_modification() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "CREATE TABLE contents(id INTEGER PRIMARY KEY, create_time INTEGER, update_time INTEGER, content TEXT, count INTEGER, ref_count INTEGER);
         CREATE TABLE chat_message(id INTEGER PRIMARY KEY, messages TEXT);",
    )
    .unwrap();
    let error = ensure_main_schema(&conn).unwrap_err();
    assert!(
        error.contains("DB_LEGACY_SCHEMA"),
        "unexpected error: {error}"
    );
    // 拒绝进入不修改数据：旧表保持原样
    let preserved: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE name='chat_message'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(preserved, 1);
}

#[test]
fn future_version_is_not_downgraded() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "CREATE TABLE schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
         INSERT INTO schema_meta VALUES ('main_schema_version', '999', 0);",
    )
    .unwrap();
    let error = ensure_main_schema(&conn).unwrap_err();
    assert!(
        error.contains("DB_SCHEMA_INCOMPATIBLE"),
        "unexpected error: {error}"
    );
}

#[test]
fn schema_hash_drift_rebuilds_indexes_at_same_version() {
    let conn = Connection::open_in_memory().unwrap();
    ensure_main_schema(&conn).unwrap();
    // 同版本号下模拟 schema 演进：删掉一个索引并使 hash 失效，重新打开应按当前 schema 重建
    conn.execute_batch("DROP INDEX idx_contents_update_time;")
        .unwrap();
    set_meta(&conn, "main_schema_hash", "stale").unwrap();
    ensure_main_schema(&conn).unwrap();
    let index: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_contents_update_time'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(index, 1);
    assert_eq!(
        get_meta(&conn, "main_schema_hash").unwrap().as_deref(),
        Some(compute_hash(MAIN_SCHEMA_SQL).as_str())
    );
}

/// v4 库样本：旧调度列结构（review_level/ease_factor）+ 一张已学卡与历史评分
fn v4_database_with_flashcards() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "CREATE TABLE schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
         INSERT INTO schema_meta VALUES ('main_schema_version', '4', 0);
         CREATE TABLE flashcard_decks(id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
           cover_color TEXT DEFAULT '#2563eb', emoji TEXT DEFAULT '🧠', sort_order INTEGER DEFAULT 0, meta TEXT,
           create_time INTEGER NOT NULL, update_time INTEGER NOT NULL);
         CREATE TABLE flashcards(id INTEGER PRIMARY KEY, deck_id INTEGER NOT NULL, type TEXT NOT NULL,
           prompt TEXT NOT NULL, detail TEXT DEFAULT '', data TEXT NOT NULL, tags TEXT DEFAULT '[]',
           difficulty TEXT DEFAULT 'standard', review_level INTEGER DEFAULT 0, due_time INTEGER NOT NULL,
           last_review_time INTEGER, review_count INTEGER DEFAULT 0, ease_factor REAL DEFAULT 2.5,
           status TEXT DEFAULT 'new', reference_summary TEXT, create_time INTEGER NOT NULL, update_time INTEGER NOT NULL);
         CREATE TABLE flashcard_reviews(id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL, deck_id INTEGER NOT NULL,
           rating TEXT NOT NULL, review_time INTEGER NOT NULL, interval INTEGER NOT NULL,
           review_level INTEGER NOT NULL, ease_factor REAL NOT NULL, notes TEXT);
         INSERT INTO flashcard_decks VALUES (1, '卡组', '', '#2563eb', '🧠', 0, NULL, 0, 0);
         INSERT INTO flashcards VALUES (10, 1, 'qa', '[]', '[]', '{}', '[]', 'standard',
           3, 1000, 500, 2, 2.5, 'review', NULL, 0, 0);
         INSERT INTO flashcards VALUES (11, 1, 'qa', '[]', '[]', '{}', '[]', 'standard',
           0, 1000, NULL, 0, 2.5, 'new', NULL, 0, 0);
         INSERT INTO flashcard_reviews VALUES (1, 10, 1, 'normal', 500, 86400000, 1, 2.5, NULL);
         INSERT INTO flashcard_reviews VALUES (2, 10, 1, 'normal', 500, 604800000, 3, 2.5, NULL);",
    )
    .unwrap();
    conn
}

#[test]
fn v4_database_migrates_flashcards_to_fsrs_columns() {
    let conn = v4_database_with_flashcards();
    // v4 先升 v5（FSRS），再链式升 v6（卡片连接迁 content_links）
    ensure_main_schema(&conn).unwrap();

    assert_eq!(
        get_meta(&conn, "main_schema_version").unwrap().as_deref(),
        Some(MAIN_SCHEMA_VERSION.to_string()).as_deref()
    );
    // 旧调度列退役，新记忆状态列就位；已学卡按 SM-2 公式回填（0.9 保留率下稳定性=旧间隔天数）
    let (stability, difficulty): (Option<f64>, Option<f64>) = conn
        .query_row(
            "SELECT memory_stability, memory_difficulty FROM flashcards WHERE id = 10",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert!((stability.unwrap() - 7.0).abs() < 1e-4);
    assert!(difficulty.unwrap() > 1.0 && difficulty.unwrap() < 10.0);
    // 新卡不回填，历史评分保留且快照列按默认 0 落库
    let new_card: Option<f64> = conn
        .query_row(
            "SELECT memory_stability FROM flashcards WHERE id = 11",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(new_card.is_none());
    let (history, snapshot): (i64, f64) = conn
        .query_row(
            "SELECT COUNT(*), MAX(stability) FROM flashcard_reviews WHERE card_id = 10",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(history, 2);
    assert_eq!(snapshot, 0.0);
}

/// 迁移是手写 DDL，钉住「迁移后列结构 == 全新建库列结构」，防止与 schema 分片漂移
#[test]
fn migrated_flashcard_tables_match_fresh_schema_columns() {
    let migrated = v4_database_with_flashcards();
    ensure_main_schema(&migrated).unwrap();
    let fresh = Connection::open_in_memory().unwrap();
    ensure_main_schema(&fresh).unwrap();

    for table in ["flashcards", "flashcard_reviews"] {
        let columns = |conn: &Connection| {
            conn.prepare(&format!("PRAGMA table_info({table})"))
                .unwrap()
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, Option<String>>(4)?,
                    ))
                })
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };
        assert_eq!(columns(&migrated), columns(&fresh), "table {table}");
    }
}

/// v5 库样本：cards.links（JSON 卡片 id 数组）里存着双向卡片连接
fn v5_database_with_card_links() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "CREATE TABLE schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
         INSERT INTO schema_meta VALUES ('main_schema_version', '5', 0);
         CREATE TABLE cards(id INTEGER PRIMARY KEY, create_time INTEGER NOT NULL, update_time INTEGER NOT NULL,
           tags TEXT, links TEXT, content_id INTEGER, is_top INTEGER DEFAULT 0, podcast_id INTEGER DEFAULT NULL);
         INSERT INTO cards VALUES (1, 0, 0, '[]', '[2,3,6,8]', 11, 0, NULL);
         INSERT INTO cards VALUES (2, 0, 0, '[]', '[1]', 12, 0, NULL);
         INSERT INTO cards VALUES (3, 0, 0, '[]', '[1]', 13, 0, NULL);
         INSERT INTO cards VALUES (4, 0, 0, '[]', '[]', 14, 0, NULL);
         INSERT INTO cards VALUES (5, 0, 0, '[]', '[99]', 15, 0, NULL);
         -- 6 与 1 共用正文 11：不互连；7 的 links 是坏 JSON：不产出边、不炸迁移；8 的 content_id 为 NULL：跳过
         INSERT INTO cards VALUES (6, 0, 0, '[]', '[1]', 11, 0, NULL);
         INSERT INTO cards VALUES (7, 0, 0, '[]', '{bad json', 17, 0, NULL);
         INSERT INTO cards VALUES (8, 0, 0, '[]', '[1]', NULL, 0, NULL);",
    )
    .unwrap();
    conn
}

#[test]
fn v5_database_migrates_card_links_to_content_links() {
    let conn = v5_database_with_card_links();
    ensure_main_schema(&conn).unwrap();

    assert_eq!(
        get_meta(&conn, "main_schema_version").unwrap().as_deref(),
        Some(MAIN_SCHEMA_VERSION.to_string()).as_deref()
    );
    // 双边冗余写收敛为无向边单行（规范化小正文 id 在前）：1↔2、1↔3；悬空目标（卡 99）丢弃
    let edges: Vec<(i64, i64)> = conn
        .prepare("SELECT content_id, target_content_id FROM content_links ORDER BY content_id, target_content_id")
        .unwrap()
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(edges, vec![(11, 12), (11, 13)]);
    // cards.links 清空（列退役），重复打开幂等不再触发迁移写
    let remaining: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM cards WHERE links IS NOT NULL AND links NOT IN ('[]', '', 'null')",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(remaining, 0);
    ensure_main_schema(&conn).unwrap();
    let edges_after: i64 = conn
        .query_row("SELECT COUNT(*) FROM content_links", [], |r| r.get(0))
        .unwrap();
    assert_eq!(edges_after, 2);
}
