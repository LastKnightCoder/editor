use rusqlite::{params, Connection, OptionalExtension, Transaction};
use tauri::AppHandle;

use super::calendar_calendars::{
    content_by_id, is_in_system_group, load_group_map, query_calendar_by_id,
};
use super::calendar_types::{
    CalendarByIdPayload, CalendarEventDateRangePayload, CalendarEventDto,
    CreateCalendarEventPayload, UpdateCalendarEventPayload,
};
use crate::database::common::{
    db_err, insert_content_record, now_millis, release_content_reference, trigger_reconcile,
    write_operation,
};
use crate::database::schema;
use crate::database::todo_calendar_sync::{
    ensure_todo_calendars, sync_recurring_tasks_with_calendars,
};

const EVENT_JOIN_COLUMNS: &str =
    "e.id, e.calendar_id, e.title, e.detail_content_id, e.start_date, \
     e.end_date, e.start_time, e.end_time, e.color, e.all_day, \
     c.title AS calendar_title, c.color AS calendar_color, c.group_id AS calendar_group_id";

type EventRow = (
    i64,
    i64,
    String,
    i64,
    i64,
    Option<i64>,
    Option<i64>,
    Option<i64>,
    Option<String>,
    bool,
    Option<String>,
    Option<String>,
    Option<i64>,
);

fn parse_event_row(
    row: &rusqlite::Row,
    groups: &std::collections::HashMap<i64, (bool, Option<i64>)>,
) -> Result<CalendarEventDto, rusqlite::Error> {
    let (
        id,
        calendar_id,
        title,
        detail_content_id,
        start_date,
        end_date,
        start_time,
        end_time,
        color,
        all_day,
        calendar_title,
        calendar_color,
        calendar_group_id,
    ): EventRow = (
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
        row.get(8)?,
        row.get::<_, i64>(9)? != 0,
        row.get(10)?,
        row.get(11)?,
        row.get(12)?,
    );
    Ok(CalendarEventDto {
        id,
        calendar_id,
        title,
        detail_content_id,
        start_date,
        end_date,
        start_time,
        end_time,
        color,
        all_day,
        detail_content: None,
        is_in_system_event: is_in_system_group(calendar_group_id, groups),
        calendar_title,
        calendar_color,
    })
}

// 物化事件的回读不带 JOIN（事件所在日历固定为周期任务日历，归属已知），
// calendar 侧字段由调用方补齐，保持与静态行同构。
fn parse_plain_event_row(
    row: &rusqlite::Row,
    calendar_title: &str,
    calendar_color: &str,
) -> Result<CalendarEventDto, rusqlite::Error> {
    Ok(CalendarEventDto {
        id: row.get(0)?,
        calendar_id: row.get(1)?,
        title: row.get(2)?,
        detail_content_id: row.get(3)?,
        start_date: row.get(4)?,
        end_date: row.get(5)?,
        start_time: row.get(6)?,
        end_time: row.get(7)?,
        color: row.get(8)?,
        all_day: row.get::<_, i64>(9)? != 0,
        detail_content: None,
        calendar_title: Some(calendar_title.to_string()),
        calendar_color: Some(calendar_color.to_string()),
        is_in_system_event: true,
    })
}

const PLAIN_EVENT_COLUMNS: &str =
    "e.id, e.calendar_id, e.title, e.detail_content_id, e.start_date, e.end_date, e.start_time, e.end_time, e.color, e.all_day";

#[tauri::command]
pub fn calendar_event_get_by_id(
    app: AppHandle,
    payload: CalendarByIdPayload,
) -> Result<CalendarEventDto, String> {
    let conn = schema::open_active_database(&app)?;
    get_event_by_id_with_conn(&conn, payload.id)
}

