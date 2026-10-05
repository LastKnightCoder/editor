use rusqlite::{params, OptionalExtension, Transaction};
use serde_json::Value;

use crate::database::calendar_holidays::HolidayDays;
use crate::database::calendar_time::CalendarTimeZone;
use crate::database::common::{now_millis, write_operation};

#[cfg(test)]
const DAY_MS: i64 = 24 * 60 * 60 * 1000;
const TODO_CALENDAR_GROUP_NAME: &str = "待办清单";
const WINDOW_BEFORE_DAYS: i64 = 30;
const WINDOW_AFTER_DAYS: i64 = 180;

#[derive(Debug, Clone)]
pub struct TodoCalendars {
    pub deadline: i64,
    pub recurring: i64,
}

#[derive(Debug, Clone)]
struct TodoRow {
    title: String,
    item_type: String,
    description_content_id: Option<i64>,
    start_at: Option<i64>,
    due_at: Option<i64>,
    is_archived: bool,
}

#[derive(Debug, Clone)]
struct RecurrenceRow {
    item_type: String,
    interval: i64,
    weekdays: Option<Vec<i64>>,
    month_day: Option<i64>,
    year_month: Option<i64>,
    year_day: Option<i64>,
    start_date: i64,
    end_date: Option<i64>,
    max_occurrences: Option<i64>,
    exclude_holidays: bool,
}

#[derive(Debug, Clone)]
struct CalendarEventData {
    calendar_id: i64,
    title: String,
    detail_content_id: i64,
    start_date: i64,
    end_date: Option<i64>,
    start_time: Option<i64>,
    end_time: Option<i64>,
    all_day: bool,
}

// 本地墙钟意义下的 epoch 天序号，所有「按天」计算（星期/月日/递增）都基于它
fn wall_day_index(ts: i64, zone: CalendarTimeZone) -> i64 {
    zone.day(ts)
}

fn day_index_start(day_index: i64, zone: CalendarTimeZone) -> i64 {
    zone.day_start(day_index)
}

fn start_of_day(ts: i64, zone: CalendarTimeZone) -> i64 {
    zone.start_of_day(ts)
}

fn day_of_week(day_index: i64) -> i64 {
    (day_index + 4).rem_euclid(7)
}

fn civil_from_days(days_since_epoch: i64) -> (i64, i64, i64) {
    use chrono::Datelike;
    let date = chrono::NaiveDate::from_ymd_opt(1970, 1, 1).unwrap()
        + chrono::Duration::days(days_since_epoch);
    (
        i64::from(date.year()),
        i64::from(date.month()),
        i64::from(date.day()),
    )
}

