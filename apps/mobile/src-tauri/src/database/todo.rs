use rusqlite::{params, OptionalExtension, Row, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use super::schema;
use super::todo_calendar_sync;

const SYSTEM_GROUPS: [(&str, &str); 5] = [
    ("all", "全部任务"),
    ("normal", "普通任务"),
    ("deadline", "截止任务"),
    ("planned", "计划任务"),
    ("recurring", "周期任务"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoGroup {
    pub id: i64,
    pub title: String,
    pub color: Option<String>,
    pub sort_index: i64,
    pub is_archived: bool,
    pub is_system: bool,
    pub system_type: Option<String>,
    pub create_time: i64,
    pub update_time: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoRecurrence {
    pub id: i64,
    pub todo_item_id: i64,
    pub r#type: String,
    pub interval: i64,
    pub weekdays: Option<Vec<i64>>,
    pub month_day: Option<i64>,
    pub year_month: Option<i64>,
    pub year_day: Option<i64>,
    pub exclude_holidays: bool,
    pub start_date: i64,
    pub end_date: Option<i64>,
    pub max_occurrences: Option<i64>,
    pub create_time: i64,
    pub update_time: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoItem {
    pub id: i64,
    pub group_id: i64,
    pub parent_id: Option<i64>,
    pub title: String,
    pub r#type: String,
    pub description_content_id: Option<i64>,
    pub description_content: Option<Value>,
    pub is_completed: bool,
    pub start_at: Option<i64>,
    pub due_at: Option<i64>,
    pub remind_before: Option<i64>,
    pub completed_at: Option<i64>,
    pub sort_index: i64,
    pub is_archived: bool,
    pub create_time: i64,
    pub update_time: i64,
    pub recurrence: Option<TodoRecurrence>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoRecurrenceCompletion {
    pub id: i64,
    pub recurrence_id: i64,
    pub scheduled_date: i64,
    pub completed_at: Option<i64>,
    pub skipped: bool,
    pub create_time: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoGroupStats {
    pub group_id: i64,
    pub total: i64,
    pub uncompleted: i64,
    pub overdue: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateContentPayload {
    pub content: Value,
    pub count: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTodoGroupPayload {
    pub title: String,
    pub color: Option<String>,
    pub is_system: Option<bool>,
    pub system_type: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTodoGroupPayload {
    pub id: i64,
    pub title: Option<String>,
    pub color: Option<String>,
    pub sort_index: Option<i64>,
    pub is_archived: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveTodoGroupPayload {
    pub id: i64,
    pub is_archived: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderGroupsPayload {
    pub ordered_ids: Vec<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListItemsPayload {
    pub group_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListItemsByTypePayload {
    #[serde(rename = "type")]
    pub item_type: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTodoItemPayload {
    pub group_id: i64,
    pub parent_id: Option<i64>,
    pub title: String,
    #[serde(rename = "type")]
    pub item_type: Option<String>,
    pub description: Option<String>,
    pub start_at: Option<i64>,
    pub due_at: Option<i64>,
    pub remind_before: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTodoItemRelativePayload {
    pub ref_id: i64,
    pub position: String,
    pub title: String,
    #[serde(rename = "type")]
    pub item_type: Option<String>,
    pub description: Option<String>,
    pub start_at: Option<i64>,
    pub due_at: Option<i64>,
    pub remind_before: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTodoItemPayload {
    pub id: i64,
    pub title: Option<String>,
    #[serde(rename = "type")]
    pub item_type: Option<String>,
    pub description_content_id: Option<i64>,
    pub start_at: Option<i64>,
    pub due_at: Option<i64>,
    pub remind_before: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleCompleteCascadePayload {
    pub id: i64,
    pub is_completed: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveAndReorderPayload {
    pub id: i64,
    pub to_group_id: i64,
    pub to_parent_id: Option<i64>,
    pub before_id: Option<i64>,
    pub after_id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveTodoItemPayload {
    pub id: i64,
    pub is_archived: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdPayload {
    pub id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoItemIdPayload {
    pub todo_item_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTodoRecurrencePayload {
    pub todo_item_id: i64,
    #[serde(rename = "type")]
    pub recurrence_type: String,
    pub interval: Option<i64>,
    pub weekdays: Option<Vec<i64>>,
    pub month_day: Option<i64>,
    pub year_month: Option<i64>,
    pub year_day: Option<i64>,
    pub exclude_holidays: Option<bool>,
    pub start_date: i64,
    pub end_date: Option<i64>,
    pub max_occurrences: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTodoRecurrencePayload {
    pub id: i64,
    #[serde(rename = "type")]
    pub recurrence_type: Option<String>,
    pub interval: Option<i64>,
    pub weekdays: Option<Vec<i64>>,
    pub month_day: Option<i64>,
    pub year_month: Option<i64>,
    pub year_day: Option<i64>,
    pub exclude_holidays: Option<bool>,
    pub start_date: Option<i64>,
    pub end_date: Option<i64>,
    pub max_occurrences: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurrenceCompletionsPayload {
    pub recurrence_id: i64,
    pub start_date: Option<i64>,
    pub end_date: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurrenceCompletionPayload {
    pub recurrence_id: i64,
    pub scheduled_date: i64,
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn parse_bool(value: i64) -> bool {
    value == 1
}

fn parse_json_content(raw: Option<String>) -> Option<Value> {
    raw.and_then(|text| serde_json::from_str::<Value>(&text).ok())
}

fn parse_weekdays(raw: Option<String>) -> Option<Vec<i64>> {
    let Some(text) = raw else {
        return None;
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return None;
    };
    let Some(items) = value.as_array() else {
        return None;
    };
    let weekdays = items.iter().filter_map(|v| v.as_i64()).collect::<Vec<_>>();
    if weekdays.is_empty() {
        None
    } else {
        Some(weekdays)
    }
}

fn format_db_error(code: &str, context: &str, error: impl std::fmt::Display) -> String {
    format!("{code}: {context}: {error}")
}

fn parse_group_row(row: &Row<'_>) -> rusqlite::Result<TodoGroup> {
    Ok(TodoGroup {
        id: row.get(0)?,
        title: row.get(1)?,
        color: row.get(2)?,
        sort_index: row.get(3)?,
        is_archived: parse_bool(row.get::<_, i64>(4)?),
        is_system: parse_bool(row.get::<_, i64>(5)?),
        system_type: row.get(6)?,
        create_time: row.get(7)?,
        update_time: row.get(8)?,
    })
}

fn parse_recurrence_row(row: &Row<'_>, offset: usize) -> rusqlite::Result<Option<TodoRecurrence>> {
    let recurrence_id = row.get::<_, Option<i64>>(offset)?;
    let Some(id) = recurrence_id else {
        return Ok(None);
    };
    Ok(Some(TodoRecurrence {
        id,
        todo_item_id: row.get(offset + 1)?,
        r#type: row.get(offset + 2)?,
        interval: row.get(offset + 3)?,
        weekdays: parse_weekdays(row.get::<_, Option<String>>(offset + 4)?),
        month_day: row.get(offset + 5)?,
        year_month: row.get(offset + 6)?,
        year_day: row.get(offset + 7)?,
        exclude_holidays: parse_bool(row.get::<_, i64>(offset + 8)?),
        start_date: row.get(offset + 9)?,
        end_date: row.get(offset + 10)?,
        max_occurrences: row.get(offset + 11)?,
        create_time: row.get(offset + 12)?,
        update_time: row.get(offset + 13)?,
    }))
}

fn parse_item_row(row: &Row<'_>) -> rusqlite::Result<TodoItem> {
    let content_raw: Option<String> = row.get(6)?;
    Ok(TodoItem {
        id: row.get(0)?,
        group_id: row.get(1)?,
        parent_id: row.get(2)?,
        title: row.get(3)?,
        r#type: row.get(4)?,
        description_content_id: row.get(5)?,
        description_content: parse_json_content(content_raw),
        is_completed: parse_bool(row.get::<_, i64>(7)?),
        start_at: row.get(8)?,
        due_at: row.get(9)?,
        remind_before: row.get(10)?,
        completed_at: row.get(11)?,
        sort_index: row.get(12)?,
        is_archived: parse_bool(row.get::<_, i64>(13)?),
        create_time: row.get(14)?,
        update_time: row.get(15)?,
        recurrence: parse_recurrence_row(row, 16)?,
    })
}

fn normalize_item_type(value: Option<String>) -> String {
    let normalized = value
        .unwrap_or_else(|| "normal".to_string())
        .trim()
        .to_ascii_lowercase();
    match normalized.as_str() {
        "normal" | "deadline" | "planned" | "recurring" => normalized,
        _ => "normal".to_string(),
    }
}

fn ensure_system_groups(tx: &Transaction<'_>) -> Result<(), String> {
    let now = now_millis();
    let mut stmt = tx
        .prepare("SELECT system_type FROM todo_group WHERE is_system = 1")
        .map_err(|e| format_db_error("TODO_GROUP_INIT_FAILED", "prepare system group query", e))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, Option<String>>(0))
        .map_err(|e| format_db_error("TODO_GROUP_INIT_FAILED", "query system groups", e))?;
    let mut existing = std::collections::HashSet::new();
    for row in rows {
        if let Ok(Some(system_type)) = row {
            existing.insert(system_type);
        }
    }

    for (index, (system_type, title)) in SYSTEM_GROUPS.iter().enumerate() {
        if existing.contains(*system_type) {
            continue;
        }
        tx.execute(
            "
            INSERT INTO todo_group (title, color, sort_index, is_archived, is_system, system_type, create_time, update_time)
            VALUES (?1, NULL, ?2, 0, 1, ?3, ?4, ?4)
            ",
            params![title, (index as i64) * 1024, system_type, now],
        )
        .map_err(|e| format_db_error("TODO_GROUP_INIT_FAILED", "insert system group", e))?;
    }
    Ok(())
}

fn insert_content_record(
    tx: &Transaction<'_>,
    content: &Value,
    count: i64,
) -> Result<i64, String> {
    let serialized = serde_json::to_string(content)
        .map_err(|e| format_db_error("CONTENT_INVALID", "serialize content", e))?;
    let now = now_millis();
    tx.execute(
        "
        INSERT INTO contents (create_time, update_time, content, count, ref_count)
        VALUES (?1, ?1, ?2, ?3, 1)
        ",
        params![now, serialized, count.max(0)],
    )
    .map_err(|e| format_db_error("CONTENT_CREATE_FAILED", "insert content", e))?;
    let content_id = tx.last_insert_rowid();
    tx.execute(
        "
        INSERT INTO operation (operation_time, operation_id, operation_content_type, operation_action)
        VALUES (?1, ?2, 'content', 'insert')
        ",
        params![now, content_id],
    )
    .map_err(|e| format_db_error("CONTENT_CREATE_FAILED", "insert operation", e))?;
    Ok(content_id)
}

fn decrement_or_delete_content(tx: &Transaction<'_>, content_id: i64) -> Result<(), String> {
    if content_id <= 0 {
        return Ok(());
    }
    tx.execute(
        "UPDATE contents SET ref_count = ref_count - 1 WHERE id = ?1",
        params![content_id],
    )
    .map_err(|e| format_db_error("CONTENT_DELETE_FAILED", "decrease ref_count", e))?;
    let ref_count = tx
        .query_row(
            "SELECT ref_count FROM contents WHERE id = ?1 LIMIT 1",
            params![content_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| format_db_error("CONTENT_DELETE_FAILED", "query ref_count", e))?;
    if matches!(ref_count, Some(v) if v <= 0) {
        tx.execute("DELETE FROM contents WHERE id = ?1", params![content_id])
            .map_err(|e| format_db_error("CONTENT_DELETE_FAILED", "delete content", e))?;
    }
    Ok(())
}

fn get_item_by_id(tx: &Transaction<'_>, id: i64) -> Result<Option<TodoItem>, String> {
    tx.query_row(
        "
        SELECT
          ti.id, ti.group_id, ti.parent_id, ti.title, ti.type, ti.description_content_id,
          c.content AS description_content,
          ti.is_completed, ti.start_at, ti.due_at, ti.remind_before, ti.completed_at,
          ti.sort_index, ti.is_archived, ti.create_time, ti.update_time,
          tr.id, tr.todo_item_id, tr.type, tr.interval, tr.weekdays, tr.month_day, tr.year_month, tr.year_day,
          tr.exclude_holidays, tr.start_date, tr.end_date, tr.max_occurrences, tr.create_time, tr.update_time
        FROM todo_item ti
        LEFT JOIN contents c ON c.id = ti.description_content_id
        LEFT JOIN todo_recurrence tr ON tr.todo_item_id = ti.id
        WHERE ti.id = ?1
        LIMIT 1
        ",
        params![id],
        parse_item_row,
    )
    .optional()
    .map_err(|e| format_db_error("TODO_QUERY_FAILED", "query todo item", e))
}

fn query_items_with_sql(
    tx: &Transaction<'_>,
    sql: &str,
    params_any: &[&dyn rusqlite::ToSql],
) -> Result<Vec<TodoItem>, String> {
    let mut stmt = tx
        .prepare(sql)
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "prepare item query", e))?;
    let rows = stmt
        .query_map(params_any, parse_item_row)
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "query items", e))?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| format_db_error("TODO_QUERY_FAILED", "parse item row", e))?);
    }
    Ok(items)
}

fn query_max_sort_index(
    tx: &Transaction<'_>,
    group_id: i64,
    parent_id: Option<i64>,
) -> Result<i64, String> {
    if let Some(pid) = parent_id {
        tx.query_row(
            "SELECT COALESCE(MAX(sort_index), 0) FROM todo_item WHERE group_id = ?1 AND parent_id = ?2",
            params![group_id, pid],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| format_db_error("TODO_CREATE_FAILED", "query max sort index", e))
    } else {
        tx.query_row(
            "SELECT COALESCE(MAX(sort_index), 0) FROM todo_item WHERE group_id = ?1 AND parent_id IS NULL",
            params![group_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| format_db_error("TODO_CREATE_FAILED", "query max sort index", e))
    }
}

fn create_item_with_payload(
    tx: &Transaction<'_>,
    payload: &CreateTodoItemPayload,
) -> Result<TodoItem, String> {
    let item_type = normalize_item_type(payload.item_type.clone());
    let sort_index = query_max_sort_index(tx, payload.group_id, payload.parent_id)? + 1024;
    let now = now_millis();
    let description_content_id = if let Some(text) = &payload.description {
        if text.trim().is_empty() {
            None
        } else {
            let content = Value::Array(vec![serde_json::json!({
                "type": "paragraph",
                "children": [{"type": "formatted", "text": text}]
            })]);
            Some(insert_content_record(tx, &content, text.chars().count() as i64)?)
        }
    } else {
        None
    };

    tx.execute(
        "
        INSERT INTO todo_item
        (group_id, parent_id, title, type, description_content_id, is_completed, start_at, due_at, remind_before, completed_at, sort_index, is_archived, create_time, update_time)
        VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8, NULL, ?9, 0, ?10, ?10)
        ",
        params![
            payload.group_id,
            payload.parent_id,
            payload.title,
            item_type,
            description_content_id,
            payload.start_at,
            payload.due_at,
            payload.remind_before,
            sort_index,
            now
        ],
    )
    .map_err(|e| format_db_error("TODO_CREATE_FAILED", "insert todo item", e))?;
    let item_id = tx.last_insert_rowid();
    todo_calendar_sync::sync_single_item(tx, item_id)?;
    get_item_by_id(tx, item_id)?.ok_or_else(|| "TODO_NOT_FOUND: todo item not found".to_string())
}

fn normalize_order_for_siblings(
    tx: &Transaction<'_>,
    group_id: i64,
    parent_id: Option<i64>,
) -> Result<(), String> {
    let mut stmt = if parent_id.is_some() {
        tx.prepare(
            "SELECT id FROM todo_item WHERE group_id = ?1 AND parent_id = ?2 ORDER BY sort_index ASC",
        )
        .map_err(|e| format_db_error("TODO_REORDER_FAILED", "prepare sibling query", e))?
    } else {
        tx.prepare(
            "SELECT id FROM todo_item WHERE group_id = ?1 AND parent_id IS NULL ORDER BY sort_index ASC",
        )
        .map_err(|e| format_db_error("TODO_REORDER_FAILED", "prepare sibling query", e))?
    };

    let mut sibling_ids = Vec::new();
    if let Some(pid) = parent_id {
        let rows = stmt
            .query_map(params![group_id, pid], |row| row.get::<_, i64>(0))
            .map_err(|e| format_db_error("TODO_REORDER_FAILED", "query siblings", e))?;
        for row in rows {
            sibling_ids.push(
                row.map_err(|e| format_db_error("TODO_REORDER_FAILED", "parse sibling row", e))?,
            );
        }
    } else {
        let rows = stmt
            .query_map(params![group_id], |row| row.get::<_, i64>(0))
            .map_err(|e| format_db_error("TODO_REORDER_FAILED", "query siblings", e))?;
        for row in rows {
            sibling_ids.push(
                row.map_err(|e| format_db_error("TODO_REORDER_FAILED", "parse sibling row", e))?,
            );
        }
    }

    let now = now_millis();
    for (index, id) in sibling_ids.into_iter().enumerate() {
        tx.execute(
            "UPDATE todo_item SET sort_index = ?1, update_time = ?2 WHERE id = ?3",
            params![((index as i64) + 1) * 1024, now, id],
        )
        .map_err(|e| format_db_error("TODO_REORDER_FAILED", "normalize sibling order", e))?;
    }
    Ok(())
}

fn move_and_reorder_in_tx(
    tx: &Transaction<'_>,
    payload: &MoveAndReorderPayload,
) -> Result<TodoItem, String> {
    let _cur = get_item_by_id(tx, payload.id)?
        .ok_or_else(|| "TODO_NOT_FOUND: todo item does not exist".to_string())?;
    let now = now_millis();

    let before_sort = payload
        .before_id
        .and_then(|id| {
            tx.query_row(
                "SELECT sort_index FROM todo_item WHERE id = ?1 LIMIT 1",
                params![id],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .ok()
            .flatten()
        });
    let after_sort = payload
        .after_id
        .and_then(|id| {
            tx.query_row(
                "SELECT sort_index FROM todo_item WHERE id = ?1 LIMIT 1",
                params![id],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .ok()
            .flatten()
        });

    let mut new_sort = if let (Some(before), Some(after)) = (before_sort, after_sort) {
        ((before + after) / 2).max(1)
    } else if let Some(before) = before_sort {
        let prev = tx
            .query_row(
                "
                SELECT sort_index FROM todo_item
                WHERE group_id = ?1 AND ((parent_id IS NULL AND ?2 IS NULL) OR parent_id = ?2) AND sort_index < ?3
                ORDER BY sort_index DESC LIMIT 1
                ",
                params![payload.to_group_id, payload.to_parent_id, before],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|e| format_db_error("TODO_REORDER_FAILED", "query previous sibling", e))?;
        ((prev.unwrap_or(0) + before) / 2).max(1)
    } else if let Some(after) = after_sort {
        let next = tx
            .query_row(
                "
                SELECT sort_index FROM todo_item
                WHERE group_id = ?1 AND ((parent_id IS NULL AND ?2 IS NULL) OR parent_id = ?2) AND sort_index > ?3
                ORDER BY sort_index ASC LIMIT 1
                ",
                params![payload.to_group_id, payload.to_parent_id, after],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|e| format_db_error("TODO_REORDER_FAILED", "query next sibling", e))?;
        ((after + next.unwrap_or(after + 1024)) / 2).max(1)
    } else {
        query_max_sort_index(tx, payload.to_group_id, payload.to_parent_id)? + 1024
    };

    if new_sort <= 0 {
        new_sort = 1024;
    }

    tx.execute(
        "
        UPDATE todo_item
        SET group_id = ?1, parent_id = ?2, sort_index = ?3, update_time = ?4
        WHERE id = ?5
        ",
        params![
            payload.to_group_id,
            payload.to_parent_id,
            new_sort,
            now,
            payload.id
        ],
    )
    .map_err(|e| format_db_error("TODO_REORDER_FAILED", "update todo order", e))?;

    normalize_order_for_siblings(tx, payload.to_group_id, payload.to_parent_id)?;
    get_item_by_id(tx, payload.id)?.ok_or_else(|| "TODO_NOT_FOUND: todo item not found".to_string())
}

fn delete_recurrence_by_item_in_tx(tx: &Transaction<'_>, todo_item_id: i64) -> Result<(), String> {
    let recurrence_id = tx
        .query_row(
            "SELECT id FROM todo_recurrence WHERE todo_item_id = ?1 LIMIT 1",
            params![todo_item_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "query recurrence by item", e))?;
    if let Some(rid) = recurrence_id {
        tx.execute(
            "DELETE FROM todo_recurrence_completion WHERE recurrence_id = ?1",
            params![rid],
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "delete recurrence completions", e))?;
        tx.execute("DELETE FROM todo_recurrence WHERE id = ?1", params![rid])
            .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "delete recurrence", e))?;
    }
    Ok(())
}

fn cleanup_todo_dependencies_in_tx(tx: &Transaction<'_>, todo_item_id: i64) -> Result<(), String> {
    delete_recurrence_by_item_in_tx(tx, todo_item_id)?;
    todo_calendar_sync::remove_all_by_todo(tx, todo_item_id)?;
    Ok(())
}

#[tauri::command]
pub fn create_content(app: AppHandle, payload: CreateContentPayload) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("CONTENT_CREATE_FAILED", "begin transaction", e))?;
    let content = if payload.content.is_array() {
        payload.content
    } else {
        Value::Array(vec![])
    };
    let count = payload.count.unwrap_or(0).max(0);
    let content_id = insert_content_record(&tx, &content, count)?;
    tx.commit()
        .map_err(|e| format_db_error("CONTENT_CREATE_FAILED", "commit transaction", e))?;
    Ok(content_id)
}

#[tauri::command]
pub fn todo_list_groups(app: AppHandle) -> Result<Vec<TodoGroup>, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "begin transaction", e))?;
    ensure_system_groups(&tx)?;
    let mut groups = vec![];
    {
        let mut stmt = tx
            .prepare(
                "
                SELECT id, title, color, sort_index, is_archived, is_system, system_type, create_time, update_time
                FROM todo_group
                WHERE is_archived = 0 AND is_system = 0
                ORDER BY sort_index ASC, create_time ASC
                ",
            )
            .map_err(|e| format_db_error("TODO_QUERY_FAILED", "prepare list groups", e))?;
        let rows = stmt
            .query_map([], parse_group_row)
            .map_err(|e| format_db_error("TODO_QUERY_FAILED", "query groups", e))?;
        for row in rows {
            groups.push(row.map_err(|e| format_db_error("TODO_QUERY_FAILED", "parse group row", e))?);
        }
    }
    tx.commit()
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "commit transaction", e))?;
    Ok(groups)
}

#[tauri::command]
pub fn todo_get_system_groups(app: AppHandle) -> Result<Vec<TodoGroup>, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "begin transaction", e))?;
    ensure_system_groups(&tx)?;
    let mut groups = vec![];
    {
        let mut stmt = tx
            .prepare(
                "
                SELECT id, title, color, sort_index, is_archived, is_system, system_type, create_time, update_time
                FROM todo_group
                WHERE is_system = 1
                ORDER BY sort_index ASC, create_time ASC
                ",
            )
            .map_err(|e| format_db_error("TODO_QUERY_FAILED", "prepare system groups", e))?;
        let rows = stmt
            .query_map([], parse_group_row)
            .map_err(|e| format_db_error("TODO_QUERY_FAILED", "query system groups", e))?;
        for row in rows {
            groups.push(row.map_err(|e| format_db_error("TODO_QUERY_FAILED", "parse system group", e))?);
        }
    }
    tx.commit()
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "commit transaction", e))?;
    Ok(groups)
}

#[tauri::command]
pub fn todo_create_group(app: AppHandle, payload: CreateTodoGroupPayload) -> Result<TodoGroup, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_GROUP_CREATE_FAILED", "begin transaction", e))?;
    let now = now_millis();
    let max_sort = tx
        .query_row(
            "SELECT COALESCE(MAX(sort_index), 0) FROM todo_group",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| format_db_error("TODO_GROUP_CREATE_FAILED", "query max sort", e))?;
    tx.execute(
        "
        INSERT INTO todo_group (title, color, sort_index, is_archived, is_system, system_type, create_time, update_time)
        VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6, ?6)
        ",
        params![
            payload.title,
            payload.color,
            max_sort + 1024,
            if payload.is_system.unwrap_or(false) { 1 } else { 0 },
            payload.system_type,
            now
        ],
    )
    .map_err(|e| format_db_error("TODO_GROUP_CREATE_FAILED", "insert group", e))?;
    let id = tx.last_insert_rowid();
    let group = tx
        .query_row(
            "
            SELECT id, title, color, sort_index, is_archived, is_system, system_type, create_time, update_time
            FROM todo_group WHERE id = ?1
            ",
            params![id],
            parse_group_row,
        )
        .map_err(|e| format_db_error("TODO_GROUP_CREATE_FAILED", "query created group", e))?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_GROUP_CREATE_FAILED", "commit transaction", e))?;
    Ok(group)
}

#[tauri::command]
pub fn todo_update_group(app: AppHandle, payload: UpdateTodoGroupPayload) -> Result<TodoGroup, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_GROUP_UPDATE_FAILED", "begin transaction", e))?;
    let current = tx
        .query_row(
            "
            SELECT id, title, color, sort_index, is_archived, is_system, system_type, create_time, update_time
            FROM todo_group WHERE id = ?1
            ",
            params![payload.id],
            parse_group_row,
        )
        .optional()
        .map_err(|e| format_db_error("TODO_GROUP_UPDATE_FAILED", "query current group", e))?
        .ok_or_else(|| "TODO_GROUP_NOT_FOUND: todo group does not exist".to_string())?;

    let now = now_millis();
    if current.is_system {
        tx.execute(
            "UPDATE todo_group SET color = ?1, update_time = ?2 WHERE id = ?3",
            params![payload.color.or(current.color), now, payload.id],
        )
        .map_err(|e| format_db_error("TODO_GROUP_UPDATE_FAILED", "update system group", e))?;
    } else {
        tx.execute(
            "
            UPDATE todo_group
            SET title = ?1, color = ?2, sort_index = ?3, is_archived = ?4, update_time = ?5
            WHERE id = ?6
            ",
            params![
                payload.title.unwrap_or(current.title),
                payload.color.or(current.color),
                payload.sort_index.unwrap_or(current.sort_index),
                if payload.is_archived.unwrap_or(current.is_archived) {
                    1
                } else {
                    0
                },
                now,
                payload.id
            ],
        )
        .map_err(|e| format_db_error("TODO_GROUP_UPDATE_FAILED", "update group", e))?;
    }

    let group = tx
        .query_row(
            "
            SELECT id, title, color, sort_index, is_archived, is_system, system_type, create_time, update_time
            FROM todo_group WHERE id = ?1
            ",
            params![payload.id],
            parse_group_row,
        )
        .map_err(|e| format_db_error("TODO_GROUP_UPDATE_FAILED", "query updated group", e))?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_GROUP_UPDATE_FAILED", "commit transaction", e))?;
    Ok(group)
}

#[tauri::command]
pub fn todo_archive_group(app: AppHandle, payload: ArchiveTodoGroupPayload) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_GROUP_ARCHIVE_FAILED", "begin transaction", e))?;
    let is_system = tx
        .query_row(
            "SELECT is_system FROM todo_group WHERE id = ?1 LIMIT 1",
            params![payload.id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| format_db_error("TODO_GROUP_ARCHIVE_FAILED", "query group", e))?
        .ok_or_else(|| "TODO_GROUP_NOT_FOUND: todo group does not exist".to_string())?;
    if is_system == 1 {
        return Err("TODO_GROUP_INVALID: cannot archive system group".to_string());
    }
    let changed = tx
        .execute(
            "UPDATE todo_group SET is_archived = ?1, update_time = ?2 WHERE id = ?3",
            params![if payload.is_archived { 1 } else { 0 }, now_millis(), payload.id],
        )
        .map_err(|e| format_db_error("TODO_GROUP_ARCHIVE_FAILED", "archive group", e))?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_GROUP_ARCHIVE_FAILED", "commit transaction", e))?;
    Ok(changed as i64)
}

#[tauri::command]
pub fn todo_reorder_groups(app: AppHandle, payload: ReorderGroupsPayload) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_GROUP_REORDER_FAILED", "begin transaction", e))?;
    let now = now_millis();
    for (index, id) in payload.ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE todo_group SET sort_index = ?1, update_time = ?2 WHERE id = ?3 AND is_system = 0",
            params![((index as i64) + 1) * 1024, now, *id],
        )
        .map_err(|e| format_db_error("TODO_GROUP_REORDER_FAILED", "update group order", e))?;
    }
    tx.commit()
        .map_err(|e| format_db_error("TODO_GROUP_REORDER_FAILED", "commit transaction", e))?;
    Ok(payload.ordered_ids.len() as i64)
}

#[tauri::command]
pub fn todo_get_group_stats(app: AppHandle) -> Result<Vec<TodoGroupStats>, String> {
    let conn = schema::open_active_database(&app)?;
    let now = now_millis();
    let mut stmt = conn
        .prepare(
            "
            SELECT
              group_id,
              COUNT(1) AS total,
              SUM(CASE WHEN is_completed = 0 THEN 1 ELSE 0 END) AS uncompleted,
              SUM(CASE WHEN is_completed = 0 AND due_at IS NOT NULL AND due_at < ?1 THEN 1 ELSE 0 END) AS overdue
            FROM todo_item
            WHERE is_archived = 0
            GROUP BY group_id
            ",
        )
        .map_err(|e| format_db_error("TODO_STATS_FAILED", "prepare stats query", e))?;
    let rows = stmt
        .query_map(params![now], |row| {
            Ok(TodoGroupStats {
                group_id: row.get(0)?,
                total: row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                uncompleted: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                overdue: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
            })
        })
        .map_err(|e| format_db_error("TODO_STATS_FAILED", "query stats", e))?;
    let mut stats = vec![];
    for row in rows {
        stats.push(row.map_err(|e| format_db_error("TODO_STATS_FAILED", "parse stats row", e))?);
    }
    Ok(stats)
}

#[tauri::command]
pub fn todo_get_system_group_stats(app: AppHandle) -> Result<Vec<TodoGroupStats>, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_STATS_FAILED", "begin transaction", e))?;
    ensure_system_groups(&tx)?;
    let mut type_to_group = std::collections::HashMap::new();
    {
        let mut group_stmt = tx
            .prepare("SELECT id, system_type FROM todo_group WHERE is_system = 1")
            .map_err(|e| format_db_error("TODO_STATS_FAILED", "prepare system group query", e))?;
        let group_rows = group_stmt
            .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?)))
            .map_err(|e| format_db_error("TODO_STATS_FAILED", "query system groups", e))?;
        for row in group_rows {
            let (id, system_type) =
                row.map_err(|e| format_db_error("TODO_STATS_FAILED", "parse system group row", e))?;
            if let Some(t) = system_type {
                type_to_group.insert(t, id);
            }
        }
    }
    let now = now_millis();
    let all_row = tx
        .query_row(
            "
            SELECT
              COUNT(1) AS total,
              SUM(CASE WHEN is_completed = 0 THEN 1 ELSE 0 END) AS uncompleted,
              SUM(CASE WHEN is_completed = 0 AND due_at IS NOT NULL AND due_at < ?1 THEN 1 ELSE 0 END) AS overdue
            FROM todo_item
            WHERE is_archived = 0
            ",
            params![now],
            |row| {
                Ok((
                    row.get::<_, Option<i64>>(0)?.unwrap_or(0),
                    row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                    row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                ))
            },
        )
        .map_err(|e| format_db_error("TODO_STATS_FAILED", "query all stats", e))?;

    let mut stats = Vec::new();
    if let Some(group_id) = type_to_group.get("all") {
        stats.push(TodoGroupStats {
            group_id: *group_id,
            total: all_row.0,
            uncompleted: all_row.1,
            overdue: all_row.2,
        });
    }

    {
        let mut stmt = tx
            .prepare(
                "
                SELECT
                  type,
                  COUNT(1) AS total,
                  SUM(CASE WHEN is_completed = 0 THEN 1 ELSE 0 END) AS uncompleted,
                  SUM(CASE WHEN is_completed = 0 AND due_at IS NOT NULL AND due_at < ?1 THEN 1 ELSE 0 END) AS overdue
                FROM todo_item
                WHERE is_archived = 0
                GROUP BY type
                ",
            )
            .map_err(|e| format_db_error("TODO_STATS_FAILED", "prepare type stats query", e))?;
        let rows = stmt
            .query_map(params![now], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                    row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                    row.get::<_, Option<i64>>(3)?.unwrap_or(0),
                ))
            })
            .map_err(|e| format_db_error("TODO_STATS_FAILED", "query type stats", e))?;
        for row in rows {
            let (item_type, total, uncompleted, overdue) =
                row.map_err(|e| format_db_error("TODO_STATS_FAILED", "parse type stats row", e))?;
            if let Some(group_id) = type_to_group.get(&item_type) {
                stats.push(TodoGroupStats {
                    group_id: *group_id,
                    total,
                    uncompleted,
                    overdue,
                });
            }
        }
    }
    tx.commit()
        .map_err(|e| format_db_error("TODO_STATS_FAILED", "commit transaction", e))?;
    Ok(stats)
}

