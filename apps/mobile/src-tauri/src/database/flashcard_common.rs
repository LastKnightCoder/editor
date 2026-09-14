use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

use super::flashcard_types::{Flashcard, FlashcardDeck, FlashcardDeckStats, FlashcardReference, FlashcardReferenceContent};

pub(crate) fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub(crate) fn format_db_error(code: &str, context: &str, error: impl std::fmt::Display) -> String {
    format!("{code}: {context}: {error}")
}

pub(crate) const DECK_COLUMNS: &str =
    "id, name, description, cover_color, emoji, sort_order, meta, create_time, update_time";

pub(crate) const CARD_COLUMNS: &str =
    "id, deck_id, type, prompt, detail, data, tags, difficulty, review_level, \
     due_time, last_review_time, review_count, ease_factor, status, reference_summary, \
     create_time, update_time";

/// 空白 Slate 段落（桌面端 textToDescendants 同构）
pub(crate) fn empty_paragraph_text() -> Value {
    json!([{ "type": "paragraph", "children": [{ "type": "formatted", "text": "" }] }])
}

/// 解析 prompt/detail 列：必须是 JSON 数组，否则降级为纯文本段落（对齐桌面 mapCardRow 的 fallback）
fn parse_rich_text_column(raw: Option<String>) -> Value {
    let Some(text) = raw else {
        return empty_paragraph_text();
    };
    match serde_json::from_str::<Value>(&text) {
        Ok(Value::Array(nodes)) => Value::Array(nodes),
        _ => json!([{ "type": "paragraph", "children": [{ "type": "formatted", "text": text }] }]),
    }
}

pub(crate) fn parse_deck_row(row: &rusqlite::Row) -> Result<FlashcardDeck, rusqlite::Error> {
    let meta_raw: Option<String> = row.get(6)?;
    let meta = meta_raw.and_then(|text| serde_json::from_str::<Value>(&text).ok());
    Ok(FlashcardDeck {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
        cover_color: row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "#2563eb".into()),
        emoji: row.get::<_, Option<String>>(4)?.unwrap_or_else(|| "🧠".into()),
        sort_order: row.get(5)?,
        meta,
        create_time: row.get(7)?,
        update_time: row.get(8)?,
        stats: None,
    })
}

pub(crate) fn parse_card_row(
    row: &rusqlite::Row,
    references: Vec<FlashcardReference>,
) -> Result<Flashcard, rusqlite::Error> {
    let tags: Vec<String> = row
        .get::<_, Option<String>>(6)?
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default();
    // 调度列在 schema 中可空，NULL 行按桌面端口径给默认值，避免单行毒化整个列表
    Ok(Flashcard {
        id: row.get(0)?,
        deck_id: row.get(1)?,
        card_type: row.get(2)?,
        prompt: parse_rich_text_column(row.get(3)?),
        detail: parse_rich_text_column(row.get(4)?),
        data: row
            .get::<_, Option<String>>(5)?
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_else(|| json!({})),
        tags,
        difficulty: row
            .get::<_, Option<String>>(7)?
            .unwrap_or_else(|| "standard".into()),
        review_level: row.get::<_, Option<i64>>(8)?.unwrap_or(0),
        due_time: row.get(9)?,
        last_review_time: row.get(10)?,
        review_count: row.get::<_, Option<i64>>(11)?.unwrap_or(0),
        ease_factor: row.get::<_, Option<f64>>(12)?.unwrap_or(2.5),
        status: row
            .get::<_, Option<String>>(13)?
            .unwrap_or_else(|| "new".into()),
        reference_summary: row.get(14)?,
        references,
        create_time: row.get(15)?,
        update_time: row.get(16)?,
    })
}

pub(crate) fn query_deck_by_id(conn: &Connection, id: i64) -> Result<Option<FlashcardDeck>, String> {
    conn.query_row(
        &format!("SELECT {DECK_COLUMNS} FROM flashcard_decks WHERE id = ?1"),
        params![id],
        parse_deck_row,
    )
    .optional()
    .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "get deck by id", e))
}

pub(crate) fn query_card_by_id(conn: &Connection, id: i64) -> Result<Option<Flashcard>, String> {
    conn.query_row(
        &format!("SELECT {CARD_COLUMNS} FROM flashcards WHERE id = ?1"),
        params![id],
        |row| parse_card_row(row, vec![]),
    )
    .optional()
    .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "get card by id", e))
    .and_then(|card| match card {
        None => Ok(None),
        Some(mut card) => {
            card.references = query_references_by_card_ids(conn, &[card.id])?
                .remove(&card.id)
                .unwrap_or_default();
            Ok(Some(card))
        }
    })
}

