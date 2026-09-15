use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use tauri::AppHandle;

use super::calendar_types::{
    CalendarByIdPayload, CalendarDto, CalendarGroupDto, CreateCalendarPayload,
    UpdateCalendarPayload,
};
use crate::database::common::{db_err, decrement_or_delete_content, now_millis, trigger_reconcile, write_operation};
use crate::database::schema;

pub(crate) const CALENDAR_COLUMNS: &str =
    "id, title, color, description_content_id, archived, pinned, visible, order_index, group_id, create_time, update_time";

type GroupMap = HashMap<i64, (bool, Option<i64>)>;

// 系统日历两层派生判定，对齐桌面 calendar.ts：分组 is_system，或其父分组 is_system；
// 分组/父分组不存在时按非系统处理（桌面 catch 吞错同语义）。
pub(crate) fn load_group_map(conn: &Connection) -> Result<GroupMap, String> {
    let mut stmt = conn
        .prepare("SELECT id, is_system, parent_group_id FROM calendar_group")
        .map_err(|e| db_err("CALENDAR_QUERY_FAILED", "prepare group map", e))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)? != 0,
                row.get::<_, Option<i64>>(2)?,
            ))
        })
        .map_err(|e| db_err("CALENDAR_QUERY_FAILED", "query group map", e))?;
    let mut map = HashMap::new();
    for row in rows {
        let (id, is_system, parent) = row.map_err(|e| db_err("CALENDAR_QUERY_FAILED", "parse group row", e))?;
        map.insert(id, (is_system, parent));
    }
    Ok(map)
}

pub(crate) fn is_in_system_group(group_id: Option<i64>, groups: &GroupMap) -> bool {
    let Some(gid) = group_id else {
        return false;
    };
    let Some(&(is_system, parent)) = groups.get(&gid) else {
        return false;
    };
    if is_system {
        return true;
    }
    match parent {
        Some(pid) => groups.get(&pid).map_or(false, |&(parent_system, _)| parent_system),
        None => false,
    }
}

pub(crate) fn parse_calendar_row(
    row: &rusqlite::Row,
    groups: &GroupMap,
    event_counts: &HashMap<i64, i64>,
) -> Result<CalendarDto, rusqlite::Error> {
    let group_id: Option<i64> = row.get(8)?;
    Ok(CalendarDto {
        id: row.get(0)?,
        title: row.get(1)?,
        color: row.get(2)?,
        description_content_id: row.get(3)?,
        archived: row.get::<_, i64>(4)? != 0,
        pinned: row.get::<_, i64>(5)? != 0,
        visible: row.get::<_, i64>(6)? != 0,
        order_index: row.get(7)?,
        group_id,
        create_time: row.get(9)?,
        update_time: row.get(10)?,
        is_in_system_group: is_in_system_group(group_id, groups),
        event_count: *event_counts.get(&row.get::<_, i64>(0)?).unwrap_or(&0),
    })
}

fn load_event_counts(conn: &Connection) -> Result<HashMap<i64, i64>, String> {
    let mut stmt = conn
        .prepare("SELECT calendar_id, COUNT(*) FROM calendar_event GROUP BY calendar_id")
        .map_err(|e| db_err("CALENDAR_QUERY_FAILED", "prepare event counts", e))?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))
        .map_err(|e| db_err("CALENDAR_QUERY_FAILED", "query event counts", e))?;
    let mut map = HashMap::new();
    for row in rows {
        let (calendar_id, count) =
            row.map_err(|e| db_err("CALENDAR_QUERY_FAILED", "parse event count", e))?;
        map.insert(calendar_id, count);
    }
    Ok(map)
}

fn query_all_calendars(conn: &Connection) -> Result<Vec<CalendarDto>, String> {
    let groups = load_group_map(conn)?;
    let event_counts = load_event_counts(conn)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {CALENDAR_COLUMNS} FROM calendar ORDER BY order_index ASC, create_time DESC"
        ))
        .map_err(|e| db_err("CALENDAR_QUERY_FAILED", "prepare list calendars", e))?;
    let rows = stmt
        .query_map([], |row| parse_calendar_row(row, &groups, &event_counts))
        .map_err(|e| db_err("CALENDAR_QUERY_FAILED", "query calendars", e))?;
    let mut calendars = Vec::new();
    for row in rows {
        calendars.push(row.map_err(|e| db_err("CALENDAR_QUERY_FAILED", "parse calendar row", e))?);
    }
    Ok(calendars)
}

