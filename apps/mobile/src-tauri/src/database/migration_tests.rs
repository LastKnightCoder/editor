use super::*;

#[test]
fn startup_cleans_all_local_databases_and_pairing_files() {
    let directory =
        std::env::temp_dir().join(format!("tau-retired-state-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(directory.join("device-sync")).unwrap();
    std::fs::write(directory.join("device-sync/peer.json"), "旧配置").unwrap();
    std::fs::write(directory.join("setting.json"), "云端设置").unwrap();
    for name in ["active.db", "inactive.DB"] {
        let conn = Connection::open(directory.join(name)).unwrap();
        conn.execute_batch("CREATE TABLE notes(content TEXT); INSERT INTO notes VALUES('正文'); CREATE TABLE _tau_device_state(payload TEXT); INSERT INTO _tau_device_state VALUES('旧同步状态')").unwrap();
    }
    remove_retired_database_state(&directory).unwrap();
    remove_retired_database_state(&directory).unwrap();
    assert!(!directory.join("device-sync").exists());
    assert_eq!(
        std::fs::read_to_string(directory.join("setting.json")).unwrap(),
        "云端设置"
    );
    for name in ["active.db", "inactive.DB"] {
        let conn = Connection::open(directory.join(name)).unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT count(*) FROM sqlite_master WHERE name GLOB '_tau_device_*'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row("SELECT content FROM notes", [], |row| row
                .get::<_, String>(0))
                .unwrap(),
            "正文"
        );
    }
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn current_schema_removes_retired_sync_objects_and_preserves_business_data() {
    let conn = Connection::open_in_memory().unwrap();
    ensure_main_schema(&conn).unwrap();
    conn.execute_batch(
        "PRAGMA secure_delete=OFF;
         INSERT INTO contents(id,create_time,update_time,content,count) VALUES(1,1,1,'[]',0);
         CREATE TABLE _tau_device_log(id INTEGER PRIMARY KEY,payload TEXT);
         INSERT INTO _tau_device_log VALUES(1,'旧同步日志');
         CREATE TABLE _tau_device_local(id INTEGER PRIMARY KEY,generation TEXT);
         INSERT INTO _tau_device_local VALUES(1,'retained-generation');
         CREATE TABLE \"_tau_device_quarantine_a\"\"b\"(payload TEXT);
         CREATE INDEX _tau_device_log_index ON _tau_device_log(payload);
         CREATE TRIGGER _tau_device_capture_contents_UPDATE AFTER UPDATE ON contents
         BEGIN INSERT INTO _tau_device_log(payload) VALUES(NEW.content); END;
         CREATE TABLE _tau_devices_keep(id INTEGER);",
    )
    .unwrap();
    ensure_main_schema(&conn).unwrap();
    let retired: i64 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE name GLOB '_tau_device_*'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(retired, 0);
    assert_eq!(get_meta(&conn, "local_generation").unwrap(), None);
    assert_eq!(
        conn.pragma_query_value(None, "secure_delete", |row| row.get::<_, i64>(0))
            .unwrap(),
        0
    );
    conn.execute("INSERT INTO _tau_devices_keep VALUES(1)", [])
        .unwrap();
    conn.execute("UPDATE contents SET count=1 WHERE id=1", [])
        .unwrap();
    assert_eq!(
        conn.query_row(
            "SELECT count FROM content_snapshots WHERE id=1",
            [],
            |row| row.get::<_, i64>(0)
        )
        .unwrap(),
        1
    );
    let changes = total_changes(&conn);
    ensure_main_schema(&conn).unwrap();
    assert_eq!(total_changes(&conn), changes);
}

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
fn version_markers_do_not_block_opening_or_remove_data() {
    for version in [
        None,
        Some("4"),
        Some("5"),
        Some("6"),
        Some("7"),
        Some("8"),
        Some("9"),
        Some("999"),
    ] {
        let conn = Connection::open_in_memory().unwrap();
        ensure_main_schema(&conn).unwrap();
        conn.execute_batch(
            "ALTER TABLE cards ADD COLUMN links TEXT;
            CREATE TABLE questions(id INTEGER PRIMARY KEY, content TEXT);
            INSERT INTO questions VALUES (1, '保留原数据');",
        )
        .unwrap();
        if let Some(version) = version {
            set_meta(&conn, "main_schema_version", version).unwrap();
        } else {
            conn.execute_batch("DROP TABLE schema_meta").unwrap();
        }
        ensure_main_schema(&conn).unwrap();
        assert_eq!(
            get_meta(&conn, "main_schema_version").unwrap(),
            Some(main_schema_version().to_string())
        );
        assert_eq!(
            conn.query_row("SELECT content FROM questions", [], |row| row
                .get::<_, String>(0))
                .unwrap(),
            "保留原数据"
        );
        let before = total_changes(&conn);
        ensure_main_schema(&conn).unwrap();
        assert_eq!(total_changes(&conn), before);
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
