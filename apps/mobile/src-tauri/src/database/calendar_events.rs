use rusqlite::{params, Connection, OptionalExtension, Transaction};
use tauri::AppHandle;

use super::calendar_calendars::{
    content_by_id, is_in_system_group, load_group_map, query_calendar_by_id,
};
use super::calendar_types::{
    CalendarByIdPayload, CalendarEventDateRangePayload, CalendarEventDto,
    CreateCalendarEventPayload, UpdateCalendarEventPayload,
};
use crate::database::calendar_time::CalendarTimeZone;
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
     c.title AS calendar_title, c.color AS calendar_color, c.group_id AS calendar_group_id,e.start_utc_ms,e.end_utc_ms";

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
    zone: CalendarTimeZone,
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
    let (start_date, end_date, start_time, end_time) = match (
        row.get::<_, Option<i64>>(13)?,
        row.get::<_, Option<i64>>(14)?,
    ) {
        (Some(start), Some(end)) => {
            let day = zone.start_of_day(start);
            let last = zone.start_of_day(end);
            (
                day,
                if end_date.is_none() && day == last {
                    None
                } else {
                    Some(last)
                },
                Some(zone.minute(start)),
                Some(zone.minute(end)),
            )
        }
        (Some(start), None) => (
            zone.start_of_day(start),
            end_date,
            Some(zone.minute(start)),
            None,
        ),
        _ => (start_date, end_date, start_time, end_time),
    };
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
    time_zone: CalendarTimeZone,
) -> Result<CalendarEventDto, String> {
    let conn = schema::open_active_database(&app)?;
    get_event_by_id_with_conn(&conn, payload.id, time_zone)
}

// 供 create/update 在同一连接（同一连接锁临界区）内回读：command 直呼 command 会
// 同线程重入 open_active_database 的 Mutex 导致死锁，必须复用连接
fn get_event_by_id_with_conn(
    conn: &Connection,
    id: i64,
    zone: CalendarTimeZone,
) -> Result<CalendarEventDto, String> {
    let groups = load_group_map(conn)?;
    let mut event = conn
        .query_row(
            &format!(
                "SELECT {EVENT_JOIN_COLUMNS} FROM calendar_event e \
                 JOIN calendar c ON c.id = e.calendar_id WHERE e.id = ?1"
            ),
            params![id],
            |row| parse_event_row(row, &groups, zone),
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
             WHERE (COALESCE(e.start_utc_ms,e.start_date) < ? AND COALESCE(e.end_utc_ms,e.start_utc_ms,e.end_date,e.start_date) >= ?) \
               AND c.archived = 0 \
               AND {id_filter} \
             ORDER BY COALESCE(e.start_utc_ms,e.start_date+COALESCE(e.start_time,0)*60000),e.id"
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
                parse_event_row(row, &groups, payload.time_zone)
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
        Value::Integer(
            payload
                .time_zone
                .day_start(payload.time_zone.day(payload.end_date) + 1),
        ),
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

pub(crate) fn list_event_ids(
    conn: &Connection,
    after_id: i64,
    range: Option<(i64, i64)>,
    calendar_ids: Option<&[i64]>,
    limit: i64,
) -> Result<Vec<i64>, String> {
    let calendars = calendar_ids
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| db_err("CALENDAR_EVENT_QUERY_FAILED", "encode calendar ids", e))?;
    let mut stmt=conn.prepare("SELECT id FROM calendar_event WHERE id>?1 AND (?2 IS NULL OR (COALESCE(start_utc_ms,start_date)<?3 AND COALESCE(end_utc_ms,start_utc_ms,end_date,start_date)>=?2)) AND (?4 IS NULL OR calendar_id IN (SELECT CAST(value AS INTEGER) FROM json_each(?4))) ORDER BY id LIMIT ?5").map_err(|e|db_err("CALENDAR_EVENT_QUERY_FAILED","prepare id page",e))?;
    let ids = stmt
        .query_map(
            params![
                after_id,
                range.map(|r| r.0),
                range.map(|r| r.1),
                calendars,
                limit
            ],
            |row| row.get(0),
        )
        .map_err(|e| db_err("CALENDAR_EVENT_QUERY_FAILED", "query id page", e))?
        .collect::<Result<Vec<i64>, _>>()
        .map_err(|e| db_err("CALENDAR_EVENT_QUERY_FAILED", "parse id page", e))?;
    Ok(ids)
}

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
    time_zone: CalendarTimeZone,
) -> Result<CalendarEventDto, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| db_err("CALENDAR_EVENT_CREATE_FAILED", "begin transaction", e))?;
    assert_user_calendar(&tx, payload.calendar_id)?;
    insert_event_in_tx(&tx, &payload, time_zone)?;
    let id = tx.last_insert_rowid();
    write_operation(&tx, "calendar_event", "insert", id, now_millis())?;
    tx.commit()
        .map_err(|e| db_err("CALENDAR_EVENT_CREATE_FAILED", "commit event", e))?;
    trigger_reconcile(&app);
    get_event_by_id_with_conn(&conn, id, time_zone)
}

