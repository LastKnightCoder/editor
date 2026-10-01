use super::main_upgrade::has_column;
use rusqlite::{params, Connection, OptionalExtension};

fn item_condition(conn: &Connection) -> rusqlite::Result<String> {
    let mut predicates = Vec::new();
    for field in ["project_item_type", "ref_type"] {
        if has_column(conn, "project_item", field)? {
            predicates.push(format!("{field}='audio-note'"));
        }
    }
    Ok(if predicates.is_empty() {
        "0".into()
    } else {
        predicates.join(" OR ")
    })
}

pub(super) fn has_items(conn: &Connection) -> rusqlite::Result<bool> {
    if !has_column(conn, "project_item", "id")? {
        return Ok(false);
    }
    conn.query_row(
        &format!(
            "SELECT EXISTS(SELECT 1 FROM project_item WHERE {})",
            item_condition(conn)?
        ),
        [],
        |r| r.get(0),
    )
}

/// 在主库升级事务内退役；树变换 SQL 与 Node 端共用，备份由调用方负责。
pub(super) fn retire(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("CREATE TEMP TABLE tau_retired_audio_items(id INTEGER PRIMARY KEY,children TEXT,content_id INTEGER);
        CREATE TEMP TABLE tau_retired_audio_contents(content_id INTEGER);")?;
    if has_items(conn)? {
        conn.execute_batch(&format!("INSERT INTO tau_retired_audio_items SELECT id,children,content_id FROM project_item WHERE {};
            INSERT INTO tau_retired_audio_contents SELECT content_id FROM tau_retired_audio_items WHERE content_id>0;", item_condition(conn)?))?;
        let sql: Vec<String> = serde_json::from_str(include_str!(
            "../../../../../packages/db-schema/src/audio-note-retirement-sql.json"
        ))
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        conn.execute_batch(&sql.join("\n"))?;
        conn.execute_batch("CREATE TABLE IF NOT EXISTS migration_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            INSERT INTO migration_meta(key,value) VALUES('audio-note-retirement:items-v1',
              (SELECT json_group_array(id) FROM (
                SELECT id FROM tau_retired_audio_items UNION
                SELECT CAST(value AS INTEGER) FROM json_each(COALESCE(
                  (SELECT value FROM migration_meta WHERE key='audio-note-retirement:items-v1'),'[]')) ORDER BY id
              ))) ON CONFLICT(key) DO UPDATE SET value=excluded.value;")?;
    }
    if has_column(conn, "audio_note_item", "content_id")? {
        conn.execute_batch("INSERT INTO tau_retired_audio_contents SELECT content_id FROM audio_note_item WHERE content_id>0;")?;
    }
    conn.execute_batch("DROP TABLE IF EXISTS audio_note_item; DROP TABLE IF EXISTS audio_notes;")?;
    if has_column(conn, "contents", "ref_count")? {
        let tables = conn
            .prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            )?
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let mut references = Vec::new();
        let mut remaining_references = Vec::new();
        for table in tables {
            let quoted = format!("\"{}\"", table.replace('"', "\"\""));
            let fields = conn
                .prepare(&format!("PRAGMA table_info({quoted})"))?
                .query_map([], |r| r.get::<_, String>(1))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            for field in fields {
                if matches!(
                    field.as_str(),
                    "content_id"
                        | "description_content_id"
                        | "detail_content_id"
                        | "preferred_content_id"
                ) {
                    references.push(format!(
                        "NOT EXISTS(SELECT 1 FROM {quoted} WHERE \"{}\"=contents.id)",
                        field.replace('"', "\"\"")
                    ));
                    remaining_references.push(format!(
                        "(SELECT COUNT(*) FROM {quoted} WHERE \"{}\"=contents.id)",
                        field.replace('"', "\"\"")
                    ));
                }
            }
        }
        let guards = if references.is_empty() {
            String::new()
        } else {
            format!("AND {}", references.join(" AND "))
        };
        let surviving = if remaining_references.is_empty() {
            "0".into()
        } else {
            remaining_references.join("+")
        };
        conn.execute_batch(&format!(
            "UPDATE contents SET ref_count=MAX(0,COALESCE(ref_count,0)-
            (SELECT COUNT(*) FROM tau_retired_audio_contents WHERE content_id=contents.id),{surviving})
            WHERE id IN (SELECT content_id FROM tau_retired_audio_contents);
            DELETE FROM contents WHERE id IN (SELECT content_id FROM tau_retired_audio_contents)
            AND ref_count=0 {guards};"
        ))?;
    }
    conn.execute_batch("DROP TABLE tau_retired_audio_contents; DROP TABLE tau_retired_audio_items;")
}

pub(super) fn retire_indexes(main: &Connection, index: &Connection) -> Result<(), String> {
    let run = || -> rusqlite::Result<()> {
        if !has_column(main, "migration_meta", "key")? || !has_column(index, "index_meta", "key")? {
            return Ok(());
        }
        let key = "audio-note-retirement:items-v1";
        let fingerprint: Option<String> = main
            .query_row(
                "SELECT value FROM migration_meta WHERE key=?1",
                [key],
                |r| r.get(0),
            )
            .optional()?;
        let Some(fingerprint) = fingerprint else {
            return Ok(());
        };
        let previous: Option<String> = index
            .query_row("SELECT value FROM index_meta WHERE key=?1", [key], |r| {
                r.get(0)
            })
            .optional()?;
        if previous.as_ref() == Some(&fingerprint) {
            return Ok(());
        }
        let ids: Vec<i64> = serde_json::from_str(&fingerprint)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        let tx = index.unchecked_transaction()?;
        for id in ids {
            let exists: bool = main.query_row(
                "SELECT EXISTS(SELECT 1 FROM project_item WHERE id=?1)",
                [id],
                |r| r.get(0),
            )?;
            if exists {
                continue;
            }
            for table in ["content_fts", "vec_documents"] {
                if has_column(&tx, table, "prefixed_id")? {
                    tx.execute(
                        &format!("DELETE FROM {table} WHERE prefixed_id=?1"),
                        [format!("project-item:{id}")],
                    )?;
                }
            }
        }
        tx.execute("INSERT INTO index_meta(key,value,updated_at) VALUES(?1,?2,0) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key,fingerprint])?;
        tx.commit()
    };
    run().map_err(|e| format!("FEATURE_TABLE_RETIREMENT_FAILED: {e}"))
}