fn minute_of_day(timestamp: i64, zone: CalendarTimeZone) -> i64 {
    zone.minute(timestamp)
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

fn is_scheduled_for_recurrence(
    recurrence: &RecurrenceRow,
    day_index: i64,
    zone: CalendarTimeZone,
) -> bool {
    let start = wall_day_index(recurrence.start_date, zone);
    if day_index < start {
        return false;
    }
    if let Some(end_date) = recurrence.end_date {
        if day_index > wall_day_index(end_date, zone) {
            return false;
        }
    }

    let interval = recurrence.interval.max(1);
    let diff_days = day_index - start;

    match recurrence.item_type.as_str() {
        "daily" => diff_days.rem_euclid(interval) == 0,
        "weekdays" => {
            let wd = day_of_week(day_index);
            wd != 0 && wd != 6 && diff_days.rem_euclid(interval) == 0
        }
        "weekly" => {
            let day_wd = day_of_week(day_index);
            let start_wd = day_of_week(start);
            let day_week_start = day_index - day_wd;
            let start_week_start = start - start_wd;
            let week_diff = (day_week_start - start_week_start) / 7;
            if week_diff.rem_euclid(interval) != 0 {
                return false;
            }
            if let Some(weekdays) = &recurrence.weekdays {
                weekdays.contains(&day_wd)
            } else {
                day_wd == start_wd
            }
        }
        "monthly" => {
            let (sy, sm, sd) = civil_from_days(start);
            let (dy, dm, dd) = civil_from_days(day_index);
            let month_diff = (dy * 12 + (dm - 1)) - (sy * 12 + (sm - 1));
            if month_diff.rem_euclid(interval) != 0 {
                return false;
            }
            let target_day = recurrence.month_day.unwrap_or(sd);
            if dd == target_day {
                return true;
            }
            // 月末钳制（对齐桌面 Math.min(monthDay, lastDay)）：目标日超过当月天数时，
            // 当月最后一天视为匹配（如 31 日规则在 2 月落到 2/28-29），否则两端会删除-重建震荡
            let (_, next_month, _) = civil_from_days(day_index + 1);
            next_month != dm && dd < target_day
        }
        "yearly" => {
            let (sy, sm, sd) = civil_from_days(start);
            let (dy, dm, dd) = civil_from_days(day_index);
            let year_diff = dy - sy;
            if year_diff.rem_euclid(interval) != 0 {
                return false;
            }
            let target_month = recurrence.year_month.unwrap_or(sm);
            let target_day = recurrence.year_day.unwrap_or(sd);
            let (_, next_month, _) = civil_from_days(day_index + 1);
            dm == target_month && (dd == target_day || (next_month != dm && dd < target_day))
        }
        _ => diff_days.rem_euclid(interval) == 0,
    }
}

// 返回值是本地墙钟天序号，调用方用 day_index_start 换算回时间戳。
// 与桌面端一致：occurrence 计数从规则 start_date 起算（max_occurrences 为全局上限），
// 仅当落点处于请求窗口内才收集。
fn generate_occurrences_in_window(
    recurrence: &RecurrenceRow,
    window_start_index: i64,
    window_end_index: i64,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Vec<i64> {
    let start = wall_day_index(recurrence.start_date, zone);
    let end = if let Some(recurrence_end) = recurrence.end_date {
        wall_day_index(recurrence_end, zone).min(window_end_index)
    } else {
        window_end_index
    };
    if end < start {
        return vec![];
    }

    let max_occurrences = recurrence.max_occurrences.unwrap_or(i64::MAX).max(0);
    let mut results = Vec::new();
    let mut occurrences = 0i64;
    let mut cursor = start;

    while cursor <= end {
        if is_scheduled_for_recurrence(recurrence, cursor, zone) {
            occurrences += 1;
            if occurrences > max_occurrences {
                break;
            }
            let mut occurrence = cursor;
            if recurrence.exclude_holidays {
                for _ in 0..365 {
                    let weekday = day_of_week(occurrence);
                    if weekday != 0
                        && weekday != 6
                        && !holidays.get(&occurrence).copied().unwrap_or(false)
                    {
                        break;
                    }
                    occurrence += 1;
                }
            }
            if occurrence >= window_start_index
                && occurrence <= end
                && results.last() != Some(&occurrence)
            {
                results.push(occurrence);
            }
        }
        cursor += 1;
    }

    results
}

fn load_todo_row(tx: &Transaction<'_>, todo_id: i64) -> Result<Option<TodoRow>, String> {
    tx.query_row(
        "
        SELECT title, type, description_content_id, start_at, due_at, is_archived
        FROM todo_item
        WHERE id = ?1
        LIMIT 1
        ",
        params![todo_id],
        |row| {
            Ok(TodoRow {
                title: row.get(0)?,
                item_type: row.get(1)?,
                description_content_id: row.get::<_, Option<i64>>(2)?,
                start_at: row.get::<_, Option<i64>>(3)?,
                due_at: row.get::<_, Option<i64>>(4)?,
                is_archived: row.get::<_, i64>(5)? == 1,
            })
        },
    )
    .optional()
    .map_err(|e| format!("TODO_CALENDAR_SYNC_FAILED: Failed to query todo item: {e}"))
}

fn load_recurrence(tx: &Transaction<'_>, todo_id: i64) -> Result<Option<RecurrenceRow>, String> {
    tx.query_row(
        "
        SELECT type, interval, weekdays, month_day, year_month, year_day, start_date, end_date, max_occurrences, exclude_holidays
        FROM todo_recurrence
        WHERE todo_item_id = ?1
        LIMIT 1
        ",
        params![todo_id],
        |row| {
            Ok(RecurrenceRow {
                item_type: row.get(0)?,
                interval: row.get::<_, i64>(1)?,
                weekdays: parse_weekdays(row.get::<_, Option<String>>(2)?),
                month_day: row.get(3)?,
                year_month: row.get(4)?,
                year_day: row.get(5)?,
                start_date: row.get(6)?,
                end_date: row.get(7)?,
                max_occurrences: row.get(8)?,
                exclude_holidays: row.get::<_, i64>(9)? != 0,
            })
        },
    )
    .optional()
    .map_err(|e| format!("TODO_CALENDAR_SYNC_FAILED: Failed to query recurrence: {e}"))
}

fn upsert_calendar_group(tx: &Transaction<'_>) -> Result<i64, String> {
    let now = now_millis();
    let existing_system_group_id = tx
        .query_row(
            "SELECT id FROM calendar_group WHERE is_system = 1 ORDER BY id ASC LIMIT 1",
            [],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| {
            format!("TODO_CALENDAR_SYNC_FAILED: Failed to query system calendar group: {e}")
        })?;
    let system_group_id = match existing_system_group_id {
        Some(id) => id,
        None => {
            tx.execute(
                "
                INSERT INTO calendar_group (name, is_system, order_index, create_time, update_time)
                VALUES (?1, 1, 0, ?2, ?2)
                ",
                params!["系统日历", now],
            )
            .map_err(|e| {
                format!("TODO_CALENDAR_SYNC_FAILED: Failed to create system calendar group: {e}")
            })?;
            tx.last_insert_rowid()
        }
    };

    let existing = tx
        .query_row(
            "SELECT id, is_system, parent_group_id FROM calendar_group WHERE name = ?1 LIMIT 1",
            params![TODO_CALENDAR_GROUP_NAME],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|e| {
            format!("TODO_CALENDAR_SYNC_FAILED: Failed to query todo calendar group: {e}")
        })?;

    if let Some((group_id, is_system, parent_group_id)) = existing {
        if is_system == 1 || parent_group_id != Some(system_group_id) {
            tx.execute(
                "
                UPDATE calendar_group
                SET is_system = 0, parent_group_id = ?1, update_time = ?2
                WHERE id = ?3
                ",
                params![system_group_id, now, group_id],
            )
            .map_err(|e| {
                format!("TODO_CALENDAR_SYNC_FAILED: Failed to update todo calendar group: {e}")
            })?;
        }
        return Ok(group_id);
    }

    tx.execute(
        "
        INSERT INTO calendar_group (name, is_system, parent_group_id, order_index, create_time, update_time)
        VALUES (?1, 0, ?2, -1, ?3, ?3)
        ",
        params![TODO_CALENDAR_GROUP_NAME, system_group_id, now],
    )
    .map_err(|e| format!("TODO_CALENDAR_SYNC_FAILED: Failed to create todo calendar group: {e}"))?;
    Ok(tx.last_insert_rowid())
}

fn upsert_calendar(
    tx: &Transaction<'_>,
    group_id: i64,
    title: &str,
    color: &str,
    order_index: i64,
) -> Result<i64, String> {
    let now = now_millis();
    let existing = tx
        .query_row(
            "SELECT id FROM calendar WHERE group_id = ?1 AND title = ?2 LIMIT 1",
            params![group_id, title],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| {
            format!("TODO_CALENDAR_SYNC_FAILED: Failed to query todo calendar {title}: {e}")
        })?;

    if let Some(id) = existing {
        return Ok(id);
    }

    tx.execute(
        "
        INSERT INTO calendar
        (create_time, update_time, title, color, description_content_id, archived, pinned, visible, order_index, group_id)
        VALUES (?1, ?1, ?2, ?3, 0, 0, 0, 1, ?4, ?5)
        ",
        params![now, title, color, order_index, group_id],
    )
    .map_err(|e| format!("TODO_CALENDAR_SYNC_FAILED: Failed to create todo calendar {title}: {e}"))?;
    Ok(tx.last_insert_rowid())
}

pub fn ensure_todo_calendars(tx: &Transaction<'_>) -> Result<TodoCalendars, String> {
    let group_id = upsert_calendar_group(tx)?;
    // 「计划任务」日历已退役（桌面开库时转换为用户日历里关联待办的事件），这里不再补建
    let deadline = upsert_calendar(tx, group_id, "截止任务", "red", 0)?;
    let recurring = upsert_calendar(tx, group_id, "周期任务", "green", 2)?;
    Ok(TodoCalendars {
        deadline,
        recurring,
    })
}

fn create_calendar_event(tx: &Transaction<'_>, data: &CalendarEventData) -> Result<i64, String> {
    let now = now_millis();
    tx.execute(
        "
        INSERT INTO calendar_event
        (create_time, update_time, calendar_id, title, detail_content_id, start_date, end_date, start_time, end_time, color, all_day)
        VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9)
        ",
        params![
            now,
            data.calendar_id,
            data.title,
            data.detail_content_id,
            data.start_date,
            data.end_date,
            data.start_time,
            data.end_time,
            if data.all_day { 1 } else { 0 }
        ],
    )
    .map_err(|e| format!("TODO_CALENDAR_SYNC_FAILED: Failed to create calendar event: {e}"))?;
    let event_id = tx.last_insert_rowid();
    // 对齐桌面 CalendarEventTable.createEvent：待办物化同样写 operation，桌面热力图不缺移动端的写
    write_operation(tx, "calendar_event", "insert", event_id, now)?;
    Ok(event_id)
}

fn delete_calendar_event(tx: &Transaction<'_>, event_id: i64) -> Result<(), String> {
    tx.execute(
        "DELETE FROM calendar_event WHERE id = ?1",
        params![event_id],
    )
    .map_err(|e| format!("TODO_CALENDAR_SYNC_FAILED: Failed to delete calendar event: {e}"))?;
    write_operation(tx, "calendar_event", "delete", event_id, now_millis())?;
    Ok(())
}

fn create_mapping(
    tx: &Transaction<'_>,
    todo_item_id: i64,
    calendar_event_id: i64,
    sync_type: &str,
    recurrence_date: Option<i64>,
) -> Result<(), String> {
    tx.execute(
        "
        INSERT INTO todo_calendar_mapping (todo_item_id, calendar_event_id, sync_type, recurrence_date, create_time)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ",
        params![
            todo_item_id,
            calendar_event_id,
            sync_type,
            recurrence_date,
            now_millis()
        ],
    )
    .map_err(|e| format!("TODO_CALENDAR_SYNC_FAILED: Failed to create calendar mapping: {e}"))?;
    Ok(())
}

pub fn remove_all_by_todo(tx: &Transaction<'_>, todo_item_id: i64) -> Result<(), String> {
    let mut stmt = tx
        .prepare("SELECT id, calendar_event_id FROM todo_calendar_mapping WHERE todo_item_id = ?1")
        .map_err(|e| format!("TODO_CALENDAR_SYNC_FAILED: Failed to prepare mapping query: {e}"))?;
    let rows = stmt
        .query_map(params![todo_item_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| format!("TODO_CALENDAR_SYNC_FAILED: Failed to query mappings: {e}"))?;

    let mut mapping_ids = Vec::new();
    let mut event_ids = Vec::new();
    for item in rows {
        let (mapping_id, event_id) = item
            .map_err(|e| format!("TODO_CALENDAR_SYNC_FAILED: Failed to parse mapping row: {e}"))?;
        mapping_ids.push(mapping_id);
        event_ids.push(event_id);
    }

    for mapping_id in mapping_ids {
        tx.execute(
            "DELETE FROM todo_calendar_mapping WHERE id = ?1",
            params![mapping_id],
        )
        .map_err(|e| format!("TODO_CALENDAR_SYNC_FAILED: Failed to delete mapping: {e}"))?;
    }
    for event_id in event_ids {
        delete_calendar_event(tx, event_id)?;
    }
    Ok(())
}

fn build_event_for_deadline(
    todo: &TodoRow,
    calendars: &TodoCalendars,
    zone: CalendarTimeZone,
) -> Option<CalendarEventData> {
    let due_at = todo.due_at?;
    let due_date = start_of_day(due_at, zone);
    let due_minute = minute_of_day(due_at, zone);
    let has_time = due_minute > 0;
    Some(CalendarEventData {
        calendar_id: calendars.deadline,
        title: todo.title.clone(),
        detail_content_id: todo.description_content_id.unwrap_or(0),
        start_date: due_date,
        end_date: None,
        start_time: if has_time { Some(due_minute) } else { None },
        end_time: None,
        all_day: !has_time,
    })
}

fn build_event_for_recurring(
    todo: &TodoRow,
    calendars: &TodoCalendars,
    recurrence_date: i64,
) -> CalendarEventData {
    CalendarEventData {
        calendar_id: calendars.recurring,
        title: todo.title.clone(),
        detail_content_id: todo.description_content_id.unwrap_or(0),
        start_date: recurrence_date,
        end_date: None,
        start_time: None,
        end_time: None,
        all_day: true,
    }
}

pub fn rematerialize_recurring_item(
    tx: &Transaction<'_>,
    todo_item_id: i64,
    time_zone: crate::database::calendar_time::CalendarTimeZone,
) -> Result<(), String> {
    let Some(todo) = load_todo_row(tx, todo_item_id)? else {
        return remove_all_by_todo(tx, todo_item_id);
    };
    if todo.is_archived || todo.item_type != "recurring" {
        return remove_all_by_todo(tx, todo_item_id);
    }
    let Some(recurrence) = load_recurrence(tx, todo_item_id)? else {
        return remove_all_by_todo(tx, todo_item_id);
    };
    remove_all_by_todo(tx, todo_item_id)?;
    // 节假日规则由范围查询在事务外加载缓存后物化，写操作不抢占网络或留下旧规则事件。
    if recurrence.exclude_holidays {
        return Ok(());
    }
    let calendars = ensure_todo_calendars(tx)?;
    let zone = time_zone;
    let today_index = wall_day_index(now_millis(), zone);
    let window_start_index = today_index - WINDOW_BEFORE_DAYS;
    let window_end_index = today_index + WINDOW_AFTER_DAYS;
    let occurrences = generate_occurrences_in_window(
        &recurrence,
        window_start_index,
        window_end_index,
        zone,
        &HolidayDays::new(),
    );

    for day_index in occurrences {
        let occurrence = day_index_start(day_index, zone);
        let event_data = build_event_for_recurring(&todo, &calendars, occurrence);
        let event_id = create_calendar_event(tx, &event_data)?;
        create_mapping(tx, todo_item_id, event_id, "recurring", Some(occurrence))?;
    }
    Ok(())
}

// 对齐桌面 syncTodoItem 的 upsert 语义 + 范围物化编排：
// 现有物化与期望一致时不改库（事件 id 稳定、无写放大），范围内多出（规则变更）
// 或形态不符（存量 UTC 日界、标题/归属变更）才删改重建；返回按日期升序的 eventIds。
// 范围与既有物化的定位一律用本地天序号（wall_day_index），与生成同一坐标系，
// 调用方传入任意时刻的 range（非本地 0 点）时删除/生成边界仍然对称。
#[cfg(test)]
fn sync_recurring_tasks_for_range(
    tx: &Transaction<'_>,
    todo_item_id: i64,
    range_start: i64,
    range_end: i64,
    time_zone: crate::database::calendar_time::CalendarTimeZone,
) -> Result<Vec<i64>, String> {
    let calendars = ensure_todo_calendars(tx)?;
    sync_recurring_tasks_with_calendars(
        tx,
        todo_item_id,
        &calendars,
        range_start,
        range_end,
        time_zone,
        &HolidayDays::new(),
    )
}

// 范围查询编排层已 ensure 过日历，传入复用，避免逐 todo 重复 4+ 条查询
pub(crate) fn sync_recurring_tasks_with_calendars(
    tx: &Transaction<'_>,
    todo_item_id: i64,
    calendars: &TodoCalendars,
    range_start: i64,
    range_end: i64,
    time_zone: crate::database::calendar_time::CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Vec<i64>, String> {
    let Some(todo) = load_todo_row(tx, todo_item_id)? else {
        return Ok(vec![]);
    };
    if todo.is_archived || todo.item_type != "recurring" {
        return Ok(vec![]);
    }
    let Some(recurrence) = load_recurrence(tx, todo_item_id)? else {
        return Ok(vec![]);
    };
    let zone = time_zone;
    let range_start_day = wall_day_index(range_start, zone);
    let range_end_day = wall_day_index(range_end, zone);
    let expected =
        generate_occurrences_in_window(&recurrence, range_start_day, range_end_day, zone, holidays);

    let mut stmt = tx
        .prepare(
            "
            SELECT m.id, m.calendar_event_id, e.start_date, e.title, e.calendar_id, e.all_day, e.detail_content_id
            FROM todo_calendar_mapping m
            JOIN calendar_event e ON e.id = m.calendar_event_id
            WHERE m.todo_item_id = ?1 AND m.sync_type = 'recurring'
            ",
        )
        .map_err(|e| {
            format!("TODO_CALENDAR_SYNC_FAILED: Failed to prepare range sync: {e}")
        })?;
    let rows = stmt
        .query_map(params![todo_item_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
            ))
        })
        .map_err(|e| format!("TODO_CALENDAR_SYNC_FAILED: Failed to query range sync: {e}"))?;

    let mut kept_by_day = std::collections::HashMap::new();
    let mut stale: Vec<(i64, i64)> = Vec::new();
    for row in rows {
        let (mapping_id, event_id, start_date, title, calendar_id, all_day, detail_content_id) =
            row.map_err(|e| {
                format!("TODO_CALENDAR_SYNC_FAILED: Failed to parse range sync row: {e}")
            })?;
        let day = wall_day_index(start_date, zone);
        if day < range_start_day || day > range_end_day {
            continue;
        }
        let matches = expected.contains(&day)
            && start_date == day_index_start(day, zone)
            && title == todo.title
            && calendar_id == calendars.recurring
            && all_day != 0
            // 描述引用变了也要重建（否则窗口外留存事件指向已删除的内容，详情显示为空）
            && detail_content_id == todo.description_content_id.unwrap_or(0);
        // 同日既有重复 mapping（历史脏数据）只保留一条，其余进 stale 收敛
        if matches && !kept_by_day.contains_key(&day) {
            kept_by_day.insert(day, event_id);
        } else {
            stale.push((mapping_id, event_id));
        }
    }
    drop(stmt);

    for (mapping_id, event_id) in stale {
        tx.execute(
            "DELETE FROM todo_calendar_mapping WHERE id = ?1",
            params![mapping_id],
        )
        .map_err(|e| format!("TODO_CALENDAR_SYNC_FAILED: Failed to delete range mapping: {e}"))?;
        delete_calendar_event(tx, event_id)?;
    }

    let mut event_ids_by_day: Vec<(i64, i64)> = Vec::with_capacity(expected.len());
    for day in expected {
        if let Some(&event_id) = kept_by_day.get(&day) {
            event_ids_by_day.push((day, event_id));
            continue;
        }
        let occurrence = day_index_start(day, zone);
        let event_data = build_event_for_recurring(&todo, &calendars, occurrence);
        let event_id = create_calendar_event(tx, &event_data)?;
        create_mapping(tx, todo_item_id, event_id, "recurring", Some(occurrence))?;
        event_ids_by_day.push((day, event_id));
    }
    event_ids_by_day.sort_by_key(|(day, _)| *day);
    Ok(event_ids_by_day.into_iter().map(|(_, id)| id).collect())
}

pub fn sync_single_item(
    tx: &Transaction<'_>,
    todo_item_id: i64,
    time_zone: crate::database::calendar_time::CalendarTimeZone,
) -> Result<(), String> {
    let Some(todo) = load_todo_row(tx, todo_item_id)? else {
        return Ok(());
    };
    if todo.is_archived {
        return remove_all_by_todo(tx, todo_item_id);
    }

    if todo.item_type == "recurring" {
        return rematerialize_recurring_item(tx, todo_item_id, time_zone);
    }

    remove_all_by_todo(tx, todo_item_id)?;
    if todo.item_type == "normal" {
        return Ok(());
    }

    let calendars = ensure_todo_calendars(tx)?;
    let zone = time_zone;
    let event_data = match todo.item_type.as_str() {
        "deadline" => build_event_for_deadline(&todo, &calendars, zone),
        // 尚未经桌面转换的 planned 待办不再物化（时间仍在 start_at / due_at，桌面转换时据此建事件）
        _ => None,
    };
    if let Some(data) = event_data {
        let event_id = create_calendar_event(tx, &data)?;
        create_mapping(tx, todo_item_id, event_id, todo.item_type.as_str(), None)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    // UTC+8：-new Date().getTimezoneOffset() = 480
    const TZ_UTC8: CalendarTimeZone = CalendarTimeZone(chrono_tz::Asia::Shanghai);

    fn database() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "
            CREATE TABLE calendar_group (
                id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_system INTEGER,
                order_index INTEGER, create_time INTEGER, update_time INTEGER,
                parent_group_id INTEGER
            );
            CREATE TABLE calendar (
                id INTEGER PRIMARY KEY, title TEXT, color TEXT,
                description_content_id INTEGER, archived INTEGER, pinned INTEGER,
                visible INTEGER, order_index INTEGER, group_id INTEGER,
                create_time INTEGER, update_time INTEGER
            );
            CREATE TABLE calendar_event (
                id INTEGER PRIMARY KEY, create_time INTEGER, update_time INTEGER,
                calendar_id INTEGER NOT NULL, title TEXT NOT NULL,
                detail_content_id INTEGER DEFAULT 0, start_date INTEGER NOT NULL,
                end_date INTEGER, start_time INTEGER, end_time INTEGER,
                color TEXT, all_day INTEGER DEFAULT 0
            );
            CREATE TABLE todo_calendar_mapping (
                id INTEGER PRIMARY KEY, todo_item_id INTEGER NOT NULL,
                calendar_event_id INTEGER NOT NULL, sync_type TEXT NOT NULL,
                recurrence_date INTEGER, create_time INTEGER NOT NULL
            );
            CREATE TABLE todo_item (
                id INTEGER PRIMARY KEY, title TEXT, type TEXT,
                description_content_id INTEGER, start_at INTEGER, due_at INTEGER,
                is_archived INTEGER DEFAULT 0
            );
            CREATE TABLE todo_recurrence (
                id INTEGER PRIMARY KEY, todo_item_id INTEGER NOT NULL,
                type TEXT, interval INTEGER, weekdays TEXT, month_day INTEGER,
                year_month INTEGER, year_day INTEGER, start_date INTEGER,
                end_date INTEGER, max_occurrences INTEGER,
                exclude_holidays INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE operation (
                id INTEGER PRIMARY KEY, operation_time INTEGER, operation_id INTEGER,
                operation_content_type TEXT, operation_action TEXT
            );
        ",
            )
            .unwrap();
        connection
    }

    fn insert_daily_recurring_todo(connection: &Connection, start_date: i64) -> i64 {
        connection
            .execute(
                "INSERT INTO todo_item (id, title, type) VALUES (1, '周期待办', 'recurring')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO todo_recurrence
                 (id, todo_item_id, type, interval, start_date)
                 VALUES (1, 1, 'daily', 1, ?1)",
                [start_date],
            )
            .unwrap();
        1
    }

    #[test]
    fn ensure_preserves_calendar_preferences() {
        let mut connection = database();
        let tx = connection.transaction().unwrap();
        let calendars = ensure_todo_calendars(&tx).unwrap();
        tx.execute(
            "UPDATE calendar SET color = 'purple', archived = 1, visible = 0,
             pinned = 1, order_index = 42, update_time = 123 WHERE id = ?1",
            [calendars.recurring],
        )
        .unwrap();
        let ensured = ensure_todo_calendars(&tx).unwrap();
        assert_eq!(ensured.recurring, calendars.recurring);
        let preferences = tx
            .query_row(
                "SELECT color, archived, visible, pinned, order_index, update_time
             FROM calendar WHERE id = ?1",
                [calendars.recurring],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, i64>(4)?,
                        row.get::<_, i64>(5)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(preferences, ("purple".into(), 1, 0, 1, 42, 123));
        let count: i64 = tx
            .query_row("SELECT COUNT(*) FROM calendar", [], |r| r.get(0))
            .unwrap();
        // 截止 + 周期（计划任务日历已退役）
        assert_eq!(count, 2);
    }

    #[test]
    fn ensure_propagates_system_group_insert_failure() {
        let mut connection = database();
        connection
            .execute_batch(
                "CREATE TRIGGER reject_system_group BEFORE INSERT ON calendar_group
            WHEN NEW.is_system = 1 BEGIN SELECT RAISE(ABORT, 'blocked'); END;",
            )
            .unwrap();
        let tx = connection.transaction().unwrap();
        let error = ensure_todo_calendars(&tx).unwrap_err();
        assert!(
            error.contains("Failed to create system calendar group"),
            "{error}"
        );
        let count: i64 = tx
            .query_row("SELECT COUNT(*) FROM calendar", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn date_part_follows_local_day_boundary() {
        // 2025-09-15T17:00:00Z = UTC+8 本地 9/16 01:00：跨 UTC 日界，本地日界应落到 9/16
        let ts = 1757955600_000;
        let zone = TZ_UTC8;
        let utc_day = start_of_day(ts, CalendarTimeZone(chrono_tz::UTC));
        let local_day = start_of_day(ts, zone);
        assert_eq!(utc_day, 1757894400_000); // 2025-09-15T00:00:00Z
        assert_eq!(local_day, 1757952000_000); // 本地 9/16 0 点（= UTC 9/15 16:00）
        assert_eq!(minute_of_day(ts, zone), 60);
        // 星期判定按本地天序号：本地 9/16 是周二
        assert_eq!(day_of_week(wall_day_index(local_day, zone)), 2);
    }

    #[test]
    fn range_materialization_is_idempotent_and_sorted() {
        let mut connection = database();
        insert_daily_recurring_todo(&connection, 0);
        let tx = connection.transaction().unwrap();
        // 2026-09-07 ~ 2026-09-13（本地）共 7 个 occurrence
        let zone = TZ_UTC8;
        let range_start = day_index_start(wall_day_index(1757203200_000, zone), zone);
        let range_end = day_index_start(wall_day_index(1757721600_000, zone), zone);
        let first =
            sync_recurring_tasks_for_range(&tx, 1, range_start, range_end, TZ_UTC8).unwrap();
        assert_eq!(first.len(), 7);
        let second =
            sync_recurring_tasks_for_range(&tx, 1, range_start, range_end, TZ_UTC8).unwrap();
        assert_eq!(second.len(), 7);
        // 幂等不仅是数量：二次查询不重建，事件 id 稳定（对齐桌面 upsert）
        assert_eq!(first, second);
        let (event_count, mapping_count): (i64, i64) = tx
            .query_row(
                "SELECT (SELECT COUNT(*) FROM calendar_event),
                        (SELECT COUNT(*) FROM todo_calendar_mapping)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!((event_count, mapping_count), (7, 7));
        // 周期任务日历上的事件均为全天、无时刻
        let all_day: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM calendar_event WHERE all_day != 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(all_day, 0);
        // 二次查询不产生新的写（operation 不增长：upsert 无变化不动库）
        let operations: i64 = tx
            .query_row("SELECT COUNT(*) FROM operation", [], |r| r.get(0))
            .unwrap();
        assert_eq!(operations, 7);
    }

    #[test]
    fn range_materialization_accepts_midday_range_bounds() {
        let mut connection = database();
        insert_daily_recurring_todo(&connection, 0);
        let tx = connection.transaction().unwrap();
        let zone = TZ_UTC8;
        let day0 = day_index_start(wall_day_index(1757203200_000, zone), zone);
        // 首次用本地 0 点范围物化 3 天
        sync_recurring_tasks_for_range(&tx, 1, day0, day0 + 2 * DAY_MS, TZ_UTC8).unwrap();
        // 再次以「当天 14:23 ~ 第 3 天 23:59:59.999」的任意时刻范围查询：
        // 删除/生成边界必须对称，否则首日旧物化删不掉而重建，出现同日重复
        sync_recurring_tasks_for_range(
            &tx,
            1,
            day0 + 14 * 60 * 60 * 1000 + 23 * 60 * 1000,
            day0 + 4 * DAY_MS - 1,
            TZ_UTC8,
        )
        .unwrap();
        let dates: Vec<i64> = {
            let mut stmt = tx
                .prepare("SELECT start_date FROM calendar_event ORDER BY start_date")
                .unwrap();
            let rows = stmt.query_map([], |row| row.get::<_, i64>(0)).unwrap();
            rows.collect::<Result<Vec<_>, _>>().unwrap()
        };
        assert_eq!(
            dates,
            vec![day0, day0 + DAY_MS, day0 + 2 * DAY_MS, day0 + 3 * DAY_MS]
        );
    }

    #[test]
    fn range_materialization_cleans_rule_change_leftovers() {
        let mut connection = database();
        insert_daily_recurring_todo(&connection, 0);
        let tx = connection.transaction().unwrap();
        let zone = TZ_UTC8;
        let day0 = day_index_start(wall_day_index(1757203200_000, zone), zone);
        let first =
            sync_recurring_tasks_for_range(&tx, 1, day0, day0 + 3 * DAY_MS, TZ_UTC8).unwrap();
        assert_eq!(first.len(), 4);
        // 规则改为隔天：范围内奇数日的旧物化应被清理，偶数日保留原 id
        tx.execute("UPDATE todo_recurrence SET interval = 2 WHERE id = 1", [])
            .unwrap();
        let second =
            sync_recurring_tasks_for_range(&tx, 1, day0, day0 + 3 * DAY_MS, TZ_UTC8).unwrap();
        assert_eq!(second.len(), 2);
        assert_eq!(second, vec![first[0], first[2]]);
        let count: i64 = tx
            .query_row("SELECT COUNT(*) FROM calendar_event", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn range_materialization_overrides_stale_utc_rows() {
        let mut connection = database();
        insert_daily_recurring_todo(&connection, 0);
        let tx = connection.transaction().unwrap();
        let calendars = ensure_todo_calendars(&tx).unwrap();
        let zone = TZ_UTC8;
        let range_start = day_index_start(wall_day_index(1757203200_000, zone), zone);
        let range_end = range_start + 3 * DAY_MS;
        // 造一条旧 UTC 日界物化：同一 local 日、start_date 与本地日界不同（模拟存量）
        let stale_start = range_start + 10 * 60 * 60 * 1000;
        tx.execute(
            "INSERT INTO calendar_event
             (create_time, update_time, calendar_id, title, detail_content_id, start_date, all_day)
             VALUES (0, 0, ?1, '周期待办', 0, ?2, 1)",
            params![calendars.recurring, stale_start],
        )
        .unwrap();
        let stale_event_id = tx.last_insert_rowid();
        tx.execute(
            "INSERT INTO todo_calendar_mapping
             (todo_item_id, calendar_event_id, sync_type, recurrence_date, create_time)
             VALUES (1, ?1, 'recurring', ?2, 0)",
            params![stale_event_id, stale_start],
        )
        .unwrap();

        sync_recurring_tasks_for_range(&tx, 1, range_start, range_end, TZ_UTC8).unwrap();
        // 旧 UTC 行被替换，范围内只余本地日界的 4 条，无重复日期
        let dates: Vec<i64> = {
            let mut stmt = tx
                .prepare("SELECT start_date FROM calendar_event ORDER BY start_date")
                .unwrap();
            let rows = stmt.query_map([], |row| row.get::<_, i64>(0)).unwrap();
            rows.collect::<Result<Vec<_>, _>>().unwrap()
        };
        assert_eq!(
            dates,
            vec![
                range_start,
                range_start + DAY_MS,
                range_start + 2 * DAY_MS,
                range_start + 3 * DAY_MS
            ]
        );
    }

    #[test]
    fn range_materialization_preserves_out_of_range_rows() {
        let mut connection = database();
        insert_daily_recurring_todo(&connection, 0);
        let tx = connection.transaction().unwrap();
        let calendars = ensure_todo_calendars(&tx).unwrap();
        let zone = TZ_UTC8;
        // 范围外（更早）留存一条
        let before_range = day_index_start(wall_day_index(1756600000_000, zone), zone);
        tx.execute(
            "INSERT INTO calendar_event
             (create_time, update_time, calendar_id, title, detail_content_id, start_date, all_day)
             VALUES (0, 0, ?1, '周期待办', 0, ?2, 1)",
            params![calendars.recurring, before_range],
        )
        .unwrap();
        let kept_event_id = tx.last_insert_rowid();
        tx.execute(
            "INSERT INTO todo_calendar_mapping
             (todo_item_id, calendar_event_id, sync_type, recurrence_date, create_time)
             VALUES (1, ?1, 'recurring', ?2, 0)",
            params![kept_event_id, before_range],
        )
        .unwrap();

        let range_start = day_index_start(wall_day_index(1757203200_000, zone), zone);
        sync_recurring_tasks_for_range(&tx, 1, range_start, range_start + 2 * DAY_MS, TZ_UTC8)
            .unwrap();
        let kept: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM todo_calendar_mapping WHERE calendar_event_id = ?1",
                [kept_event_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(kept, 1);
    }

    #[test]
    fn deadline_event_uses_local_day_and_minute() {
        let mut connection = database();
        connection
            .execute("INSERT INTO todo_item (id, title, type, due_at) VALUES (1, '交付', 'deadline', ?1)", [
                1757955600_000i64, // 2026-09-15T17:00:00Z = 本地 9/16 01:00
            ])
            .unwrap();
        let tx = connection.transaction().unwrap();
        sync_single_item(&tx, 1, TZ_UTC8).unwrap();
        let (start_date, start_time, all_day): (i64, i64, i64) = tx
            .query_row(
                "SELECT start_date, start_time, all_day FROM calendar_event",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(start_date, 1757952000_000); // 本地 9/16 0 点
        assert_eq!(start_time, 60);
        assert_eq!(all_day, 0);
    }

    #[test]
    fn exclude_holidays_rules_keep_workdays_without_network_data() {
        let mut connection = database();
        insert_daily_recurring_todo(&connection, 0);
        connection
            .execute(
                "UPDATE todo_recurrence SET exclude_holidays = 1 WHERE id = 1",
                [],
            )
            .unwrap();
        let tx = connection.transaction().unwrap();
        let zone = TZ_UTC8;
        let day0 = day_index_start(wall_day_index(1757203200_000, zone), zone);
        let ids = sync_recurring_tasks_for_range(&tx, 1, day0, day0 + DAY_MS, TZ_UTC8).unwrap();
        assert_eq!(ids.len(), 1);
        let count: i64 = tx
            .query_row("SELECT COUNT(*) FROM calendar_event", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn monthly_rule_clamps_to_month_end() {
        let mut connection = database();
        // 每月 31 日规则：2 月应物化 2/28（月末钳制，对齐桌面），3 月正常 3/31
        connection
            .execute(
                "INSERT INTO todo_item (id, title, type) VALUES (1, '月末', 'recurring')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO todo_recurrence (id, todo_item_id, type, interval, month_day, start_date)
                 VALUES (1, 1, 'monthly', 1, 31, ?1)",
                [1756684800_000i64], // 本地 2025-09-01 0 点
            )
            .unwrap();
        let tx = connection.transaction().unwrap();
        let zone = TZ_UTC8;
        // 2026-01-26（本地 0 点）起一个月：覆盖 1/31、2/28、（3/31 在范围外）
        let range_start = 1769385600_000i64;
        let range_end = range_start + 40 * DAY_MS;
        let ids = sync_recurring_tasks_for_range(&tx, 1, range_start, range_end, TZ_UTC8).unwrap();
        assert_eq!(ids.len(), 2);
        let dates: Vec<i64> = {
            let mut stmt = tx
                .prepare("SELECT start_date FROM calendar_event ORDER BY start_date")
                .unwrap();
            let rows = stmt.query_map([], |row| row.get::<_, i64>(0)).unwrap();
            rows.collect::<Result<Vec<_>, _>>().unwrap()
        };
        let jan31 = day_index_start(wall_day_index(dates[0], zone), zone);
        assert_eq!(day_of_week(wall_day_index(dates[0], zone)), 6); // 2026-01-31 是周六
        assert_eq!(dates[0], jan31);
        // 第二条落在 2 月最后一天
        let (_, month, day) = civil_from_days(wall_day_index(dates[1], zone));
        assert_eq!((month, day), (2, 28));
    }

    #[test]
    fn shared_recurrence_contract() {
        let fixtures: Vec<Value> = serde_json::from_str(include_str!(
            "../../../../../packages/shared/src/utils/__fixtures__/calendar-recurrence.json"
        ))
        .unwrap();
        let timestamp = |value: &Value| {
            chrono::DateTime::parse_from_rfc3339(value.as_str().unwrap())
                .unwrap()
                .timestamp_millis()
        };
        for fixture in fixtures {
            let zone = CalendarTimeZone(fixture["timeZone"].as_str().unwrap().parse().unwrap());
            let rule = &fixture["rule"];
            let recurrence = RecurrenceRow {
                item_type: rule["type"].as_str().unwrap().into(),
                interval: rule["interval"].as_i64().unwrap(),
                start_date: timestamp(&rule["startDate"]),
                end_date: rule.get("endDate").map(timestamp),
                max_occurrences: rule["maxOccurrences"].as_i64(),
                weekdays: rule["weekdays"]
                    .as_array()
                    .map(|days| days.iter().map(|day| day.as_i64().unwrap()).collect()),
                month_day: rule["monthDay"].as_i64(),
                year_month: rule["yearMonth"].as_i64(),
                year_day: rule["yearDay"].as_i64(),
                exclude_holidays: rule["excludeHolidays"].as_bool().unwrap_or(false),
            };
            let holidays = fixture["holidays"]
                .as_array()
                .map(|days| {
                    days.iter()
                        .map(|day| (zone.day(timestamp(day)), true))
                        .collect()
                })
                .unwrap_or_default();
            let actual = generate_occurrences_in_window(
                &recurrence,
                zone.day(timestamp(&fixture["start"])),
                zone.day(timestamp(&fixture["end"])),
                zone,
                &holidays,
            )
            .into_iter()
            .map(|day| zone.day_start(day))
            .collect::<Vec<_>>();
            let expected = fixture["expected"]
                .as_array()
                .unwrap()
                .iter()
                .map(timestamp)
                .collect::<Vec<_>>();
            assert_eq!(actual, expected, "{}", fixture["name"]);
        }
    }

    #[test]
    fn failed_materialization_rolls_back_deleted_rows_and_operations() {
        let mut connection = database();
        insert_daily_recurring_todo(&connection, 0);
        let start = 1757203200_000;
        let original = {
            let tx = connection.transaction().unwrap();
            let ids =
                sync_recurring_tasks_for_range(&tx, 1, start, start + DAY_MS, TZ_UTC8).unwrap();
            tx.commit().unwrap();
            ids
        };
        connection.execute_batch("UPDATE todo_item SET title = '新标题' WHERE id = 1; CREATE TRIGGER reject_mapping BEFORE INSERT ON todo_calendar_mapping BEGIN SELECT RAISE(ABORT, '模拟映射写入失败'); END;").unwrap();
        let operations: i64 = connection
            .query_row("SELECT COUNT(*) FROM operation", [], |r| r.get(0))
            .unwrap();
        {
            let tx = connection.transaction().unwrap();
            assert!(
                sync_recurring_tasks_for_range(&tx, 1, start, start + DAY_MS, TZ_UTC8).is_err()
            );
        }
        let ids = connection
            .prepare("SELECT id FROM calendar_event ORDER BY id")
            .unwrap()
            .query_map([], |r| r.get::<_, i64>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(ids, original);
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM operation", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            operations
        );
    }
}