#[tauri::command]
pub fn todo_list_items(app: AppHandle, payload: ListItemsPayload) -> Result<Vec<TodoItem>, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "begin transaction", e))?;
    let items = query_items_with_sql(
        &tx,
        "
        SELECT
          ti.id, ti.group_id, ti.parent_id, ti.title, ti.type, ti.description_content_id,
          c.content AS description_content,
          ti.is_completed, ti.start_at, ti.due_at, ti.remind_before, ti.completed_at,
          ti.sort_index, ti.is_archived, ti.create_time, ti.update_time,
          tr.id, tr.todo_item_id, tr.type, tr.interval, tr.weekdays, tr.month_day, tr.year_month, tr.year_day,
          tr.exclude_holidays, tr.start_date, tr.end_date, tr.max_occurrences, tr.create_time, tr.update_time
        FROM todo_item ti
        LEFT JOIN contents c ON c.id = ti.description_content_id
        LEFT JOIN todo_recurrence tr ON tr.todo_item_id = ti.id
        WHERE ti.group_id = ?1 AND ti.is_archived = 0
        ORDER BY ti.parent_id IS NOT NULL, ti.parent_id, ti.sort_index ASC
        ",
        &[&payload.group_id],
    )?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "commit transaction", e))?;
    Ok(items)
}

