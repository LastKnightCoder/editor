use rusqlite::{params, OptionalExtension, Transaction};
use serde_json::Value;

const DAY_MS: i64 = 24 * 60 * 60 * 1000;
const TODO_CALENDAR_GROUP_NAME: &str = "待办清单";
const WINDOW_BEFORE_DAYS: i64 = 30;
const WINDOW_AFTER_DAYS: i64 = 180;

#[derive(Debug, Clone)]
pub struct TodoCalendars {
    pub deadline: i64,
    pub planned: i64,
    pub recurring: i64,
}

#[derive(Debug, Clone)]
struct TodoRow {
    id: i64,
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

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn start_of_day(ts: i64) -> i64 {
    ts - ts.rem_euclid(DAY_MS)
}

fn day_of_week(day_start_ms: i64) -> i64 {
    let days = day_start_ms.div_euclid(DAY_MS);
    (days + 4).rem_euclid(7)
}

fn civil_from_days(days_since_epoch: i64) -> (i64, i64, i64) {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let mut y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    if m <= 2 {
        y += 1;
    }
    (y, m, d)
}

fn year_month_day(day_start_ms: i64) -> (i64, i64, i64) {
    civil_from_days(day_start_ms.div_euclid(DAY_MS))
}

fn date_part(timestamp: i64) -> i64 {
    start_of_day(timestamp)
}

fn minute_of_day(timestamp: i64) -> i64 {
    let day_start = start_of_day(timestamp);
    let delta = timestamp - day_start;
    if delta <= 0 {
        0
    } else {
        delta / 60_000
    }
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

fn is_scheduled_for_recurrence(recurrence: &RecurrenceRow, day_ms: i64) -> bool {
    let day = start_of_day(day_ms);
    let start = start_of_day(recurrence.start_date);
    if day < start {
        return false;
    }
    if let Some(end_date) = recurrence.end_date {
        if day > start_of_day(end_date) {
            return false;
        }
    }

    let interval = recurrence.interval.max(1);
    let diff_days = day.div_euclid(DAY_MS) - start.div_euclid(DAY_MS);

    match recurrence.item_type.as_str() {
        "daily" => diff_days.rem_euclid(interval) == 0,
        "weekdays" => {
            let wd = day_of_week(day);
            wd != 0 && wd != 6 && diff_days.rem_euclid(interval) == 0
        }
        "weekly" => {
            let day_wd = day_of_week(day);
            let start_wd = day_of_week(start);
            let day_week_start = day - day_wd * DAY_MS;
            let start_week_start = start - start_wd * DAY_MS;
            let week_diff = (day_week_start - start_week_start).div_euclid(7 * DAY_MS);
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
            let (sy, sm, sd) = year_month_day(start);
            let (dy, dm, dd) = year_month_day(day);
            let month_diff = (dy * 12 + (dm - 1)) - (sy * 12 + (sm - 1));
            if month_diff.rem_euclid(interval) != 0 {
                return false;
            }
            let target_day = recurrence.month_day.unwrap_or(sd);
            dd == target_day
        }
        "yearly" => {
            let (sy, sm, sd) = year_month_day(start);
            let (dy, dm, dd) = year_month_day(day);
            let year_diff = dy - sy;
            if year_diff.rem_euclid(interval) != 0 {
                return false;
            }
            let target_month = recurrence.year_month.unwrap_or(sm);
            let target_day = recurrence.year_day.unwrap_or(sd);
            dm == target_month && dd == target_day
        }
        _ => diff_days.rem_euclid(interval) == 0,
    }
}

fn generate_occurrences_in_window(
    recurrence: &RecurrenceRow,
    window_start: i64,
    window_end: i64,
) -> Vec<i64> {
    let start = start_of_day(recurrence.start_date);
    let end = if let Some(recurrence_end) = recurrence.end_date {
        start_of_day(recurrence_end).min(window_end)
    } else {
        window_end
    };
    if end < start {
        return vec![];
    }

    let max_occurrences = recurrence.max_occurrences.unwrap_or(i64::MAX).max(0);
    let mut results = Vec::new();
    let mut occurrences = 0i64;
    let mut cursor = start;

    while cursor <= end {
        if is_scheduled_for_recurrence(recurrence, cursor) {
            occurrences += 1;
            if occurrences > max_occurrences {
                break;
            }
            if cursor >= window_start {
                results.push(cursor);
            }
        }
        cursor += DAY_MS;
    }

    results
}

fn load_todo_row(tx: &Transaction<'_>, todo_id: i64) -> Result<Option<TodoRow>, String> {
    tx.query_row(
        "
        SELECT id, title, type, description_content_id, start_at, due_at, is_archived
        FROM todo_item
        WHERE id = ?1
        LIMIT 1
        ",
        params![todo_id],
        |row| {
            Ok(TodoRow {
                id: row.get(0)?,
                title: row.get(1)?,
                item_type: row.get(2)?,
                description_content_id: row.get::<_, Option<i64>>(3)?,
                start_at: row.get::<_, Option<i64>>(4)?,
                due_at: row.get::<_, Option<i64>>(5)?,
                is_archived: row.get::<_, i64>(6)? == 1,
            })
        },
    )
    .optional()
    .map_err(|e| format!("TODO_CALENDAR_SYNC_FAILED: Failed to query todo item: {e}"))
}

fn load_recurrence(tx: &Transaction<'_>, todo_id: i64) -> Result<Option<RecurrenceRow>, String> {
    tx.query_row(
        "
        SELECT type, interval, weekdays, month_day, year_month, year_day, start_date, end_date, max_occurrences
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
                month_day: row.get::<_, Option<i64>>(3)?,
                year_month: row.get::<_, Option<i64>>(4)?,
                year_day: row.get::<_, Option<i64>>(5)?,
                start_date: row.get(6)?,
                end_date: row.get::<_, Option<i64>>(7)?,
                max_occurrences: row.get::<_, Option<i64>>(8)?,
            })
        },
    )
    .optional()
    .map_err(|e| format!("TODO_CALENDAR_SYNC_FAILED: Failed to query recurrence: {e}"))
}

