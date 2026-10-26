use super::*;

fn total_changes(conn: &Connection) -> i64 {
    conn.query_row("SELECT total_changes()", [], |row| row.get(0))
        .unwrap()
}

#[test]
fn fresh_database_is_initialized_at_current_schema_version() {
    let conn = Connection::open_in_memory().unwrap();
    ensure_main_schema(&conn).unwrap();
    assert_eq!(
        get_meta(&conn, "main_schema_version").unwrap(),
        Some(main_schema_version().to_string())
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
        Some(main_schema_version().to_string())
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
        error.contains("DB_SCHEMA_INCOMPATIBLE"),
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
fn schema_hash_drift_adds_missing_indexes_at_same_version() {
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

#[test]
fn unsupported_versions_keep_original_tables_and_rows() {
    for version in [4, 5, 6, 7, 8, 9, 999] {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
            CREATE TABLE questions(id INTEGER PRIMARY KEY, content TEXT);
            INSERT INTO questions VALUES (1, '保留原数据');").unwrap();
        set_meta(&conn, "main_schema_version", &version.to_string()).unwrap();
        let before = total_changes(&conn);
        assert!(ensure_main_schema(&conn)
            .unwrap_err()
            .contains("DB_SCHEMA_INCOMPATIBLE"));
        assert_eq!(total_changes(&conn), before);
        assert_eq!(
            get_meta(&conn, "main_schema_version").unwrap(),
            Some(version.to_string())
        );
        assert_eq!(
            conn.query_row("SELECT content FROM questions", [], |row| row
                .get::<_, String>(0))
                .unwrap(),
            "保留原数据"
        );
    }
}

#[test]
fn current_baseline_has_no_card_links_and_seeds_web_provider() {
    let conn = Connection::open_in_memory().unwrap();
    ensure_main_schema(&conn).unwrap();
    let retired: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('cards') WHERE name='links'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(retired, 0);
    assert_eq!(
        conn.query_row(
            "SELECT label FROM excerpt_provider WHERE source_type='web'",
            [],
            |row| row.get::<_, String>(0)
        )
        .unwrap(),
        "网页"
    );
    let before = total_changes(&conn);
    ensure_main_schema(&conn).unwrap();
    assert_eq!(total_changes(&conn), before);
}

#[test]
fn failed_initialization_does_not_leave_partial_schema_or_version() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("CREATE VIEW contents AS SELECT 1 AS id")
        .unwrap();
    assert!(ensure_main_schema(&conn).is_err());
    assert_eq!(
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            [],
            |row| row.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
}