#[tauri::command]
pub fn todo_list_items_by_type(
    app: AppHandle,
    payload: ListItemsByTypePayload,
) -> Result<Vec<TodoItem>, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "begin transaction", e))?;
    let items = if payload.item_type.trim().eq_ignore_ascii_case("all") {
        query_items_with_sql(
            &tx,
            "
            SELECT
              ti.id, ti.group_id, ti.parent_id, ti.title, ti.type, ti.description_content_id,
              c.content AS description_content,
              ti.is_completed, ti.start_at, ti.due_at, ti.remind_before, ti.completed_at,
              ti.sort_index, ti.is_archived, ti.create_time, ti.update_time,
              tr.id, tr.todo_item_id, tr.type, tr.interval, tr.weekdays, tr.month_day, tr.year_month, tr.year_day,
              tr.exclude_holidays, tr.start_date, tr.end_date, tr.max_occurrences, tr.create_time, tr.update_time
            FROM todo_item ti
            LEFT JOIN contents c ON c.id = ti.description_content_id
            LEFT JOIN todo_recurrence tr ON tr.todo_item_id = ti.id
            WHERE ti.is_archived = 0
            ORDER BY ti.group_id, ti.parent_id IS NOT NULL, ti.parent_id, ti.sort_index ASC
            ",
            &[],
        )?
    } else {
        query_items_with_sql(
            &tx,
            "
            SELECT
              ti.id, ti.group_id, ti.parent_id, ti.title, ti.type, ti.description_content_id,
              c.content AS description_content,
              ti.is_completed, ti.start_at, ti.due_at, ti.remind_before, ti.completed_at,
              ti.sort_index, ti.is_archived, ti.create_time, ti.update_time,
              tr.id, tr.todo_item_id, tr.type, tr.interval, tr.weekdays, tr.month_day, tr.year_month, tr.year_day,
              tr.exclude_holidays, tr.start_date, tr.end_date, tr.max_occurrences, tr.create_time, tr.update_time
            FROM todo_item ti
            LEFT JOIN contents c ON c.id = ti.description_content_id
            LEFT JOIN todo_recurrence tr ON tr.todo_item_id = ti.id
            WHERE ti.is_archived = 0 AND ti.type = ?1
            ORDER BY ti.group_id, ti.parent_id IS NOT NULL, ti.parent_id, ti.sort_index ASC
            ",
            &[&payload.item_type],
        )?
    };
    tx.commit()
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "commit transaction", e))?;
    Ok(items)
}

