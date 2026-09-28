use super::*;

#[test]
fn subscription_retirement_preserves_saved_content_and_repeats() {
    let conn = Connection::open_in_memory().unwrap();
    ensure_main_schema(&conn).unwrap();
    conn.execute_batch(include_str!("../../../../../packages/db-schema/fixtures/subscription-retirement.sql")).unwrap();
    ensure_main_schema(&conn).unwrap();
    ensure_main_schema(&conn).unwrap();
    let retired: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE name IN ('rss_feed','rss_subscription','rss_entry','read_later','idx_rss_entry_read')",
        [], |r| r.get(0),
    ).unwrap();
    assert_eq!(retired, 0);
    for table in ["contents", "articles", "project", "project_item", "video_notes"] {
        let count: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM {table} WHERE id=900"), [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1, "{table} 不得删除");
    }
}

#[test]
fn feature_table_retirement_drops_leftovers_and_keeps_data() {
    let conn = Connection::open_in_memory().unwrap();
    ensure_main_schema(&conn).unwrap();
    conn.execute_batch(
        "CREATE TABLE history(id INTEGER); CREATE TABLE prompt(id INTEGER, title TEXT);
        CREATE INDEX idx_prompt_update_time ON prompt(id); INSERT INTO prompt VALUES(1,'留在备份里');
        CREATE TABLE skill(id INTEGER); CREATE TABLE notion_sync(id INTEGER);
        ALTER TABLE vibe_learning_resources ADD COLUMN is_chunked INTEGER DEFAULT 0;
        ALTER TABLE vibe_learning_resources ADD COLUMN chapter_count INTEGER DEFAULT 0;",
    )
    .unwrap();
    ensure_main_schema(&conn).unwrap();
    ensure_main_schema(&conn).unwrap();
    let left: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE name IN ('history','prompt','skill','notion_sync','idx_prompt_update_time')",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(left, 0);
    assert!(conn.prepare("SELECT is_chunked FROM vibe_learning_resources").is_err());
    conn.prepare("SELECT sort_index FROM vibe_learning_resources").unwrap();
}

#[test]
fn subscription_retirement_failure_rolls_back() {
    let conn = Connection::open_in_memory().unwrap();
    ensure_main_schema(&conn).unwrap();
    conn.execute_batch("CREATE TABLE read_later(id INTEGER); INSERT INTO read_later VALUES(42);
        CREATE VIEW rss_entry AS SELECT 1;").unwrap();
    assert!(ensure_main_schema(&conn).is_err());
    let id: i64 = conn.query_row("SELECT id FROM read_later", [], |r| r.get(0)).unwrap();
    assert_eq!(id, 42);
}

#[test]
fn subscription_retirement_snapshots_wal_and_restored_databases() {
    let dir = std::env::temp_dir().join(format!("tau-retirement-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("data.db");
    {
        let conn = Connection::open(&path).unwrap();
        ensure_main_schema(&conn).unwrap();
        conn.execute_batch("PRAGMA wal_autocheckpoint=0;").unwrap();
        conn.execute_batch(include_str!("../../../../../packages/db-schema/fixtures/subscription-retirement.sql")).unwrap();
        ensure_main_schema(&conn).unwrap();
        ensure_main_schema(&conn).unwrap();
    }
    let backups: Vec<_> = std::fs::read_dir(&dir).unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| path.to_string_lossy().contains(".pre-subscription-retirement-v1-"))
        .collect();
    assert_eq!(backups.len(), 1);
    {
        let snapshot = Connection::open(&backups[0]).unwrap();
        let content: String = snapshot.query_row("SELECT content FROM rss_entry", [], |r| r.get(0)).unwrap();
        assert_eq!(content, "抓取正文");
    }
    std::fs::copy(&backups[0], &path).unwrap();
    {
        let restored = Connection::open(&path).unwrap();
        ensure_main_schema(&restored).unwrap();
        let remaining: i64 = restored.query_row("SELECT count(*) FROM sqlite_master WHERE name='rss_entry'", [], |r| r.get(0)).unwrap();
        assert_eq!(remaining, 0);
    }
    assert_eq!(std::fs::read_dir(&dir).unwrap().filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().contains(".pre-subscription-retirement-v1-")).count(), 2);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn subscription_retirement_backup_failure_preserves_data() {
    let dir = std::env::temp_dir().join(format!("tau-retirement-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    {
        let conn = Connection::open(dir.join("data.db")).unwrap();
        conn.execute_batch("CREATE TABLE read_later(id INTEGER); INSERT INTO read_later VALUES(42); BEGIN;").unwrap();
        assert!(ensure_main_schema(&conn).unwrap_err().contains("备份数据库失败"));
        let id: i64 = conn.query_row("SELECT id FROM read_later", [], |r| r.get(0)).unwrap();
        assert_eq!(id, 42);
        conn.execute_batch("ROLLBACK;").unwrap();
    }
    std::fs::remove_dir_all(dir).unwrap();
}

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
        INSERT INTO chat_session(id,scope,session_file,title,create_time,update_time)
        VALUES('s1','main-chat','s1.jsonl','/saved.png',1,1);
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
    let title: String = conn
        .query_row("SELECT title FROM chat_session WHERE id='s1'", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert!(title.contains("/saved.png"));
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
        // 旧聊天表已不在基线里（桌面迁到 pi 会话后删除，pi 迁移 M8）：移动端不补列，原样留给桌面迁移
        conn.prepare("SELECT messages FROM chat_message").unwrap();
        conn.prepare("SELECT id FROM chat_session").unwrap();
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
    // 旧聊天行原样保留（由桌面迁到 pi 会话后才删，pi 迁移 M8）
    assert_eq!(
        conn.query_row("SELECT messages FROM chat_message WHERE id=3", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "[]"
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
