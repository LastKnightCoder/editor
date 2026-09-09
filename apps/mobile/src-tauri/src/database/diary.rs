use rusqlite::{params, OptionalExtension, Row, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use super::schema;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiaryEntry {
    pub id: i64,
    #[serde(rename = "type")]
    pub diary_type: String,
    pub date: String,
    pub content_id: Option<i64>,
    pub weather: Option<String>,
    pub mood: Option<String>,
    pub word_count: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub content: Value,
    pub segments: Vec<DiarySegment>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiarySegment {
    pub id: i64,
    pub diary_id: i64,
    pub content_id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub word_count: i64,
    pub content: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiaryListPayload {
    #[serde(rename = "type")]
    pub diary_type: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiaryGetPayload {
    #[serde(rename = "type")]
    pub diary_type: String,
    pub date: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiaryUpsertPayload {
    #[serde(rename = "type")]
    pub diary_type: String,
    pub date: String,
    pub content: Value,
    pub weather: Option<Value>,
    pub mood: Option<Value>,
    pub segment_id: Option<i64>,
    #[serde(default)]
    pub new_segment: bool,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiaryDeleteSegmentPayload {
    pub diary_id: i64,
    pub segment_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiaryDeletePayload {
    pub id: i64,
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn format_db_error(code: &str, context: &str, error: impl std::fmt::Display) -> String {
    format!("{code}: {context}: {error}")
}

fn parse_diary_content(raw: Option<String>) -> Value {
    let Some(text) = raw else {
        return Value::Array(vec![]);
    };
    match serde_json::from_str::<Value>(&text) {
        Ok(Value::Array(items)) => Value::Array(items),
        _ => Value::Array(vec![]),
    }
}

fn parse_diary_row(row: &Row<'_>) -> rusqlite::Result<DiaryEntry> {
    let content_raw: Option<String> = row.get(9)?;
    Ok(DiaryEntry {
        id: row.get(0)?,
        diary_type: row.get(1)?,
        date: row.get(2)?,
        content_id: row.get(3)?,
        weather: row.get(4)?,
        mood: row.get(5)?,
        word_count: row.get(6)?,
        create_time: row.get(7)?,
        update_time: row.get(8)?,
        content: parse_diary_content(content_raw),
        segments: Vec::new(),
        tags: Vec::new(),
    })
}

fn collect_texts(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            if let Some(text) = map.get("text").and_then(|v| v.as_str()) {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    out.push(trimmed.to_string());
                }
            }
            for child in map.values() {
                collect_texts(child, out);
            }
        }
        Value::Array(items) => {
            for child in items {
                collect_texts(child, out);
            }
        }
        _ => {}
    }
}

fn get_content_word_count(content: &Value) -> i64 {
    let mut texts = vec![];
    collect_texts(content, &mut texts);
    texts.iter().map(|text| text.chars().count() as i64).sum()
}

fn normalize_diary_type(value: &str) -> Result<String, String> {
    let normalized = value.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "daily" | "weekly" | "monthly" => Ok(normalized),
        _ => Err("DIARY_INVALID_TYPE: type must be daily/weekly/monthly".to_string()),
    }
}

fn is_digit(byte: u8) -> bool {
    byte.is_ascii_digit()
}

fn validate_diary_date(diary_type: &str, date: &str) -> bool {
    let bytes = date.as_bytes();
    match diary_type {
        "daily" => {
            bytes.len() == 10
                && is_digit(bytes[0])
                && is_digit(bytes[1])
                && is_digit(bytes[2])
                && is_digit(bytes[3])
                && bytes[4] == b'-'
                && is_digit(bytes[5])
                && is_digit(bytes[6])
                && bytes[7] == b'-'
                && is_digit(bytes[8])
                && is_digit(bytes[9])
        }
        "weekly" => {
            bytes.len() == 8
                && is_digit(bytes[0])
                && is_digit(bytes[1])
                && is_digit(bytes[2])
                && is_digit(bytes[3])
                && bytes[4] == b'-'
                && bytes[5] == b'W'
                && is_digit(bytes[6])
                && is_digit(bytes[7])
        }
        "monthly" => {
            bytes.len() == 7
                && is_digit(bytes[0])
                && is_digit(bytes[1])
                && is_digit(bytes[2])
                && is_digit(bytes[3])
                && bytes[4] == b'-'
                && is_digit(bytes[5])
                && is_digit(bytes[6])
        }
        _ => false,
    }
}

fn serialize_optional_json(value: Option<Value>) -> Result<Option<String>, String> {
    match value {
        Some(Value::Null) | None => Ok(None),
        Some(v) => serde_json::to_string(&v)
            .map(Some)
            .map_err(|e| format_db_error("DIARY_INVALID_JSON", "serialize optional json", e)),
    }
}

fn insert_content(
    tx: &Transaction<'_>,
    content: &Value,
    count: i64,
    now: i64,
) -> Result<i64, String> {
    let serialized = serde_json::to_string(content)
        .map_err(|e| format_db_error("DIARY_CONTENT_INVALID", "serialize content", e))?;
    tx.execute(
        "
        INSERT INTO contents (create_time, update_time, content, count, ref_count)
        VALUES (?1, ?1, ?2, ?3, 1)
        ",
        params![now, serialized, count.max(0)],
    )
    .map_err(|e| format_db_error("DIARY_CONTENT_CREATE_FAILED", "insert content", e))?;
    Ok(tx.last_insert_rowid())
}

fn decrement_or_delete_content(
    tx: &Transaction<'_>,
    content_id: Option<i64>,
) -> Result<(), String> {
    let Some(id) = content_id else {
        return Ok(());
    };
    if id <= 0 {
        return Ok(());
    }
    tx.execute(
        "UPDATE contents SET ref_count = ref_count - 1 WHERE id = ?1",
        params![id],
    )
    .map_err(|e| format_db_error("DIARY_CONTENT_DELETE_FAILED", "decrease ref_count", e))?;
    let ref_count = tx
        .query_row(
            "SELECT ref_count FROM contents WHERE id = ?1 LIMIT 1",
            params![id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| format_db_error("DIARY_CONTENT_DELETE_FAILED", "query ref_count", e))?;
    if matches!(ref_count, Some(v) if v <= 0) {
        tx.execute("DELETE FROM contents WHERE id = ?1", params![id])
            .map_err(|e| format_db_error("DIARY_CONTENT_DELETE_FAILED", "delete content", e))?;
    }
    Ok(())
}

fn hydrate_entry(conn: &rusqlite::Connection, mut entry: DiaryEntry) -> Result<DiaryEntry, String> {
    let tags: Option<String> = conn
        .query_row(
            "SELECT tags FROM diary_entries WHERE id=?1",
            [entry.id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    entry.tags = serde_json::from_str(tags.as_deref().unwrap_or("[]"))
        .map_err(|e| format!("DIARY_INVALID_JSON: {e}"))?;
    entry.segments = conn.prepare("SELECT s.id,s.diary_id,s.content_id,s.create_time,s.update_time,COALESCE(c.count,0),c.content
        FROM diary_segments s JOIN contents c ON c.id=s.content_id WHERE s.diary_id=?1 ORDER BY s.create_time,s.id")
        .map_err(|e| e.to_string())?.query_map([entry.id], |r| Ok(DiarySegment {
            id:r.get(0)?,diary_id:r.get(1)?,content_id:r.get(2)?,create_time:r.get(3)?,update_time:r.get(4)?,word_count:r.get(5)?,content:parse_diary_content(r.get(6)?),
        })).map_err(|e| e.to_string())?.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?;
    entry.content = Value::Array(
        entry
            .segments
            .iter()
            .flat_map(|s| s.content.as_array().cloned().unwrap_or_default())
            .collect(),
    );
    entry.word_count = entry.segments.iter().map(|s| s.word_count).sum();
    entry.content_id = None;
    Ok(entry)
}

fn query_entry_by_id(conn: &rusqlite::Connection, id: i64) -> Result<DiaryEntry, String> {
    let entry = conn
        .query_row(
            "
        SELECT
          d.id, d.type, d.date, d.content_id, d.weather, d.mood,
          d.word_count, d.create_time, d.update_time, c.content
        FROM diary_entries d
        LEFT JOIN contents c ON c.id = d.content_id
        WHERE d.id = ?1
        LIMIT 1
        ",
            params![id],
            parse_diary_row,
        )
        .map_err(|e| format_db_error("DIARY_QUERY_FAILED", "query diary entry by id", e))?;
    hydrate_entry(conn, entry)
}

#[tauri::command]
pub fn diary_list_entries(
    app: AppHandle,
    payload: Option<DiaryListPayload>,
) -> Result<Vec<DiaryEntry>, String> {
    let conn = schema::open_active_database(&app)?;
    let list_type = payload
        .as_ref()
        .and_then(|p| p.diary_type.as_deref())
        .map(normalize_diary_type)
        .transpose()?;
    let limit = payload
        .as_ref()
        .and_then(|p| p.limit)
        .unwrap_or(500)
        .clamp(1, 2000);
    let offset = payload.as_ref().and_then(|p| p.offset).unwrap_or(0).max(0);

    let mut stmt = if list_type.is_some() {
        conn.prepare(
            "
            SELECT
              d.id, d.type, d.date, d.content_id, d.weather, d.mood,
              d.word_count, d.create_time, d.update_time, c.content
            FROM diary_entries d
            LEFT JOIN contents c ON c.id = d.content_id
            WHERE d.type = ?1
            ORDER BY d.date DESC
            LIMIT ?2 OFFSET ?3
            ",
        )
        .map_err(|e| format_db_error("DIARY_QUERY_FAILED", "prepare diary list query", e))?
    } else {
        conn.prepare(
            "
            SELECT
              d.id, d.type, d.date, d.content_id, d.weather, d.mood,
              d.word_count, d.create_time, d.update_time, c.content
            FROM diary_entries d
            LEFT JOIN contents c ON c.id = d.content_id
            ORDER BY d.date DESC
            LIMIT ?1 OFFSET ?2
            ",
        )
        .map_err(|e| format_db_error("DIARY_QUERY_FAILED", "prepare diary list query", e))?
    };

    let mut items = Vec::new();
    if let Some(diary_type) = list_type {
        let rows = stmt
            .query_map(params![diary_type, limit, offset], parse_diary_row)
            .map_err(|e| format_db_error("DIARY_QUERY_FAILED", "query diary list", e))?;
        for row in rows {
            items.push(
                row.map_err(|e| format_db_error("DIARY_QUERY_FAILED", "parse diary row", e))?,
            );
        }
    } else {
        let rows = stmt
            .query_map(params![limit, offset], parse_diary_row)
            .map_err(|e| format_db_error("DIARY_QUERY_FAILED", "query diary list", e))?;
        for row in rows {
            items.push(
                row.map_err(|e| format_db_error("DIARY_QUERY_FAILED", "parse diary row", e))?,
            );
        }
    }
    items
        .into_iter()
        .map(|entry| hydrate_entry(&conn, entry))
        .collect()
}

#[tauri::command]
pub fn diary_get_entry(
    app: AppHandle,
    payload: DiaryGetPayload,
) -> Result<Option<DiaryEntry>, String> {
    let conn = schema::open_active_database(&app)?;
    let diary_type = normalize_diary_type(&payload.diary_type)?;
    let date = payload.date.trim().to_string();
    if !validate_diary_date(&diary_type, &date) {
        return Err("DIARY_INVALID_DATE: invalid date format for diary type".to_string());
    }

    let entry = conn
        .query_row(
            "
        SELECT
          d.id, d.type, d.date, d.content_id, d.weather, d.mood,
          d.word_count, d.create_time, d.update_time, c.content
        FROM diary_entries d
        LEFT JOIN contents c ON c.id = d.content_id
        WHERE d.type = ?1 AND d.date = ?2
        LIMIT 1
        ",
            params![diary_type, date],
            parse_diary_row,
        )
        .optional()
        .map_err(|e| format_db_error("DIARY_QUERY_FAILED", "query diary by type/date", e))?;
    entry.map(|entry| hydrate_entry(&conn, entry)).transpose()
}

#[tauri::command]
pub fn diary_upsert_entry(
    app: AppHandle,
    payload: DiaryUpsertPayload,
) -> Result<DiaryEntry, String> {
    let mut conn = schema::open_active_database(&app)?;
    upsert_entry(&mut conn, payload)
}

fn upsert_entry(
    conn: &mut rusqlite::Connection,
    payload: DiaryUpsertPayload,
) -> Result<DiaryEntry, String> {
    let diary_type = normalize_diary_type(&payload.diary_type)?;
    let date = payload.date.trim().to_string();
    if !validate_diary_date(&diary_type, &date) {
        return Err("DIARY_INVALID_DATE: invalid date format for diary type".to_string());
    }

    let content = if payload.content.is_array() {
        payload.content
    } else {
        Value::Array(vec![])
    };
    let weather = serialize_optional_json(payload.weather)?;
    let mood = serialize_optional_json(payload.mood)?;
    let word_count = get_content_word_count(&content);
    let now = now_millis();

    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("DIARY_UPSERT_FAILED", "begin transaction", e))?;

    let existing = tx
        .query_row(
            "
            SELECT id, content_id
            FROM diary_entries
            WHERE type = ?1 AND date = ?2
            LIMIT 1
            ",
            params![diary_type, date],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<i64>>(1)?)),
        )
        .optional()
        .map_err(|e| format_db_error("DIARY_UPSERT_FAILED", "query existing diary entry", e))?;

    let serialized_content = serde_json::to_string(&content)
        .map_err(|e| format_db_error("DIARY_CONTENT_INVALID", "serialize content", e))?;

    let entry_id = if let Some((id, _)) = existing {
        tx.execute(
            "
            UPDATE diary_entries
            SET weather = ?1, mood = ?2, update_time = ?3
            WHERE id = ?4
            ",
            params![weather, mood, now, id],
        )
        .map_err(|e| format_db_error("DIARY_UPSERT_FAILED", "update diary entry", e))?;
        id
    } else {
        tx.execute(
            "
            INSERT INTO diary_entries (type, date, content_id, weather, mood, word_count, create_time, update_time)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
            ",
            params![
                diary_type,
                date,
                Option::<i64>::None,
                weather,
                mood,
                word_count,
                now
            ],
        )
        .map_err(|e| format_db_error("DIARY_UPSERT_FAILED", "insert diary entry", e))?;
        tx.last_insert_rowid()
    };

    if let Some(tags) = payload.tags {
        tx.execute(
            "UPDATE diary_entries SET tags=?1 WHERE id=?2",
            params![
                serde_json::to_string(&tags).map_err(|e| e.to_string())?,
                entry_id
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    let segments = tx
        .prepare(
            "SELECT id,content_id FROM diary_segments WHERE diary_id=?1 ORDER BY create_time,id",
        )
        .map_err(|e| e.to_string())?
        .query_map([entry_id], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    let target = if payload.new_segment {
        None
    } else if let Some(id) = payload.segment_id {
        Some(
            *segments
                .iter()
                .find(|s| s.0 == id)
                .ok_or("DIARY_SEGMENT_NOT_FOUND: 日记片段已删除，请刷新后重试")?,
        )
    } else if segments.len() > 1 {
        return Err("DIARY_SEGMENT_REQUIRED: 请选择需要编辑的日记片段".into());
    } else {
        segments.first().copied()
    };
    if let Some((segment_id, content_id)) = target {
        let changed = tx
            .execute(
                "UPDATE contents SET content=?1,count=?2,update_time=?3 WHERE id=?4",
                params![serialized_content, word_count, now, content_id],
            )
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err("DIARY_CONTENT_NOT_FOUND: 日记内容不存在".into());
        }
        tx.execute(
            "UPDATE diary_segments SET update_time=?1 WHERE content_id=?2",
            params![now, content_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute("UPDATE diary_entries SET update_time=?1 WHERE id IN (SELECT diary_id FROM diary_segments WHERE id=?2 OR content_id=?3)", params![now,segment_id,content_id]).map_err(|e| e.to_string())?;
    } else {
        let content_id = insert_content(&tx, &content, word_count, now)?;
        tx.execute("INSERT INTO diary_segments(diary_id,content_id,create_time,update_time) VALUES(?1,?2,?3,?3)", params![entry_id,content_id,now]).map_err(|e| e.to_string())?;
    }
    sync_word_counts(&tx)?;

    tx.commit()
        .map_err(|e| format_db_error("DIARY_UPSERT_FAILED", "commit transaction", e))?;

    query_entry_by_id(&conn, entry_id)
}

#[tauri::command]
pub fn diary_delete_entry(app: AppHandle, payload: DiaryDeletePayload) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    delete_entry(&mut conn, payload.id)
}

fn delete_entry(conn: &mut rusqlite::Connection, entry_id: i64) -> Result<i64, String> {
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("DIARY_DELETE_FAILED", "begin transaction", e))?;

    let content_id = tx
        .query_row(
            "SELECT content_id FROM diary_entries WHERE id = ?1 LIMIT 1",
            params![entry_id],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map_err(|e| format_db_error("DIARY_DELETE_FAILED", "query diary entry", e))?
        .ok_or_else(|| "DIARY_NOT_FOUND: diary entry does not exist".to_string())?;

    let segment_contents = tx
        .prepare("SELECT content_id FROM diary_segments WHERE diary_id=?1")
        .map_err(|e| e.to_string())?
        .query_map([entry_id], |r| r.get::<_, i64>(0))
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM diary_segments WHERE diary_id=?1", [entry_id])
        .map_err(|e| e.to_string())?;
    let changes = tx
        .execute("DELETE FROM diary_entries WHERE id = ?1", params![entry_id])
        .map_err(|e| format_db_error("DIARY_DELETE_FAILED", "delete diary entry", e))?;

    if !segment_contents.contains(&content_id.unwrap_or(0)) {
        decrement_or_delete_content(&tx, content_id)?;
    }
    for content_id in segment_contents {
        decrement_or_delete_content(&tx, Some(content_id))?;
    }

    tx.commit()
        .map_err(|e| format_db_error("DIARY_DELETE_FAILED", "commit transaction", e))?;

    Ok(changes as i64)
}

fn sync_word_counts(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch("UPDATE diary_entries SET word_count=COALESCE((SELECT SUM(c.count) FROM diary_segments s JOIN contents c ON c.id=s.content_id WHERE s.diary_id=diary_entries.id),0);").map_err(|e| e.to_string())
}

pub(super) fn touch_content_diaries(
    conn: &rusqlite::Connection,
    content_id: i64,
    now: i64,
) -> Result<(), String> {
    conn.execute(
        "UPDATE diary_segments SET update_time=?1 WHERE content_id=?2",
        params![now, content_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("UPDATE diary_entries SET update_time=?1,word_count=COALESCE((SELECT SUM(c.count) FROM diary_segments s JOIN contents c ON c.id=s.content_id WHERE s.diary_id=diary_entries.id),0)
        WHERE id IN (SELECT diary_id FROM diary_segments WHERE content_id=?2)", params![now,content_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn diary_delete_segment(
    app: AppHandle,
    payload: DiaryDeleteSegmentPayload,
) -> Result<DiaryEntry, String> {
    let mut conn = schema::open_active_database(&app)?;
    delete_segment(&mut conn, payload.diary_id, payload.segment_id)
}

fn delete_segment(
    conn: &mut rusqlite::Connection,
    diary_id: i64,
    segment_id: i64,
) -> Result<DiaryEntry, String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let content_id: i64 = tx
        .query_row(
            "SELECT content_id FROM diary_segments WHERE id=?1 AND diary_id=?2",
            params![segment_id, diary_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM diary_segments WHERE id=?1 AND diary_id=?2",
        params![segment_id, diary_id],
    )
    .map_err(|e| e.to_string())?;
    decrement_or_delete_content(&tx, Some(content_id))?;
    tx.execute(
        "UPDATE diary_entries SET update_time=?1 WHERE id=?2",
        params![now_millis(), diary_id],
    )
    .map_err(|e| e.to_string())?;
    sync_word_counts(&tx)?;
    tx.commit().map_err(|e| e.to_string())?;
    query_entry_by_id(conn, diary_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn database() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::migrator::ensure_main_schema(&conn).unwrap();
        conn
    }

    fn payload(text: &str, segment_id: Option<i64>, new_segment: bool) -> DiaryUpsertPayload {
        DiaryUpsertPayload {
            diary_type: "daily".into(),
            date: "2026-09-09".into(),
            content: json!([{ "type":"paragraph","children":[{"text":text}] }]),
            weather: None,
            mood: None,
            segment_id,
            new_segment,
            tags: None,
        }
    }

    #[test]
    fn edits_one_segment_and_preserves_other_ids_content_and_tags() {
        let mut conn = database();
        let mut first_payload = payload("first", None, false);
        first_payload.tags = Some(vec!["日常".into()]);
        let first = upsert_entry(&mut conn, first_payload).unwrap();
        let second = upsert_entry(&mut conn, payload("second", None, true)).unwrap();
        let untouched = second.segments[1].clone();
        let edited = upsert_entry(
            &mut conn,
            payload("changed", Some(first.segments[0].id), false),
        )
        .unwrap();
        assert_eq!(edited.segments.len(), 2);
        assert_eq!(edited.segments[0].content_id, first.segments[0].content_id);
        assert_eq!(edited.segments[1].id, untouched.id);
        assert_eq!(edited.segments[1].content, untouched.content);
        assert_eq!(edited.tags, vec!["日常"]);
        assert_eq!(edited.content_id, None);
        assert_eq!(edited.word_count, 13);
        assert!(upsert_entry(&mut conn, payload("overwrite", None, false)).is_err());
        assert_eq!(query_entry_by_id(&conn, edited.id).unwrap().word_count, 13);
    }

    #[test]
    fn deleting_segments_and_entries_preserves_shared_content() {
        let mut conn = database();
        let first = upsert_entry(&mut conn, payload("shared", None, false)).unwrap();
        let first_segment = first.segments[0].clone();
        conn.execute(
            "UPDATE contents SET ref_count=2 WHERE id=?1",
            [first_segment.content_id],
        )
        .unwrap();
        let second = upsert_entry(&mut conn, payload("private", None, true)).unwrap();
        let private_id = second.segments[1].content_id;
        let after = delete_segment(&mut conn, first.id, first_segment.id).unwrap();
        assert_eq!(after.segments.len(), 1);
        assert_eq!(
            conn.query_row(
                "SELECT ref_count FROM contents WHERE id=?1",
                [first_segment.content_id],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
        delete_entry(&mut conn, first.id).unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM contents WHERE id=?1",
                [private_id],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM diary_segments", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn wrong_segment_id_rolls_back_metadata_updates() {
        let mut conn = database();
        let before = upsert_entry(&mut conn, payload("original", None, false)).unwrap();
        let mut invalid = payload("bad", Some(999), false);
        invalid.tags = Some(vec!["不应保存".into()]);
        assert!(upsert_entry(&mut conn, invalid).is_err());
        let after = query_entry_by_id(&conn, before.id).unwrap();
        assert_eq!(after.tags, before.tags);
        assert_eq!(after.content, before.content);
    }
}