#[tauri::command]
pub fn todo_create_item(app: AppHandle, payload: CreateTodoItemPayload) -> Result<TodoItem, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_CREATE_FAILED", "begin transaction", e))?;
    let item = create_item_with_payload(&tx, &payload)?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_CREATE_FAILED", "commit transaction", e))?;
    Ok(item)
}

#[tauri::command]
pub fn todo_create_item_relative(
    app: AppHandle,
    payload: CreateTodoItemRelativePayload,
) -> Result<TodoItem, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_CREATE_FAILED", "begin transaction", e))?;
    let ref_item = get_item_by_id(&tx, payload.ref_id)?
        .ok_or_else(|| "TODO_NOT_FOUND: ref todo item does not exist".to_string())?;

    let create_payload = CreateTodoItemPayload {
        group_id: ref_item.group_id,
        parent_id: if payload.position == "child" {
            Some(ref_item.id)
        } else {
            ref_item.parent_id
        },
        title: payload.title,
        item_type: payload.item_type,
        description: payload.description,
        start_at: payload.start_at,
        due_at: payload.due_at,
        remind_before: payload.remind_before,
    };
    let created = create_item_with_payload(&tx, &create_payload)?;

    if payload.position == "above" || payload.position == "below" {
        let siblings = query_items_with_sql(
            &tx,
            "
            SELECT
              ti.id, ti.group_id, ti.parent_id, ti.title, ti.type, ti.description_content_id,
              c.content AS description_content,
              ti.is_completed, ti.start_at, ti.due_at, ti.remind_before, ti.completed_at,
              ti.sort_index, ti.is_archived, ti.create_time, ti.update_time,
              tr.id, tr.todo_item_id, tr.type, tr.interval, tr.weekdays, tr.month_day, tr.year_month, tr.year_day,
              tr.exclude_holidays, tr.start_date, tr.end_date, tr.max_occurrences, tr.create_time, tr.update_time
            FROM todo_item ti
            LEFT JOIN contents c ON c.id = ti.description_content_id
            LEFT JOIN todo_recurrence tr ON tr.todo_item_id = ti.id
            WHERE ti.group_id = ?1
              AND ((ti.parent_id IS NULL AND ?2 IS NULL) OR ti.parent_id = ?2)
            ORDER BY ti.sort_index ASC
            ",
            &[&ref_item.group_id, &ref_item.parent_id],
        )?;
        let index = siblings.iter().position(|item| item.id == ref_item.id).unwrap_or(0);
        let before_id = if payload.position == "above" {
            siblings.get(index.saturating_sub(1)).map(|item| item.id)
        } else {
            Some(ref_item.id)
        };
        let after_id = if payload.position == "above" {
            Some(ref_item.id)
        } else {
            siblings.get(index + 1).map(|item| item.id)
        };
        let moved = move_and_reorder_in_tx(
            &tx,
            &MoveAndReorderPayload {
                id: created.id,
                to_group_id: ref_item.group_id,
                to_parent_id: ref_item.parent_id,
                before_id,
                after_id,
            },
        )?;
        tx.commit()
            .map_err(|e| format_db_error("TODO_CREATE_FAILED", "commit transaction", e))?;
        return Ok(moved);
    }

    tx.commit()
        .map_err(|e| format_db_error("TODO_CREATE_FAILED", "commit transaction", e))?;
    Ok(created)
}

