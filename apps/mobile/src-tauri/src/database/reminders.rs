//! 待办与日程提醒：读写提醒列表，并给系统通知排期列出即将到来的提醒。
//!
//! 待办首个提醒存 `todo_item.remind_before`，其余存 `item_reminder`（owner_type='todo'）；
//! 日程全部存 `item_reminder`（owner_type='event'）。offset = 基准时刻 - 提醒时刻，
//! 全天日程以当天零点为基准。与桌面 `@tau/shared/reminders` 同口径。

use std::collections::{BTreeSet, HashSet};

use chrono::TimeZone;
use rusqlite::{params, Connection, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use super::calendar_holidays::HolidayDays;
use super::calendar_time::CalendarTimeZone;
use super::common::{now_millis, write_operation};
use super::document_task_header::parse as parse_header;
use super::plugin_document_tasks::{document_reminder_access, meta, DocumentReminderAccess};
use super::schema;
use super::todo_calendar_sync::occurrences_for_metadata;

const MINUTE: i64 = 60_000;

fn db_err(code: &str, context: &str, error: impl std::fmt::Display) -> String {
    format!("{code}: {context}: {error}")
}

fn normalize(offsets: &[i64]) -> Vec<i64> {
    let mut list = offsets.to_vec();
    list.sort_unstable();
    list.dedup();
    list
}

pub(super) fn list_owner(
    conn: &Connection,
    owner: &str,
    owner_id: i64,
) -> Result<Vec<i64>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT offset_ms FROM item_reminder WHERE owner_type = ?1 AND owner_id = ?2 ORDER BY offset_ms",
        )
        .map_err(|e| db_err("REMINDER_QUERY_FAILED", "prepare", e))?;
    let rows = stmt
        .query_map(params![owner, owner_id], |row| row.get::<_, i64>(0))
        .map_err(|e| db_err("REMINDER_QUERY_FAILED", "query", e))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| db_err("REMINDER_QUERY_FAILED", "read", e))
}

pub(super) fn replace_owner(
    conn: &Connection,
    owner: &str,
    owner_id: i64,
    offsets: &[i64],
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM item_reminder WHERE owner_type = ?1 AND owner_id = ?2",
        params![owner, owner_id],
    )
    .map_err(|e| db_err("REMINDER_UPDATE_FAILED", "clear", e))?;
    for offset in offsets {
        conn.execute(
            "INSERT INTO item_reminder (owner_type, owner_id, offset_ms) VALUES (?1, ?2, ?3)",
            params![owner, owner_id, offset],
        )
        .map_err(|e| db_err("REMINDER_UPDATE_FAILED", "insert", e))?;
    }
    Ok(())
}

pub(super) fn stored_todo_reminders(conn: &Connection, todo_id: i64) -> Result<Vec<i64>, String> {
    let first: Option<i64> = conn
        .query_row(
            "SELECT remind_before FROM todo_item WHERE id = ?1",
            params![todo_id],
            |row| row.get(0),
        )
        .map_err(|e| db_err("TODO_NOT_FOUND", "read todo", e))?;
    let Some(first) = first else {
        return Ok(vec![]);
    };
    let mut all = list_owner(conn, "todo", todo_id)?;
    all.push(first);
    all.sort_unstable();
    all.dedup();
    Ok(all)
}