pub(crate) fn insert_event_in_tx(
    tx: &Transaction<'_>,
    payload: &CreateCalendarEventPayload,
    zone: CalendarTimeZone,
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
    let start = payload
        .start_time
        .filter(|_| !payload.all_day)
        .map(|minute| zone.event_instant(payload.start_date, minute, None))
        .transpose()?;
    let end = payload
        .end_time
        .filter(|_| start.is_some())
        .map(|minute| {
            zone.event_instant(payload.end_date.unwrap_or(payload.start_date), minute, None)
        })
        .transpose()?;
    if end.zip(start).is_some_and(|(last, first)| last < first) {
        return Err("结束时间不能早于开始时间".into());
    }
    tx.execute(
        "
        INSERT INTO calendar_event
        (id, create_time, update_time, calendar_id, title, detail_content_id, start_date, end_date, start_time, end_time, color, all_day,start_utc_ms,end_utc_ms,start_time_zone,end_time_zone)
        VALUES (?11, ?1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,?12,?13,?14,?15)
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
            super::super::assistant_tasks::next_id(tx,"calendar_event")?,start,end,start.map(|_|zone.0.name()),end.map(|_|zone.0.name()),
        ],
    )
    .map_err(|e| db_err("CALENDAR_EVENT_CREATE_FAILED", "insert event", e))?;
    Ok(())
}

struct StoredTimes {
    start_date: i64,
    end_date: Option<i64>,
    start_minute: Option<i64>,
    end_minute: Option<i64>,
    all_day: bool,
    start: Option<i64>,
    end: Option<i64>,
    start_zone: Option<String>,
    end_zone: Option<String>,
}