#[tauri::command]
pub fn todo_update_item(app: AppHandle, payload: UpdateTodoItemPayload) -> Result<TodoItem, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_UPDATE_FAILED", "begin transaction", e))?;
    let current = get_item_by_id(&tx, payload.id)?
        .ok_or_else(|| "TODO_NOT_FOUND: todo item does not exist".to_string())?;
    let now = now_millis();
    let next_type = normalize_item_type(payload.item_type.clone().or_else(|| Some(current.r#type.clone())));
    tx.execute(
        "
        UPDATE todo_item
        SET title = ?1, type = ?2, description_content_id = ?3, start_at = ?4, due_at = ?5, remind_before = ?6, update_time = ?7
        WHERE id = ?8
        ",
        params![
            payload.title.unwrap_or(current.title),
            next_type,
            payload.description_content_id.or(current.description_content_id),
            payload.start_at.or(current.start_at),
            payload.due_at.or(current.due_at),
            payload.remind_before.or(current.remind_before),
            now,
            payload.id
        ],
    )
    .map_err(|e| format_db_error("TODO_UPDATE_FAILED", "update todo item", e))?;

    todo_calendar_sync::sync_single_item(&tx, payload.id)?;
    let item = get_item_by_id(&tx, payload.id)?
        .ok_or_else(|| "TODO_NOT_FOUND: todo item does not exist".to_string())?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_UPDATE_FAILED", "commit transaction", e))?;
    Ok(item)
}

#[tauri::command]
pub fn todo_toggle_complete_cascade(
    app: AppHandle,
    payload: ToggleCompleteCascadePayload,
) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_COMPLETE_FAILED", "begin transaction", e))?;
    let now = now_millis();
    let completed = if payload.is_completed { 1 } else { 0 };
    tx.execute(
        &format!(
            "
            WITH RECURSIVE descendants(id) AS (
              SELECT id FROM todo_item WHERE id = {id}
              UNION ALL
              SELECT ti.id FROM todo_item ti JOIN descendants d ON ti.parent_id = d.id
            )
            UPDATE todo_item
            SET is_completed = {completed},
                completed_at = CASE WHEN {completed} = 1 THEN {now} ELSE NULL END,
                update_time = {now}
            WHERE id IN (SELECT id FROM descendants)
            ",
            id = payload.id,
            completed = completed,
            now = now
        ),
        [],
    )
    .map_err(|e| format_db_error("TODO_COMPLETE_FAILED", "toggle complete cascade", e))?;
    let changed = tx
        .query_row("SELECT changes()", [], |row| row.get::<_, i64>(0))
        .map_err(|e| format_db_error("TODO_COMPLETE_FAILED", "query changed rows", e))?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_COMPLETE_FAILED", "commit transaction", e))?;
    Ok(changed)
}

#[tauri::command]
pub fn todo_move_and_reorder(app: AppHandle, payload: MoveAndReorderPayload) -> Result<TodoItem, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_REORDER_FAILED", "begin transaction", e))?;
    let item = move_and_reorder_in_tx(&tx, &payload)?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_REORDER_FAILED", "commit transaction", e))?;
    Ok(item)
}