/// 先写 remind_before（触发器随之清空追加提醒），再写追加提醒
pub(super) fn set_todo_reminders(
    conn: &Connection,
    todo_id: i64,
    offsets: &[i64],
) -> Result<Vec<i64>, String> {
    let list = normalize(offsets);
    let changed = conn
        .execute(
            "UPDATE todo_item SET remind_before = ?1, update_time = ?2 WHERE id = ?3",
            params![list.first(), now_millis(), todo_id],
        )
        .map_err(|e| db_err("REMINDER_UPDATE_FAILED", "update todo", e))?;
    if changed == 0 {
        return Err("TODO_NOT_FOUND: todo item does not exist".into());
    }
    replace_owner(conn, "todo", todo_id, list.get(1..).unwrap_or(&[]))?;
    Ok(list)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderOwnerPayload {
    pub kind: String,
    pub id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetRemindersPayload {
    pub kind: String,
    pub id: i64,
    pub offsets: Vec<i64>,
    #[serde(default)]
    pub expected_offsets: Option<Vec<i64>>,
}

fn owner_type(kind: &str) -> Result<&'static str, String> {
    match kind {
        "todo" => Ok("todo"),
        "event" => Ok("event"),
        _ => Err(format!("REMINDER_INVALID_KIND: {kind}")),
    }
}

pub(super) fn reminder_set_in_tx(
    tx: &Transaction<'_>,
    payload: &SetRemindersPayload,
) -> Result<Vec<i64>, String> {
    match owner_type(&payload.kind)? {
        "todo" => {
            if let Some(expected) = payload.expected_offsets.as_deref() {
                let current = stored_todo_reminders(tx, payload.id)?;
                if normalize(&current) != normalize(expected) {
                    return Err("REMINDER_CONFLICT: reminders changed externally".into());
                }
            }
            let list = set_todo_reminders(tx, payload.id, &payload.offsets)?;
            write_operation(tx, "todo", "update", 0, now_millis())?;
            Ok(list)
        }
        owner => {
            if let Some(expected) = payload.expected_offsets.as_deref() {
                let current = list_owner(tx, owner, payload.id)?;
                if normalize(&current) != normalize(expected) {
                    return Err("REMINDER_CONFLICT: reminders changed externally".into());
                }
            }
            let list = normalize(&payload.offsets);
            replace_owner(tx, owner, payload.id, &list)?;
            write_operation(tx, "calendar_event", "update", payload.id, now_millis())?;
            Ok(list)
        }
    }
}

#[tauri::command]
pub fn reminder_document_access(
    app: AppHandle,
    content_id: i64,
) -> Result<DocumentReminderAccess, String> {
    let conn = schema::open_active_database(&app)?;
    document_reminder_access(&conn, content_id)
}

#[tauri::command]
pub fn reminder_list(app: AppHandle, payload: ReminderOwnerPayload) -> Result<Vec<i64>, String> {
    let conn = schema::open_active_database(&app)?;
    match owner_type(&payload.kind)? {
        "todo" => stored_todo_reminders(&conn, payload.id),
        owner => list_owner(&conn, owner, payload.id),
    }
}

#[tauri::command]
pub fn reminder_set(app: AppHandle, payload: SetRemindersPayload) -> Result<Vec<i64>, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| db_err("REMINDER_UPDATE_FAILED", "begin transaction", e))?;
    let list = reminder_set_in_tx(&tx, &payload)?;
    tx.commit()
        .map_err(|e| db_err("REMINDER_UPDATE_FAILED", "commit transaction", e))?;
    Ok(list)
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpcomingReminder {
    /// 稳定身份，前缀即归属：`todo:<id>:<offset>`、`todo:<id>:<offset>:<原定日>`（周期）、
    /// `event:<id>:<offset>`、`doc:<内容 id>:<待办 id>:<原定日或 once>:<提醒时刻>`
    pub key: String,
    /// 归属：`todo:<id>` / `event:<id>` / `doc:<内容 id>:<待办 id>`
    pub owner: String,
    pub kind: String,
    /// 待办 / 日程 id；文档待办为所在内容 id
    pub owner_id: i64,
    /// 文档待办的待办 id
    pub task_id: Option<String>,
    pub title: String,
    /// 截止时间 / 日程开始时间（全天为当天零点）；没有截止时间的文档待办为 None
    pub anchor: Option<i64>,
    pub remind_at: i64,
    pub all_day: bool,
    pub end_at: Option<i64>,
    /// 周期实例：不能从通知直接「完成」（要按实例打卡），只提供稍后与查看
    pub recurring: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpcomingReminders {
    pub items: Vec<UpcomingReminder>,
    /// 仍然有效的提醒归属，不受时间窗与条数限制；原生侧据此丢弃已完成或已删除事项的「稍后提醒」
    pub owners: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpcomingPayload {
    pub from: i64,
    pub to: i64,
    pub limit: usize,
}

struct Window {
    from: i64,
    to: i64,
}

impl Window {
    fn push(&self, list: &mut Vec<UpcomingReminder>, item: UpcomingReminder) {
        if item.remind_at > self.from && item.remind_at <= self.to {
            list.push(item);
        }
    }
}

fn parse_time(value: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|time| time.timestamp_millis())
}

fn open_occurrences(
    metadata: &Value,
    start: i64,
    end: i64,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<std::collections::BTreeMap<i64, i64>, String> {
    let mut occurrences =
        occurrences_for_metadata(metadata, start, end, zone, holidays)?.unwrap_or_default();
    if let Some(segments) = metadata["segments"].as_array() {
        occurrences.retain(|original, _| {
            let date = super::plugin_task_dates::day_text(*original);
            let series = segments
                .iter()
                .rev()
                .find(|segment| {
                    segment["effectiveDate"]
                        .as_str()
                        .is_some_and(|d| d <= date.as_str())
                })
                .and_then(|segment| segment["seriesId"].as_str())
                .unwrap_or("");
            metadata["occurrenceState"][format!("{series}/{date}")]["completedAt"].is_null()
        });
    }
    Ok(occurrences)
}

fn deadline_todos(
    conn: &Connection,
    window: &Window,
    list: &mut Vec<UpcomingReminder>,
    owners: &mut BTreeSet<String>,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.title, t.due_at, t.remind_before, r.offset_ms
             FROM todo_item t LEFT JOIN item_reminder r ON r.owner_type = 'todo' AND r.owner_id = t.id
             WHERE t.type = 'deadline' AND t.is_completed = 0 AND t.is_archived = 0
               AND t.due_at IS NOT NULL AND t.remind_before IS NOT NULL",
        )
        .map_err(|e| db_err("REMINDER_QUERY_FAILED", "prepare todos", e))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, Option<i64>>(4)?,
            ))
        })
        .map_err(|e| db_err("REMINDER_QUERY_FAILED", "query todos", e))?;
    let mut seen = HashSet::new();
    for row in rows {
        let (id, title, due, first, extra) =
            row.map_err(|e| db_err("REMINDER_QUERY_FAILED", "read todos", e))?;
        owners.insert(format!("todo:{id}"));
        // 每行带出首个提醒；LEFT JOIN 让有追加提醒的待办出现多行，首个只记一次
        for offset in std::iter::once(first).chain(extra) {
            if !seen.insert((id, offset)) {
                continue;
            }
            window.push(
                list,
                UpcomingReminder {
                    key: format!("todo:{id}:{offset}"),
                    owner: format!("todo:{id}"),
                    kind: "todo".into(),
                    owner_id: id,
                    task_id: None,
                    title: title.clone(),
                    anchor: Some(due),
                    remind_at: due - offset,
                    all_day: false,
                    end_at: None,
                    recurring: false,
                },
            );
        }
    }
    Ok(())
}

