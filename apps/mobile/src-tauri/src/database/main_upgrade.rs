use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug)]
struct Column {
    name: String,
    kind: String,
    required: bool,
    default: Option<String>,
    primary_key: i64,
}

fn quote(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

fn columns(conn: &Connection, table: &str) -> rusqlite::Result<Vec<Column>> {
    conn.prepare(&format!("PRAGMA table_info({})", quote(table)))?
        .query_map([], |row| {
            Ok(Column {
                name: row.get(1)?,
                kind: row.get(2)?,
                required: row.get::<_, i64>(3)? != 0,
                default: row.get(4)?,
                primary_key: row.get(5)?,
            })
        })?
        .collect()
}

pub(super) fn has_column(conn: &Connection, table: &str, name: &str) -> rusqlite::Result<bool> {
    Ok(columns(conn, table)?
        .iter()
        .any(|column| column.name == name))
}

fn table_definitions(conn: &Connection) -> rusqlite::Result<Vec<(String, String)>> {
    conn.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect()
}

pub(super) fn upgrade(conn: &Connection, baseline: &Connection, now: i64) -> Result<(), String> {
    upgrade_inner(conn, baseline, now).map_err(|e| format!("DB_SCHEMA_MIGRATION_FAILED: {e}"))
}

fn upgrade_inner(conn: &Connection, baseline: &Connection, now: i64) -> rusqlite::Result<()> {
    // 只删除主库资源索引，附件文件与协作缓存保持原样。
    if !columns(conn, "operation")?.is_empty() {
        conn.execute(
            "DELETE FROM operation WHERE operation_content_type = ?1",
            ["resource"],
        )?;
    }
    conn.execute_batch(
        "DROP TABLE IF EXISTS resources;
        DROP TABLE IF EXISTS resource_scan_version;
        DROP TABLE IF EXISTS resource_group;",
    )?;

    let add_diary_tags = !has_column(conn, "diary_entries", "tags")?;
    // 首次补 diary_segments.tags 列时，把旧 entry 级标签回填到该天全部片段，
    // 保证「标签绑 segment」模型迁移后老数据不丢
    let backfill_segment_tags = !has_column(conn, "diary_segments", "tags")?;

    if has_column(conn, "collaboration_bindings", "article_id")? {
        conn.execute_batch(
            "ALTER TABLE collaboration_bindings RENAME TO collaboration_bindings_legacy",
        )?;
        let sql: String = baseline.query_row(
            "SELECT sql FROM sqlite_master WHERE name='collaboration_bindings'",
            [],
            |r| r.get(0),
        )?;
        conn.execute_batch(&sql)?;
        conn.execute_batch("INSERT INTO collaboration_bindings
            SELECT b.content_id,c.create_time,b.server_url,b.document_id,'article',b.article_id,a.title
            FROM collaboration_bindings_legacy b JOIN contents c ON c.id=b.content_id
            JOIN articles a ON a.id=b.article_id AND a.create_time=b.article_created_at AND a.content_id=c.id;
            DROP TABLE collaboration_bindings_legacy;")?;
    }

    // 从 SQLite 元信息取定义，避免通过拆分 SQL 推断列和默认值。
    for (table, create_sql) in table_definitions(baseline)? {
        let existing = columns(conn, &table)?;
        if existing.is_empty() {
            conn.execute_batch(&create_sql)?;
            continue;
        }
        for column in columns(baseline, &table)? {
            if existing.iter().any(|item| item.name == column.name) {
                continue;
            }
            if column.primary_key != 0 || (column.required && column.default.is_none()) {
                return Err(rusqlite::Error::InvalidColumnName(format!(
                    "不支持自动补齐 {table}.{}，请先用桌面端升级",
                    column.name
                )));
            }
            let default = match column.name.as_str() {
                "message_schema_version" | "title_dirty" => Some("1".to_string()),
                _ => column.default,
            };
            let sql = format!(
                "ALTER TABLE {} ADD COLUMN {} {}{}{}",
                quote(&table),
                quote(&column.name),
                column.kind,
                if column.required { " NOT NULL" } else { "" },
                default
                    .map(|value| format!(" DEFAULT {value}"))
                    .unwrap_or_default()
            );
            conn.execute_batch(&sql)?;
        }
    }

    if has_column(conn, "diary_segments", "position")? {
        rebuild_known_table(conn, baseline, "diary_segments")?;
    }
    migrate_diaries(conn)?;
    if add_diary_tags {
        conn.execute_batch("UPDATE diary_entries SET tags='[\"周记\"]' WHERE type='weekly' AND COALESCE(tags,'[]') IN ('[]','');
            UPDATE diary_entries SET tags='[\"月记\"]' WHERE type='monthly' AND COALESCE(tags,'[]') IN ('[]','');")?;
    }
    // 放在 add_diary_tags 之后：极旧库同轮升级时，周记/月记的自动标签也能回填进片段
    if backfill_segment_tags {
        conn.execute_batch("UPDATE diary_segments SET tags=COALESCE((SELECT tags FROM diary_entries WHERE id=diary_segments.diary_id),'[]') WHERE COALESCE(tags,'[]') IN ('[]','');")?;
    }
    for (name, color, sort) in [("周记", "#52c41a", 0), ("月记", "#fa8c16", 1)] {
        conn.execute("INSERT INTO diary_tag_settings(name,color,sort,create_time,update_time) VALUES(?1,?2,?3,?4,?4) ON CONFLICT(name) DO NOTHING", params![name,color,sort,now])?;
    }
    for table in [
        "chat_message",
        "pdf_chats",
        "video_note_chats",
        "vibe_learning_chats",
    ] {
        conn.execute_batch(&format!(
            "UPDATE {table} SET message_schema_version=1 WHERE message_schema_version IS NULL;
            UPDATE {table} SET agent_type='local' WHERE agent_type IS NULL;"
        ))?;
    }
    conn.execute_batch("WITH ranked AS (
        SELECT id,(ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY CASE WHEN sort_index=0 THEN 1 ELSE 0 END,sort_index,create_time DESC,id DESC)+1)*1024 AS next_sort
        FROM vibe_learning_resources WHERE project_id IN (SELECT project_id FROM vibe_learning_resources WHERE sort_index=0)
    ) UPDATE vibe_learning_resources SET sort_index=(SELECT next_sort FROM ranked WHERE ranked.id=vibe_learning_resources.id) WHERE id IN (SELECT id FROM ranked);
    CREATE INDEX IF NOT EXISTS idx_vl_resource_project_sort ON vibe_learning_resources(project_id,sort_index);")?;
    migrate_video_notes(conn, baseline)?;
    Ok(())
}

fn rebuild_known_table(
    conn: &Connection,
    baseline: &Connection,
    table: &str,
) -> rusqlite::Result<()> {
    let sql: String = baseline.query_row(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?1",
        [table],
        |r| r.get(0),
    )?;
    let names = columns(baseline, table)?
        .iter()
        .map(|c| quote(&c.name))
        .collect::<Vec<_>>()
        .join(",");
    // 使用临时副本保留主键和共享字段，不触发重命名对其他表外键的改写。
    conn.execute_batch(&format!(
        "CREATE TEMP TABLE mobile_upgrade_copy AS SELECT {names} FROM {};
        DROP TABLE {}; {sql}; INSERT INTO {}({names}) SELECT {names} FROM mobile_upgrade_copy;
        DROP TABLE mobile_upgrade_copy;",
        quote(table),
        quote(table),
        quote(table)
    ))
}

fn migrate_diaries(conn: &Connection) -> rusqlite::Result<()> {
    let orphan: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM diary_entries d LEFT JOIN contents c ON c.id=d.content_id WHERE d.content_id IS NOT NULL AND c.id IS NULL)", [], |r| r.get(0))?;
    if orphan {
        return Err(rusqlite::Error::InvalidParameterName(
            "旧日记存在缺失的正文，请先恢复内容后再升级".into(),
        ));
    }
    let notes = conn.prepare("SELECT d.date,d.content_id,c.create_time,c.update_time FROM daily_notes d JOIN contents c ON c.id=d.content_id
        WHERE NOT EXISTS(SELECT 1 FROM diary_segments s JOIN diary_entries e ON e.id=s.diary_id WHERE e.type='daily' AND s.content_id=d.content_id)
        AND NOT EXISTS(SELECT 1 FROM diary_entries e WHERE e.type='daily' AND e.content_id=d.content_id)
        ORDER BY d.date,c.create_time,d.id")?
        .query_map([], |r| Ok((r.get::<_,String>(0)?,r.get::<_,i64>(1)?,r.get::<_,i64>(2)?,r.get::<_,i64>(3)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for (date, content_id, created, updated) in notes {
        conn.execute("INSERT INTO diary_entries(type,date,content_id,word_count,create_time,update_time) VALUES('daily',?1,NULL,0,?2,?3) ON CONFLICT(date) DO NOTHING", params![date,created,updated])?;
        let diary_id: i64 = conn.query_row(
            "SELECT id FROM diary_entries WHERE type='daily' AND date=?1",
            [date],
            |r| r.get(0),
        )?;
        conn.execute("INSERT INTO diary_segments(diary_id,content_id,create_time,update_time) SELECT ?1,?2,?3,?4 WHERE NOT EXISTS(SELECT 1 FROM diary_segments WHERE diary_id=?1 AND content_id=?2)", params![diary_id,content_id,created,updated])?;
    }
    conn.execute_batch("INSERT INTO diary_segments(diary_id,content_id,create_time,update_time)
        SELECT d.id,d.content_id,c.create_time,c.update_time FROM diary_entries d JOIN contents c ON c.id=d.content_id
        WHERE NOT EXISTS(SELECT 1 FROM diary_segments s WHERE s.diary_id=d.id AND s.content_id=d.content_id);
        UPDATE diary_entries SET content_id=NULL WHERE EXISTS(SELECT 1 FROM diary_segments s WHERE s.diary_id=diary_entries.id AND s.content_id=diary_entries.content_id);
        UPDATE diary_entries SET word_count=COALESCE((SELECT SUM(c.count) FROM diary_segments s JOIN contents c ON c.id=s.content_id WHERE s.diary_id=diary_entries.id),0),
        update_time=MAX(update_time,COALESCE((SELECT MAX(s.update_time) FROM diary_segments s WHERE s.diary_id=diary_entries.id),update_time));")
}

fn migrate_video_notes(conn: &Connection, baseline: &Connection) -> rusqlite::Result<()> {
    if has_column(conn, "video_notes", "notes")? {
        let videos = conn
            .prepare("SELECT id,notes,create_time,update_time FROM video_notes")?
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, i64>(3)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        for (id, notes, created, updated) in videos {
            let exists = conn
                .query_row(
                    "SELECT 1 FROM video_note_item WHERE video_note_id=?1",
                    [id],
                    |_| Ok(()),
                )
                .optional()?
                .is_some();
            if exists {
                continue;
            }
            let notes: Vec<serde_json::Value> = serde_json::from_str(&notes)
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
            let mut content = Vec::new();
            let mut count = 0i64;
            for note in notes {
                if let Some(content_id) = note.get("contentId").and_then(|v| v.as_i64()) {
                    let (raw, size): (String, i64) = conn.query_row(
                        "SELECT content,COALESCE(count,0) FROM contents WHERE id=?1",
                        [content_id],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )?;
                    let nodes: Vec<serde_json::Value> = serde_json::from_str(&raw)
                        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
                    content.extend(nodes);
                    count += size;
                }
            }
            if content.is_empty() {
                continue;
            }
            conn.execute("INSERT INTO contents(create_time,update_time,content,count,ref_count) VALUES(?1,?2,?3,?4,1)", params![created,updated,serde_json::Value::Array(content).to_string(),count])?;
            conn.execute("INSERT INTO video_note_item(video_note_id,content_id,title,create_time,update_time) VALUES(?1,?2,'',?3,?4)", params![id,conn.last_insert_rowid(),created,updated])?;
        }
        // 保留原 contents，避免历史引用计数不完整时误删其他内容。
        rebuild_known_table(conn, baseline, "video_notes")?;
    } else if has_column(conn, "video_notes", "ebook_markdown")? {
        rebuild_known_table(conn, baseline, "video_notes")?;
    }
    Ok(())
}

pub(super) fn validate(conn: &Connection, baseline: &Connection) -> Result<(), String> {
    for (table, _) in table_definitions(baseline).map_err(|e| e.to_string())? {
        let actual = columns(conn, &table).map_err(|e| e.to_string())?;
        for expected in columns(baseline, &table).map_err(|e| e.to_string())? {
            if !actual.iter().any(|col| {
                col.name == expected.name
                    && col.kind.eq_ignore_ascii_case(&expected.kind)
                    && col.primary_key == expected.primary_key
                    && (!expected.required || col.required)
            }) {
                return Err(format!(
                    "DB_SCHEMA_INCOMPATIBLE: {table}.{} 与当前结构不兼容",
                    expected.name
                ));
            }
        }
    }
    Ok(())
}