#[tauri::command]
pub fn todo_archive_item(app: AppHandle, payload: ArchiveTodoItemPayload) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_ARCHIVE_FAILED", "begin transaction", e))?;
    let changed = tx
        .execute(
            "UPDATE todo_item SET is_archived = ?1, update_time = ?2 WHERE id = ?3",
            params![
                if payload.is_archived { 1 } else { 0 },
                now_millis(),
                payload.id
            ],
        )
        .map_err(|e| format_db_error("TODO_ARCHIVE_FAILED", "archive todo item", e))?;
    if payload.is_archived {
        todo_calendar_sync::remove_all_by_todo(&tx, payload.id)?;
    } else {
        todo_calendar_sync::sync_single_item(&tx, payload.id)?;
    }
    tx.commit()
        .map_err(|e| format_db_error("TODO_ARCHIVE_FAILED", "commit transaction", e))?;
    Ok(changed as i64)
}

#[tauri::command]
pub fn todo_delete_item(app: AppHandle, payload: IdPayload) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_DELETE_FAILED", "begin transaction", e))?;
    let description_content_id = tx
        .query_row(
            "SELECT description_content_id FROM todo_item WHERE id = ?1 LIMIT 1",
            params![payload.id],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map_err(|e| format_db_error("TODO_DELETE_FAILED", "query todo item", e))?
        .ok_or_else(|| "TODO_NOT_FOUND: todo item does not exist".to_string())?;
    cleanup_todo_dependencies_in_tx(&tx, payload.id)?;
    let changed = tx
        .execute("DELETE FROM todo_item WHERE id = ?1", params![payload.id])
        .map_err(|e| format_db_error("TODO_DELETE_FAILED", "delete todo item", e))?;
    if let Some(content_id) = description_content_id {
        decrement_or_delete_content(&tx, content_id)?;
    }
    tx.commit()
        .map_err(|e| format_db_error("TODO_DELETE_FAILED", "commit transaction", e))?;
    Ok(changed as i64)
}

#[tauri::command]
pub fn todo_delete_item_cascade(app: AppHandle, payload: IdPayload) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_DELETE_FAILED", "begin transaction", e))?;
    let mut todo_ids = Vec::new();
    let mut content_ids = std::collections::HashSet::new();
    {
        let mut stmt = tx
            .prepare(
                "
                WITH RECURSIVE descendants(id) AS (
                  SELECT id FROM todo_item WHERE id = ?1
                  UNION ALL
                  SELECT ti.id FROM todo_item ti JOIN descendants d ON ti.parent_id = d.id
                )
                SELECT id, description_content_id FROM todo_item WHERE id IN (SELECT id FROM descendants)
                ",
            )
            .map_err(|e| format_db_error("TODO_DELETE_FAILED", "prepare descendant query", e))?;
        let rows = stmt
            .query_map(params![payload.id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, Option<i64>>(1)?))
            })
            .map_err(|e| format_db_error("TODO_DELETE_FAILED", "query descendants", e))?;

        for row in rows {
            let (todo_id, content_id) =
                row.map_err(|e| format_db_error("TODO_DELETE_FAILED", "parse descendant row", e))?;
            todo_ids.push(todo_id);
            if let Some(cid) = content_id {
                content_ids.insert(cid);
            }
        }
    }
    if todo_ids.is_empty() {
        return Err("TODO_NOT_FOUND: todo item does not exist".to_string());
    }

    for todo_id in todo_ids.iter().copied() {
        cleanup_todo_dependencies_in_tx(&tx, todo_id)?;
    }

    tx.execute(
        "
        WITH RECURSIVE descendants(id) AS (
          SELECT id FROM todo_item WHERE id = ?1
          UNION ALL
          SELECT ti.id FROM todo_item ti JOIN descendants d ON ti.parent_id = d.id
        )
        DELETE FROM todo_item WHERE id IN (SELECT id FROM descendants)
        ",
        params![payload.id],
    )
    .map_err(|e| format_db_error("TODO_DELETE_FAILED", "delete descendants", e))?;
    let changed = tx
        .query_row("SELECT changes()", [], |row| row.get::<_, i64>(0))
        .map_err(|e| format_db_error("TODO_DELETE_FAILED", "query changed rows", e))?;

    for content_id in content_ids {
        decrement_or_delete_content(&tx, content_id)?;
    }

    tx.commit()
        .map_err(|e| format_db_error("TODO_DELETE_FAILED", "commit transaction", e))?;
    Ok(changed)
}

#[tauri::command]
pub fn todo_get_recurrence(app: AppHandle, payload: IdPayload) -> Result<Option<TodoRecurrence>, String> {
    let conn = schema::open_active_database(&app)?;
    conn.query_row(
        "
        SELECT id, todo_item_id, type, interval, weekdays, month_day, year_month, year_day, exclude_holidays, start_date, end_date, max_occurrences, create_time, update_time
        FROM todo_recurrence WHERE id = ?1 LIMIT 1
        ",
        params![payload.id],
        |row| {
            Ok(TodoRecurrence {
                id: row.get(0)?,
                todo_item_id: row.get(1)?,
                r#type: row.get(2)?,
                interval: row.get(3)?,
                weekdays: parse_weekdays(row.get::<_, Option<String>>(4)?),
                month_day: row.get(5)?,
                year_month: row.get(6)?,
                year_day: row.get(7)?,
                exclude_holidays: parse_bool(row.get::<_, i64>(8)?),
                start_date: row.get(9)?,
                end_date: row.get(10)?,
                max_occurrences: row.get(11)?,
                create_time: row.get(12)?,
                update_time: row.get(13)?,
            })
        },
    )
    .optional()
    .map_err(|e| format_db_error("TODO_RECURRENCE_QUERY_FAILED", "query recurrence", e))
}

#[tauri::command]
pub fn todo_get_recurrence_by_item(
    app: AppHandle,
    payload: TodoItemIdPayload,
) -> Result<Option<TodoRecurrence>, String> {
    let conn = schema::open_active_database(&app)?;
    conn.query_row(
        "
        SELECT id, todo_item_id, type, interval, weekdays, month_day, year_month, year_day, exclude_holidays, start_date, end_date, max_occurrences, create_time, update_time
        FROM todo_recurrence WHERE todo_item_id = ?1 LIMIT 1
        ",
        params![payload.todo_item_id],
        |row| {
            Ok(TodoRecurrence {
                id: row.get(0)?,
                todo_item_id: row.get(1)?,
                r#type: row.get(2)?,
                interval: row.get(3)?,
                weekdays: parse_weekdays(row.get::<_, Option<String>>(4)?),
                month_day: row.get(5)?,
                year_month: row.get(6)?,
                year_day: row.get(7)?,
                exclude_holidays: parse_bool(row.get::<_, i64>(8)?),
                start_date: row.get(9)?,
                end_date: row.get(10)?,
                max_occurrences: row.get(11)?,
                create_time: row.get(12)?,
                update_time: row.get(13)?,
            })
        },
    )
    .optional()
    .map_err(|e| format_db_error("TODO_RECURRENCE_QUERY_FAILED", "query recurrence by item", e))
}