fn recurring_reminder_at(day: i64, offset: i64, zone: CalendarTimeZone) -> Option<i64> {
    if !(-86_399_999..=0).contains(&offset) {
        return None;
    }
    let date = chrono::NaiveDate::from_ymd_opt(1970, 1, 1)? + chrono::Duration::days(day);
    let local = date.and_hms_opt(0, 0, 0)? - chrono::Duration::milliseconds(offset);
    zone.0
        .from_local_datetime(&local)
        .earliest()
        .map(|t| t.timestamp_millis())
}

/// 周期待办：remind_before 为当次所在日内的时刻（负数，与桌面同口径），已打卡的实例不提醒
fn recurring_todos(
    tx: &Transaction<'_>,
    window: &Window,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
    list: &mut Vec<UpcomingReminder>,
    owners: &mut BTreeSet<String>,
) -> Result<(), String> {
    let rows: Vec<(i64, String, i64)> = {
        let mut stmt = tx
            .prepare(
                "SELECT id, title, remind_before FROM todo_item
                 WHERE type = 'recurring' AND is_archived = 0 AND remind_before IS NOT NULL",
            )
            .map_err(|e| db_err("REMINDER_QUERY_FAILED", "prepare recurring", e))?;
        let rows = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .map_err(|e| db_err("REMINDER_QUERY_FAILED", "query recurring", e))?;
        rows.collect::<Result<_, _>>()
            .map_err(|e| db_err("REMINDER_QUERY_FAILED", "read recurring", e))?
    };
    let (start_day, end_day) = (zone.day(window.from) - 1, zone.day(window.to) + 1);
    for (id, title, first) in rows {
        let mut offsets = list_owner(tx, "todo", id)?;
        offsets.push(first);
        let offsets = normalize(&offsets);
        owners.insert(format!("todo:{id}"));
        let Ok(occurrences) = super::plugin_tasks::metadata_by_id(tx, id, zone)
            .and_then(|metadata| open_occurrences(&metadata, start_day, end_day, zone, holidays))
        else {
            continue;
        };
        for (original, actual) in occurrences {
            let anchor = zone.day_start(actual);
            for &offset in &offsets {
                let Some(remind_at) = recurring_reminder_at(actual, offset, zone) else {
                    continue;
                };
                window.push(
                    list,
                    UpcomingReminder {
                        key: format!("todo:{id}:{offset}:{original}"),
                        owner: format!("todo:{id}"),
                        kind: "todo".into(),
                        owner_id: id,
                        task_id: None,
                        title: title.clone(),
                        anchor: Some(anchor),
                        remind_at,
                        all_day: true,
                        end_at: None,
                        recurring: true,
                    },
                );
            }
        }
    }
    Ok(())
}