pub(crate) fn query_calendar_by_id(
    conn: &Connection,
    id: i64,
) -> Result<Option<CalendarDto>, String> {
    let groups = load_group_map(conn)?;
    let event_counts = load_event_counts(conn)?;
    conn.query_row(
        &format!("SELECT {CALENDAR_COLUMNS} FROM calendar WHERE id = ?1"),
        params![id],
        |row| parse_calendar_row(row, &groups, &event_counts),
    )
    .optional()
    .map_err(|e| db_err("CALENDAR_QUERY_FAILED", "get calendar by id", e))
}

// ── 分组 ──

#[tauri::command]
pub fn calendar_group_get_all(app: AppHandle) -> Result<Vec<CalendarGroupDto>, String> {
    let conn = schema::open_active_database(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, is_system, parent_group_id, order_index, create_time, update_time \
             FROM calendar_group ORDER BY is_system DESC, order_index ASC, create_time ASC",
        )
        .map_err(|e| db_err("CALENDAR_GROUP_QUERY_FAILED", "prepare groups", e))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(CalendarGroupDto {
                id: row.get(0)?,
                name: row.get(1)?,
                is_system: row.get::<_, i64>(2)? != 0,
                parent_group_id: row.get(3)?,
                order_index: row.get(4)?,
                create_time: row.get(5)?,
                update_time: row.get(6)?,
            })
        })
        .map_err(|e| db_err("CALENDAR_GROUP_QUERY_FAILED", "query groups", e))?;
    let mut groups = Vec::new();
    for row in rows {
        groups.push(row.map_err(|e| db_err("CALENDAR_GROUP_QUERY_FAILED", "parse group row", e))?);
    }
    Ok(groups)
}

// ── 日历 ──

#[tauri::command]
pub fn calendar_get_all(app: AppHandle) -> Result<Vec<CalendarDto>, String> {
    let conn = schema::open_active_database(&app)?;
    query_all_calendars(&conn)
}

#[tauri::command]
pub fn calendar_create(app: AppHandle, payload: CreateCalendarPayload) -> Result<CalendarDto, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| db_err("CALENDAR_CREATE_FAILED", "begin transaction", e))?;
    let now = now_millis();
    tx.execute(
        "
        INSERT INTO calendar
        (create_time, update_time, title, color, description_content_id, archived, pinned, visible, order_index, group_id)
        VALUES (?1, ?1, ?2, ?3, 0, ?4, ?5, ?6, ?7, ?8)
        ",
        params![
            now,
            payload.title,
            payload.color.clone().unwrap_or_else(|| "blue".to_string()),
            payload.archived.unwrap_or(false),
            payload.pinned.unwrap_or(false),
            payload.visible.unwrap_or(true),
            payload.order_index.unwrap_or(0),
            payload.group_id,
        ],
    )
    .map_err(|e| db_err("CALENDAR_CREATE_FAILED", "insert calendar", e))?;
    let id = tx.last_insert_rowid();
    write_operation(&tx, "calendar", "insert", id, now)?;
    tx.commit()
        .map_err(|e| db_err("CALENDAR_CREATE_FAILED", "commit calendar", e))?;
    trigger_reconcile(&app);
    query_calendar_by_id(&conn, id)?.ok_or_else(|| "CALENDAR_NOT_FOUND: 日历不存在".to_string())
}