#[tauri::command]
pub fn todo_create_recurrence(
    app: AppHandle,
    payload: CreateTodoRecurrencePayload,
) -> Result<TodoRecurrence, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_RECURRENCE_CREATE_FAILED", "begin transaction", e))?;
    let exists = tx
        .query_row(
            "SELECT id FROM todo_recurrence WHERE todo_item_id = ?1 LIMIT 1",
            params![payload.todo_item_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| format_db_error("TODO_RECURRENCE_CREATE_FAILED", "query existing recurrence", e))?;
    if exists.is_some() {
        return Err("TODO_RECURRENCE_INVALID: recurrence already exists for todo item".to_string());
    }
    let now = now_millis();
    let weekdays = payload
        .weekdays
        .as_ref()
        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()));
    tx.execute(
        "
        INSERT INTO todo_recurrence
        (todo_item_id, type, interval, weekdays, month_day, year_month, year_day, exclude_holidays, start_date, end_date, max_occurrences, create_time, update_time)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)
        ",
        params![
            payload.todo_item_id,
            payload.recurrence_type,
            payload.interval.unwrap_or(1).max(1),
            weekdays,
            payload.month_day,
            payload.year_month,
            payload.year_day,
            if payload.exclude_holidays.unwrap_or(false) {
                1
            } else {
                0
            },
            payload.start_date,
            payload.end_date,
            payload.max_occurrences,
            now
        ],
    )
    .map_err(|e| format_db_error("TODO_RECURRENCE_CREATE_FAILED", "insert recurrence", e))?;
    let id = tx.last_insert_rowid();
    todo_calendar_sync::rematerialize_recurring_item(&tx, payload.todo_item_id)?;
    let recurrence = tx
        .query_row(
            "
            SELECT id, todo_item_id, type, interval, weekdays, month_day, year_month, year_day, exclude_holidays, start_date, end_date, max_occurrences, create_time, update_time
            FROM todo_recurrence WHERE id = ?1
            ",
            params![id],
            |row| {
                Ok(TodoRecurrence {
                    id: row.get(0)?,
                    todo_item_id: row.get(1)?,
                    r#type: row.get(2)?,
                    interval: row.get(3)?,
                    weekdays: parse_weekdays(row.get::<_, Option<String>>(4)?),
                    month_day: row.get(5)?,
                    year_month: row.get(6)?,
                    year_day: row.get(7)?,
                    exclude_holidays: parse_bool(row.get::<_, i64>(8)?),
                    start_date: row.get(9)?,
                    end_date: row.get(10)?,
                    max_occurrences: row.get(11)?,
                    create_time: row.get(12)?,
                    update_time: row.get(13)?,
                })
            },
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_CREATE_FAILED", "query created recurrence", e))?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_RECURRENCE_CREATE_FAILED", "commit transaction", e))?;
    Ok(recurrence)
}

#[tauri::command]
pub fn todo_update_recurrence(
    app: AppHandle,
    payload: UpdateTodoRecurrencePayload,
) -> Result<TodoRecurrence, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_RECURRENCE_UPDATE_FAILED", "begin transaction", e))?;
    let current = tx
        .query_row(
            "
            SELECT id, todo_item_id, type, interval, weekdays, month_day, year_month, year_day, exclude_holidays, start_date, end_date, max_occurrences, create_time, update_time
            FROM todo_recurrence WHERE id = ?1
            ",
            params![payload.id],
            |row| {
                Ok(TodoRecurrence {
                    id: row.get(0)?,
                    todo_item_id: row.get(1)?,
                    r#type: row.get(2)?,
                    interval: row.get(3)?,
                    weekdays: parse_weekdays(row.get::<_, Option<String>>(4)?),
                    month_day: row.get(5)?,
                    year_month: row.get(6)?,
                    year_day: row.get(7)?,
                    exclude_holidays: parse_bool(row.get::<_, i64>(8)?),
                    start_date: row.get(9)?,
                    end_date: row.get(10)?,
                    max_occurrences: row.get(11)?,
                    create_time: row.get(12)?,
                    update_time: row.get(13)?,
                })
            },
        )
        .optional()
        .map_err(|e| format_db_error("TODO_RECURRENCE_UPDATE_FAILED", "query recurrence", e))?
        .ok_or_else(|| "TODO_RECURRENCE_NOT_FOUND: recurrence does not exist".to_string())?;
    let now = now_millis();
    let weekdays = payload
        .weekdays
        .as_ref()
        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()))
        .or_else(|| current.weekdays.as_ref().map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string())));
    tx.execute(
        "
        UPDATE todo_recurrence
        SET type = ?1, interval = ?2, weekdays = ?3, month_day = ?4, year_month = ?5, year_day = ?6,
            exclude_holidays = ?7, start_date = ?8, end_date = ?9, max_occurrences = ?10, update_time = ?11
        WHERE id = ?12
        ",
        params![
            payload.recurrence_type.unwrap_or(current.r#type),
            payload.interval.unwrap_or(current.interval).max(1),
            weekdays,
            payload.month_day.or(current.month_day),
            payload.year_month.or(current.year_month),
            payload.year_day.or(current.year_day),
            if payload.exclude_holidays.unwrap_or(current.exclude_holidays) {
                1
            } else {
                0
            },
            payload.start_date.unwrap_or(current.start_date),
            payload.end_date.or(current.end_date),
            payload.max_occurrences.or(current.max_occurrences),
            now,
            payload.id
        ],
    )
    .map_err(|e| format_db_error("TODO_RECURRENCE_UPDATE_FAILED", "update recurrence", e))?;
    todo_calendar_sync::rematerialize_recurring_item(&tx, current.todo_item_id)?;
    let recurrence = tx
        .query_row(
            "
            SELECT id, todo_item_id, type, interval, weekdays, month_day, year_month, year_day, exclude_holidays, start_date, end_date, max_occurrences, create_time, update_time
            FROM todo_recurrence WHERE id = ?1
            ",
            params![payload.id],
            |row| {
                Ok(TodoRecurrence {
                    id: row.get(0)?,
                    todo_item_id: row.get(1)?,
                    r#type: row.get(2)?,
                    interval: row.get(3)?,
                    weekdays: parse_weekdays(row.get::<_, Option<String>>(4)?),
                    month_day: row.get(5)?,
                    year_month: row.get(6)?,
                    year_day: row.get(7)?,
                    exclude_holidays: parse_bool(row.get::<_, i64>(8)?),
                    start_date: row.get(9)?,
                    end_date: row.get(10)?,
                    max_occurrences: row.get(11)?,
                    create_time: row.get(12)?,
                    update_time: row.get(13)?,
                })
            },
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_UPDATE_FAILED", "query updated recurrence", e))?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_RECURRENCE_UPDATE_FAILED", "commit transaction", e))?;
    Ok(recurrence)
}

#[tauri::command]
pub fn todo_delete_recurrence(app: AppHandle, payload: IdPayload) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "begin transaction", e))?;
    let todo_item_id = tx
        .query_row(
            "SELECT todo_item_id FROM todo_recurrence WHERE id = ?1 LIMIT 1",
            params![payload.id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "query recurrence", e))?
        .ok_or_else(|| "TODO_RECURRENCE_NOT_FOUND: recurrence does not exist".to_string())?;
    tx.execute(
        "DELETE FROM todo_recurrence_completion WHERE recurrence_id = ?1",
        params![payload.id],
    )
    .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "delete recurrence completions", e))?;
    let changed = tx
        .execute("DELETE FROM todo_recurrence WHERE id = ?1", params![payload.id])
        .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "delete recurrence", e))?;
    todo_calendar_sync::remove_all_by_todo(&tx, todo_item_id)?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "commit transaction", e))?;
    Ok(changed as i64)
}