fn events(
    conn: &Connection,
    window: &Window,
    list: &mut Vec<UpcomingReminder>,
    owners: &mut BTreeSet<String>,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.title, e.start_date, e.start_time, e.end_date, e.end_time, e.all_day, r.offset_ms,e.start_utc_ms,e.end_utc_ms
             FROM item_reminder r JOIN calendar_event e ON r.owner_type = 'event' AND r.owner_id = e.id
             WHERE e.todo_item_id IS NULL",
        )
        .map_err(|e| db_err("REMINDER_QUERY_FAILED", "prepare events", e))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, Option<i64>>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, Option<i64>>(6)?.unwrap_or(0) != 0,
                row.get::<_, i64>(7)?,
                row.get::<_, Option<i64>>(8)?,
                row.get::<_, Option<i64>>(9)?,
            ))
        })
        .map_err(|e| db_err("REMINDER_QUERY_FAILED", "query events", e))?;
    for row in rows {
        let (
            id,
            title,
            start_date,
            start_time,
            end_date,
            end_time,
            all_day,
            offset,
            start_ms,
            end_ms,
        ) = row.map_err(|e| db_err("REMINDER_QUERY_FAILED", "read events", e))?;
        owners.insert(format!("event:{id}"));
        let all_day = all_day || start_time.is_none();
        let anchor = start_ms.unwrap_or(
            start_date
                + if all_day {
                    0
                } else {
                    start_time.unwrap_or(0) * MINUTE
                },
        );
        let end_at = match (all_day, end_time) {
            (false, Some(end)) => {
                Some(end_ms.unwrap_or(end_date.unwrap_or(start_date) + end * MINUTE))
            }
            _ => None,
        };
        window.push(
            list,
            UpcomingReminder {
                key: format!("event:{id}:{offset}"),
                owner: format!("event:{id}"),
                kind: "event".into(),
                owner_id: id,
                task_id: None,
                title,
                anchor: Some(anchor),
                remind_at: anchor - offset,
                all_day,
                end_at,
                recurring: false,
            },
        );
    }
    Ok(())
}

/// 正文里的单次提醒按绝对时间送达；周期提醒按每个未完成实例当日的钟点送达。
/// 排除的文档与已提升为独立待办的条目不提醒（与桌面文档待办口径一致）。
fn document_tasks(
    conn: &Connection,
    window: &Window,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
    list: &mut Vec<UpcomingReminder>,
    owners: &mut BTreeSet<String>,
) -> Result<(), String> {
    let nodes: Vec<(i64, String)> = {
        let mut stmt = conn
            .prepare(
                "SELECT c.id, j.value FROM
                   (SELECT id, content FROM content_snapshots WHERE instr(content, '\"taskReminder\"') > 0) c,
                   json_tree(CASE WHEN json_valid(c.content) THEN c.content ELSE '[]' END) j
                 WHERE j.type = 'object'
                   AND json_extract(j.value, '$.type') = 'check-list-item'
                   AND COALESCE(json_extract(j.value, '$.taskId'), '') <> ''
                   AND json_type(j.value, '$.taskReminder') = 'object'
                   AND COALESCE(json_extract(j.value, '$.taskArchived'), 0) = 0",
            )
            .map_err(|e| db_err("REMINDER_QUERY_FAILED", "prepare documents", e))?;
        let rows = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| db_err("REMINDER_QUERY_FAILED", "query documents", e))?;
        rows.collect::<Result<_, _>>()
            .map_err(|e| db_err("REMINDER_QUERY_FAILED", "read documents", e))?
    };
    let (start_day, end_day) = (zone.day(window.from) - 1, zone.day(window.to) + 1);
    let mut access_by_content = std::collections::HashMap::new();
    for (content, raw) in nodes {
        let Ok(node) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        let Some(task) = node["taskId"].as_str() else {
            continue;
        };
        // 解析失败（结构损坏、未知周期规则）的条目跳过，不影响其他提醒
        let access = match access_by_content.entry(content) {
            std::collections::hash_map::Entry::Occupied(entry) => entry.into_mut(),
            std::collections::hash_map::Entry::Vacant(entry) => {
                entry.insert(document_reminder_access(conn, content)?)
            }
        };
        if !access.allows(task) {
            continue;
        }
        let Ok(reminders) = super::plugin_task_recurrence::read_document_reminders(&node, zone)
        else {
            continue;
        };
        let Ok(metadata) = meta(&node) else {
            continue;
        };
        let Ok((title, _, _, due)) = parse_header(conn, &node) else {
            continue;
        };
        let owner = format!("doc:{content}:{task}");
        let segments = metadata["segments"].as_array().cloned().unwrap_or_default();
        if segments.is_empty() {
            if node["checked"] == true {
                continue;
            }
            owners.insert(owner.clone());
            let (anchor, all_day) = match due.as_deref() {
                Some(value) if value.len() == 10 => (
                    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
                        .ok()
                        .map(|date| {
                            zone.day_start(
                                date.signed_duration_since(
                                    chrono::NaiveDate::from_ymd_opt(1970, 1, 1).unwrap(),
                                )
                                .num_days(),
                            )
                        }),
                    true,
                ),
                Some(value) => (parse_time(value), false),
                None => (None, false),
            };
            for configured in reminders
                .iter()
                .filter_map(|r| r["at"].as_str().and_then(parse_time))
            {
                window.push(
                    list,
                    UpcomingReminder {
                        key: format!("{owner}:once:{configured}"),
                        owner: owner.clone(),
                        kind: "doc".into(),
                        owner_id: content,
                        task_id: Some(task.to_owned()),
                        title: title.clone(),
                        anchor,
                        remind_at: configured,
                        all_day,
                        end_at: None,
                        recurring: false,
                    },
                );
            }
            continue;
        }
        owners.insert(owner.clone());
        let Ok(occurrences) = open_occurrences(&metadata, start_day, end_day, zone, holidays)
        else {
            continue;
        };
        for (original, actual) in occurrences {
            let anchor = zone.day_start(actual);
            for offset in reminders.iter().filter_map(|r| r["offsetMs"].as_i64()) {
                let Some(remind_at) = recurring_reminder_at(actual, offset, zone) else {
                    continue;
                };
                window.push(
                    list,
                    UpcomingReminder {
                        key: format!("{owner}:{original}:{offset}"),
                        owner: owner.clone(),
                        kind: "doc".into(),
                        owner_id: content,
                        task_id: Some(task.to_owned()),
                        title: title.clone(),
                        anchor: Some(anchor),
                        remind_at,
                        all_day: true,
                        end_at: None,
                        recurring: true,
                    },
                );
            }
        }
    }
    Ok(())
}

