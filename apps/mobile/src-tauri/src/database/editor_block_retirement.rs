use rusqlite::{functions::FunctionFlags, params, Connection, TransactionBehavior};
use serde_json::{json, Value};

const CARRIERS: &[(&str, &str)] = &[
    ("contents", "content"),
    ("project", "desc"),
    ("questions", "description"),
    ("white_board_contents", "data"),
    ("flashcards", "prompt"),
    ("flashcards", "detail"),
    ("flashcards", "data"),
    ("data_tables", "rows"),
    ("data_tables", "columns"),
    ("pdf_annotations", "notes"),
];

/// 退役类型权威清单在 packages/db-schema/src/retired-editor-blocks.ts（RETIRED_TYPES），
/// 双端一致由 fixtures/editor-block-retirement.json 测试守护；新增退役块时同步此处与 fixtures。
fn retired_type(value: &str) -> bool {
    matches!(
        value,
        "chat-reference"
            | "question"
            | "question-card"
            | "chart"
            | "graphviz"
            | "multi-column-container"
            | "multi-column-item"
    )
}

fn retired(value: &Value) -> bool {
    value.get("children").is_some_and(Value::is_array)
        && (retired_type(value["type"].as_str().unwrap_or(""))
            || (value["type"] == "collaboration-placeholder"
                && retired_type(value["label"].as_str().unwrap_or(""))))
}

fn paragraph() -> Value {
    json!({"type":"paragraph","children":[{"type":"formatted","text":""}]})
}

fn visit(value: &mut Value, parent: &str, key: &str) -> usize {
    match value {
        Value::Array(items) => {
            let mut removed = 0;
            let mut dropped = false;
            let mut output = Vec::with_capacity(items.len());
            for mut item in std::mem::take(items) {
                let remove = retired(&item);
                removed += visit(&mut item, "", "");
                if remove {
                    removed += 1;
                    dropped = true;
                } else {
                    output.push(item);
                }
            }
            if dropped && output.is_empty() {
                let blocks = parent.is_empty()
                    || key != "children"
                    || matches!(
                        parent,
                        "blockquote"
                            | "tab-pane"
                            | "list-item"
                            | "check-list-item"
                            | "bulleted-list"
                            | "numbered-list"
                            | "detail"
                            | "callout"
                            | "highlight-block"
                    );
                output.push(if blocks {
                    paragraph()
                } else {
                    json!({"type":"formatted","text":""})
                });
            }
            *items = output;
            removed
        }
        Value::Object(map) => {
            let parent = map
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let mut removed = 0;
            map.retain(|key, child| {
                let remove = retired(child);
                removed += visit(child, &parent, key);
                if remove {
                    removed += 1;
                }
                !remove
            });
            removed
        }
        _ => 0,
    }
}

pub(super) fn strip(value: &mut Value) -> usize {
    let remove = retired(value);
    let mut count = visit(value, "", "");
    if remove {
        *value = paragraph();
        count += 1;
    }
    count
}

fn clean_json(input: &str, location: &str) -> Result<String, String> {
    if input.is_empty() {
        return Ok(input.into());
    }
    if location.starts_with("flashcards:")
        && (location.ends_with(".prompt") || location.ends_with(".detail"))
        && !(input.trim_start().starts_with('{')
            || input
                .trim_start()
                .strip_prefix('[')
                .is_some_and(|rest| rest.trim_start().starts_with(['[', '{'])))
    {
        return Ok(input.into());
    }
    let mut value: Value = match serde_json::from_str(input) {
        Ok(value) => value,
        Err(_) => {
            // 存量行可能是纯文本或损坏 JSON：保留原值跳过清理，绝不能让开库或触发器写入失败
            eprintln!("[editor-block-retirement] {location} 不是合法 JSON，已保留原值");
            return Ok(input.into());
        }
    };
    if strip(&mut value) == 0 {
        Ok(input.into())
    } else {
        serde_json::to_string(&value).map_err(|e| e.to_string())
    }
}

