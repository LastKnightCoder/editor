use super::*;

#[test]
fn row_id_upgrade_preserves_data_and_deleted_high_water() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(&MAIN_SCHEMA_SQL.replace(" AUTOINCREMENT", ""))
        .unwrap();
    conn.execute_batch("ALTER TABLE cards ADD COLUMN extra TEXT;
      INSERT INTO contents(id,create_time,update_time,content) VALUES(10,1,1,'原正文');
      INSERT INTO cards(id,create_time,update_time,content_id,extra) VALUES(7,1,1,10,'额外字段');
      CREATE TABLE migration_child(id INTEGER PRIMARY KEY,content_id INTEGER REFERENCES contents(id) ON DELETE CASCADE);
      INSERT INTO migration_child VALUES(1,10);
      CREATE INDEX idx_cards_extra ON cards(extra);
      CREATE VIEW migration_view AS SELECT content FROM contents;
      CREATE TRIGGER migration_update AFTER UPDATE ON contents BEGIN UPDATE cards SET extra='已触发' WHERE id=7; END;
      INSERT INTO operation(operation_time,operation_id,operation_content_type,operation_action) VALUES(1,800,'card','delete');
      INSERT INTO entity_lineage(src_kind,src_id,dst_kind,dst_id,relation,create_time) VALUES('card','810','article','7','derived',1);
      INSERT INTO migration_meta VALUES('task:id-seq:contents','900');
      INSERT INTO schema_meta VALUES('main_schema_version','13',1);").unwrap();
    ensure_main_schema(&conn).unwrap();
    assert_eq!(
        conn.query_row("SELECT content FROM migration_view", [], |row| row
            .get::<_, String>(0))
            .unwrap(),
        "原正文"
    );
    assert_eq!(
        conn.query_row("SELECT extra FROM cards WHERE id=7", [], |row| row
            .get::<_, String>(0))
            .unwrap(),
        "额外字段"
    );
    assert_eq!(
        conn.query_row("SELECT content_id FROM migration_child", [], |row| row
            .get::<_, i64>(0))
            .unwrap(),
        10
    );
    conn.execute("INSERT INTO cards(create_time,update_time) VALUES(2,2)", [])
        .unwrap();
    assert_eq!(conn.last_insert_rowid(), 811);
    conn.execute(
        "INSERT INTO contents(create_time,update_time) VALUES(2,2)",
        [],
    )
    .unwrap();
    assert_eq!(conn.last_insert_rowid(), 901);
    conn.execute("UPDATE contents SET count=1 WHERE id=10", [])
        .unwrap();
    assert_eq!(
        conn.query_row("SELECT extra FROM cards WHERE id=7", [], |row| row
            .get::<_, String>(0))
            .unwrap(),
        "已触发"
    );
    assert!(row_ids::foreign_key_errors(&conn).unwrap().is_empty());
    let changes = total_changes(&conn);
    ensure_main_schema(&conn).unwrap();
    assert_eq!(total_changes(&conn), changes);
}