/// (from, to] 区间内待送达的提醒，按时间升序截断到 limit。
/// 包含截止任务、周期待办、独立日程（待办安排出的日程跟随待办自身的提醒）与正文待办。
pub(crate) fn upcoming(
    tx: &Transaction<'_>,
    from: i64,
    to: i64,
    limit: usize,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<UpcomingReminders, String> {
    let window = Window { from, to };
    let mut list = Vec::new();
    let mut owners = BTreeSet::new();
    deadline_todos(tx, &window, &mut list, &mut owners)?;
    recurring_todos(tx, &window, zone, holidays, &mut list, &mut owners)?;
    events(tx, &window, &mut list, &mut owners)?;
    document_tasks(tx, &window, zone, holidays, &mut list, &mut owners)?;
    list.sort_by(|a, b| {
        a.remind_at
            .cmp(&b.remind_at)
            .then_with(|| a.key.cmp(&b.key))
    });
    list.truncate(limit);
    Ok(UpcomingReminders {
        items: list,
        owners: owners.into_iter().collect(),
    })
}

/// 有「排除节假日」的周期规则时才取节假日（网络 + 缓存），没有就不发请求
fn needs_holidays(conn: &Connection) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM todo_recurrence r JOIN todo_item t ON t.id = r.todo_item_id
           WHERE r.exclude_holidays = 1 AND t.type = 'recurring' AND t.remind_before IS NOT NULL)
         OR EXISTS(SELECT 1 FROM todo_recurrence_history WHERE instr(COALESCE(rule_json, ''), '\"excludeHolidays\":true') > 0)
         OR EXISTS(SELECT 1 FROM content_snapshots WHERE instr(content, '\"taskReminder\"') > 0 AND instr(content, '\"excludeHolidays\":true') > 0)",
        [],
        |row| row.get(0),
    )
    .map_err(|e| db_err("REMINDER_QUERY_FAILED", "check holiday rules", e))
}

