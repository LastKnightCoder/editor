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
fn audio_note_retirement_promotes_children_and_preserves_shared_content() {
    let conn = Connection::open_in_memory().unwrap();
    ensure_main_schema(&conn).unwrap();
    conn.execute_batch(include_str!("../../../../../packages/db-schema/fixtures/audio-note-retirement.sql")).unwrap();
    ensure_main_schema(&conn).unwrap();
    ensure_main_schema(&conn).unwrap();
    let remaining: i64 = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE name IN ('audio_notes','audio_note_item','idx_audio_note_item_audio')", [], |r| r.get(0)).unwrap();
    assert_eq!(remaining, 0);
    let roots: String = conn.query_row("SELECT children FROM project WHERE id=1", [], |r| r.get(0)).unwrap();
    assert_eq!(roots, "[10,26,12]");
    let children: String = conn.query_row("SELECT children FROM project_item WHERE id=10", [], |r| r.get(0)).unwrap();
    assert_eq!(children, "[21,23,25]");
    let relation: (String,String) = conn.query_row("SELECT parents,projects FROM project_item WHERE id=21", [], |r| Ok((r.get(0)?,r.get(1)?))).unwrap();
    assert_eq!(relation, ("[10]".into(),"[1,2]".into()));
    let refs = conn.prepare("SELECT id,ref_count FROM contents ORDER BY id").unwrap().query_map([], |r| Ok((r.get::<_,i64>(0)?,r.get::<_,i64>(1)?))).unwrap().collect::<rusqlite::Result<Vec<_>>>().unwrap();
    assert_eq!(refs, vec![(101,1),(102,2),(104,1),(105,1)]);
    let body: String = conn.query_row("SELECT content FROM contents WHERE id=105", [], |r| r.get(0)).unwrap();
    assert!(body.contains("saved.mp3"));
    conn.prepare("SELECT messages FROM audio_note_chats").unwrap();
}

#[test]
fn audio_note_retirement_rolls_back_and_retries_without_tables() {
    let conn = Connection::open_in_memory().unwrap();
    ensure_main_schema(&conn).unwrap();
    conn.execute_batch(include_str!("../../../../../packages/db-schema/fixtures/audio-note-retirement.sql")).unwrap();
    conn.execute_batch("CREATE TRIGGER fail_retirement BEFORE DELETE ON contents BEGIN SELECT RAISE(ABORT,'模拟清理失败'); END;").unwrap();
    assert!(ensure_main_schema(&conn).unwrap_err().contains("模拟清理失败"));
    let roots: String = conn.query_row("SELECT children FROM project WHERE id=1", [], |r| r.get(0)).unwrap();
    assert_eq!(roots, "[10,11,12]");
    conn.prepare("SELECT content_id FROM audio_note_item").unwrap();
    conn.execute_batch("DROP TRIGGER fail_retirement; DROP TABLE audio_note_item; DROP TABLE audio_notes;").unwrap();
    ensure_main_schema(&conn).unwrap();
    assert!(!super::super::audio_note_retirement::has_items(&conn).unwrap());
}

#[test]
fn audio_note_indexes_retire_without_knowledge_mapping_and_preserve_reused_ids() {
    let conn = Connection::open_in_memory().unwrap();
    ensure_main_schema(&conn).unwrap();
    conn.execute_batch(include_str!("../../../../../packages/db-schema/fixtures/audio-note-retirement.sql")).unwrap();
    ensure_main_schema(&conn).unwrap();
    conn.execute_batch("INSERT INTO project_item(id,create_time,update_time,title) VALUES(11,1,1,'新文档');
        DELETE FROM migration_meta WHERE key='knowledge-to-project:v1';").unwrap();
    let index = Connection::open_in_memory().unwrap();
    index.execute_batch("CREATE TABLE index_meta(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);
        CREATE VIRTUAL TABLE content_fts USING fts5(prefixed_id,type,content);
        CREATE TABLE vec_documents(prefixed_id TEXT);
        INSERT INTO content_fts VALUES('project-item:20','project-item','旧音频'),('project-item:11','project-item','新文档');
        INSERT INTO vec_documents VALUES('project-item:20'),('project-item:11');
        CREATE TRIGGER fail_index BEFORE DELETE ON vec_documents BEGIN SELECT RAISE(ABORT,'模拟索引失败'); END;").unwrap();
    assert!(super::super::knowledge_migration::migrate_index(&conn,&index).unwrap_err().contains("模拟索引失败"));
    let count: i64 = index.query_row("SELECT COUNT(*) FROM content_fts", [], |r| r.get(0)).unwrap();
    assert_eq!(count, 2);
    index.execute_batch("DROP TRIGGER fail_index;").unwrap();
    super::super::knowledge_migration::migrate_index(&conn,&index).unwrap();
    super::super::knowledge_migration::migrate_index(&conn,&index).unwrap();
    for table in ["content_fts","vec_documents"] {
        let id: String = index.query_row(&format!("SELECT prefixed_id FROM {table}"), [], |r| r.get(0)).unwrap();
        assert_eq!(id, "project-item:11");
    }
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
            Some(crate::database::migrator::MAIN_SCHEMA_VERSION.to_string())
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

#[test]
fn split_modules_moves_parasite_projects_and_rewires_resource_foreign_key() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(MAIN_SCHEMA_SQL).unwrap();
    // 还原拆分前的形态：资源外键指向 project
    conn.execute_batch(
        "DROP TABLE vibe_learning_resources;
         CREATE TABLE vibe_learning_resources (
           id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL,
           sort_index INTEGER NOT NULL DEFAULT 0,
           create_time INTEGER NOT NULL, update_time INTEGER NOT NULL,
           name TEXT NOT NULL, original_path TEXT NOT NULL, markdown_path TEXT,
           resource_type TEXT NOT NULL, file_size INTEGER, duration INTEGER,
           source_type TEXT, source_meta_info TEXT, transcript_segments TEXT,
           FOREIGN KEY(project_id) REFERENCES project(id));
         INSERT INTO project(id,create_time,update_time,title,desc,children,archived,pinned,project_type,data_table_id)
           VALUES(10,1,1,'文档树','[]','[]',0,0,'document-tree',0),
                 (11,1,1,'表格','[]','[]',0,1,'data-table',77),
                 (12,1,1,'学习','[]','[]',0,0,'vibe-learning',0);
         INSERT INTO vibe_learning_resources(id,project_id,create_time,update_time,name,original_path,resource_type)
           VALUES(1,12,1,1,'资料','/a.pdf','pdf');",
    )
    .unwrap();

    ensure_main_schema(&conn).unwrap();
    ensure_main_schema(&conn).unwrap();

    // project 只剩文档树，另两类按原 id 落到各自表
    assert_eq!(
        conn.query_row("SELECT COUNT(*) FROM project", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        conn.query_row("SELECT data_table_id FROM database_item WHERE id=11", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        77
    );
    assert_eq!(
        conn.query_row("SELECT pinned FROM database_item WHERE id=11", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        conn.query_row("SELECT title FROM vibe_learning_project WHERE id=12", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "学习"
    );
    // 资源仍挂在 12 上，外键已改指新表
    assert_eq!(
        conn.query_row("SELECT project_id FROM vibe_learning_resources WHERE id=1", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        12
    );
    let vlr_sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE name='vibe_learning_resources'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(vlr_sql.contains("REFERENCES vibe_learning_project(id)"));
}