// 供 create/update 在同一连接（同一连接锁临界区）内回读：command 直呼 command 会
// 同线程重入 open_active_database 的 Mutex 导致死锁，必须复用连接
fn get_event_by_id_with_conn(conn: &Connection, id: i64) -> Result<CalendarEventDto, String> {
    let groups = load_group_map(conn)?;
    let mut event = conn
        .query_row(
            &format!(
                "SELECT {EVENT_JOIN_COLUMNS} FROM calendar_event e \
                 JOIN calendar c ON c.id = e.calendar_id WHERE e.id = ?1"
            ),
            params![id],
            |row| parse_event_row(row, &groups),
        )
        .optional()
        .map_err(|e| db_err("CALENDAR_EVENT_QUERY_FAILED", "get event by id", e))?
        .ok_or_else(|| "CALENDAR_EVENT_NOT_FOUND: 日程不存在".to_string())?;
    event.detail_content = content_by_id(conn, event.detail_content_id)?;
    Ok(event)
}

// 核心查询，编排对齐桌面 calendar-event.ts getEventsByDateRange：
// ① 静态事件按 [start, end] 与跨天横跨三支条件查询；② 永远排除周期任务日历的存量行；
// ③ 按请求范围物化周期任务（移动端经 sync_recurring_tasks_for_range，本地日界），
//    生成的事件追加在静态结果之后，不重排序；
// 排序与桌面一致：start_date ASC, start_time ASC。
#[tauri::command]
pub async fn calendar_event_get_by_date_range(
    app: AppHandle,
    payload: CalendarEventDateRangePayload,
) -> Result<Vec<CalendarEventDto>, String> {
    if payload.end_date < payload.start_date
        || payload.end_date.saturating_sub(payload.start_date) > 366 * 86_400_000
    {
        return Err("CALENDAR_RANGE_INVALID: 查询范围必须在一年内".into());
    }
    let needs_holidays = {
        let conn = schema::open_active_database(&app)?;
        conn.query_row("SELECT EXISTS(SELECT 1 FROM todo_recurrence r JOIN todo_item t ON t.id = r.todo_item_id WHERE r.exclude_holidays = 1 AND t.type = 'recurring' AND t.is_archived = 0)", [], |row| row.get::<_, bool>(0))
            .map_err(|e| db_err("CALENDAR_EVENT_QUERY_FAILED", "check holiday rules", e))?
    };
    let holidays = if needs_holidays {
        crate::database::calendar_holidays::load_holidays(
            &app,
            payload.start_date,
            payload.end_date,
            payload.time_zone,
        )
        .await?
    } else {
        Default::default()
    };
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| db_err("CALENDAR_EVENT_QUERY_FAILED", "begin transaction", e))?;
    let calendars = ensure_todo_calendars(&tx)?;
    let recurring_id = calendars.recurring;
    let groups = load_group_map(&tx)?;

    let filter_ids = payload.calendar_ids.clone();
    // 可见性过滤对齐桌面：传入的 calendarIds 先剔除周期日历（存量不读库）；
    // Some(空) 是「用户全不勾」的明确空集（静态 1=0、不物化），None 才是未传 = 全部；
    // 剔除周期日历后为空说明只看周期日历，同样返回空集
    let static_ids: Option<Vec<i64>> = filter_ids.as_ref().map(|ids| {
        ids.iter()
            .copied()
            .filter(|id| *id != recurring_id)
            .collect::<Vec<_>>()
    });

    let mut static_events = Vec::new();
    {
        let id_filter = match &static_ids {
            None => {
                format!("e.calendar_id != {recurring_id}")
            }
            Some(ids) if ids.is_empty() => "1 = 0".to_string(),
            Some(ids) => {
                let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
                format!("e.calendar_id IN ({placeholders})")
            }
        };
        let sql = format!(
            "SELECT {EVENT_JOIN_COLUMNS} FROM calendar_event e \
             JOIN calendar c ON c.id = e.calendar_id \
             WHERE ((e.start_date >= ? AND e.start_date <= ?) \
                OR (e.end_date IS NOT NULL AND e.end_date >= ? AND e.end_date <= ?) \
                OR (e.end_date IS NOT NULL AND e.start_date <= ? AND e.end_date >= ?)) \
               AND c.archived = 0 \
               AND {id_filter} \
             ORDER BY e.start_date ASC, e.start_time ASC"
        );
        let mut bound = params_from_range(&payload);
        if let Some(ids) = &static_ids {
            for id in ids {
                bound.push(rusqlite::types::Value::Integer(*id));
            }
        }
        let mut stmt = tx
            .prepare(&sql)
            .map_err(|e| db_err("CALENDAR_EVENT_QUERY_FAILED", "prepare range query", e))?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(bound.iter()), |row| {
                parse_event_row(row, &groups)
            })
            .map_err(|e| db_err("CALENDAR_EVENT_QUERY_FAILED", "query range events", e))?;
        for row in rows {
            static_events.push(
                row.map_err(|e| db_err("CALENDAR_EVENT_QUERY_FAILED", "parse range event", e))?,
            );
        }
    }

    // 整个范围查询原子物化：任何一条失败都回滚，避免向用户呈现部分成功的空日程。
    let mut events = static_events;
    let should_materialize = filter_ids
        .as_ref()
        .map_or(true, |ids| ids.contains(&recurring_id));
    if should_materialize {
        let materialized = materialize_recurring_in_range(
            &tx,
            &calendars,
            payload.start_date,
            payload.end_date,
            payload.time_zone,
            &holidays,
        )?;
        if !materialized.is_empty() {
            if let Some((title, color)) = query_calendar_title_color(&tx, recurring_id)? {
                append_materialized_events(&tx, &materialized, &title, &color, &mut events)?;
            }
        }
    }
    // 事件、映射及操作日志一起提交，详情查询才能读取返回的事件身份。
    tx.commit()
        .map_err(|e| db_err("CALENDAR_EVENT_QUERY_FAILED", "commit materialization", e))?;
    Ok(events)
}

