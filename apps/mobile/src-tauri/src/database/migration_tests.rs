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
    ensure_main_schema(&conn).unwrap();

    assert_eq!(
        get_meta(&conn, "main_schema_version").unwrap().as_deref(),
        Some("5")
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