#[tauri::command]
pub async fn reminder_upcoming(
    app: AppHandle,
    payload: UpcomingPayload,
    time_zone: CalendarTimeZone,
) -> Result<UpcomingReminders, String> {
    // 连接不跨 await 持有（非 Send）
    let check = {
        let conn = schema::open_active_database(&app)?;
        needs_holidays(&conn)?
    };
    let holidays = if check {
        // 节假日不可用时按无节假日排期，不让整轮提醒失败
        super::calendar_holidays::load_holidays(&app, payload.from, payload.to, time_zone)
            .await
            .unwrap_or_default()
    } else {
        HolidayDays::new()
    };
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| db_err("REMINDER_QUERY_FAILED", "begin transaction", e))?;
    let result = upcoming(
        &tx,
        payload.from,
        payload.to,
        payload.limit,
        time_zone,
        &holidays,
    )?;
    tx.commit()
        .map_err(|e| db_err("REMINDER_QUERY_FAILED", "commit transaction", e))?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::database::migrator::ensure_main_schema(&conn).unwrap();
        conn.execute_batch(
            "INSERT INTO todo_group(id,title,create_time,update_time) VALUES(1,'测试',1,1);
             INSERT INTO todo_item(id,group_id,title,type,due_at,create_time,update_time)
               VALUES(1,1,'交报告','deadline',100000000,1,1);
             INSERT INTO calendar(id,create_time,update_time,title,color) VALUES(1,1,1,'工作','blue');
             INSERT INTO calendar_event(id,create_time,update_time,calendar_id,title,start_date,start_time,end_time,all_day)
               VALUES(1,1,1,1,'评审会',86400000,840,930,0);",
        )
        .unwrap();
        conn
    }

    #[test]
    fn todo_keeps_first_in_column_and_legacy_single_write_drops_extras() {
        let conn = db();
        assert_eq!(
            set_todo_reminders(&conn, 1, &[86_400_000, 900_000, 900_000]).unwrap(),
            vec![900_000, 86_400_000]
        );
        let first: i64 = conn
            .query_row("SELECT remind_before FROM todo_item WHERE id=1", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(first, 900_000);
        assert_eq!(
            stored_todo_reminders(&conn, 1).unwrap(),
            vec![900_000, 86_400_000]
        );
        // 只认 remind_before 的老写入方改首个提醒：追加提醒随之失效
        conn.execute(
            "UPDATE todo_item SET remind_before = 300000 WHERE id = 1",
            [],
        )
        .unwrap();
        assert_eq!(stored_todo_reminders(&conn, 1).unwrap(), vec![300_000]);
        conn.execute("DELETE FROM todo_item WHERE id = 1", [])
            .unwrap();
        assert!(list_owner(&conn, "todo", 1).unwrap().is_empty());
    }

    const UTC: CalendarTimeZone = CalendarTimeZone(chrono_tz::UTC);
    const DAY: i64 = 86_400_000;

    fn run(conn: &mut Connection, from: i64, to: i64, limit: usize) -> UpcomingReminders {
        let tx = conn.transaction().unwrap();
        upcoming(&tx, from, to, limit, UTC, &HolidayDays::new()).unwrap()
    }

    #[test]
    fn upcoming_lists_todo_and_event_reminders_in_window() {
        let mut conn = db();
        let offsets = serde_json::json!([
            {"offsetMs": 900_000}, {"offsetMs": 0}, {"offsetMs": 300_000},
            {"offsetMs": 3_600_000}, {"offsetMs": 900_000}
        ]);
        let tx = conn.transaction().unwrap();
        for owner in ["todo", "event"] {
            super::super::plugin_schedule_data::set_reminders(&tx, owner, 1, &offsets, true)
                .unwrap();
        }
        tx.commit().unwrap();
        let expected = [0, 300_000, 900_000, 3_600_000];
        assert_eq!(stored_todo_reminders(&conn, 1).unwrap(), expected);
        assert_eq!(list_owner(&conn, "event", 1).unwrap(), expected);

        let start = DAY + 840 * MINUTE;
        let result = run(&mut conn, 0, 10 * DAY, 10);
        assert_eq!(result.owners, vec!["event:1", "todo:1"]);
        let keys: Vec<_> = result.items.iter().map(|item| item.key.as_str()).collect();
        assert_eq!(
            keys,
            vec![
                "todo:1:3600000",
                "todo:1:900000",
                "todo:1:300000",
                "todo:1:0",
                "event:1:3600000",
                "event:1:900000",
                "event:1:300000",
                "event:1:0"
            ]
        );
        let event = result.items.last().unwrap();
        assert_eq!(event.remind_at, start);
        assert_eq!(event.end_at, Some(DAY + 930 * MINUTE));
        assert_eq!(run(&mut conn, 0, 10 * DAY, 1).items.len(), 1);
        conn.execute("UPDATE todo_item SET is_completed = 1 WHERE id = 1", [])
            .unwrap();
        let after = run(&mut conn, 0, 10 * DAY, 10);
        assert_eq!(after.items.len(), expected.len());
        assert_eq!(after.owners, vec!["event:1"]);
    }

    #[test]
    fn local_reminders_follow_the_clock_across_dst_changes() {
        let zone = CalendarTimeZone(chrono_tz::America::New_York);
        let spring = super::super::plugin_task_dates::day("2026-03-08").unwrap();
        let autumn = super::super::plugin_task_dates::day("2026-11-01").unwrap();
        assert_eq!(recurring_reminder_at(spring, -150 * MINUTE, zone), None);
        assert_eq!(
            recurring_reminder_at(spring, -540 * MINUTE, zone),
            parse_time("2026-03-08T13:00:00Z")
        );
        assert_eq!(
            recurring_reminder_at(autumn, -90 * MINUTE, zone),
            parse_time("2026-11-01T05:30:00Z")
        );
    }

    #[test]
    fn recurring_todo_reminds_each_open_day_at_its_clock() {
        let mut conn = db();
        // 每天早晚各提醒一次，第 2 天已打卡
        conn.execute_batch(
            "INSERT INTO todo_item(id,group_id,title,type,remind_before,create_time,update_time)
               VALUES(2,1,'喝水','recurring',-32400000,1,1);
             INSERT INTO item_reminder(owner_type,owner_id,offset_ms) VALUES('todo',2,-72000000);
             INSERT INTO todo_recurrence(id,todo_item_id,type,interval,start_date,create_time,update_time)
               VALUES(1,2,'daily',1,0,1,1);
             INSERT INTO todo_recurrence_completion(recurrence_id,scheduled_date,completed_at,skipped,create_time)
               VALUES(1,172800000,1,0,1);",
        )
        .unwrap();
        let result = run(&mut conn, 0, 4 * DAY - 1, 50);
        let days: Vec<_> = result
            .items
            .iter()
            .filter(|item| item.owner == "todo:2")
            .map(|item| (item.remind_at, item.recurring))
            .collect();
        let at = |day: i64, hour: i64| (day * DAY + hour * 3_600_000, true);
        assert_eq!(
            days,
            vec![
                at(0, 9),
                at(0, 20),
                at(1, 9),
                at(1, 20),
                at(3, 9),
                at(3, 20)
            ]
        );
    }

    #[test]
    fn document_task_reminder_skips_checked_and_excluded() {
        let mut conn = db();
        let node = |checked: bool| {
            serde_json::json!([{"type":"check-list-item","checked":checked,"taskId":"t1",
              "taskReminder":{"version":1,"at":"1970-01-03T08:00:00Z"},
              "children":[{"type":"paragraph","children":[{"text":"写周报"}]}]}])
            .to_string()
        };
        conn.execute(
            "INSERT INTO contents(id,create_time,update_time,content) VALUES(7,1,1,?1)",
            [node(false)],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO cards(id,create_time,update_time,content_id) VALUES(1,1,1,7)",
            [],
        )
        .unwrap();
        let docs = |conn: &mut Connection| {
            run(conn, 0, 10 * DAY, 50)
                .items
                .into_iter()
                .filter(|item| item.kind == "doc")
                .collect::<Vec<_>>()
        };
        let found = docs(&mut conn);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].owner, "doc:7:t1");
        assert_eq!(found[0].remind_at, 2 * DAY + 8 * 3_600_000);
        assert_eq!(found[0].title, "写周报");
        let mut body: Value = serde_json::from_str(&node(false)).unwrap();
        body[0]["taskReminder"] = serde_json::json!({"version":2,"reminders":[
            {"at":"1970-01-03T08:00:00Z"},{"at":"1970-01-03T20:00:00Z"}]});
        conn.execute(
            "UPDATE contents SET content=?1 WHERE id=7",
            [body.to_string()],
        )
        .unwrap();
        let added = docs(&mut conn);
        assert_eq!(
            added.iter().map(|r| r.remind_at).collect::<Vec<_>>(),
            vec![2 * DAY + 8 * 3_600_000, 2 * DAY + 20 * 3_600_000]
        );
        assert_ne!(added[0].key, added[1].key);
        body[0]["taskReminder"] = serde_json::json!({"version":2,"reminders":[
            {"offsetMs":-28800000},{"offsetMs":-72000000}]});
        body[0]["taskRecurrence"] = serde_json::json!({"version":1,"segments":[{"seriesId":"s","effectiveDate":"1970-01-03","rule":{"type":"daily","interval":1,"startDate":"1970-01-03","endDate":"1970-01-04"}}]});
        body[0]["taskOccurrenceState"] = serde_json::json!({"s/1970-01-03":{"completedAt":1}});
        conn.execute(
            "UPDATE contents SET content=?1 WHERE id=7",
            [body.to_string()],
        )
        .unwrap();
        let next = docs(&mut conn);
        assert_eq!(
            next.iter().map(|r| r.remind_at).collect::<Vec<_>>(),
            vec![3 * DAY + 8 * 3_600_000, 3 * DAY + 20 * 3_600_000]
        );
        assert_ne!(next[0].key, next[1].key);
        body[0]["taskReminder"] = serde_json::json!({"version":1,"at":"1970-01-03T08:00:00Z"});
        conn.execute(
            "UPDATE contents SET content=?1 WHERE id=7",
            [body.to_string()],
        )
        .unwrap();
        assert_eq!(
            docs(&mut conn)
                .iter()
                .map(|r| r.remind_at)
                .collect::<Vec<_>>(),
            vec![3 * DAY + 8 * 3_600_000]
        );

        conn.execute("UPDATE contents SET content=?1 WHERE id=7", [node(true)])
            .unwrap();
        assert!(docs(&mut conn).is_empty());
        conn.execute("UPDATE contents SET content=?1 WHERE id=7", [node(false)])
            .unwrap();
        conn.execute(
            "INSERT INTO doc_task_settings(content_id,task_id,kind,create_time) VALUES(7,'','excluded',1)",
            [],
        )
        .unwrap();
        assert!(docs(&mut conn).is_empty());
    }

    #[test]
    fn reminder_set_rejects_stale_expected_offsets_without_overwriting() {
        let mut conn = db();
        let tx = conn.transaction().unwrap();
        let initial = stored_todo_reminders(&tx, 1).unwrap();
        let first = reminder_set_in_tx(
            &tx,
            &SetRemindersPayload {
                kind: "todo".into(),
                id: 1,
                offsets: vec![-28_800_000, -72_000_000],
                expected_offsets: Some(initial.clone()),
            },
        )
        .unwrap();
        assert_eq!(first, vec![-72_000_000, -28_800_000]);

        let conflict = reminder_set_in_tx(
            &tx,
            &SetRemindersPayload {
                kind: "todo".into(),
                id: 1,
                offsets: vec![-28_800_000],
                expected_offsets: Some(initial),
            },
        );
        assert!(conflict.unwrap_err().starts_with("REMINDER_CONFLICT:"));
        assert_eq!(
            stored_todo_reminders(&tx, 1).unwrap(),
            vec![-72_000_000, -28_800_000]
        );
        tx.commit().unwrap();
    }

    #[test]
    fn legacy_doc_walkthrough_and_todo_type_switch_clear_incompatible_reminders() {
        let mut conn = db();
        // 老笔记单条 08:00 → 加 20:00 → 改 19:30 → 删 08:00，最终只为 19:30 排期
        let mut body = serde_json::json!([{
            "type": "check-list-item",
            "checked": false,
            "taskId": "legacy-doc",
            "taskReminder": {"version": 1, "at": "1970-01-03T08:00:00Z"},
            "children": [{"type": "paragraph", "children": [{"text": "老笔记"}]}]
        }]);
        conn.execute(
            "INSERT INTO contents(id,create_time,update_time,content) VALUES(9,1,1,?1)",
            [body.to_string()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO cards(id,create_time,update_time,content_id) VALUES(2,1,1,9)",
            [],
        )
        .unwrap();
        body[0]["taskReminder"] = serde_json::json!({
            "version": 2,
            "reminders": [
                {"at": "1970-01-03T08:00:00Z"},
                {"at": "1970-01-03T20:00:00Z"}
            ]
        });
        conn.execute(
            "UPDATE contents SET content=?1 WHERE id=9",
            [body.to_string()],
        )
        .unwrap();
        body[0]["taskReminder"] = serde_json::json!({
            "version": 2,
            "reminders": [{"at": "1970-01-03T19:30:00Z"}]
        });
        conn.execute(
            "UPDATE contents SET content=?1 WHERE id=9",
            [body.to_string()],
        )
        .unwrap();
        let scheduled: Vec<_> = run(&mut conn, 0, 10 * DAY, 50)
            .items
            .into_iter()
            .filter(|item| item.owner == "doc:9:legacy-doc")
            .map(|item| item.remind_at)
            .collect();
        assert_eq!(scheduled, vec![2 * DAY + (19 * 60 + 30) * MINUTE]);

        // 独立待办切换类型清空不兼容提醒
        let tx = conn.transaction().unwrap();
        set_todo_reminders(&tx, 1, &[-28_800_000, -72_000_000]).unwrap();
        let payload: super::super::todo::UpdateTodoItemPayload =
            serde_json::from_value(serde_json::json!({"id": 1, "type": "recurring"})).unwrap();
        let updated =
            super::super::todo::update_item_in_tx(&tx, &payload, CalendarTimeZone(chrono_tz::UTC))
                .unwrap();
        assert_eq!(updated.r#type, "recurring");
        assert_eq!(updated.remind_before, None);
        assert!(list_owner(&tx, "todo", 1).unwrap().is_empty());
        tx.commit().unwrap();
    }
}