// 与共享 content-length 的默认 words-count 口径一致，避免清理时改写保留正文的字数。
fn words_count(text: &str) -> i64 {
    let punctuation = ",，.。:：;；[]【】{｛}｝(（)）<《>》$￥!！?？~～'’\"“”*/\\&%@#^、";
    let mut cleaned = String::new();
    let mut whitespace_started = false;
    let mut whitespace_done = false;
    for ch in text.chars().filter(|ch| {
        !punctuation.contains(*ch) && !matches!(*ch as u32, 0xff00..=0xffef | 0x2000..=0x206f)
    }) {
        if ch.is_whitespace() && !whitespace_done {
            if !whitespace_started {
                cleaned.push(' ');
                whitespace_started = true;
            }
        } else {
            if whitespace_started {
                whitespace_done = true;
            }
            cleaned.push(ch);
        }
    }
    cleaned.split(' ').filter(|word| !word.trim().is_empty()).map(|word| {
        let mut count = 0;
        let mut previous = 0;
        for ch in word.chars() {
            let code = ch as u32;
            let kind = if ch.is_ascii_digit() { 1 }
                else if ch.is_ascii_alphabetic() || matches!(code, 0x00c0..=0x02af | 0x1e00..=0x1eff | 0x0400..=0x04ff | 0x0500..=0x052f | 0x0d00..=0x0d7f) { 2 }
                else if matches!(code, 0x2e80..=0x2eff | 0x2f00..=0x2fdf | 0x3000..=0x30ff | 0x31c0..=0x31ff | 0x3200..=0x33ff | 0x3400..=0x4dbf | 0x4e00..=0x9fff | 0xf900..=0xfaff | 0x3190..=0x319f | 0x1100..=0x11ff | 0x3130..=0x318f | 0xa960..=0xa97f | 0xac00..=0xd7ff) { 3 }
                else { 0 };
            if kind != 0 && (kind == 3 || previous != kind) { count += 1; }
            previous = kind;
        }
        count.max(1)
    }).sum()
}

fn content_count(value: &Value) -> i64 {
    if let Some(nodes) = value.as_array() {
        return nodes.iter().map(content_count).sum();
    }
    let kind = value["type"].as_str().unwrap_or("");
    let field = match kind {
        "formatted" => "text",
        "code-block" => "code",
        "inline-math" | "block-math" => "tex",
        "mermaid" => "chart",
        "html-block" => "html",
        "custom-block" | "tikz" => "content",
        _ => "",
    };
    let mut count = words_count(value.get(field).and_then(Value::as_str).unwrap_or(""));
    if kind == "tabs" {
        if let Some(tabs) = value["tabsContent"].as_array() {
            for tab in tabs {
                if tab["key"] != value["activeKey"] {
                    count += content_count(&tab["content"]);
                }
            }
        }
    } else if kind == "list-item" && value["isFold"] == true {
        if let Some(items) = value["allContent"].as_array() {
            count += items.iter().skip(1).map(content_count).sum::<i64>();
        }
    }
    if let Some(children) = value.get("children") {
        count += content_count(children);
    }
    count
}

fn columns(conn: &Connection, table: &str) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(&format!("PRAGMA table_info(\"{table}\")"))
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([], |row| row.get(1))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn dependents_sql(conn: &Connection, id: &str) -> Result<String, String> {
    let mut sql = String::new();
    for table in [
        "cards",
        "articles",
        "project_item",
        "diary_segments",
        "diary_entries",
    ] {
        let fields = columns(conn, table)?;
        if fields.iter().any(|f| f == "content_id") && fields.iter().any(|f| f == "update_time") {
            sql.push_str(&format!("UPDATE \"{table}\" SET update_time=MAX(update_time+1,(SELECT update_time FROM contents WHERE id={id})) WHERE content_id={id};"));
        }
    }
    if columns(conn, "diary_entries")?
        .iter()
        .any(|f| f == "word_count")
        && columns(conn, "diary_segments")?
            .iter()
            .any(|f| f == "diary_id")
    {
        sql.push_str(&format!("UPDATE diary_entries SET word_count=COALESCE((SELECT SUM(c.count) FROM diary_segments s JOIN contents c ON c.id=s.content_id WHERE s.diary_id=diary_entries.id),0),update_time=MAX(update_time+1,(SELECT update_time FROM contents WHERE id={id})) WHERE id IN (SELECT diary_id FROM diary_segments WHERE content_id={id});"));
    }
    Ok(sql)
}