#[test]
fn deleted_row_ids_are_not_reused_after_reopen_and_manual_allocation() {
    let directory = std::env::temp_dir().join(format!("tau-row-id-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&directory).unwrap();
    let filename = directory.join("test.db");
    let mut conn = Connection::open(&filename).unwrap();
    ensure_main_schema(&conn).unwrap();
    for (table, columns, values) in [
        ("cards", "create_time,update_time", "1,1"),
        ("articles", "title,create_time,update_time", "'文章',1,1"),
        (
            "project_item",
            "title,create_time,update_time",
            "'文档',1,1",
        ),
        ("contents", "create_time,update_time", "1,1"),
    ] {
        let insert = format!("INSERT INTO {table}({columns}) VALUES({values})");
        conn.execute(&insert, []).unwrap();
        let first = conn.last_insert_rowid();
        conn.execute(&format!("DELETE FROM {table} WHERE id=?1"), [first])
            .unwrap();
        conn.close().unwrap();
        conn = Connection::open(&filename).unwrap();
        ensure_main_schema(&conn).unwrap();
        conn.execute(&insert, []).unwrap();
        assert!(conn.last_insert_rowid() > first);
    }
    conn.execute_batch("INSERT INTO contents(id,create_time,update_time) VALUES(30,1,1); DELETE FROM contents WHERE id=30;").unwrap();
    assert_eq!(
        super::super::assistant_tasks::next_id(&conn, "contents").unwrap(),
        31
    );
    drop(conn);
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn failed_row_id_upgrade_rolls_back_and_restores_foreign_keys() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(&MAIN_SCHEMA_SQL.replace(" AUTOINCREMENT", ""))
        .unwrap();
    conn.execute_batch("INSERT INTO contents(id,create_time,update_time,content) VALUES(10,1,1,'保留正文');
        INSERT INTO schema_meta VALUES('main_schema_version','13',1);
        CREATE TRIGGER migration_reject BEFORE INSERT ON schema_meta BEGIN SELECT RAISE(ABORT,'拒绝提交'); END;").unwrap();
    assert!(ensure_main_schema(&conn).unwrap_err().contains("拒绝提交"));
    let sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE name='contents'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(!sql.contains("AUTOINCREMENT"));
    assert_eq!(
        get_meta(&conn, "main_schema_version").unwrap().as_deref(),
        Some("13")
    );
    assert_eq!(
        conn.query_row("SELECT content FROM contents WHERE id=10", [], |row| row
            .get::<_, String>(
            0
        ))
        .unwrap(),
        "保留正文"
    );
    assert!(conn
        .pragma_query_value(None, "foreign_keys", |row| row.get::<_, bool>(0))
        .unwrap());
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

const OLD_PLUGIN_RECEIPTS:&str="CREATE TABLE plugin_create_receipts(plugin_id TEXT NOT NULL,request_id TEXT NOT NULL,input_hash TEXT NOT NULL,entity TEXT NOT NULL CHECK(entity IN ('todo','event')),entity_id INTEGER NOT NULL,created_at INTEGER NOT NULL,operation_id TEXT NOT NULL,retired INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(plugin_id,request_id)) WITHOUT ROWID; INSERT INTO plugin_create_receipts VALUES('p','a','h','todo',7,1,'op-a',0),('p','b','h','event',8,2,'op-b',1);";
#[test]
fn directory_receipt_upgrade_preserves_old_rows_and_retirement() {
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch(OLD_PLUGIN_RECEIPTS).unwrap();
    ensure_main_schema(&db).unwrap();
    let old: Vec<(String, bool)> = db
        .prepare("SELECT request_id,retired FROM plugin_create_receipts ORDER BY request_id")
        .unwrap()
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(old, vec![("a".into(), false), ("b".into(), true)]);
    db.execute_batch("INSERT INTO todo_group(id,title,create_time,update_time) VALUES(7,'目录',1,1);INSERT INTO plugin_create_receipts VALUES('p','c','h','todo-list',7,1,'op-c',0);DELETE FROM todo_group WHERE id=7").unwrap();
    assert!(db
        .query_row(
            "SELECT retired FROM plugin_create_receipts WHERE request_id='c'",
            [],
            |r| r.get::<_, bool>(0)
        )
        .unwrap());
    ensure_main_schema(&db).unwrap();
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM plugin_create_receipts", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        3
    );
}
#[test]
fn directory_receipt_upgrade_failure_restores_old_constraint_and_rows() {
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch(OLD_PLUGIN_RECEIPTS).unwrap();
    db.execute_batch("CREATE TABLE data_change_log(seq INTEGER PRIMARY KEY AUTOINCREMENT,domain TEXT NOT NULL,entity_id TEXT NOT NULL,operation TEXT NOT NULL);INSERT INTO data_change_log VALUES(900,'calendar','9','upsert')").unwrap();
    db.execute_batch("CREATE TABLE schema_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL CHECK(key<>'main_schema_version' OR value='14'),updated_at INTEGER)").unwrap();
    assert!(ensure_main_schema(&db).is_err());
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM plugin_create_receipts", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        2
    );
    assert!(db
        .execute(
            "INSERT INTO plugin_create_receipts VALUES('p','c','h','calendar',1,1,'op',0)",
            []
        )
        .is_err());
    assert!(needs_receipt_upgrade(&db).unwrap());
    assert!(db.prepare("SELECT action FROM data_change_log").is_err());
    assert_eq!(
        db.query_row("SELECT seq FROM data_change_log", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        900
    );
}

#[test]
fn object_notification_upgrade_preserves_log_rows_and_sequence() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("CREATE TABLE data_change_log(seq INTEGER PRIMARY KEY AUTOINCREMENT,domain TEXT NOT NULL,entity_id TEXT NOT NULL,operation TEXT NOT NULL CHECK(operation IN ('upsert','delete')));INSERT INTO data_change_log VALUES(900,'calendar','9','upsert')").unwrap();
    ensure_main_schema(&conn).unwrap();
    let old: (i64, String, Option<String>) = conn
        .query_row(
            "SELECT seq,operation,action FROM data_change_log WHERE seq=900",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!(old, (900, "upsert".into(), None));
    conn.execute_batch("INSERT INTO calendar(id,title,color,create_time,update_time) VALUES(1,'新日历','blue',1,1)").unwrap();
    let row: (i64, String) = conn
        .query_row(
            "SELECT seq,action FROM data_change_log WHERE entity_id='1'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(row, (901, "created".into()));
    ensure_main_schema(&conn).unwrap();
    assert_eq!(
        conn.query_row("SELECT COUNT(*) FROM data_change_log", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        2
    );
}

#[test]
fn existing_capture_triggers_upgrade_to_exact_object_actions() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(MAIN_SCHEMA_SQL).unwrap();
    conn.execute_batch("DROP TRIGGER dc_calendar_insert;CREATE TRIGGER dc_calendar_insert AFTER INSERT ON calendar BEGIN INSERT INTO data_change_log(domain,entity_id,operation) VALUES('calendar',CAST(NEW.id AS TEXT),'upsert'); END;").unwrap();
    ensure_main_schema(&conn).unwrap();
    conn.execute_batch("INSERT INTO calendar(id,title,color,create_time,update_time) VALUES(1,'新日历','blue',1,1)").unwrap();
    assert_eq!(
        conn.query_row(
            "SELECT action FROM data_change_log WHERE domain='calendar' AND entity_id='1'",
            [],
            |r| r.get::<_, String>(0)
        )
        .unwrap(),
        "created"
    );
}