/// 批量取卡片的参考资料（LEFT JOIN contents 带出完整内容快照）
pub(crate) fn query_references_by_card_ids(
    conn: &Connection,
    card_ids: &[i64],
) -> Result<std::collections::HashMap<i64, Vec<FlashcardReference>>, String> {
    let mut map = std::collections::HashMap::new();
    if card_ids.is_empty() {
        return Ok(map);
    }
    let placeholders = vec!["?"; card_ids.len()].join(", ");
    let sql = format!(
        "SELECT fr.id, fr.card_id, fr.content_id, fr.ref_type, fr.title, fr.create_time, fr.update_time, \
         c.id, c.content, c.create_time, c.update_time, c.count, c.ref_count \
         FROM flashcard_references fr \
         LEFT JOIN contents c ON fr.content_id = c.id \
         WHERE fr.card_id IN ({placeholders}) \
         ORDER BY fr.update_time ASC"
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "prepare references query", e))?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(card_ids.iter()), |row| {
            // 列序与上方 SQL 一一对应：7=c.id, 8=c.content, 9/10=c.create_time/update_time, 11/12=c.count/ref_count
            let content_id: Option<i64> = row.get(7)?;
            let content_json: Option<String> = row.get(8)?;
            let content = match (content_id, content_json) {
                (Some(id), Some(text)) => serde_json::from_str::<Value>(&text).ok().map(|content| {
                    FlashcardReferenceContent {
                        id,
                        content,
                        create_time: row.get(9).unwrap_or(0),
                        update_time: row.get(10).unwrap_or(0),
                        count: row.get(11).unwrap_or(0),
                        ref_count: row.get(12).unwrap_or(0),
                    }
                }),
                _ => None,
            };
            Ok(FlashcardReference {
                id: row.get(0)?,
                card_id: row.get(1)?,
                content_id: row.get(2)?,
                ref_type: row.get(3)?,
                title: row.get(4)?,
                create_time: row.get(5)?,
                update_time: row.get(6)?,
                content,
            })
        })
        .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "query references", e))?;
    for row in rows {
        let reference = row
            .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "parse reference row", e))?;
        map.entry(reference.card_id).or_default().push(reference);
    }
    Ok(map)
}

/// 各卡组统计（一次聚合查询，对齐桌面 getDeckStatsMap）
pub(crate) fn query_deck_stats_map(
    conn: &Connection,
) -> Result<std::collections::HashMap<i64, FlashcardDeckStats>, String> {
    let now = now_millis();
    let mut stmt = conn
        .prepare(
            "SELECT deck_id, COUNT(*), \
             SUM(CASE WHEN review_count = 0 THEN 1 ELSE 0 END), \
             SUM(CASE WHEN due_time <= ?1 THEN 1 ELSE 0 END), \
             SUM(CASE WHEN status = 'learning' THEN 1 ELSE 0 END), \
             MAX(last_review_time) \
             FROM flashcards GROUP BY deck_id",
        )
        .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "prepare deck stats", e))?;
    let rows = stmt
        .query_map(params![now], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                FlashcardDeckStats {
                    total_cards: row.get(1)?,
                    new_cards: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                    due_cards: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
                    learning_cards: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
                    last_review_time: row.get(5)?,
                },
            ))
        })
        .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "query deck stats", e))?;
    let mut map = std::collections::HashMap::new();
    for row in rows {
        let (deck_id, stats) =
            row.map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "parse deck stats", e))?;
        map.insert(deck_id, stats);
    }
    Ok(map)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 回归：references LEFT JOIN contents 的列索引曾整体错位一位，
    /// 把 c.content(TEXT) 当 c.id(INTEGER) 读，带参考资料的卡组整个列表报
    /// "Invalid column type Text"——此测试钉住列序与解析的对齐
    #[test]
    fn query_references_parses_joined_content_columns() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE flashcard_references (id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL, \
             content_id INTEGER NOT NULL, ref_type TEXT NOT NULL, title TEXT NOT NULL, \
             create_time INTEGER NOT NULL, update_time INTEGER NOT NULL);
             CREATE TABLE contents (id INTEGER PRIMARY KEY, content TEXT, create_time INTEGER, \
             update_time INTEGER, count INTEGER, ref_count INTEGER);
             INSERT INTO flashcard_references VALUES (1, 10, 77, 'content', '标题', 1, 1);
             INSERT INTO contents VALUES (77, '{\"type\":\"paragraph\"}', 5, 6, 3, 2);",
        )
        .unwrap();

        let map = query_references_by_card_ids(&conn, &[10]).unwrap();
        let reference = &map[&10][0];
        assert_eq!(reference.id, 1);
        assert_eq!(reference.card_id, 10);
        assert_eq!(reference.content_id, 77);
        assert_eq!(reference.title, "标题");
        let content = reference.content.as_ref().unwrap();
        assert_eq!(content.id, 77);
        assert_eq!(content.create_time, 5);
        assert_eq!(content.update_time, 6);
        assert_eq!(content.count, 3);
        assert_eq!(content.ref_count, 2);
    }
}
