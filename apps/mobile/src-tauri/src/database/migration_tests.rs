use super::*;

#[test]
fn resource_retirement_preserves_attachments_and_repeats() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(MAIN_SCHEMA_SQL).unwrap();
    conn.execute_batch("CREATE TABLE resources(id INTEGER, path TEXT);
        CREATE INDEX idx_resources_path ON resources(path);
        CREATE TABLE resource_group(id INTEGER);
        CREATE TABLE resource_scan_version(id INTEGER);
        INSERT INTO resources VALUES(42,'/saved.png');
        INSERT INTO contents(id,create_time,update_time,content,count,ref_count)
        VALUES(1,1,1,'[{\"url\":\"/saved.png\"}]',0,1);
        INSERT INTO chat_message(id,create_time,update_time,messages)
        VALUES(1,1,1,'[{\"resourceId\":42,\"path\":\"/saved.png\"}]');
        INSERT INTO resource_sync_blacklist(file_name,create_time,update_time) VALUES('saved.png',1,1);
        INSERT INTO operation(operation_content_type,operation_time) VALUES('resource',1),('content',1);").unwrap();
    ensure_main_schema(&conn).unwrap();
    ensure_main_schema(&conn).unwrap();
    let retired: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE name IN
        ('resources','resource_group','resource_scan_version','idx_resources_path')",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(retired, 0);
    let content: String = conn
        .query_row("SELECT content FROM contents WHERE id=1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(content, "[{\"url\":\"/saved.png\"}]");
    let messages: String = conn
        .query_row("SELECT messages FROM chat_message WHERE id=1", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert!(messages.contains("/saved.png"));
    let operation: String = conn
        .query_row("SELECT operation_content_type FROM operation", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(operation, "content");
    let blacklist: String = conn
        .query_row("SELECT file_name FROM resource_sync_blacklist", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(blacklist, "saved.png");
}

#[test]
fn resource_retirement_failure_rolls_back() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(MAIN_SCHEMA_SQL).unwrap();
    conn.execute_batch(
        "CREATE TABLE resources(id INTEGER); INSERT INTO resources VALUES(42);
        CREATE VIEW resource_scan_version AS SELECT 1;
        INSERT INTO operation(operation_content_type,operation_time) VALUES('resource',1);",
    )
    .unwrap();
    assert!(ensure_main_schema(&conn).is_err());
    let id: i64 = conn
        .query_row("SELECT id FROM resources", [], |r| r.get(0))
        .unwrap();
    assert_eq!(id, 42);
    let operation: String = conn
        .query_row("SELECT operation_content_type FROM operation", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(operation, "resource");
}

fn legacy_database(reference: &str) -> Connection {
    let output = std::process::Command::new("git")
        .args([
            "show",
            &format!("{reference}:packages/db-schema/schema/main.sql"),
        ])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("历史迁移测试需要 Git");
    assert!(output.status.success(), "缺少历史 schema: {reference}");
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(std::str::from_utf8(&output.stdout).unwrap())
        .unwrap();
    conn
}

#[test]
fn historical_schemas_upgrade_and_repeat_without_missing_columns() {
    for reference in ["1a5e853e", "9f072e4e", "98de2f61", "092cadeb"] {
        let conn = legacy_database(reference);
        ensure_main_schema(&conn).unwrap_or_else(|e| panic!("{reference}: {e}"));
        ensure_main_schema(&conn).unwrap();
        assert!(!needs_main_upgrade(&conn).unwrap());
        assert_eq!(
            get_meta(&conn, "main_schema_version").unwrap(),
            Some("3".into())
        );
        conn.prepare("SELECT tags FROM diary_entries").unwrap();
        conn.prepare("SELECT agent_type,agent_session_id,message_schema_version,title_dirty FROM chat_message").unwrap();
    }
}

#[test]
fn legacy_data_keeps_ids_references_and_message_version() {
    let conn = legacy_database("9f072e4e");
    conn.execute_batch("INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(100,11,12,'[]',8,1),(101,21,22,'[]',9,1);
        INSERT INTO daily_notes(id,date,content_id) VALUES(1,'2026-02-20',100);
        INSERT INTO diary_entries(id,type,date,content_id,word_count,create_time,update_time) VALUES(2,'weekly','2026-W08',101,9,21,22);
        INSERT INTO chat_message(id,create_time,update_time,messages) VALUES(3,1,1,'[]');").unwrap();
    ensure_main_schema(&conn).unwrap();
    ensure_main_schema(&conn).unwrap();
    assert_eq!(
        conn.query_row("SELECT COUNT(*) FROM diary_segments", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        2
    );
    assert_eq!(
        conn.query_row(
            "SELECT COUNT(*) FROM diary_entries WHERE content_id IS NOT NULL",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
    assert_eq!(
        conn.query_row("SELECT ref_count FROM contents WHERE id=101", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        conn.query_row("SELECT tags FROM diary_entries WHERE id=2", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "[\"周记\"]"
    );
    // 旧 entry 级标签迁移后应回填到片段上（标签绑 segment）
    assert_eq!(
        conn.query_row(
            "SELECT s.tags FROM diary_segments s JOIN diary_entries e ON e.id=s.diary_id WHERE e.id=2",
            [],
            |r| r.get::<_, String>(0)
        )
        .unwrap(),
        "[\"周记\"]"
    );
    assert_eq!(
        conn.query_row(
            "SELECT message_schema_version FROM chat_message WHERE id=3",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        1
    );
}

#[test]
fn failed_migration_rolls_back_schema_and_meta() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("CREATE TABLE contents(id TEXT PRIMARY KEY,create_time INTEGER NOT NULL,update_time INTEGER NOT NULL,content TEXT,count INTEGER DEFAULT 0,ref_count INTEGER DEFAULT 0);").unwrap();
    assert!(ensure_main_schema(&conn).is_err());
    assert_eq!(
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        1
    );
}

#[test]
fn future_version_is_not_downgraded() {
    let conn = Connection::open_in_memory().unwrap();
    ensure_main_schema(&conn).unwrap();
    set_meta(&conn, "main_schema_version", "999").unwrap();
    assert!(ensure_main_schema(&conn)
        .unwrap_err()
        .contains("DB_SCHEMA_INCOMPATIBLE"));
    assert_eq!(
        get_meta(&conn, "main_schema_version").unwrap(),
        Some("999".into())
    );
}

#[test]
fn legacy_segment_position_is_removed_without_changing_identity() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(MAIN_SCHEMA_SQL).unwrap();
    conn.execute_batch("ALTER TABLE diary_segments ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
        INSERT INTO contents VALUES(1,1,1,'[]',2,1);
        INSERT INTO diary_entries(id,type,date,content_id,word_count,create_time,update_time) VALUES(1,'daily','2026-09-09',NULL,2,1,1);
        INSERT INTO diary_segments(id,diary_id,content_id,create_time,update_time) VALUES(44,1,1,5,6);").unwrap();
    ensure_main_schema(&conn).unwrap();
    assert!(
        !crate::database::main_upgrade::has_column(&conn, "diary_segments", "position").unwrap()
    );
    assert_eq!(
        conn.query_row("SELECT id FROM diary_segments", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        44
    );
}