fn append_materialized_events(
    tx: &Transaction<'_>,
    event_ids: &[i64],
    calendar_title: &str,
    calendar_color: &str,
    events: &mut Vec<CalendarEventDto>,
) -> Result<(), String> {
    let placeholders = event_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT {PLAIN_EVENT_COLUMNS} FROM calendar_event e WHERE e.id IN ({placeholders}) \
         ORDER BY e.start_date ASC, e.start_time ASC, e.id ASC"
    );
    let mut stmt = tx.prepare(&sql).map_err(|e| {
        db_err(
            "CALENDAR_EVENT_QUERY_FAILED",
            "prepare materialized query",
            e,
        )
    })?;
    let rows = stmt
        .query_map(
            rusqlite::params_from_iter(event_ids.iter().copied()),
            |row| parse_plain_event_row(row, calendar_title, calendar_color),
        )
        .map_err(|e| {
            db_err(
                "CALENDAR_EVENT_QUERY_FAILED",
                "query materialized events",
                e,
            )
        })?;
    for row in rows {
        events.push(
            row.map_err(|e| db_err("CALENDAR_EVENT_QUERY_FAILED", "parse materialized event", e))?,
        );
    }
    Ok(())
}

fn params_from_range(payload: &CalendarEventDateRangePayload) -> Vec<rusqlite::types::Value> {
    use rusqlite::types::Value;
    vec![
        Value::Integer(payload.start_date),
        Value::Integer(payload.end_date),
        Value::Integer(payload.start_date),
        Value::Integer(payload.end_date),
        Value::Integer(payload.start_date),
        Value::Integer(payload.start_date),
    ]
}

// 返回本次范围内的事件身份；失败交给外层事务回滚，不提交部分物化。
fn materialize_recurring_in_range(
    tx: &Transaction<'_>,
    calendars: &crate::database::todo_calendar_sync::TodoCalendars,
    range_start: i64,
    range_end: i64,
    time_zone: crate::database::calendar_time::CalendarTimeZone,
    holidays: &crate::database::calendar_holidays::HolidayDays,
) -> Result<Vec<i64>, String> {
    let mut stmt = tx
        .prepare(
            "SELECT r.todo_item_id FROM todo_recurrence r \
             JOIN todo_item t ON t.id = r.todo_item_id \
             WHERE t.type = 'recurring' AND t.is_archived = 0",
        )
        .map_err(|e| db_err("CALENDAR_EVENT_QUERY_FAILED", "prepare recurring list", e))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(|e| db_err("CALENDAR_EVENT_QUERY_FAILED", "query recurring items", e))?;
    let mut todo_ids = Vec::new();
    for row in rows {
        todo_ids.push(
            row.map_err(|e| db_err("CALENDAR_EVENT_QUERY_FAILED", "parse recurring item", e))?,
        );
    }
    let mut event_ids = Vec::new();
    for todo_id in todo_ids {
        let ids = sync_recurring_tasks_with_calendars(
            tx,
            todo_id,
            calendars,
            range_start,
            range_end,
            time_zone,
            holidays,
        )
        .map_err(|error| format!("CALENDAR_MATERIALIZE_FAILED: 周期任务 {todo_id}: {error}"))?;
        event_ids.extend(ids);
    }
    Ok(event_ids)
}