#[tauri::command]
pub fn calendar_update(app: AppHandle, payload: UpdateCalendarPayload) -> Result<CalendarDto, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| db_err("CALENDAR_UPDATE_FAILED", "begin transaction", e))?;
    let current = query_calendar_by_id(&tx, payload.id)?
        .ok_or_else(|| "CALENDAR_NOT_FOUND: 日历不存在".to_string())?;
    let now = now_millis();
    // 对齐桌面 updateCalendar：全字段覆盖（前端以完整对象提交），nullish 回退在 DTO 层完成
    tx.execute(
        "
        UPDATE calendar
        SET title = ?1, color = ?2, archived = ?3, pinned = ?4, visible = ?5,
            order_index = ?6, group_id = ?7, update_time = ?8
        WHERE id = ?9
        ",
        params![
            payload.title.unwrap_or(current.title),
            payload.color.unwrap_or(current.color),
            payload.archived.unwrap_or(current.archived),
            payload.pinned.unwrap_or(current.pinned),
            payload.visible.unwrap_or(current.visible),
            payload.order_index.unwrap_or(current.order_index),
            payload.group_id.or(current.group_id),
            now,
            payload.id,
        ],
    )
    .map_err(|e| db_err("CALENDAR_UPDATE_FAILED", "update calendar", e))?;
    write_operation(&tx, "calendar", "update", payload.id, now)?;
    tx.commit()
        .map_err(|e| db_err("CALENDAR_UPDATE_FAILED", "commit calendar", e))?;
    query_calendar_by_id(&conn, payload.id)?.ok_or_else(|| "CALENDAR_NOT_FOUND: 日历不存在".to_string())
}

// 级联删除对齐桌面 calendar.ts deleteCalendar：事件详情内容随事件清理（引用计数）、
// 删事件、删日历描述内容、删日历。注意：移动端没有桌面 cleanupOrphanedEvents 的
// 等价例行清理，孤儿 mapping（事件已被直接删除）会留存但无功能影响（JOIN 丢弃）。
#[tauri::command]
pub fn calendar_delete(app: AppHandle, payload: CalendarByIdPayload) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| db_err("CALENDAR_DELETE_FAILED", "begin transaction", e))?;
    let current = query_calendar_by_id(&tx, payload.id)?
        .ok_or_else(|| "CALENDAR_NOT_FOUND: 日历不存在".to_string())?;
    if current.is_in_system_group {
        return Err("CALENDAR_SYSTEM_READONLY: 系统日历不可删除".to_string());
    }

    let mut stmt = tx
        .prepare("SELECT id, detail_content_id FROM calendar_event WHERE calendar_id = ?1")
        .map_err(|e| db_err("CALENDAR_DELETE_FAILED", "prepare events query", e))?;
    let rows = stmt
        .query_map(params![payload.id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| db_err("CALENDAR_DELETE_FAILED", "query events", e))?;
    let mut event_ids = Vec::new();
    for row in rows {
        let (event_id, content_id) =
            row.map_err(|e| db_err("CALENDAR_DELETE_FAILED", "parse event row", e))?;
        if content_id > 0 {
            decrement_or_delete_content(&tx, content_id)?;
        }
        event_ids.push(event_id);
    }
    drop(stmt);
    for event_id in event_ids {
        tx.execute("DELETE FROM calendar_event WHERE id = ?1", params![event_id])
            .map_err(|e| db_err("CALENDAR_DELETE_FAILED", "delete event", e))?;
    }
    if current.description_content_id > 0 {
        decrement_or_delete_content(&tx, current.description_content_id)?;
    }
    let now = now_millis();
    write_operation(&tx, "calendar", "delete", payload.id, now)?;
    tx.execute("DELETE FROM calendar WHERE id = ?1", params![payload.id])
        .map_err(|e| db_err("CALENDAR_DELETE_FAILED", "delete calendar", e))?;
    tx.commit()
        .map_err(|e| db_err("CALENDAR_DELETE_FAILED", "commit delete calendar", e))?;
    trigger_reconcile(&app);
    Ok(payload.id)
}

// 供其他域（番茄钟桥、范围查询）在事务内复用的内容透传助手
pub(crate) fn content_by_id(conn: &Connection, content_id: i64) -> Result<Option<Value>, String> {
    if content_id <= 0 {
        return Ok(None);
    }
    conn.query_row(
        "SELECT content FROM contents WHERE id = ?1",
        params![content_id],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| db_err("CONTENT_QUERY_FAILED", "get content by id", e))?
    .map(|text| serde_json::from_str::<Value>(&text).map_err(|e| db_err("CONTENT_INVALID", "parse content", e)))
    .transpose()
}