fn upsert_calendar_group(tx: &Transaction<'_>) -> Result<i64, String> {
    let now = now_millis();
    let system_group_id = tx
        .query_row(
            "SELECT id FROM calendar_group WHERE is_system = 1 ORDER BY id ASC LIMIT 1",
            [],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| {
            format!("TODO_CALENDAR_SYNC_FAILED: Failed to query system calendar group: {e}")
        })?
        .unwrap_or_else(|| {
            tx.execute(
                "
                INSERT INTO calendar_group (name, is_system, order_index, create_time, update_time)
                VALUES (?1, 1, 0, ?2, ?2)
                ",
                params!["系统日历", now],
            )
            .ok();
            tx.last_insert_rowid()
        });

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
        tx.execute(
            "
            UPDATE calendar
            SET color = ?1, archived = 0, visible = 1, order_index = ?2, update_time = ?3
            WHERE id = ?4
            ",
            params![color, order_index, now, id],
        )
        .map_err(|e| {
            format!("TODO_CALENDAR_SYNC_FAILED: Failed to update todo calendar {title}: {e}")
        })?;
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
    let deadline = upsert_calendar(tx, group_id, "截止任务", "red", 0)?;
    let planned = upsert_calendar(tx, group_id, "计划任务", "blue", 1)?;
    let recurring = upsert_calendar(tx, group_id, "周期任务", "green", 2)?;
    Ok(TodoCalendars {
        deadline,
        planned,
        recurring,
    })
}

fn create_calendar_event(tx: &Transaction<'_>, data: &CalendarEventData) -> Result<i64, String> {
    let now = now_millis();
    tx.execute(
        "
        INSERT INTO calendar_event
        (create_time, update_time, calendar_id, title, detail_content_id, start_date, end_date, start_time, end_time, color, all_day, value)
        VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9, NULL)
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
    Ok(tx.last_insert_rowid())
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
        tx.execute(
            "DELETE FROM calendar_event WHERE id = ?1",
            params![event_id],
        )
        .map_err(|e| format!("TODO_CALENDAR_SYNC_FAILED: Failed to delete calendar event: {e}"))?;
    }
    Ok(())
}

fn build_event_for_deadline(
    todo: &TodoRow,
    calendars: &TodoCalendars,
) -> Option<CalendarEventData> {
    let due_at = todo.due_at?;
    let due_date = date_part(due_at);
    let due_minute = minute_of_day(due_at);
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

fn build_event_for_planned(todo: &TodoRow, calendars: &TodoCalendars) -> Option<CalendarEventData> {
    let anchor = todo.start_at.or(todo.due_at)?;
    let start_date = date_part(anchor);
    let due_at = todo.due_at;
    let end_date = due_at.map(date_part).filter(|d| *d != start_date);
    let start_minute = todo.start_at.map(minute_of_day).unwrap_or(0);
    let end_minute = due_at.map(minute_of_day).unwrap_or(0);
    let has_time = start_minute > 0 || end_minute > 0;

    Some(CalendarEventData {
        calendar_id: calendars.planned,
        title: todo.title.clone(),
        detail_content_id: todo.description_content_id.unwrap_or(0),
        start_date,
        end_date,
        start_time: if has_time { Some(start_minute) } else { None },
        end_time: if has_time { Some(end_minute) } else { None },
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

pub fn rematerialize_recurring_item(tx: &Transaction<'_>, todo_item_id: i64) -> Result<(), String> {
    remove_all_by_todo(tx, todo_item_id)?;
    let Some(todo) = load_todo_row(tx, todo_item_id)? else {
        return Ok(());
    };
    if todo.is_archived || todo.item_type != "recurring" {
        return Ok(());
    }
    let Some(recurrence) = load_recurrence(tx, todo.id)? else {
        return Ok(());
    };

    let calendars = ensure_todo_calendars(tx)?;
    let today = start_of_day(now_millis());
    let window_start = today - WINDOW_BEFORE_DAYS * DAY_MS;
    let window_end = today + WINDOW_AFTER_DAYS * DAY_MS;
    let occurrences = generate_occurrences_in_window(&recurrence, window_start, window_end);

    for occurrence in occurrences {
        let event_data = build_event_for_recurring(&todo, &calendars, occurrence);
        let event_id = create_calendar_event(tx, &event_data)?;
        create_mapping(tx, todo.id, event_id, "recurring", Some(occurrence))?;
    }
    Ok(())
}

pub fn sync_single_item(tx: &Transaction<'_>, todo_item_id: i64) -> Result<(), String> {
    let Some(todo) = load_todo_row(tx, todo_item_id)? else {
        return Ok(());
    };
    if todo.is_archived {
        return remove_all_by_todo(tx, todo.id);
    }

    if todo.item_type == "recurring" {
        return rematerialize_recurring_item(tx, todo.id);
    }

    remove_all_by_todo(tx, todo.id)?;
    if todo.item_type == "normal" {
        return Ok(());
    }

    let calendars = ensure_todo_calendars(tx)?;
    let event_data = match todo.item_type.as_str() {
        "deadline" => build_event_for_deadline(&todo, &calendars),
        "planned" => build_event_for_planned(&todo, &calendars),
        _ => None,
    };
    if let Some(data) = event_data {
        let event_id = create_calendar_event(tx, &data)?;
        create_mapping(tx, todo.id, event_id, todo.item_type.as_str(), None)?;
    }
    Ok(())
}
