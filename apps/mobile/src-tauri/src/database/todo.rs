use rusqlite::{params, OptionalExtension, Row, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use super::common::insert_content_record;
use super::schema;
use super::todo_calendar_sync;

const SYSTEM_GROUPS: [(&str, &str); 4] = [
    ("all", "全部任务"),
    ("normal", "普通任务"),
    ("deadline", "截止任务"),
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
    pub contracts: Option<Value>,
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
    pub description_content: Option<Value>,
    pub contracts: Option<Value>,
    pub description_count: i64,
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
    pub description_content: Option<Value>,
    pub contracts: Option<Value>,
    pub description_count: i64,
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
pub struct TodoIdPayload {
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

/// 「计划任务」已退役：拒绝显式写入 planned（已有的 planned 行照常读取、编辑时保留，等桌面转换）
fn reject_retired_type(value: &Option<String>) -> Result<(), String> {
    match value.as_deref().map(|v| v.trim().to_ascii_lowercase()) {
        Some(t) if t == "planned" => {
            Err("TODO_TYPE_RETIRED: 计划任务已退役，请在日程里安排时间".to_string())
        }
        _ => Ok(()),
    }
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

fn cleanup_todo_dependencies_in_tx(tx: &Transaction<'_>, todo_item_id: i64) -> Result<(), String> {
    super::assistant_tasks::release_todo_schedules(tx, todo_item_id)?;
    todo_items::delete_recurrence_by_item_in_tx(tx, todo_item_id)?;
    todo_calendar_sync::remove_all_by_todo(tx, todo_item_id)?;
    delete_note_links_by_todo_in_tx(tx, todo_item_id)?;
    tx.execute(
        "DELETE FROM todo_recurrence_history WHERE todo_item_id=?1",
        [todo_item_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM todo_occurrence_override WHERE todo_item_id=?1",
        [todo_item_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 关联笔记链接（桌面端建立，与桌面 detach 同口径：删链接 + 笔记内容减引用）
fn delete_note_links_by_todo_in_tx(tx: &Transaction<'_>, todo_item_id: i64) -> Result<(), String> {
    let content_ids = {
        let mut stmt = tx
            .prepare("SELECT content_id FROM todo_note_link WHERE todo_id = ?1")
            .map_err(|e| format_db_error("TODO_DELETE_FAILED", "prepare note link query", e))?;
        let rows = stmt
            .query_map(params![todo_item_id], |row| row.get::<_, i64>(0))
            .map_err(|e| format_db_error("TODO_DELETE_FAILED", "query note links", e))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format_db_error("TODO_DELETE_FAILED", "parse note link row", e))?
    };
    tx.execute(
        "DELETE FROM todo_note_link WHERE todo_id = ?1",
        params![todo_item_id],
    )
    .map_err(|e| format_db_error("TODO_DELETE_FAILED", "delete note links", e))?;
    for content_id in content_ids {
        super::common::release_content_reference(tx, content_id)?;
    }
    Ok(())
}

#[path = "todo_groups.rs"]
mod todo_groups;
#[path = "todo_items.rs"]
mod todo_items;
#[path = "todo_recurrence.rs"]
mod todo_recurrence;

pub use todo_groups::*;
pub use todo_items::*;
pub use todo_recurrence::*;

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
    let content_id = insert_content_record(
        &tx,
        &content,
        payload.contracts.as_ref(),
        count,
        now_millis(),
    )?;
    tx.commit()
        .map_err(|e| format_db_error("CONTENT_CREATE_FAILED", "commit transaction", e))?;
    Ok(content_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn delete_note_links_releases_links_and_queues_unreferenced_content() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!(
            "../../../../../packages/db-schema/schema/main.sql"
        ))
        .unwrap();
        conn.execute_batch(
            "
            INSERT INTO contents (id, create_time, update_time, content, count, ref_count)
              VALUES (1, 0, 0, '[]', 0, 1), (2, 0, 0, '[]', 0, 2);
            INSERT INTO todo_note_link (todo_id, content_id, sort_index, create_time, update_time)
              VALUES (7, 1, 0, 0, 0), (7, 2, 1, 0, 0), (8, 2, 0, 0, 0);
            ",
        )
        .unwrap();

        let tx = conn.transaction().unwrap();
        delete_note_links_by_todo_in_tx(&tx, 7).unwrap();
        tx.commit().unwrap();

        let links: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM todo_note_link WHERE todo_id = 7",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(links, 0);
        let only_ref_gone: i64 = conn
            .query_row("SELECT ref_count FROM contents WHERE id = 1", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(only_ref_gone, 0);
        let shared_ref: i64 = conn
            .query_row("SELECT ref_count FROM contents WHERE id = 2", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(shared_ref, 1);
    }
}