#[tauri::command]
pub fn todo_delete_recurrence_by_item(
    app: AppHandle,
    payload: TodoItemIdPayload,
) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "begin transaction", e))?;
    let recurrence_id = tx
        .query_row(
            "SELECT id FROM todo_recurrence WHERE todo_item_id = ?1 LIMIT 1",
            params![payload.todo_item_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "query recurrence by item", e))?;
    let Some(id) = recurrence_id else {
        return Ok(0);
    };
    tx.execute(
        "DELETE FROM todo_recurrence_completion WHERE recurrence_id = ?1",
        params![id],
    )
    .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "delete recurrence completions", e))?;
    let changed = tx
        .execute("DELETE FROM todo_recurrence WHERE id = ?1", params![id])
        .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "delete recurrence", e))?;
    todo_calendar_sync::remove_all_by_todo(&tx, payload.todo_item_id)?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "commit transaction", e))?;
    Ok(changed as i64)
}

#[tauri::command]
pub fn todo_get_recurrence_completions(
    app: AppHandle,
    payload: RecurrenceCompletionsPayload,
) -> Result<Vec<TodoRecurrenceCompletion>, String> {
    let conn = schema::open_active_database(&app)?;
    let mut sql = String::from(
        "
        SELECT id, recurrence_id, scheduled_date, completed_at, skipped, create_time
        FROM todo_recurrence_completion
        WHERE recurrence_id = ?1
        ",
    );
    let mut params_vec: Vec<i64> = vec![payload.recurrence_id];
    if let Some(start) = payload.start_date {
        sql.push_str(" AND scheduled_date >= ?2 ");
        params_vec.push(start);
    }
    if let Some(end) = payload.end_date {
        let marker = if payload.start_date.is_some() { 3 } else { 2 };
        sql.push_str(&format!(" AND scheduled_date <= ?{marker} "));
        params_vec.push(end);
    }
    sql.push_str(" ORDER BY scheduled_date ASC ");
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format_db_error("TODO_RECURRENCE_QUERY_FAILED", "prepare recurrence completions", e))?;
    let mut rows = stmt
        .query(rusqlite::params_from_iter(params_vec.iter()))
        .map_err(|e| format_db_error("TODO_RECURRENCE_QUERY_FAILED", "query recurrence completions", e))?;
    let mut results = vec![];
    while let Some(row) = rows
        .next()
        .map_err(|e| format_db_error("TODO_RECURRENCE_QUERY_FAILED", "read recurrence completion row", e))?
    {
        results.push(TodoRecurrenceCompletion {
            id: row.get(0).map_err(|e| format_db_error("TODO_RECURRENCE_QUERY_FAILED", "parse completion id", e))?,
            recurrence_id: row
                .get(1)
                .map_err(|e| format_db_error("TODO_RECURRENCE_QUERY_FAILED", "parse recurrence_id", e))?,
            scheduled_date: row
                .get(2)
                .map_err(|e| format_db_error("TODO_RECURRENCE_QUERY_FAILED", "parse scheduled_date", e))?,
            completed_at: row
                .get(3)
                .map_err(|e| format_db_error("TODO_RECURRENCE_QUERY_FAILED", "parse completed_at", e))?,
            skipped: parse_bool(
                row.get::<_, i64>(4)
                    .map_err(|e| format_db_error("TODO_RECURRENCE_QUERY_FAILED", "parse skipped", e))?,
            ),
            create_time: row
                .get(5)
                .map_err(|e| format_db_error("TODO_RECURRENCE_QUERY_FAILED", "parse create_time", e))?,
        });
    }
    Ok(results)
}

#[tauri::command]
pub fn todo_get_recurrence_completion(
    app: AppHandle,
    payload: RecurrenceCompletionPayload,
) -> Result<Option<TodoRecurrenceCompletion>, String> {
    let conn = schema::open_active_database(&app)?;
    conn.query_row(
        "
        SELECT id, recurrence_id, scheduled_date, completed_at, skipped, create_time
        FROM todo_recurrence_completion
        WHERE recurrence_id = ?1 AND scheduled_date = ?2
        LIMIT 1
        ",
        params![payload.recurrence_id, payload.scheduled_date],
        |row| {
            Ok(TodoRecurrenceCompletion {
                id: row.get(0)?,
                recurrence_id: row.get(1)?,
                scheduled_date: row.get(2)?,
                completed_at: row.get(3)?,
                skipped: parse_bool(row.get::<_, i64>(4)?),
                create_time: row.get(5)?,
            })
        },
    )
    .optional()
    .map_err(|e| format_db_error("TODO_RECURRENCE_QUERY_FAILED", "query recurrence completion", e))
}

#[tauri::command]
pub fn todo_complete_recurrence(
    app: AppHandle,
    payload: RecurrenceCompletionPayload,
) -> Result<TodoRecurrenceCompletion, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "begin transaction", e))?;
    let now = now_millis();
    let existing_id = tx
        .query_row(
            "
            SELECT id FROM todo_recurrence_completion
            WHERE recurrence_id = ?1 AND scheduled_date = ?2
            LIMIT 1
            ",
            params![payload.recurrence_id, payload.scheduled_date],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "query existing completion", e))?;
    if let Some(id) = existing_id {
        tx.execute(
            "UPDATE todo_recurrence_completion SET completed_at = ?1, skipped = 0 WHERE id = ?2",
            params![now, id],
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "update completion", e))?;
    } else {
        tx.execute(
            "
            INSERT INTO todo_recurrence_completion (recurrence_id, scheduled_date, completed_at, skipped, create_time)
            VALUES (?1, ?2, ?3, 0, ?4)
            ",
            params![payload.recurrence_id, payload.scheduled_date, now, now],
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "insert completion", e))?;
    }
    let completion = tx
        .query_row(
            "
            SELECT id, recurrence_id, scheduled_date, completed_at, skipped, create_time
            FROM todo_recurrence_completion
            WHERE recurrence_id = ?1 AND scheduled_date = ?2
            LIMIT 1
            ",
            params![payload.recurrence_id, payload.scheduled_date],
            |row| {
                Ok(TodoRecurrenceCompletion {
                    id: row.get(0)?,
                    recurrence_id: row.get(1)?,
                    scheduled_date: row.get(2)?,
                    completed_at: row.get(3)?,
                    skipped: parse_bool(row.get::<_, i64>(4)?),
                    create_time: row.get(5)?,
                })
            },
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "query completion", e))?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "commit transaction", e))?;
    Ok(completion)
}

#[tauri::command]
pub fn todo_uncomplete_recurrence(
    app: AppHandle,
    payload: RecurrenceCompletionPayload,
) -> Result<i64, String> {
    let conn = schema::open_active_database(&app)?;
    let changed = conn
        .execute(
            "DELETE FROM todo_recurrence_completion WHERE recurrence_id = ?1 AND scheduled_date = ?2",
            params![payload.recurrence_id, payload.scheduled_date],
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "delete completion", e))?;
    Ok(changed as i64)
}

#[tauri::command]
pub fn todo_skip_recurrence(
    app: AppHandle,
    payload: RecurrenceCompletionPayload,
) -> Result<TodoRecurrenceCompletion, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "begin transaction", e))?;
    let existing_id = tx
        .query_row(
            "
            SELECT id FROM todo_recurrence_completion
            WHERE recurrence_id = ?1 AND scheduled_date = ?2
            LIMIT 1
            ",
            params![payload.recurrence_id, payload.scheduled_date],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "query existing completion", e))?;
    if let Some(id) = existing_id {
        tx.execute(
            "UPDATE todo_recurrence_completion SET completed_at = NULL, skipped = 1 WHERE id = ?1",
            params![id],
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "update skipped completion", e))?;
    } else {
        let now = now_millis();
        tx.execute(
            "
            INSERT INTO todo_recurrence_completion (recurrence_id, scheduled_date, completed_at, skipped, create_time)
            VALUES (?1, ?2, NULL, 1, ?3)
            ",
            params![payload.recurrence_id, payload.scheduled_date, now],
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "insert skipped completion", e))?;
    }
    let completion = tx
        .query_row(
            "
            SELECT id, recurrence_id, scheduled_date, completed_at, skipped, create_time
            FROM todo_recurrence_completion
            WHERE recurrence_id = ?1 AND scheduled_date = ?2
            LIMIT 1
            ",
            params![payload.recurrence_id, payload.scheduled_date],
            |row| {
                Ok(TodoRecurrenceCompletion {
                    id: row.get(0)?,
                    recurrence_id: row.get(1)?,
                    scheduled_date: row.get(2)?,
                    completed_at: row.get(3)?,
                    skipped: parse_bool(row.get::<_, i64>(4)?),
                    create_time: row.get(5)?,
                })
            },
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "query skipped completion", e))?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "commit transaction", e))?;
    Ok(completion)
}