fn query_calendar_title_color(
    conn: &Connection,
    calendar_id: i64,
) -> Result<Option<(String, String)>, String> {
    conn.query_row(
        "SELECT title, color FROM calendar WHERE id = ?1",
        params![calendar_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    )
    .optional()
    .map_err(|e| db_err("CALENDAR_QUERY_FAILED", "get calendar title color", e))
}

// ── 事件写命令（系统日历事件 P0 硬拒绝，错误码前端本地化为 toast） ──

pub(crate) fn assert_user_calendar(conn: &Connection, calendar_id: i64) -> Result<(), String> {
    let calendar = query_calendar_by_id(conn, calendar_id)?
        .ok_or_else(|| "CALENDAR_NOT_FOUND: 日历不存在".to_string())?;
    if calendar.is_in_system_group {
        return Err("CALENDAR_EVENT_SYSTEM_READONLY: 系统日历日程不可在移动端编辑".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn calendar_event_create(
    app: AppHandle,
    payload: CreateCalendarEventPayload,
) -> Result<CalendarEventDto, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| db_err("CALENDAR_EVENT_CREATE_FAILED", "begin transaction", e))?;
    assert_user_calendar(&tx, payload.calendar_id)?;
    insert_event_in_tx(&tx, &payload)?;
    let id = tx.last_insert_rowid();
    write_operation(&tx, "calendar_event", "insert", id, now_millis())?;
    tx.commit()
        .map_err(|e| db_err("CALENDAR_EVENT_CREATE_FAILED", "commit event", e))?;
    trigger_reconcile(&app);
    get_event_by_id_with_conn(&conn, id)
}

pub(crate) fn insert_event_in_tx(
    tx: &Transaction<'_>,
    payload: &CreateCalendarEventPayload,
) -> Result<(), String> {
    let now = now_millis();
    let content_id = match &payload.detail_content {
        Some(content) => insert_content_record(
            tx,
            content,
            payload.contracts.as_ref(),
            payload.detail_content_count.unwrap_or(0),
            now,
        )?,
        None => payload.detail_content_id.unwrap_or(0),
    };
    tx.execute(
        "
        INSERT INTO calendar_event
        (id, create_time, update_time, calendar_id, title, detail_content_id, start_date, end_date, start_time, end_time, color, all_day)
        VALUES (?11, ?1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        ",
        params![
            now,
            payload.calendar_id,
            payload.title,
            content_id,
            payload.start_date,
            payload.end_date,
            payload.start_time,
            payload.end_time,
            payload.color,
            if payload.all_day { 1 } else { 0 },
            super::super::assistant_tasks::next_id(tx,"calendar_event")?,
        ],
    )
    .map_err(|e| db_err("CALENDAR_EVENT_CREATE_FAILED", "insert event", e))?;
    Ok(())
}

#[tauri::command]
pub fn calendar_event_update(
    app: AppHandle,
    payload: UpdateCalendarEventPayload,
) -> Result<CalendarEventDto, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| db_err("CALENDAR_EVENT_UPDATE_FAILED", "begin transaction", e))?;
    let current_calendar_id: Option<i64> = tx
        .query_row(
            "SELECT calendar_id FROM calendar_event WHERE id = ?1",
            params![payload.id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| db_err("CALENDAR_EVENT_QUERY_FAILED", "get event for update", e))?;
    if current_calendar_id.is_none() {
        return Err("CALENDAR_EVENT_NOT_FOUND: 日程不存在".to_string());
    }
    // 系统日历写保护：事件当前归属与目标日历都必须是用户日历，
    // 否则等于把系统事件「转移」出系统日历
    assert_user_calendar(&tx, current_calendar_id.unwrap_or(0))?;
    assert_user_calendar(&tx, payload.calendar_id)?;
    let now = now_millis();
    // 详情内容替换：未传（None）保留旧内容；新内容 id 与旧值不同且旧值 > 0 时
    // 按引用计数回收（对齐桌面 deleteContent）
    let old_content_id: i64 = tx
        .query_row(
            "SELECT detail_content_id FROM calendar_event WHERE id = ?1",
            params![payload.id],
            |row| row.get(0),
        )
        .map_err(|e| db_err("CALENDAR_EVENT_UPDATE_FAILED", "get old content id", e))?;
    let new_content_id = match &payload.detail_content {
        Some(content) => insert_content_record(
            &tx,
            content,
            payload.contracts.as_ref(),
            payload.detail_content_count.unwrap_or(0),
            now,
        )?,
        None => payload.detail_content_id.unwrap_or(old_content_id),
    };
    tx.execute(
        "
        UPDATE calendar_event
        SET calendar_id = ?1, title = ?2, detail_content_id = ?3, start_date = ?4, end_date = ?5,
            start_time = ?6, end_time = ?7, color = ?8, all_day = ?9, update_time = ?10
        WHERE id = ?11
        ",
        params![
            payload.calendar_id,
            payload.title,
            new_content_id,
            payload.start_date,
            payload.end_date,
            payload.start_time,
            payload.end_time,
            payload.color,
            if payload.all_day { 1 } else { 0 },
            now,
            payload.id,
        ],
    )
    .map_err(|e| db_err("CALENDAR_EVENT_UPDATE_FAILED", "update event", e))?;
    if old_content_id > 0 && old_content_id != new_content_id {
        release_content_reference(&tx, old_content_id)?;
    }
    write_operation(&tx, "calendar_event", "update", payload.id, now)?;
    tx.commit()
        .map_err(|e| db_err("CALENDAR_EVENT_UPDATE_FAILED", "commit event", e))?;
    trigger_reconcile(&app);
    get_event_by_id_with_conn(&conn, payload.id)
}

#[tauri::command]
pub fn calendar_event_delete(app: AppHandle, payload: CalendarByIdPayload) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| db_err("CALENDAR_EVENT_DELETE_FAILED", "begin transaction", e))?;
    delete_event_in_tx(&tx, payload.id)?;
    tx.commit()
        .map_err(|e| db_err("CALENDAR_EVENT_DELETE_FAILED", "commit delete event", e))?;
    trigger_reconcile(&app);
    Ok(payload.id)
}

pub(crate) fn delete_event_in_tx(tx: &Transaction<'_>, event_id: i64) -> Result<(), String> {
    let (calendar_id, content_id): (i64, i64) = tx
        .query_row(
            "SELECT e.calendar_id, e.detail_content_id FROM calendar_event e WHERE e.id = ?1",
            params![event_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| db_err("CALENDAR_EVENT_QUERY_FAILED", "get event for delete", e))?
        .ok_or_else(|| "CALENDAR_EVENT_NOT_FOUND: 日程不存在".to_string())?;
    assert_user_calendar(tx, calendar_id)?;
    if content_id > 0 {
        release_content_reference(tx, content_id)?;
    }
    write_operation(tx, "calendar_event", "delete", event_id, now_millis())?;
    tx.execute(
        "DELETE FROM todo_schedule_occurrence WHERE calendar_event_id=?1",
        [event_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM doc_task_calendar_link WHERE calendar_event_id=?1",
        [event_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM calendar_event WHERE id = ?1",
        params![event_id],
    )
    .map_err(|e| db_err("CALENDAR_EVENT_DELETE_FAILED", "delete event", e))?;
    Ok(())
}