/// 临时触发器与连接同寿命，不进入数据库共享结构。
pub(super) fn install_guards(conn: &Connection) -> Result<(), String> {
    conn.create_scalar_function(
        "tau_strip_retired_blocks",
        2,
        FunctionFlags::SQLITE_UTF8,
        |ctx| {
            clean_json(&ctx.get::<String>(0)?, &ctx.get::<String>(1)?).map_err(|e| {
                rusqlite::Error::UserFunctionError(Box::new(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    e,
                )))
            })
        },
    )
    .map_err(|e| e.to_string())?;
    conn.create_scalar_function(
        "tau_editor_content_count",
        1,
        FunctionFlags::SQLITE_UTF8,
        |ctx| {
            let input = ctx.get::<String>(0)?;
            match serde_json::from_str::<Value>(&input) {
                Ok(value) => Ok(Some(content_count(&value))),
                // 非法 JSON 返回 NULL，由触发器 SQL 的 COALESCE 保留原 count
                Err(_) => Ok(None),
            }
        },
    )
    .map_err(|e| e.to_string())?;
    for (table, column) in CARRIERS {
        let fields = columns(conn, table)?;
        if !fields.iter().any(|f| f == column) {
            continue;
        }
        let value = format!(
            "tau_strip_retired_blocks(NEW.\"{column}\", '{table}:' || NEW.id || '.{column}')"
        );
        let count = if *table == "contents" {
            format!(",count=COALESCE(tau_editor_content_count({value}),NEW.\"count\")")
        } else {
            String::new()
        };
        let timestamp = if fields.iter().any(|f| f == "update_time") {
            ",update_time=MAX(NEW.update_time+1,CAST(strftime('%s','now') AS INTEGER)*1000)"
        } else {
            ""
        };
        let dependents = if *table == "contents" {
            dependents_sql(conn, "NEW.id")?
        } else {
            String::new()
        };
        for (event, suffix) in [
            ("INSERT".to_owned(), "insert"),
            (format!("UPDATE OF \"{column}\""), "update"),
        ] {
            conn.execute_batch(&format!("CREATE TEMP TRIGGER IF NOT EXISTS retired_blocks_{table}_{column}_{suffix}
                AFTER {event} ON main.\"{table}\" WHEN NEW.\"{column}\" IS NOT NULL AND {value} IS NOT NEW.\"{column}\"
                BEGIN UPDATE \"{table}\" SET \"{column}\"={value}{count}{timestamp} WHERE id=NEW.id; {dependents} END"))
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

struct PendingChange {
    table: &'static str,
    column: &'static str,
    id: i64,
    next: String,
}

/// 单遍扫描直接收集变更（退役块行数有限），避免探测遍+事务遍重复全表扫描。
fn collect_changes(conn: &Connection) -> Result<Vec<PendingChange>, String> {
    let mut pending = Vec::new();
    for (table, column) in CARRIERS {
        if !columns(conn, table)?.iter().any(|f| f == column) {
            continue;
        }
        let mut cursor: Option<i64> = None;
        loop {
            let mut statement = conn.prepare(&format!("SELECT id,\"{column}\" FROM \"{table}\"
                WHERE (?1 IS NULL OR id>?1) AND \"{column}\" IS NOT NULL AND \"{column}\"<>'' ORDER BY id LIMIT 200"))
                .map_err(|e| e.to_string())?;
            let rows = statement
                .query_map([cursor], |r| {
                    Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            if rows.is_empty() {
                break;
            }
            for (id, input) in rows {
                cursor = Some(id);
                let next = clean_json(&input, &format!("{table}:{id}.{column}"))?;
                if next != input {
                    pending.push(PendingChange { table, column, id, next });
                }
            }
        }
    }
    Ok(pending)
}

/// 退役备份只保留最新一份，避免反复恢复旧备份时无限累积全库体积的 .bak 文件。
fn remove_stale_backups(database_path: &str, keep: &str) {
    let path = std::path::Path::new(database_path);
    let Some(directory) = path.parent() else { return };
    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else { return };
    let prefix = format!("{file_name}.pre-editor-block-retirement-v1-");
    let Ok(entries) = std::fs::read_dir(directory) else { return };
    let keep_path = std::path::Path::new(keep);
    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let Some(name) = file_name.to_str() else { continue };
        if name.starts_with(&prefix) && name.ends_with(".bak") && entry.path() != keep_path {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

pub(super) fn retire(conn: &Connection) -> Result<(), String> {
    install_guards(conn)?;
    let pending = collect_changes(conn)?;
    if pending.is_empty() {
        return Ok(());
    }
    if let Some(path) = conn.path().filter(|p| !p.is_empty() && *p != ":memory:") {
        let backup = format!(
            "{path}.pre-editor-block-retirement-v1-{}.bak",
            uuid::Uuid::new_v4()
        );
        conn.execute("VACUUM INTO ?1", [backup.clone()])
            .map_err(|e| format!("EDITOR_BLOCK_RETIREMENT_FAILED: 备份失败: {e}"))?;
        remove_stale_backups(&path, &backup);
    }
    let tx = rusqlite::Transaction::new_unchecked(conn, TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    for PendingChange { table, column, id, next } in &pending {
        let fields = columns(&tx, table)?;
        let count = if *table == "contents" {
            ",count=COALESCE(tau_editor_content_count(?1),count)"
        } else {
            ""
        };
        let timestamp = if fields.iter().any(|f| f == "update_time") {
            ",update_time=MAX(update_time+1,CAST(strftime('%s','now') AS INTEGER)*1000)"
        } else {
            ""
        };
        tx.execute(
            &format!("UPDATE \"{table}\" SET \"{column}\"=?1{count}{timestamp} WHERE id=?2"),
            params![next, id],
        )
        .map_err(|e| e.to_string())?;
        if *table == "contents" {
            tx.execute_batch(&dependents_sql(&tx, &id.to_string())?)
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_word_counts() {
        let cases: Value = serde_json::from_str(include_str!(
            "../../../../../packages/db-schema/fixtures/editor-word-count.json"
        ))
        .unwrap();
        for case in cases.as_array().unwrap() {
            assert_eq!(
                words_count(case["text"].as_str().unwrap()),
                case["count"].as_i64().unwrap(),
                "{}",
                case["text"]
            );
        }
        assert_eq!(
            content_count(
                &json!([{ "type":"code-block", "code":"const a = 1" }, { "type":"inline-math", "tex":"E=mc^2" }])
            ),
            7
        );
    }

    #[test]
    fn wal_backup_and_malformed_json_tolerance() {
        let directory =
            std::env::temp_dir().join(format!("tau-editor-retirement-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("main.db");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE contents(id INTEGER PRIMARY KEY,content TEXT,count INTEGER,update_time INTEGER)").unwrap();
        let legacy = r#"[{"type":"question","children":[]}]"#;
        conn.execute("INSERT INTO contents VALUES(1,?1,0,1)", [legacy])
            .unwrap();
        conn.execute("INSERT INTO contents VALUES(2,?1,0,1)", ["{broken"])
            .unwrap();
        // 非法 JSON 存量行保留原值跳过清理，其余行正常退役，不再阻断
        retire(&conn).unwrap();
        let broken: String = conn
            .query_row("SELECT content FROM contents WHERE id=2", [], |r| r.get(0))
            .unwrap();
        assert_eq!(broken, "{broken");
        let cleaned: String = conn
            .query_row("SELECT content FROM contents WHERE id=1", [], |r| r.get(0))
            .unwrap();
        // serde_json 序列化按键排序，用结构化比较避免依赖键序
        assert_eq!(
            serde_json::from_str::<Value>(&cleaned).unwrap(),
            json!([{"type":"paragraph","children":[{"type":"formatted","text":""}]}])
        );
        // 备份保留清理前的原始状态
        let backups = std::fs::read_dir(&directory)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|entry| entry.extension().is_some_and(|ext| ext == "bak"))
            .collect::<Vec<_>>();
        assert_eq!(backups.len(), 1);
        let snapshot = Connection::open(&backups[0]).unwrap();
        let original: String = snapshot
            .query_row("SELECT content FROM contents WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(original, legacy);
        drop(snapshot);
        conn.execute("DELETE FROM contents WHERE id=2", []).unwrap();
        // 幂等：无变更时不再产生新备份
        retire(&conn).unwrap();
        // 再次出现退役块时重新备份，且只保留最新一份
        conn.execute("UPDATE contents SET content=?1 WHERE id=1", [legacy])
            .unwrap();
        retire(&conn).unwrap();
        let backups = std::fs::read_dir(&directory)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|entry| entry.extension().is_some_and(|ext| ext == "bak"))
            .collect::<Vec<_>>();
        assert_eq!(backups.len(), 1);
        drop(conn);
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn shared_depth_first_cases() {
        let cases: Value = serde_json::from_str(include_str!(
            "../../../../../packages/db-schema/fixtures/editor-block-retirement.json"
        ))
        .unwrap();
        for case in cases.as_array().unwrap() {
            let mut value = case["input"].clone();
            assert_eq!(
                strip(&mut value),
                case["removed"].as_u64().unwrap() as usize,
                "{}",
                case["name"]
            );
            assert_eq!(value, case["expected"], "{}", case["name"]);
            assert_eq!(strip(&mut value), 0);
        }
    }

    #[test]
    fn migration_and_import_guard_are_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE contents(id INTEGER PRIMARY KEY,content TEXT,count INTEGER,update_time INTEGER)").unwrap();
        let content = r#"[{"type":"question","children":[]}]"#;
        conn.execute("INSERT INTO contents VALUES(1,?1,0,1)", [content])
            .unwrap();
        retire(&conn).unwrap();
        let first: String = conn
            .query_row("SELECT content FROM contents", [], |r| r.get(0))
            .unwrap();
        assert!(!first.contains("question"));
        retire(&conn).unwrap();
        conn.execute("INSERT INTO contents VALUES(2,?1,0,1)", [content])
            .unwrap();
        let second: String = conn
            .query_row("SELECT content FROM contents WHERE id=2", [], |r| r.get(0))
            .unwrap();
        assert_eq!(first, second);
    }
}