#[tauri::command]
pub fn calendar_event_update(
    app: AppHandle,
    payload: UpdateCalendarEventPayload,
    time_zone: CalendarTimeZone,
) -> Result<CalendarEventDto, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| db_err("CALENDAR_EVENT_UPDATE_FAILED", "begin transaction", e))?;
    let (calendar_id,old_content_id,independent,existing) = tx.query_row(
        "SELECT calendar_id,COALESCE(detail_content_id,0),todo_item_id IS NULL
         AND NOT EXISTS(SELECT 1 FROM doc_task_calendar_link WHERE calendar_event_id=?1)
         AND NOT EXISTS(SELECT 1 FROM todo_calendar_mapping WHERE calendar_event_id=?1),
         start_date,end_date,start_time,end_time,all_day,start_utc_ms,end_utc_ms,start_time_zone,end_time_zone
         FROM calendar_event WHERE id=?1",
        [payload.id],|r| Ok((r.get::<_,i64>(0)?,r.get::<_,i64>(1)?,r.get::<_,bool>(2)?,StoredTimes{
          start_date:r.get(3)?,end_date:r.get(4)?,start_minute:r.get(5)?,end_minute:r.get(6)?,all_day:r.get(7)?,
          start:r.get(8)?,end:r.get(9)?,start_zone:r.get(10)?,end_zone:r.get(11)?,
        }))
    ).optional().map_err(|e|db_err("CALENDAR_EVENT_UPDATE_FAILED","read event",e))?.ok_or("CALENDAR_EVENT_NOT_FOUND: 日程不存在")?;
    assert_user_calendar(&tx, calendar_id)?;
    assert_user_calendar(&tx, payload.calendar_id)?;
    let now = now_millis();
    // 详情内容替换：未传（None）保留旧内容；新内容 id 与旧值不同且旧值 > 0 时
    // 按引用计数回收（对齐桌面 deleteContent）
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
    let changed = existing.start_date != payload.start_date
        || existing.end_date.unwrap_or(existing.start_date)
            != payload.end_date.unwrap_or(payload.start_date)
        || existing.start_minute != payload.start_time
        || existing.end_minute != payload.end_time
        || existing.all_day != payload.all_day;
    let (start, end, start_zone, end_zone) = match (payload.start_time, payload.end_time) {
        (Some(start), end)
            if independent && !payload.all_day && (changed || existing.start.is_some()) =>
        {
            let first = time_zone.event_instant(payload.start_date, start, existing.start)?;
            let last = end
                .map(|minute| {
                    time_zone.event_instant(
                        payload.end_date.unwrap_or(payload.start_date),
                        minute,
                        existing.end,
                    )
                })
                .transpose()?;
            if last.is_some_and(|end| end < first) {
                return Err("结束时间不能早于开始时间".into());
            }
            (
                Some(first),
                last,
                Some(existing.start_zone.as_deref().unwrap_or(time_zone.0.name())),
                last.map(|_| existing.end_zone.as_deref().unwrap_or(time_zone.0.name())),
            )
        }
        _ => (None, None, None, None),
    };
    let keep_wall = !changed || (start.is_some() && existing.start == start && existing.end == end);
    tx.execute(
        "
        UPDATE calendar_event
        SET calendar_id = ?1, title = ?2, detail_content_id = ?3, start_date = ?4, end_date = ?5,
            start_time = ?6, end_time = ?7, color = ?8, all_day = ?9, update_time = ?10,start_utc_ms=?12,end_utc_ms=?13,start_time_zone=?14,end_time_zone=?15
        WHERE id = ?11
        ",
        params![
            payload.calendar_id,
            payload.title,
            new_content_id,
            if keep_wall {Some(existing.start_date)} else {Some(payload.start_date)},
            if keep_wall {existing.end_date} else {payload.end_date},
            if keep_wall {existing.start_minute} else {payload.start_time},
            if keep_wall {existing.end_minute} else {payload.end_time},
            payload.color,
            if payload.all_day { 1 } else { 0 },
            now,
            payload.id,start,end,start_zone,end_zone,
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
    get_event_by_id_with_conn(&conn, payload.id, time_zone)
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

#[cfg(test)]
mod time_zone_tests {
    use super::*;
    use chrono_tz::{America::New_York, Asia::Tokyo};

    #[test]
    fn native_calendar_creation_is_visible_on_the_next_day_in_tokyo() {
        let mut db = Connection::open_in_memory().unwrap();
        crate::database::migrator::ensure_main_schema(&db).unwrap();
        db.execute(
            "INSERT INTO calendar(title,color,create_time,update_time) VALUES('个人','blue',1,1)",
            [],
        )
        .unwrap();
        let ny = CalendarTimeZone(New_York);
        let tokyo = CalendarTimeZone(Tokyo);
        let timestamp = |value: &str| {
            chrono::DateTime::parse_from_rfc3339(value)
                .unwrap()
                .timestamp_millis()
        };
        let day = timestamp("2026-03-08T00:00:00-05:00");
        let input:CreateCalendarEventPayload=serde_json::from_value(serde_json::json!({"calendarId":1,"title":"跨日会议","startDate":day,"startTime":1380,"endTime":1410,"allDay":false})).unwrap();
        let tx = db.transaction().unwrap();
        insert_event_in_tx(&tx, &input, ny).unwrap();
        let id = tx.last_insert_rowid();
        tx.commit().unwrap();
        let tokyo_day = timestamp("2026-03-09T00:00:00+09:00");
        let event = get_event_by_id_with_conn(&db, id, tokyo).unwrap();
        assert_eq!(
            (event.start_date, event.start_time, event.end_time),
            (tokyo_day, Some(720), Some(750))
        );
        assert_eq!(
            list_event_ids(&db, 0, Some((tokyo_day, tokyo_day + 86400000)), None, 10).unwrap(),
            [id]
        );
        assert!(
            list_event_ids(&db, 0, Some((tokyo_day - 86400000, tokyo_day)), None, 10)
                .unwrap()
                .is_empty()
        );
        let raw: (i64, String) = db
            .query_row(
                "SELECT start_utc_ms,start_time_zone FROM calendar_event WHERE id=?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(
            raw,
            (timestamp("2026-03-09T03:00:00Z"), "America/New_York".into())
        );
    }
}
