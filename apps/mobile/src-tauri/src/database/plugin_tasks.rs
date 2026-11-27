use super::{
    assistant_tasks, calendar_holidays::HolidayDays, calendar_time::CalendarTimeZone, common,
    plugin_data::sql_error, plugin_task_dates as dates, plugin_task_snapshots as snapshots,
    todo_calendar_sync,
};
use rusqlite::{params, Connection, Transaction};
use serde_json::{json, Value};
use tauri::{AppHandle, WebviewWindow};

#[derive(Clone, Debug)]
pub(super) enum TaskId {
    Todo(i64, i64, Option<String>),
    Document(i64, i64, String, Option<String>),
}
pub(super) fn encode_task_component(value: &str) -> String {
    if !value.starts_with('~')
        && !value
            .chars()
            .any(|c| matches!(c, '@' | '\n' | '\r' | '\u{2028}' | '\u{2029}'))
    {
        return value.to_owned();
    }
    format!(
        "~{}",
        value
            .as_bytes()
            .iter()
            .map(|byte| format!("{byte:02X}"))
            .collect::<String>()
    )
}
fn decode_task_component(value: &str) -> String {
    let Some(hex) = value.strip_prefix('~').filter(|v| {
        !v.is_empty()
            && v.len() % 2 == 0
            && v.bytes()
                .all(|b| b.is_ascii_digit() || (b'A'..=b'F').contains(&b))
    }) else {
        return value.into();
    };
    let bytes = (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16))
        .collect::<Result<Vec<_>, _>>();
    if let Ok(bytes) = bytes {
        if let Ok(decoded) = String::from_utf8(bytes) {
            if encode_task_component(&decoded) == value {
                return decoded;
            }
        }
    }
    value.into()
}
pub(super) fn document_key(content: i64, created: i64, task: &str) -> String {
    let component = encode_task_component(task);
    if component == task {
        format!("document:{content}:{created}:{task}")
    } else {
        format!("document:v2:{content}:{created}:{}", &component[1..])
    }
}
pub(super) fn parse_task(value: &str) -> Result<TaskId, String> {
    let (base, occurrence) = if let Some((base, date)) = value
        .rsplit_once('@')
        .filter(|(_, date)| dates::day(date).is_ok())
    {
        (base, Some(date.to_owned()))
    } else {
        (value, None)
    };
    if let Some(encoded) = base.strip_prefix("document:v2:") {
        let parts = encoded.splitn(3, ':').collect::<Vec<_>>();
        if parts.len() != 3 {
            return Err("待办身份无效".into());
        }
        let id = parts[0].parse::<i64>().map_err(|_| "待办身份无效")?;
        let created = parts[1].parse::<i64>().map_err(|_| "待办身份无效")?;
        let component = format!("~{}", parts[2]);
        let task = decode_task_component(&component);
        if id <= 0 || created < 0 || encode_task_component(&task) != component {
            return Err("待办身份无效".into());
        }
        return Ok(TaskId::Document(id, created, task, occurrence));
    }
    let parts = base.splitn(4, ':').collect::<Vec<_>>();
    if parts.len() < 3 {
        return Err("待办身份无效".into());
    }
    let id = parts[1].parse::<i64>().map_err(|_| "待办身份无效")?;
    let created = parts[2].parse::<i64>().map_err(|_| "待办身份无效")?;
    if id <= 0 || created < 0 {
        return Err("待办身份无效".into());
    }
    match parts[0] {
        "todo" if parts.len() == 3 => Ok(TaskId::Todo(id, created, occurrence)),
        "document" if parts.len() == 4 && !parts[3].is_empty() => Ok(TaskId::Document(
            id,
            created,
            parts[3].to_owned(),
            occurrence,
        )),
        _ => Err("待办身份无效".into()),
    }
}
fn parent_todo(conn: &Connection, value: &Value) -> Result<Option<(i64, i64)>, String> {
    if value.is_null() {
        return Ok(None);
    }
    let TaskId::Todo(id, created, None) = parse_task(value.as_str().ok_or("父待办身份无效")?)?
    else {
        return Err("父项必须是独立待办".into());
    };
    let row = todo_row(conn, id, created)?;
    Ok(Some((id, row["group_id"].as_i64().ok_or("父项缺少清单")?)))
}

fn start_time(value: &Value, zone: CalendarTimeZone) -> Result<Option<i64>, String> {
    if value.is_null() {
        Ok(None)
    } else {
        dates::timestamp(value.as_str().ok_or("开始时刻无效")?, zone).map(Some)
    }
}

fn todo_row(conn: &Connection, id: i64, created: i64) -> Result<Value, String> {
    let row = snapshots::row(conn, "todo_item", id)?.ok_or("待办已删除")?;
    if row["create_time"] != created {
        return Err("待办身份已变化".into());
    }
    Ok(row)
}
pub(super) fn metadata(
    conn: &Connection,
    row: &Value,
    zone: CalendarTimeZone,
) -> Result<Value, String> {
    metadata_by_id(conn, row["id"].as_i64().ok_or("待办身份无效")?, zone)
}
pub(super) fn metadata_by_id(
    conn: &Connection,
    id: i64,
    zone: CalendarTimeZone,
) -> Result<Value, String> {
    let mut result = assistant_tasks::recurrence_state(conn, id)?;
    if let Some(rule) =
        snapshots::rows(conn, "todo_recurrence", "todo_item_id=?1", vec![id.into()])?.first()
    {
        let series = format!("recurrence:{}:{}", rule["id"], rule["create_time"]);
        if result["segments"].as_array().is_some_and(|v| v.is_empty()) {
            let prefix = format!("native:{}:{}/", rule["id"], rule["create_time"]);
            if let Some(states) = result["occurrenceState"].as_object_mut() {
                let keys = states
                    .keys()
                    .filter(|k| k.starts_with(&prefix))
                    .cloned()
                    .collect::<Vec<_>>();
                for key in keys {
                    if let Some(state) = states.remove(&key) {
                        let date = &key[prefix.len()..];
                        states.entry(format!("{series}/{date}")).or_insert(state);
                    }
                }
            }
        }
        let start = dates::day_text(zone.day(rule["start_date"].as_i64().ok_or("周期起点无效")?));
        let rule_value = json!({"type":rule["type"],"interval":rule["interval"],"startDate":start,"endDate":rule["end_date"].as_i64().map(|value|dates::day_text(zone.day(value))),"weekdays":rule["weekdays"].as_str().and_then(|raw|serde_json::from_str::<Value>(raw).ok()),"monthDay":rule["month_day"],"yearMonth":rule["year_month"],"yearDay":rule["year_day"],"maxOccurrences":rule["max_occurrences"],"excludeHolidays":rule["exclude_holidays"]==1});
        if result["segments"].as_array().is_none_or(|v| v.is_empty()) {
            result["segments"] =
                json!([{"seriesId":series,"effectiveDate":start,"rule":rule_value}]);
        }
        for completion in snapshots::rows(
            conn,
            "todo_recurrence_completion",
            "recurrence_id=?1",
            vec![rule["id"].as_i64().ok_or("周期身份无效")?.into()],
        )? {
            let date = dates::day_text(
                zone.day(
                    completion["scheduled_date"]
                        .as_i64()
                        .ok_or("实例日期无效")?,
                ),
            );
            let series = result["segments"]
                .as_array()
                .and_then(|v| {
                    v.iter().rev().find(|s| {
                        s["effectiveDate"]
                            .as_str()
                            .is_some_and(|d| d <= date.as_str())
                    })
                })
                .and_then(|s| s["seriesId"].as_str())
                .unwrap_or(&series);
            let key = format!("{series}/{date}");
            if result["occurrenceState"].get(&key).is_none() {
                result["occurrenceState"][key] = json!({"completedAt":completion["completed_at"],"skipped":completion["skipped"]==1});
            }
        }
    }
    if let Some(segments) = result["segments"].as_array_mut() {
        for segment in segments {
            if !segment["rule"].is_null() {
                segment["rule"] = super::plugin_task_recurrence::normalize_rule(&segment["rule"]);
            }
        }
    }
    Ok(result)
}
pub(super) fn occurrence(
    metadata: &Value,
    date: &str,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<(String, Value), String> {
    let day = dates::day(date)?;
    let segments = metadata["segments"].as_array().ok_or("周期规则缺失")?;
    let segment = segments
        .iter()
        .rev()
        .find(|segment| {
            segment["effectiveDate"]
                .as_str()
                .is_some_and(|start| start <= date)
        })
        .ok_or("实例不属于周期规则")?;
    if segment["rule"].is_null() {
        return Err("该日期已停止重复".into());
    }
    let series = segment["seriesId"]
        .as_str()
        .ok_or("周期身份缺失")?
        .to_owned();
    let key = format!("{series}/{date}");
    let state = metadata["occurrenceState"]
        .get(&key)
        .cloned()
        .unwrap_or(json!({}));
    let mut base = metadata.clone();
    base["occurrenceState"] = json!({});
    let matches = todo_calendar_sync::occurrences_for_metadata(&base, day, day, zone, holidays)?
        .unwrap_or_default();
    if !matches.contains_key(&day) {
        return Err("该日期不是有效原始周期实例".into());
    }
    Ok((series, state))
}
fn normalize_tags<'a>(tags: impl Iterator<Item = &'a str>) -> Vec<&'a str> {
    let mut seen = std::collections::HashSet::new();
    // Match JavaScript String.trim so synchronized tag names have the same identity.
    tags.map(|tag| {
        tag.trim_matches(|c: char| (c.is_whitespace() && c != '\u{0085}') || c == '\u{feff}')
    })
    .filter(|tag| !tag.is_empty() && seen.insert(*tag))
    .collect()
}

fn todo_metadata(fields: &Value) -> Result<(Option<&str>, Option<String>), String> {
    let priority = fields
        .get("priority")
        .map(|value| {
            value
                .as_str()
                .filter(|p| matches!(*p, "none" | "low" | "medium" | "high"))
                .ok_or("待办优先级无效")
        })
        .transpose()?;
    let tags = fields
        .get("tags")
        .map(|value| -> Result<String, String> {
            let tags: Vec<String> =
                serde_json::from_value(value.clone()).map_err(|_| "待办标签必须是文本数组")?;
            Ok(json!(normalize_tags(tags.iter().map(String::as_str))).to_string())
        })
        .transpose()?;
    Ok((priority, tags))
}

pub(super) fn task_dto(
    conn: &Connection,
    row: &Value,
    date: Option<&str>,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    let id = row["id"].as_i64().ok_or("待办身份无效")?;
    let created = row["create_time"].as_i64().ok_or("待办身份无效")?;
    let meta = metadata_by_id(conn, id, zone)?;
    let mut title = json!({"id":format!("todo:{id}:{created}"),"title":row["title"],"completed":row["is_completed"]==1,"archived":row["is_archived"]==1,"dueAt":row["due_at"].as_i64().map(dates::iso).transpose()?});
    let mut snapshot = snapshots::capture_todo(conn, id)?;
    if let Some(date) = date {
        let (series, state) = occurrence(&meta, date, zone, holidays)?;
        title["id"] = json!(format!("todo:{id}:{created}@{date}"));
        title["completed"] = json!(!state["completedAt"].is_null());
        title["dueAt"] = state
            .get("scheduledAt")
            .filter(|value| !value.is_null())
            .cloned()
            .unwrap_or(json!(date));
        title["occurrence"] = json!({"taskId":format!("todo:{id}:{created}"),"seriesId":series,"originalDate":date,"state":state});
    } else {
        let children=snapshots::rows(conn,"todo_item","id IN (WITH RECURSIVE nested(id) AS (SELECT id FROM todo_item WHERE parent_id=?1 UNION SELECT t.id FROM todo_item t JOIN nested n ON t.parent_id=n.id) SELECT id FROM nested LIMIT 1001)",vec![id.into()])?;
        if children.len() > 1000 {
            return Err("待办子项超过操作预算".into());
        }
        if !children.is_empty() {
            snapshot["descendants"] = json!(children);
        }
    }
    let tags = row["tags"]
        .as_str()
        .and_then(|raw| serde_json::from_str::<Vec<Value>>(raw).ok())
        .unwrap_or_default();
    title["tags"] = json!(normalize_tags(tags.iter().filter_map(Value::as_str)));
    title["priority"] = row["priority"].clone();
    title["listId"] = json!(row["group_id"].as_i64().ok_or("清单身份无效")?.to_string());
    if date.is_none() && row["type"] == "recurring" {
        title["completed"] = json!(false);
    }
    title["reminders"] = super::plugin_schedule_data::reminders(conn, "todo", id)?;
    title["recurrence"] = if meta["segments"]
        .as_array()
        .is_some_and(|segments| !segments.is_empty())
    {
        json!({"segments":meta["segments"]})
    } else {
        Value::Null
    };
    title["writable"] = json!(super::todo::is_writable_group(
        conn,
        row["group_id"].as_i64().ok_or("清单身份无效")?
    )?);
    let description = row["description_content_id"]
        .as_i64()
        .filter(|id| *id > 0)
        .map(|id| super::query::query_content_detail(conn, id))
        .transpose()?;
    let mut version = title.clone();
    if let Some(body) = &description {
        version["descriptionRevision"] = json!([body.revision, body.content]);
    }
    title["descriptionRef"] =
        json!(description.map(|body| format!("{}:{}", body.content_id, body.create_time)));
    title["startAt"] = json!(row["start_at"].as_i64().map(dates::iso).transpose()?);
    let parent = row["parent_id"]
        .as_i64()
        .map(|id| snapshots::row(conn, "todo_item", id))
        .transpose()?
        .flatten();
    title["parentId"] =
        json!(parent.map(|row| format!("todo:{}:{}", row["id"], row["create_time"])));

    version["descendants"] = super::plugin_schedule_data::semantic(&snapshot);
    title["revision"] = json!(snapshots::digest(&version));
    title["completedAt"] =
        if date.is_none() && row["type"] != "recurring" && row["is_completed"] == 1 {
            row["completed_at"].clone()
        } else {
            Value::Null
        };
    Ok(title)
}
fn window_meta(
    meta: &Value,
    range: (i64, i64),
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Vec<String>, String> {
    Ok(todo_calendar_sync::occurrences_for_metadata(
        meta,
        zone.day(range.0),
        zone.day(range.1 - 1),
        zone,
        holidays,
    )?
    .unwrap_or_default()
    .keys()
    .map(|day| dates::day_text(*day))
    .collect())
}
fn filter_task(
    task: &Value,
    query: &Value,
    zone: CalendarTimeZone,
    range: Option<(i64, i64)>,
) -> Result<bool, String> {
    if query["archived"].as_bool().unwrap_or(false) != (task["archived"] == true) {
        return Ok(false);
    }
    if query["listId"]
        .as_str()
        .is_some_and(|id| task["listId"].as_str() != Some(id))
    {
        return Ok(false);
    }
    if query["completed"]
        .as_bool()
        .is_some_and(|value| task["completed"] != value)
    {
        return Ok(false);
    }
    if let Some(keyword) = query["keyword"].as_str() {
        if !task["title"]
            .as_str()
            .unwrap_or("")
            .to_lowercase()
            .contains(&keyword.to_lowercase())
        {
            return Ok(false);
        }
    }
    if let Some((start, end)) = range {
        let Some(due) = task["dueAt"].as_str() else {
            return Ok(false);
        };
        let time = dates::timestamp(due, zone)?;
        if time < start || time >= end {
            return Ok(false);
        }
    }
    Ok(true)
}
fn limit(query: &Value) -> Result<usize, String> {
    let size = query["limit"].as_u64().unwrap_or(50);
    if size == 0 || size > 100 {
        return Err("每页须为 1–100 条".into());
    }
    Ok(size as usize)
}
fn cursor(
    query: &Value,
    zone: CalendarTimeZone,
    kind: &str,
) -> Result<(String, usize, usize), String> {
    let mut filter = query.clone();
    if let Some(fields) = filter.as_object_mut() {
        fields.remove("cursor");
        fields.remove("limit");
    }
    let fingerprint = snapshots::digest(&json!([kind, zone.0.name(), filter]));
    if let Some(raw) = query["cursor"].as_str() {
        let (key, offset, inner): (String, usize, usize) =
            serde_json::from_str(raw).map_err(|_| "分页游标无效")?;
        if key != fingerprint || offset > 1_000_000 || inner > 10000 {
            return Err("分页条件已变化".into());
        }
        Ok((fingerprint, offset, inner))
    } else {
        Ok((fingerprint, 0, 0))
    }
}
pub(super) fn query_tasks(
    conn: &Connection,
    query: &Value,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    let expanded = query["view"] == "occurrences";
    let range = dates::window(query, zone, expanded)?;
    let size = limit(query)?;
    let (fingerprint, mut position, mut inner) = cursor(query, zone, "todos")?;
    let requested_source = query["source"].as_str().unwrap_or("all");
    let parent = query
        .get("parentId")
        .map(
            |value| match parse_task(value.as_str().ok_or("父项身份无效")?)? {
                TaskId::Todo(id, created, None) => Ok((id, created)),
                _ => Err(String::from("父项必须是独立待办")),
            },
        )
        .transpose()?;
    if parent.is_some() && requested_source == "document" {
        return Ok(json!({"items":[]}));
    }
    let source = if parent.is_some() {
        "todo"
    } else {
        requested_source
    };
    let mut items = vec![];
    let mut examined = 0;
    loop {
        let candidates = super::plugin_document_tasks::candidates(
            conn,
            source,
            position,
            100,
            query["archived"].as_bool().unwrap_or(false),
            parent,
        )?;
        if candidates.is_empty() {
            return Ok(json!({"items":items}));
        }
        for candidate in candidates {
            let values = if candidate["source"] == "todo" {
                let row = &candidate["row"];
                if expanded {
                    window_meta(
                        &metadata(conn, row, zone)?,
                        range.ok_or("实例查询缺少窗口")?,
                        zone,
                        holidays,
                    )?
                    .iter()
                    .map(|date| task_dto(conn, row, Some(date), zone, holidays))
                    .collect::<Result<Vec<_>, _>>()?
                } else {
                    vec![task_dto(conn, row, None, zone, holidays)?]
                }
            } else {
                super::plugin_document_tasks::query_candidate(
                    conn, &candidate, query, zone, holidays,
                )?
            };
            for (index, value) in values.iter().enumerate().skip(inner) {
                if filter_task(value, query, zone, range)? {
                    items.push(value.clone());
                }
                if items.len() == size {
                    let next = if index + 1 < values.len() {
                        (fingerprint, position, index + 1)
                    } else {
                        (fingerprint, position + 1, 0)
                    };
                    return Ok(
                        json!({"items":items,"cursor":serde_json::to_string(&next).map_err(|e|e.to_string())?}),
                    );
                }
            }
            inner = 0;
            position += 1;
            examined += 1;
            if examined >= 2000 {
                return Ok(
                    json!({"items":items,"cursor":serde_json::to_string(&(fingerprint,position,0)).map_err(|e|e.to_string())?}),
                );
            }
        }
    }
}
pub(super) fn event_dto(
    conn: &Connection,
    row: &Value,
    zone: CalendarTimeZone,
) -> Result<Value, String> {
    let id = row["id"].as_i64().ok_or("日程身份无效")?;
    let (start, end) = dates::event_times(row, zone)?;
    let mut result = json!({"id":format!("{id}:{}",row["create_time"]),"revision":snapshots::digest(&snapshots::capture_events(conn,&[id])?),"title":row["title"],"calendarId":row["calendar_id"].as_i64().ok_or("日历身份无效")?.to_string(),"start":start,"end":end,"allDay":row["all_day"]==1});
    let linked = snapshots::rows(
        conn,
        "doc_task_calendar_link",
        "calendar_event_id=?1",
        vec![id.into()],
    )?;
    if let Some(link) = linked.first() {
        result["todoId"] = json!(document_key(
            link["content_id"].as_i64().ok_or("正文身份无效")?,
            link["content_created_at"].as_i64().ok_or("正文身份无效")?,
            link["task_id"].as_str().ok_or("正文待办身份无效")?
        ));
    } else {
        let mapping = snapshots::rows(
            conn,
            "todo_calendar_mapping",
            "calendar_event_id=?1",
            vec![id.into()],
        )?;
        if let Some(todo) = row["todo_item_id"]
            .as_i64()
            .or_else(|| mapping.first().and_then(|row| row["todo_item_id"].as_i64()))
        {
            if let Some(task) = snapshots::row(conn, "todo_item", todo)? {
                result["todoId"] = json!(format!("todo:{todo}:{}", task["create_time"]));
            }
        }
    }
    if let Some(base) = result["todoId"].as_str().map(str::to_owned) {
        let direct = snapshots::rows(
            conn,
            "doc_task_calendar_link",
            "calendar_event_id=?1",
            vec![id.into()],
        )?;
        let scheduled = snapshots::rows(
            conn,
            "todo_schedule_occurrence",
            "calendar_event_id=?1",
            vec![id.into()],
        )?;
        let mapped = snapshots::rows(
            conn,
            "todo_calendar_mapping",
            "calendar_event_id=?1",
            vec![id.into()],
        )?;
        let date = direct
            .first()
            .or(scheduled.first())
            .and_then(|row| row["occurrence_date"].as_str())
            .map(str::to_owned)
            .or_else(|| {
                mapped
                    .first()
                    .filter(|row| row["sync_type"] == "recurring")
                    .and_then(|row| row["recurrence_date"].as_i64())
                    .map(|value| dates::day_text(zone.day(value)))
            });
        if let Some(date) = date {
            result["todoId"] = json!(format!("{base}@{date}"));
        }
    }
    result["reminders"] = super::plugin_schedule_data::reminders(conn, "event", id)?;
    result["writable"] = json!(super::calendar::get_calendar_directory(
        conn,
        row["calendar_id"].as_i64().ok_or("日历身份无效")?
    )?
    .is_some_and(|calendar| calendar.writable));
    if result["writable"] != true {
        result["readonlyReason"] = json!("系统日历或已归档日历不可写");
    }
    result["kind"] = json!(if result.get("todoId").is_some() {
        "todo-schedule"
    } else {
        "event"
    });
    let notes = row["detail_content_id"]
        .as_i64()
        .filter(|id| *id > 0)
        .map(|content| super::query::query_content_detail(conn, content))
        .transpose()?;
    result["notesRef"] = notes
        .as_ref()
        .map(|notes| json!(format!("{}:{}", notes.content_id, notes.create_time)))
        .unwrap_or(Value::Null);
    if row["start_time_zone"].is_string() {
        result["startTimeZone"] = row["start_time_zone"].clone();
        if row["end_time_zone"].is_string() {
            result["endTimeZone"] = row["end_time_zone"].clone();
        }
    }
    let mut version = result.clone();
    version
        .as_object_mut()
        .map(|fields| fields.remove("revision"));
    version["notesContent"] = notes
        .as_ref()
        .map(|notes| notes.content.clone())
        .unwrap_or(Value::Null);
    version["notesRevision"] = notes
        .as_ref()
        .map(|notes| json!(notes.revision))
        .unwrap_or(Value::Null);
    result["revision"] = json!(snapshots::digest(&version));
    Ok(result)
}
pub(super) fn query_calendar(
    conn: &mut Connection,
    query: &Value,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    if query["view"] == "stored" {
        return super::plugin_schedule_data::stored_events(conn, query, zone);
    }
    let range = dates::window(query, zone, true)?.ok_or("日程查询缺少窗口")?;
    if range.0 == range.1 {
        return Ok(json!({"items":[]}));
    }
    let size = limit(query)?;
    let (fingerprint, offset, virtual_offset) = cursor(query, zone, "calendar")?;
    let tx = conn.transaction().map_err(sql_error)?;
    let calendars = todo_calendar_sync::ensure_todo_calendars(&tx)?;
    let mut stmt=tx.prepare("SELECT id FROM calendar_event WHERE COALESCE(start_utc_ms,start_date)<?2 AND COALESCE(end_utc_ms,start_utc_ms,end_date,start_date)>=?1 AND NOT EXISTS(SELECT 1 FROM todo_calendar_mapping m WHERE m.calendar_event_id=calendar_event.id AND m.sync_type='recurring') ORDER BY COALESCE(start_utc_ms,start_date+COALESCE(start_time,0)*60000),id LIMIT 2001 OFFSET ?3").map_err(sql_error)?;
    let ids = stmt
        .query_map(
            params![
                zone.start_of_day(range.0),
                zone.day_start(zone.day(range.1 - 1) + 1),
                offset as i64
            ],
            |row| row.get::<_, i64>(0),
        )
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    drop(stmt);
    let mut scanned = offset;
    let mut physical = vec![];
    for id in ids.iter().take(2000) {
        let row = snapshots::row(&tx, "calendar_event", *id)?.ok_or("日程已变化")?;
        let value = event_dto(&tx, &row, zone)?;
        scanned += 1;
        if query["calendarIds"]
            .as_array()
            .is_some_and(|ids| !ids.contains(&value["calendarId"]))
        {
            continue;
        }
        let from = dates::timestamp(value["start"].as_str().ok_or("时间无效")?, zone)?;
        let to = dates::timestamp(value["end"].as_str().ok_or("时间无效")?, zone)?;
        if from < range.1 && (to > range.0 || (from == to && from >= range.0)) {
            physical.push((value, false, scanned));
        }
        if physical.len() > size {
            break;
        }
    }
    let mut virtuals = vec![];
    for view in ["tasks", "occurrences"] {
        let mut query = json!({"source":if view=="occurrences"{"all"}else{"document"},"view":view,"nonRecurring":view=="tasks","start":dates::day_text(zone.day(range.0)),"end":dates::day_text(zone.day(range.1-1)),"limit":100});
        let mut pages = 0;
        loop {
            let batch = query_tasks(&tx, &query, zone, holidays)?;
            for task in batch["items"].as_array().into_iter().flatten() {
                let Some(due) = task["dueAt"].as_str() else {
                    continue;
                };
                let start = zone.start_of_day(dates::timestamp(due, zone)?);
                let end = zone.day_start(zone.day(start) + 1);
                if start >= range.1 || end <= range.0 {
                    continue;
                }
                let negative =
                    -(i64::from_str_radix(&snapshots::digest(&json!([task["id"], due]))[..12], 16)
                        .map_err(|_| "标记身份无效")?
                        + 1);
                virtuals.push(json!({"id":format!("{negative}:0"),"revision":task["revision"],"title":task["title"],"start":dates::day_text(zone.day(start)),"end":dates::day_text(zone.day(end)),"allDay":true,"reminders":[],"notesRef":null,"writable":false,"readonlyReason":"系统任务标记不可写","kind":"virtual","calendarId":if view=="occurrences"{calendars.recurring.to_string()}else{calendars.deadline.to_string()},"todoId":task["id"]}));
            }
            pages += 1;
            if batch.get("cursor").is_none() {
                break;
            }
            if pages >= 20 {
                return Err("正文任务标记超过查询预算，请缩小范围".into());
            }
            query["cursor"] = batch["cursor"].clone();
        }
    }
    virtuals.sort_by(|a, b| {
        a["start"]
            .as_str()
            .cmp(&b["start"].as_str())
            .then(a["id"].as_str().cmp(&b["id"].as_str()))
    });
    virtuals.retain(|event| {
        query["calendarIds"]
            .as_array()
            .is_none_or(|ids| ids.contains(&event["calendarId"]))
    });
    let mut combined = physical.clone();
    combined.extend(
        virtuals
            .iter()
            .enumerate()
            .skip(virtual_offset)
            .take(size + 1)
            .map(|(index, value)| (value.clone(), true, index + 1)),
    );
    combined.sort_by(|a, b| {
        dates::timestamp(a.0["start"].as_str().unwrap_or(""), zone)
            .unwrap_or(0)
            .cmp(&dates::timestamp(b.0["start"].as_str().unwrap_or(""), zone).unwrap_or(0))
            .then(a.0["id"].as_str().cmp(&b.0["id"].as_str()))
    });
    let mut next_physical = if physical.is_empty() { scanned } else { offset };
    let mut next_virtual = virtual_offset;
    let mut items = vec![];
    for (value, virtual_item, next) in combined.iter().take(size) {
        if *virtual_item {
            next_virtual = *next;
        } else {
            next_physical = *next;
        }
        items.push(value.clone());
    }
    let mut result = json!({"items":items});
    if combined.len() > size || scanned - offset < ids.len() || next_virtual < virtuals.len() {
        result["cursor"] =
            json!(
                serde_json::to_string(&(fingerprint, next_physical, next_virtual))
                    .map_err(|e| e.to_string())?
            );
    }
    tx.commit().map_err(sql_error)?;
    Ok(result)
}
fn assert_revision(expected: &Value, current: &Value) -> Result<(), String> {
    if expected.as_str() != current["revision"].as_str() {
        return Err("PLUGIN_CONFLICT: 待办或日程已变化，请重新读取".into());
    }
    Ok(())
}
fn active_recurrence(metadata: &Value, zone: CalendarTimeZone) -> bool {
    let today = dates::day_text(zone.day(common::now_millis()));
    metadata["segments"]
        .as_array()
        .and_then(|segments| {
            segments.iter().rev().find(|segment| {
                segment["effectiveDate"]
                    .as_str()
                    .is_some_and(|date| date <= today.as_str())
            })
        })
        .is_some_and(|segment| !segment["rule"].is_null())
}
fn update_instance(
    tx: &Transaction<'_>,
    row: &Value,
    date: &str,
    action: &str,
    input: &Value,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<(), String> {
    let meta = metadata(tx, row, zone)?;
    let (series, mut state) = occurrence(&meta, date, zone, holidays)?;
    match action {
        "state" => {
            state = super::plugin_task_recurrence::patch_state(&state, &input["patch"], zone)?;
        }
        "complete" => {
            state["completedAt"] = if input["completed"] == true {
                json!(common::now_millis())
            } else {
                Value::Null
            };
            state["skipped"] = json!(false);
        }
        "delete" => {
            state["skipped"] = json!(true);
            state["completedAt"] = Value::Null;
        }
        "update" => {
            if input["patch"]
                .as_object()
                .is_none_or(|p| p.keys().any(|k| k != "dueAt"))
            {
                return Err("实例标题跟随系列；修改标题请使用系列 ID".into());
            }
            let due = input["patch"].get("dueAt").ok_or("实例改期须给出 dueAt")?;
            if let Some(value) = due.as_str() {
                dates::timestamp(value, zone)?;
            } else if !due.is_null() {
                return Err("实例改期时间无效".into());
            }
            state["scheduledAt"] = due.clone();
        }
        _ => return Err("不支持的周期操作".into()),
    }
    tx.execute("INSERT INTO todo_occurrence_override VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(todo_item_id,todo_created_at,series_id,occurrence_date) DO UPDATE SET state_json=excluded.state_json,update_time=excluded.update_time",params![row["id"].as_i64(),row["create_time"].as_i64(),series,date,state.to_string(),common::now_millis()]).map_err(sql_error)?;
    if let Some(rule) = snapshots::rows(
        tx,
        "todo_recurrence",
        "todo_item_id=?1",
        vec![row["id"].as_i64().ok_or("待办身份无效")?.into()],
    )?
    .first()
    {
        if action != "update" {
            tx.execute("INSERT INTO todo_recurrence_completion(recurrence_id,scheduled_date,completed_at,skipped,create_time) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(recurrence_id,scheduled_date) DO UPDATE SET completed_at=excluded.completed_at,skipped=excluded.skipped",params![rule["id"].as_i64(),zone.day_start(dates::day(date)?),state["completedAt"].as_i64(),state["skipped"]==true,common::now_millis()]).map_err(sql_error)?;
        }
    }
    if action != "complete" {
        let task = row["id"].as_i64().ok_or("待办身份无效")?;
        let markers = snapshots::rows(
            tx,
            "todo_calendar_mapping",
            "todo_item_id=?1 AND sync_type='recurring' AND recurrence_date=?2",
            vec![task.into(), zone.day_start(dates::day(date)?).into()],
        )?;
        for marker in markers {
            let event = marker["calendar_event_id"].as_i64().ok_or("标记身份无效")?;
            tx.execute("DELETE FROM calendar_event WHERE id=?1", [event])
                .map_err(sql_error)?;
            tx.execute(
                "DELETE FROM todo_calendar_mapping WHERE calendar_event_id=?1",
                [event],
            )
            .map_err(sql_error)?;
        }
    }
    Ok(())
}
pub(super) fn write_todo(
    conn: &mut Connection,
    plugin: &str,
    write: &Value,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    let action = write["action"].as_str().ok_or("待办动作无效")?;
    if action != "create"
        && matches!(
            parse_task(write["id"].as_str().ok_or("待办身份无效")?)?,
            TaskId::Document(..)
        )
    {
        return super::plugin_document_tasks::write_local(conn, plugin, write, zone, holidays);
    }
    let tx = conn.transaction().map_err(sql_error)?;
    let now = common::now_millis();
    if action == "create" {
        if let Some(result) =
            super::plugin_schedule_data::replay(&tx, plugin, write, zone, holidays)?
        {
            return Ok(result);
        }
    }
    let result = if action == "create" {
        super::todo::ensure_system_groups(&tx)?;
        let input = &write["input"];
        let parent = parent_todo(&tx, &input["parentId"])?;
        let group: i64 = if let Some(id) = input["listId"].as_str() {
            id.parse().map_err(|_| "清单身份无效")?
        } else if let Some((_, group)) = parent {
            group
        } else {
            tx.query_row("SELECT id FROM todo_group WHERE is_system=1 AND system_type='normal' AND is_archived=0 ORDER BY id LIMIT 1",[],|row|row.get(0)).map_err(sql_error)?
        };
        if !super::todo::is_writable_group(&tx, group)? {
            return Err("清单不存在或已归档".into());
        }
        if parent.is_some_and(|(_, parent_group)| parent_group != group) {
            return Err("父待办必须属于目标清单".into());
        }
        let parent_id = parent.map(|(id, _)| id);
        let start = start_time(&input["startAt"], zone)?;
        let description = write
            .get("preparedDescription")
            .map(|body| super::plugin_data::create_content_input(&tx, plugin, body))
            .transpose()?;
        if input.get("description").is_some() && description.is_none() {
            return Err("待办描述尚未准备".into());
        }
        let due = dates::deadline(&input["dueAt"], zone)?;
        let id = assistant_tasks::next_id(&tx, "todo_item")?;
        let (priority, tags) = todo_metadata(input)?;
        tx.execute("INSERT INTO todo_item(id,group_id,title,type,due_at,create_time,update_time,parent_id,start_at,description_content_id,priority,tags,sort_index)
            VALUES(?1,?2,?3,?4,?5,?6,?6,?7,?8,?9,?10,?11,COALESCE((SELECT MAX(sort_index)+1024 FROM todo_item WHERE group_id=?2 AND parent_id IS ?7),1024))",
            params![id,group,input["title"].as_str().ok_or("缺少标题")?,if due.is_some(){"deadline"}else{"normal"},due,now,parent_id,start,description,priority.unwrap_or("none"),tags.as_deref().unwrap_or("[]")]).map_err(sql_error)?;
        let recurring = write["input"].get("recurrence").is_some();
        if let Some(rule) = write["input"].get("recurrence") {
            let segments = super::plugin_task_recurrence::amend(
                &json!([]),
                rule["startDate"].as_str().ok_or("规则起点缺失")?,
                rule,
            )?;
            super::plugin_task_recurrence::store(
                &tx,
                &todo_row(&tx, id, now)?,
                &segments,
                &json!({}),
                zone,
            )?;
        }
        if let Some(reminders) = write["input"].get("reminders") {
            if recurring
                && reminders.as_array().is_some_and(|v| {
                    v.iter().any(|r| {
                        r["offsetMs"]
                            .as_i64()
                            .is_none_or(|n| !(-86_399_999..=0).contains(&n))
                    })
                })
            {
                return Err("周期提醒需要当日偏移".into());
            }
            super::plugin_schedule_data::set_reminders(
                &tx,
                "todo",
                id,
                reminders,
                due.is_some() || recurring,
            )?;
        }
        todo_calendar_sync::sync_single_item(&tx, id, zone)?;
        common::write_operation(&tx, "todo", "insert", id, now)?;
        task_dto(&tx, &todo_row(&tx, id, now)?, None, zone, holidays)?
    } else {
        let TaskId::Todo(id, created, date) =
            parse_task(write["id"].as_str().ok_or("待办身份无效")?)?
        else {
            unreachable!()
        };
        let row = todo_row(&tx, id, created)?;
        let current = task_dto(&tx, &row, date.as_deref(), zone, holidays)?;
        assert_revision(&write["expectedRevision"], &current)?;
        if current["writable"] != true {
            return Err("待办所属清单不可写".into());
        }
        if action == "update"
            && current["descriptionRef"].is_string()
            && write["patch"] == json!({"ensureDescription":true})
            && date.is_none()
        {
            return Ok(current);
        }
        let completed_at = write
            .get("completedAt")
            .map(|value| {
                if action != "complete"
                    || write["completed"] != true
                    || date.is_some()
                    || row["type"] == "recurring"
                {
                    return Err("仅完成普通独立待办时可指定完成时间".to_string());
                }
                value
                    .as_i64()
                    .filter(|v| (-8_640_000_000_000_000..=8_640_000_000_000_000).contains(v))
                    .ok_or_else(|| "完成时间必须是有效的 Unix 毫秒整数".to_string())
            })
            .transpose()?;
        let before = if matches!(action, "delete" | "state" | "recurrence") {
            Some(snapshots::capture_todo(&tx, id)?)
        } else {
            None
        };
        if let Some(date) = &date {
            update_instance(&tx, &row, date, action, write, zone, holidays)?;
        } else {
            match action {
                "recurrence" => {
                    let metadata = metadata_by_id(&tx, id, zone)?;
                    if metadata["segments"]
                        .as_array()
                        .is_some_and(|v| v.is_empty())
                        && write["change"]["rule"].is_null()
                    {
                        return Err("普通待办没有可停止的重复规则".into());
                    }
                    if metadata["segments"]
                        .as_array()
                        .is_some_and(|v| v.is_empty())
                        && !super::reminders::stored_todo_reminders(&tx, id)?.is_empty()
                    {
                        return Err("请先清空普通待办提醒，再设置重复规则".into());
                    }
                    let segments = super::plugin_task_recurrence::amend(
                        &metadata["segments"],
                        write["change"]["effectiveFrom"]
                            .as_str()
                            .ok_or("生效日期缺失")?,
                        &write["change"]["rule"],
                    )?;
                    if segments == metadata["segments"] {
                        return Ok(current);
                    }
                    super::plugin_task_recurrence::store(
                        &tx,
                        &row,
                        &segments,
                        &metadata["occurrenceState"],
                        zone,
                    )?;
                }
                "state" => return Err("实例操作需要实例身份".into()),
                "update" => {
                    let patch = &write["patch"];
                    if patch.get("parentId").is_some() || patch.get("listId").is_some() {
                        let parent = parent_todo(&tx, &patch["parentId"])?;
                        let old_group = row["group_id"].as_i64().ok_or("缺少清单")?;
                        let group = patch["listId"]
                            .as_str()
                            .map(str::parse::<i64>)
                            .transpose()
                            .map_err(|_| "清单身份无效")?
                            .or(parent.map(|(_, group)| group))
                            .unwrap_or(old_group);
                        if !super::todo::is_writable_group(&tx, group)? {
                            return Err("清单不存在或已归档".into());
                        }
                        if parent.is_some_and(|(_, g)| g != group) {
                            return Err("父待办必须属于目标清单".into());
                        }
                        let parent_id = if patch.get("parentId").is_none() && group == old_group {
                            row["parent_id"].as_i64()
                        } else {
                            parent.map(|(id, _)| id)
                        };
                        if parent_id.is_some() && tx.query_row("WITH RECURSIVE nested(id) AS (SELECT ?1 UNION SELECT t.id FROM todo_item t JOIN nested n ON t.parent_id=n.id) SELECT EXISTS(SELECT 1 FROM nested WHERE id=?2)",params![id,parent_id],|r| r.get::<_,bool>(0)).map_err(sql_error)? {
                            return Err("不能将待办移动到自身或子项之下".into());
                        }
                        super::todo::move_and_reorder_in_tx(
                            &tx,
                            &super::todo::MoveAndReorderPayload {
                                id,
                                to_group_id: group,
                                to_parent_id: parent_id,
                                before_id: None,
                                after_id: None,
                            },
                        )?;
                        if group != old_group {
                            tx.execute("WITH RECURSIVE nested(id) AS (SELECT id FROM todo_item WHERE parent_id=?1 UNION SELECT t.id FROM todo_item t JOIN nested n ON t.parent_id=n.id) UPDATE todo_item SET group_id=?2,update_time=?3 WHERE id IN (SELECT id FROM nested)",params![id,group,now]).map_err(sql_error)?;
                        }
                    }
                    if let Some(start) = patch.get("startAt") {
                        tx.execute(
                            "UPDATE todo_item SET start_at=?1 WHERE id=?2",
                            params![start_time(start, zone)?, id],
                        )
                        .map_err(sql_error)?;
                    }
                    if patch["ensureDescription"] == true
                        && row["description_content_id"].as_i64().unwrap_or(0) == 0
                    {
                        let content = super::plugin_data::create_content_input(
                            &tx,
                            plugin,
                            write.get("preparedDescription").ok_or("待办描述尚未准备")?,
                        )?;
                        tx.execute(
                            "UPDATE todo_item SET description_content_id=?1 WHERE id=?2",
                            params![content, id],
                        )
                        .map_err(sql_error)?;
                    }
                    let due = if patch.get("dueAt").is_some() {
                        dates::deadline(&patch["dueAt"], zone)?
                    } else {
                        row["due_at"].as_i64()
                    };
                    let recurring = row["type"] == "recurring";
                    let (priority, tags) = todo_metadata(patch)?;
                    tx.execute("UPDATE todo_item SET title=?1,due_at=?2,type=?3,priority=COALESCE(?6,priority),tags=COALESCE(?7,tags),remind_before=CASE WHEN ?2 IS NULL AND ?3<>'recurring' THEN NULL ELSE remind_before END,update_time=MAX(update_time+1,?4) WHERE id=?5",params![patch["title"].as_str().unwrap_or(row["title"].as_str().unwrap_or("")),due,if recurring{"recurring"}else if due.is_some(){"deadline"}else{"normal"},now,id,priority,tags]).map_err(sql_error)?;
                    if let Some(reminders) = patch.get("reminders") {
                        if recurring
                            && reminders.as_array().is_some_and(|v| {
                                v.iter().any(|r| {
                                    r["offsetMs"]
                                        .as_i64()
                                        .is_none_or(|n| !(-86_399_999..=0).contains(&n))
                                })
                            })
                        {
                            return Err("周期提醒需要当日偏移".into());
                        }
                        super::plugin_schedule_data::set_reminders(
                            &tx,
                            "todo",
                            id,
                            reminders,
                            due.is_some() || recurring,
                        )?;
                    }
                    tx.execute("UPDATE calendar_event SET title=?1,update_time=MAX(update_time+1,?2) WHERE todo_item_id=?3",params![patch["title"].as_str().unwrap_or(row["title"].as_str().unwrap_or("")),now,id]).map_err(sql_error)?;
                    todo_calendar_sync::sync_single_item(&tx, id, zone)?;
                }
                "complete" => {
                    let completed = write["completed"].as_bool().ok_or("完成状态无效")?;
                    let correcting = completed && row["is_completed"] == 1;
                    let affected = if correcting {
                        vec![row.clone()]
                    } else {
                        snapshots::rows(
                            &tx,
                            "todo_item",
                            "id IN (WITH RECURSIVE descendants(id) AS (
                                SELECT ?1 UNION SELECT t.id FROM todo_item t
                                JOIN descendants d ON t.parent_id=d.id
                            ) SELECT id FROM descendants LIMIT 1001)",
                            vec![id.into()],
                        )?
                    };
                    if affected.len() > 1000 {
                        return Err("子待办超过单次操作预算".into());
                    }
                    for task in affected {
                        if task["type"] == "recurring"
                            || active_recurrence(&metadata(&tx, &task, zone)?, zone)
                        {
                            return Err("周期待办须指定实例，不能整系列或连同子项完成".into());
                        }
                        let previous = task["completed_at"].as_i64();
                        let was_completed = task["is_completed"] == 1;
                        let mut time = if completed { Some(now) } else { None };
                        if completed && was_completed {
                            time = previous;
                        }
                        if task["id"] == id && completed_at.is_some() {
                            time = completed_at;
                        }
                        if was_completed != completed || previous != time {
                            tx.execute(
                                "UPDATE todo_item SET is_completed=?1, completed_at=?2,
                                 update_time=MAX(update_time+1,?3) WHERE id=?4",
                                params![completed, time, now, task["id"].as_i64()],
                            )
                            .map_err(sql_error)?;
                        }
                    }
                }
                "delete" => {
                    if tx
                        .query_row(
                            "SELECT EXISTS(SELECT 1 FROM todo_item WHERE parent_id=?1)",
                            [id],
                            |row| row.get::<_, bool>(0),
                        )
                        .map_err(sql_error)?
                    {
                        return Err("待办有子项，不能删除".into());
                    }
                    assistant_tasks::release_todo_schedules_in_zone(&tx, id, Some(zone))?;
                    todo_calendar_sync::remove_all_by_todo(&tx, id)?;
                    tx.execute("DELETE FROM todo_recurrence_completion WHERE recurrence_id IN (SELECT id FROM todo_recurrence WHERE todo_item_id=?1)",[id]).map_err(sql_error)?;
                    for (table, key) in [
                        ("todo_recurrence", "todo_item_id"),
                        ("todo_recurrence_history", "todo_item_id"),
                        ("todo_occurrence_override", "todo_item_id"),
                        ("todo_note_link", "todo_id"),
                    ] {
                        tx.execute(&format!("DELETE FROM {table} WHERE {key}=?1"), [id])
                            .map_err(sql_error)?;
                    }
                    if let Some(before) = &before {
                        for note in before["todo_note_link"].as_array().into_iter().flatten() {
                            if let Some(content) = note["content_id"].as_i64().filter(|id| *id > 0)
                            {
                                common::release_content_reference(&tx, content)?;
                            }
                        }
                    }
                    if let Some(content) =
                        row["description_content_id"].as_i64().filter(|id| *id > 0)
                    {
                        common::release_content_reference(&tx, content)?;
                    }
                    tx.execute("DELETE FROM todo_item WHERE id=?1", [id])
                        .map_err(sql_error)?;
                }
                _ => return Err("待办动作无效".into()),
            }
        }
        if let Some(before) = before {
            let after = if date.is_some() || action == "recurrence" {
                snapshots::capture_todo(&tx, id)?
            } else {
                snapshots::known(&tx, &before)?
            };
            snapshots::record_mutation(
                &tx,
                plugin,
                "todo",
                write["id"].as_str().ok_or("身份无效")?,
                row["title"].as_str().unwrap_or(""),
                &before,
                &after,
                match action {
                    "state" => "update_todo_occurrence",
                    "recurrence" => "set_todo_recurrence",
                    _ => "delete_todo",
                },
            )?;
        }
        common::write_operation(
            &tx,
            "todo",
            if action == "delete" {
                "delete"
            } else {
                "update"
            },
            id,
            now,
        )?;
        common::write_operation(&tx, "calendar_event", "update", 0, now)?;
        if action == "delete" {
            Value::Null
        } else {
            task_dto(
                &tx,
                &todo_row(&tx, id, created)?,
                date.as_deref(),
                zone,
                holidays,
            )?
        }
    };
    if action == "create" {
        super::plugin_schedule_data::save_receipt(&tx, plugin, write, "todo", &result)?;
    }
    tx.commit().map_err(sql_error)?;
    Ok(result)
}
pub(super) fn parse_event(value: &str) -> Result<(i64, i64), String> {
    let (id, created) = value.split_once(':').ok_or("日程身份无效")?;
    let id = id.parse::<i64>().map_err(|_| "日程身份无效")?;
    let created = created.parse::<i64>().map_err(|_| "日程身份无效")?;
    if id <= 0 {
        return Err("系统任务标记只读，请通过待办修改".into());
    }
    Ok((id, created))
}
pub(super) fn write_calendar(
    conn: &mut Connection,
    plugin: &str,
    write: &Value,
    zone: CalendarTimeZone,
) -> Result<Value, String> {
    let action = write["action"].as_str().ok_or("日程动作无效")?;
    let tx = conn.transaction().map_err(sql_error)?;
    let now = common::now_millis();
    if action == "create" {
        if let Some(result) =
            super::plugin_schedule_data::replay(&tx, plugin, write, zone, &HolidayDays::new())?
        {
            return Ok(result);
        }
    }
    let result = if action == "create" {
        let input = &write["input"];
        let calendar = super::calendar::find_writable_user_calendar(
            &tx,
            input["calendarId"]
                .as_str()
                .map(str::parse::<i64>)
                .transpose()
                .map_err(|_| "日历身份无效")?,
        )?;
        let fields = dates::schedule(input, zone, true)?;
        let id = assistant_tasks::next_id(&tx, "calendar_event")?;
        tx.execute("INSERT INTO calendar_event(id,create_time,update_time,calendar_id,title,detail_content_id,start_date,end_date,start_time,end_time,all_day,start_utc_ms,end_utc_ms,start_time_zone,end_time_zone) VALUES(?1,?2,?2,?3,?4,0,?5,?6,?7,?8,?9,?10,?11,?12,?13)",params![id,now,calendar,input["title"].as_str().ok_or("缺少日程标题")?,fields["start_date"].as_i64(),fields["end_date"].as_i64(),fields["start_time"].as_i64(),fields["end_time"].as_i64(),fields["all_day"].as_i64(),fields["start_utc_ms"].as_i64(),fields["end_utc_ms"].as_i64(),fields["start_time_zone"].as_str(),fields["end_time_zone"].as_str()]).map_err(sql_error)?;
        if let Some(notes) = input.get("notes") {
            let content = super::plugin_data::create_content_input(&tx, plugin, notes)?;
            tx.execute(
                "UPDATE calendar_event SET detail_content_id=?1 WHERE id=?2",
                params![content, id],
            )
            .map_err(sql_error)?;
        }
        if let Some(reminders) = input.get("reminders") {
            super::plugin_schedule_data::set_reminders(&tx, "event", id, reminders, true)?;
        }
        common::write_operation(&tx, "calendar_event", "insert", id, now)?;
        event_dto(
            &tx,
            &snapshots::row(&tx, "calendar_event", id)?.ok_or("日程不存在")?,
            zone,
        )?
    } else {
        let (id, created) = parse_event(write["id"].as_str().ok_or("日程身份无效")?)?;
        let row = snapshots::row(&tx, "calendar_event", id)?.ok_or("日程已删除")?;
        if row["create_time"] != created {
            return Err("日程身份已变化".into());
        }
        let current = event_dto(&tx, &row, zone)?;
        assert_revision(&write["expectedRevision"], &current)?;
        super::calendar::find_writable_user_calendar(&tx, row["calendar_id"].as_i64())?;
        if action == "delete" {
            let before = snapshots::capture_events(&tx, &[id])?;
            super::calendar::delete_event_in_tx(&tx, id)?;
            let after = snapshots::known(&tx, &before)?;
            snapshots::record(
                &tx,
                plugin,
                "event",
                write["id"].as_str().ok_or("身份无效")?,
                row["title"].as_str().unwrap_or(""),
                &before,
                &after,
            )?;
            Value::Null
        } else if action == "update" || action == "notes" {
            if action == "notes" && row["detail_content_id"].as_i64().unwrap_or(0) == 0 {
                let content = super::plugin_data::create_content_input(
                    &tx,
                    plugin,
                    write.get("notes").ok_or("备注正文尚未准备")?,
                )?;
                tx.execute(
                    "UPDATE calendar_event SET detail_content_id=?1 WHERE id=?2",
                    params![content, id],
                )
                .map_err(sql_error)?;
            }
            let empty = json!({});
            let patch = if action == "notes" {
                &empty
            } else {
                &write["patch"]
            };
            if patch.get("title").is_some() && current.get("todoId").is_some() {
                return Err("关联安排的标题跟随待办，请修改待办标题".into());
            }
            let independent = current["kind"] == "event";
            let temporal_patch = ["start", "end", "allDay", "startTimeZone", "endTimeZone"]
                .iter()
                .any(|key| patch.get(key).is_some());
            let mut merged = current;
            for (key, value) in patch.as_object().ok_or("日程修改字段无效")? {
                merged[key] = value.clone();
            }
            let calendar = super::calendar::find_writable_user_calendar(
                &tx,
                merged["calendarId"]
                    .as_str()
                    .map(str::parse::<i64>)
                    .transpose()
                    .map_err(|_| "日历身份无效")?,
            )?;
            if merged["allDay"] == true
                && patch.get("startTimeZone").is_none()
                && patch.get("endTimeZone").is_none()
            {
                merged.as_object_mut().unwrap().remove("startTimeZone");
                merged.as_object_mut().unwrap().remove("endTimeZone");
            }
            let only_zones = row["start_utc_ms"].is_number()
                && ["start", "end", "allDay"]
                    .iter()
                    .all(|key| patch.get(key).is_none());
            let mut fields = if only_zones {
                let mut fields = row.clone();
                for (key, column) in [
                    ("startTimeZone", "start_time_zone"),
                    ("endTimeZone", "end_time_zone"),
                ] {
                    if let Some(zone) = patch.get(key) {
                        if column == "end_time_zone" && !row["end_utc_ms"].is_number() {
                            return Err("无结束时间的日程不能指定结束时区".into());
                        }
                        fields[column] =
                            json!(dates::event_zone(zone.as_str().ok_or("时区无效")?)?);
                    }
                }
                fields
            } else if temporal_patch {
                dates::schedule(&merged, zone, independent)?
            } else {
                row.clone()
            };
            if fields["start_utc_ms"].is_number()
                && fields["start_utc_ms"] == row["start_utc_ms"]
                && fields["end_utc_ms"] == row["end_utc_ms"]
            {
                for name in ["start_date", "end_date", "start_time", "end_time"] {
                    fields[name] = row[name].clone();
                }
            }
            tx.execute("UPDATE calendar_event SET title=?1,calendar_id=?2,start_date=?3,end_date=?4,start_time=?5,end_time=?6,all_day=?7,update_time=MAX(update_time+1,?8), start_utc_ms=?10,end_utc_ms=?11,start_time_zone=?12,end_time_zone=?13 WHERE id=?9",params![merged["title"].as_str(),calendar,fields["start_date"].as_i64(),fields["end_date"].as_i64(),fields["start_time"].as_i64(),fields["end_time"].as_i64(),fields["all_day"].as_i64(),now,id,fields["start_utc_ms"].as_i64(),fields["end_utc_ms"].as_i64(),fields["start_time_zone"].as_str(),fields["end_time_zone"].as_str()]).map_err(sql_error)?;
            if let Some(reminders) = patch.get("reminders") {
                super::plugin_schedule_data::set_reminders(&tx, "event", id, reminders, true)?;
            }
            common::write_operation(&tx, "calendar_event", "update", id, now)?;
            event_dto(
                &tx,
                &snapshots::row(&tx, "calendar_event", id)?.ok_or("日程不存在")?,
                zone,
            )?
        } else {
            return Err("日程动作无效".into());
        }
    };
    if action == "create" {
        super::plugin_schedule_data::save_receipt(&tx, plugin, write, "event", &result)?;
    }
    tx.commit().map_err(sql_error)?;
    Ok(result)
}
async fn task_holidays(
    app: &AppHandle,
    token: &str,
    database: &str,
    request: &Value,
    zone: CalendarTimeZone,
) -> Result<HolidayDays, String> {
    if request["method"] == "occurrence-states" {
        let dates = crate::plugin_transport::with_database(token, database, || {
            let conn = super::schema::open_active_database(app)?;
            super::plugin_task_recurrence::state_dates(&conn, &request["query"], zone)
        })?;
        let mut result = HolidayDays::new();
        for date in dates {
            let day = dates::day(&date)?;
            result.extend(
                super::calendar_holidays::load_task_holidays(
                    app,
                    zone.day_start(day),
                    zone.day_start(day + 1) - 1,
                    zone,
                )
                .await?,
            );
        }
        return Ok(result);
    }
    let range = if (request["method"] == "calendar" && request["query"]["view"] != "stored")
        || request["query"]["view"] == "occurrences"
    {
        dates::window(&request["query"], zone, true)?
    } else {
        request["write"]["id"]
            .as_str()
            .or(request["id"].as_str())
            .and_then(|id| {
                id.rsplit_once('@')
                    .filter(|(_, date)| dates::day(date).is_ok())
            })
            .map(|(_, date)| {
                dates::day(date).map(|day| (zone.day_start(day), zone.day_start(day + 1)))
            })
            .transpose()?
    };
    let Some((start, end)) = range else {
        return Ok(HolidayDays::new());
    };
    let needs = crate::plugin_transport::with_database(token, database, || {
        let conn = super::schema::open_active_database(app)?;
        if conn.database_name() != database {
            return Err("插件工作区已失效".into());
        }
        conn.query_row("SELECT EXISTS(SELECT 1 FROM todo_recurrence WHERE exclude_holidays=1) OR EXISTS(SELECT 1 FROM todo_recurrence_history WHERE json_valid(rule_json) AND json_extract(rule_json,'$.excludeHolidays')=1) OR EXISTS(SELECT 1 FROM content_snapshots WHERE instr(content,'excludeHolidays')>0)",[],|row|row.get::<_,bool>(0)).map_err(sql_error)
    })?;
    if needs {
        super::calendar_holidays::load_task_holidays(app, start, end - 1, zone).await
    } else {
        Ok(HolidayDays::new())
    }
}

#[tauri::command]
pub async fn plugin_tasks_read(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    request: Value,
    time_zone: CalendarTimeZone,
    plugin_id: String,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::provider_settings::validate_plugin_id(&plugin_id)?;
    crate::plugin_transport::with_database(&token, &database, || Ok(()))?;
    let holidays = task_holidays(&app, &token, &database, &request, time_zone).await?;
    crate::plugin_transport::with_database(&token, &database, || {
        let mut conn = super::schema::open_active_database(&app)?;
        if conn.database_name() != database {
            return Err("插件工作区已失效".into());
        }
        let mut scoped_query = request["query"].clone();
        if scoped_query.is_object() {
            scoped_query["_scope"] = json!(token);
        }
        match request["method"].as_str() {
            Some("operation") => super::plugin_document_tasks::operation(
                &conn,
                &plugin_id,
                request["id"].as_i64().ok_or("恢复身份无效")?,
            ),
            Some("pending") => super::plugin_document_tasks::pending(&conn, &plugin_id),
            Some("changes") => {
                let local = crate::data_change_scope::scope(
                    &crate::setting::resolve_app_dir(&app)?,
                    &database,
                    &crate::setting::resolve_database_path(&app, &database)?,
                )?;
                let grants =
                    crate::plugin_permissions::change_revision(&app, &database, &plugin_id)?;
                super::data_changes::read(
                    &mut conn,
                    &request["query"],
                    &json!([local, grants]).to_string(),
                )
            }
            Some("replay-create") => Ok(super::plugin_schedule_data::replay(
                &conn,
                &plugin_id,
                &request["write"],
                time_zone,
                &holidays,
            )?
            .unwrap_or(Value::Null)),
            Some("get") => super::plugin_schedule_data::get(
                &conn,
                request["entity"].as_str().ok_or("数据类型无效")?,
                request["id"].as_str().ok_or("身份无效")?,
                time_zone,
                &holidays,
            ),
            Some("directories") => super::plugin_schedule_data::directories(
                &conn,
                request["entity"].as_str().ok_or("目录类型无效")?,
                &scoped_query,
            ),
            Some("occurrence-states") => {
                let local = crate::data_change_scope::scope(
                    &crate::setting::resolve_app_dir(&app)?,
                    &database,
                    &crate::setting::resolve_database_path(&app, &database)?,
                )?;
                let grants =
                    crate::plugin_permissions::change_revision(&app, &database, &plugin_id)?;
                super::plugin_task_recurrence::states(
                    &conn,
                    &plugin_id,
                    &scoped_query,
                    time_zone,
                    &holidays,
                    &json!([local, grants]).to_string(),
                )
            }
            Some("todos") => query_tasks(&conn, &scoped_query, time_zone, &holidays),
            Some("calendar") => query_calendar(&mut conn, &scoped_query, time_zone, &holidays),
            Some("prepare") => super::plugin_document_tasks::prepare(
                &conn,
                &request["write"],
                time_zone,
                &holidays,
            ),
            Some("document") => super::plugin_document_tasks::read(
                &conn,
                request["id"].as_str().ok_or("待办身份无效")?,
                time_zone,
                &holidays,
            ),
            _ => Err("未知任务读取".into()),
        }
    })
}
#[tauri::command]
pub async fn plugin_tasks_write(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    plugin_id: String,
    request: Value,
    time_zone: CalendarTimeZone,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::provider_settings::validate_plugin_id(&plugin_id)?;
    let holidays = task_holidays(&app, &token, &database, &request, time_zone).await?;
    let result = crate::plugin_transport::with_database(&token, &database, || {
        let mut conn = super::schema::open_active_database(&app)?;
        if conn.database_name() != database {
            return Err("插件工作区已失效".into());
        }
        let before = super::plugin_data::last_operation(&conn)?;
        let result = if request["method"] == "directory" {
            super::plugin_directories::write(&mut conn, &plugin_id, &request["write"])
        } else if request["method"] == "restore-stage" {
            super::plugin_document_tasks::stage_restore(&mut conn, &plugin_id, &request)
        } else if request["method"] == "cancel-shared" {
            super::plugin_document_tasks::cancel_shared(
                &mut conn,
                &plugin_id,
                request["id"].as_i64().ok_or("恢复身份无效")?,
            )
        } else if request["method"] == "restore" {
            super::plugin_data::restore(
                &mut conn,
                &plugin_id,
                request["id"].as_i64().ok_or("恢复身份无效")?,
            )
        } else if request["method"] == "document-stage" {
            super::plugin_document_tasks::stage_shared(
                &mut conn,
                &plugin_id,
                &request["write"],
                time_zone,
                &holidays,
            )
        } else if request["method"] == "calendar" {
            write_calendar(&mut conn, &plugin_id, &request["write"], time_zone)
        } else {
            write_todo(
                &mut conn,
                &plugin_id,
                &request["write"],
                time_zone,
                &holidays,
            )
        }?;
        super::plugin_data::remember_origin(&conn, &token, &plugin_id, before)?;
        Ok(result)
    })?;
    super::reconcile::trigger_reconcile(&app, &database);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    const ZONE: CalendarTimeZone = CalendarTimeZone(chrono_tz::Asia::Shanghai);
    fn database() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&db).unwrap();
        db.execute("INSERT INTO calendar(id,title,color,create_time,update_time) VALUES(100,'个人','#000',1,1)",[]).unwrap();
        db
    }
    fn create(conn: &mut Connection, title: &str, due: Value) -> Value {
        write_todo(
            conn,
            "fixture",
            &json!({"action":"create","input":{"title":title,"dueAt":due}}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap()
    }
    #[test]
    fn series_tags_and_priority_are_inherited_and_partial_edits_preserve_the_other_field() {
        let mut db = database();
        let holidays = HolidayDays::new();
        let root = write_todo(&mut db, "fixture", &json!({
            "action":"create", "input":{"title":"评审","priority":"high","tags":[" 项目 ", "", "评审", "项目"],
            "recurrence":{"type":"daily","interval":1,"startDate":"2026-10-01"}}
        }), ZONE, &holidays).unwrap();
        let instance = format!("{}@2026-10-02", root["id"].as_str().unwrap());
        let get = |db: &Connection| {
            super::super::plugin_schedule_data::get(db, "todo", &instance, ZONE, &holidays).unwrap()
        };
        let first = get(&db);
        assert_eq!(first["tags"], json!(["项目", "评审"]));
        assert_eq!(first["priority"], "high");
        let edit = json!({"action":"update","id":root["id"],"expectedRevision":root["revision"],"patch":{"tags":[]}});
        let saved = write_todo(&mut db, "fixture", &edit, ZONE, &holidays).unwrap();
        assert_eq!(saved["priority"], "high");
        let fresh = get(&db);
        assert_eq!(fresh["tags"], json!([]));
        assert_ne!(fresh["revision"], first["revision"]);
        assert!(write_todo(&mut db, "fixture", &edit, ZONE, &holidays)
            .unwrap_err()
            .contains("PLUGIN_CONFLICT"));
    }

    #[test]
    fn phase_three_rule_writes_and_instance_patches_preserve_original_identity() {
        let mut db = database();
        let root=write_todo(&mut db,"fixture",&json!({"action":"create","input":{"title":"新系列","recurrence":{"type":"daily","interval":1,"startDate":"2026-10-01"},"reminders":[{"offsetMs":-32400000},{"offsetMs":-72000000}]}}),ZONE,&HolidayDays::new()).unwrap();
        let edited = write_todo(
            &mut db,
            "fixture",
            &json!({
                "action":"update", "id":root["id"], "expectedRevision":root["revision"],
                "patch":{"reminders":[{"offsetMs":-28800000},{"offsetMs":-72000000}]}
            }),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert_eq!(
            edited["reminders"],
            json!([{"offsetMs":-72000000},{"offsetMs":-28800000}])
        );
        let id = root["id"].as_str().unwrap();
        let instance_id = format!("{id}@2026-10-02");
        let first = super::super::plugin_schedule_data::get(
            &db,
            "todo",
            &instance_id,
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        let moved=write_todo(&mut db,"fixture",&json!({"action":"state","id":instance_id,"expectedRevision":first["revision"],"patch":{"skipped":true,"scheduledAt":"2026-12-01"}}),ZONE,&HolidayDays::new()).unwrap();
        assert_eq!(moved["id"], first["id"]);
        assert_eq!(moved["dueAt"], "2026-12-01");
        assert_eq!(moved["occurrence"]["state"]["skipped"], true);
        assert!(write_todo(&mut db,"fixture",&json!({"action":"state","id":instance_id,"expectedRevision":first["revision"],"patch":{"completed":true}}),ZONE,&HolidayDays::new()).unwrap_err().contains("PLUGIN_CONFLICT"));
        let restored=write_todo(&mut db,"fixture",&json!({"action":"state","id":instance_id,"expectedRevision":moved["revision"],"patch":{"completed":true,"scheduledAt":null}}),ZONE,&HolidayDays::new()).unwrap();
        assert_eq!(restored["completed"], true);
        assert_eq!(restored["dueAt"], "2026-10-02");
        let current =
            super::super::plugin_schedule_data::get(&db, "todo", id, ZONE, &HolidayDays::new())
                .unwrap();
        write_todo(&mut db,"fixture",&json!({"action":"recurrence","id":id,"expectedRevision":current["revision"],"change":{"effectiveFrom":"2026-11-01","rule":null}}),ZONE,&HolidayDays::new()).unwrap();
        assert_eq!(
            super::super::plugin_schedule_data::get(
                &db,
                "todo",
                &instance_id,
                ZONE,
                &HolidayDays::new()
            )
            .unwrap()["completed"],
            true
        );
        assert!(super::super::plugin_schedule_data::get(
            &db,
            "todo",
            &format!("{id}@2026-11-02"),
            ZONE,
            &HolidayDays::new()
        )
        .unwrap()
        .is_null());
        let page = super::super::plugin_task_recurrence::states(
            &db,
            "fixture",
            &json!({"taskId":id,"limit":1}),
            ZONE,
            &HolidayDays::new(),
            "scope",
        )
        .unwrap();
        assert_eq!(page["items"][0]["originalDate"], "2026-10-02");
        assert_eq!(page["items"][0]["active"], true);
    }

    #[test]
    fn shared_task_id_components_round_trip_without_occurrence_collisions() {
        let cases: Vec<String> = serde_json::from_str(include_str!(
            "../../../../../packages/shared/src/utils/__fixtures__/plugin-task-ids.json"
        ))
        .unwrap();
        for task in cases {
            let key = document_key(50, 10, &task);
            match parse_task(&key).unwrap() {
                TaskId::Document(50, 10, actual, None) => assert_eq!(actual, task),
                _ => panic!("root identity changed"),
            }
            match parse_task(&format!("{key}@2026-11-25")).unwrap() {
                TaskId::Document(50, 10, actual, Some(date)) => {
                    assert_eq!(actual, task);
                    assert_eq!(date, "2026-11-25");
                }
                _ => panic!("occurrence identity changed"),
            }
        }
    }
    #[test]
    fn planned_stop_keeps_legacy_completion_reads_consistent_with_instance_state() {
        let mut db = database();
        let day = ZONE.day(common::now_millis());
        let start = dates::day_text(day - 1);
        let stop = dates::day_text(day + 10);
        let root=write_todo(&mut db,"fixture",&json!({"action":"create","input":{"title":"计划停止","recurrence":{"type":"daily","interval":1,"startDate":start}}}),ZONE,&HolidayDays::new()).unwrap();
        write_todo(&mut db,"fixture",&json!({"action":"recurrence","id":root["id"],"expectedRevision":root["revision"],"change":{"effectiveFrom":stop,"rule":null}}),ZONE,&HolidayDays::new()).unwrap();
        let id = format!("{}@{start}", root["id"].as_str().unwrap());
        let instance =
            super::super::plugin_schedule_data::get(&db, "todo", &id, ZONE, &HolidayDays::new())
                .unwrap();
        let result=write_todo(&mut db,"fixture",&json!({"action":"state","id":id,"expectedRevision":instance["revision"],"patch":{"completed":true}}),ZONE,&HolidayDays::new()).unwrap();
        assert_eq!(result["completed"], true);
        assert!(db.query_row("SELECT EXISTS(SELECT 1 FROM todo_recurrence_completion WHERE completed_at IS NOT NULL)",[],|r|r.get::<_,bool>(0)).unwrap());
    }
    #[test]
    fn legacy_nullable_rules_round_trip_without_changing_the_revision() {
        let mut db = database();
        let start = dates::day_text(ZONE.day(common::now_millis()) - 1);
        let root=write_todo(&mut db,"fixture",&json!({"action":"create","input":{"title":"旧规则","recurrence":{"type":"weekly","interval":1,"startDate":start,"weekdays":[1,2]}}}),ZONE,&HolidayDays::new()).unwrap();
        let legacy = json!({"type":"weekly","interval":1,"startDate":start,"weekdays":[2,1,1],"monthDay":null,"yearMonth":null,"yearDay":null,"endDate":null,"maxOccurrences":null,"excludeHolidays":false});
        db.execute(
            "UPDATE todo_recurrence_history SET rule_json=?1",
            [legacy.to_string()],
        )
        .unwrap();
        let id = root["id"].as_str().unwrap();
        let current =
            super::super::plugin_schedule_data::get(&db, "todo", id, ZONE, &HolidayDays::new())
                .unwrap();
        let segment = &current["recurrence"]["segments"][0];
        assert_eq!(segment["rule"]["weekdays"], json!([1, 2]));
        assert!(segment["rule"].get("monthDay").is_none());
        let result=write_todo(&mut db,"fixture",&json!({"action":"recurrence","id":id,"expectedRevision":current["revision"],"change":{"effectiveFrom":segment["effectiveDate"],"rule":segment["rule"]}}),ZONE,&HolidayDays::new()).unwrap();
        assert_eq!(result["revision"], current["revision"]);
    }
    fn periodic(conn: &mut Connection) -> Value {
        let task = create(conn, "周期", Value::Null);
        let TaskId::Todo(id, created, _) = parse_task(task["id"].as_str().unwrap()).unwrap() else {
            unreachable!()
        };
        let start = dates::timestamp("2026-10-01", ZONE).unwrap();
        conn.execute("UPDATE todo_item SET type='recurring' WHERE id=?1", [id])
            .unwrap();
        conn.execute("INSERT INTO todo_recurrence(todo_item_id,type,interval,start_date,create_time,update_time) VALUES(?1,'daily',1,?2,1,1)",params![id,start]).unwrap();
        conn.execute(
            "INSERT INTO todo_recurrence_history VALUES('old',?1,?2,'2026-10-01',?3,1)",
            params![
                id,
                created,
                json!({"type":"daily","interval":1,"startDate":"2026-10-01"}).to_string()
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO todo_recurrence_history VALUES('new',?1,?2,'2026-10-10',?3,1)",
            params![
                id,
                created,
                json!({"type":"weekly","interval":1,"weekdays":[1],"startDate":"2026-10-10"})
                    .to_string()
            ],
        )
        .unwrap();
        task_dto(
            conn,
            &todo_row(conn, id, created).unwrap(),
            None,
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap()
    }
    #[test]
    fn ordinary_tasks_clear_deadline_check_versions_and_restore() {
        let mut conn = database();
        let task = create(&mut conn, "普通", json!("2026-10-28"));
        assert_eq!(task["dueAt"], "2026-10-28T15:59:59.999Z");
        let request = json!({"action":"update","id":task["id"],"expectedRevision":task["revision"],"patch":{"dueAt":null,"title":"修改"}});
        let next = write_todo(&mut conn, "fixture", &request, ZONE, &HolidayDays::new()).unwrap();
        assert!(next["dueAt"].is_null());
        assert!(
            write_todo(&mut conn, "fixture", &request, ZONE, &HolidayDays::new())
                .unwrap_err()
                .starts_with("PLUGIN_CONFLICT:")
        );
        write_todo(
            &mut conn,
            "fixture",
            &json!({"action":"delete","id":next["id"],"expectedRevision":next["revision"]}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        let operation = conn
            .query_row("SELECT MAX(id) FROM plugin_operations", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap();
        super::super::plugin_data::restore(&mut conn, "fixture", operation).unwrap();
        assert_eq!(
            query_tasks(&conn, &json!({"source":"todo"}), ZONE, &HolidayDays::new()).unwrap()
                ["items"][0]["title"],
            "修改"
        );
    }
    #[test]
    fn independent_details_round_trip_and_reject_parent_cycles() {
        let mut db = database();
        let parent = create(&mut db, "parent", Value::Null);
        let write = |db: &mut Connection, input: Value| {
            write_todo(db, "fixture", &input, ZONE, &HolidayDays::new())
        };
        let contract = json!({"format":2,"domain":"editor-node","owner":"example.note","type":"example.note","dataVersion":1,"kind":"block","isVoid":true,"textFields":["source"],"structuredFields":[],"resources":[]});
        let hash = snapshots::digest(&contract);
        let prepared = json!({"nodes":[{"type":"example.note","tauContract":hash,"source":"hello","children":[{"type":"formatted","text":""}]}],"contracts":{hash:contract},"count":5});
        let child = write(&mut db,json!({"action":"create","input":{"title":"child","parentId":parent["id"],"startAt":"2026-11-27T09:30:00+08:00",
          "description":{"markdown":"hello"}},"preparedDescription":prepared})).unwrap();
        assert_eq!(child["startAt"], "2026-11-27T01:30:00.000Z");
        assert_eq!(child["parentId"], parent["id"]);
        assert_eq!(child["listId"], parent["listId"]);
        let children = query_tasks(
            &db,
            &json!({"parentId":parent["id"]}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert_eq!(children["items"].as_array().unwrap(), &[child.clone()]);
        let reference = child["descriptionRef"].as_str().unwrap();
        let mut ids = reference.split(':');
        let content = ids.next().unwrap().parse::<i64>().unwrap();
        assert_eq!(
            super::super::query::query_content_detail(&db, content)
                .unwrap()
                .content[0]["source"],
            "hello"
        );
        let root = query_tasks(&db, &json!({"source":"todo"}), ZONE, &HolidayDays::new()).unwrap()
            ["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["id"] == parent["id"])
            .unwrap()
            .clone();
        assert!(write(&mut db,json!({"action":"update","id":root["id"],"expectedRevision":root["revision"],"patch":{"parentId":child["id"]}})).is_err());
        let detached=write(&mut db,json!({"action":"update","id":child["id"],"expectedRevision":child["revision"],"patch":{"parentId":null,"startAt":null}})).unwrap();
        assert!(detached["parentId"].is_null() && detached["startAt"].is_null());
        assert_eq!(detached["descriptionRef"], reference);
    }

    #[test]
    fn parent_completion_time_round_trips_without_rewriting_children() {
        let mut db = database();
        let parent = create(&mut db, "parent", Value::Null);
        let child = create(&mut db, "child", Value::Null);
        let parent_id = parse_task(parent["id"].as_str().unwrap()).unwrap();
        let TaskId::Todo(id, _, _) = parent_id else {
            panic!("fixture")
        };
        db.execute(
            "UPDATE todo_item SET parent_id=?1 WHERE title='child'",
            [id],
        )
        .unwrap();
        let read = |db: &Connection, title: &str| {
            query_tasks(db, &json!({"source":"todo"}), ZONE, &HolidayDays::new()).unwrap()["items"]
                .as_array()
                .unwrap()
                .iter()
                .find(|item| item["title"] == title)
                .unwrap()
                .clone()
        };
        let complete = |db: &mut Connection, task: &Value, done: bool, time: Option<i64>| {
            let mut request = json!({"action":"complete","id":task["id"],"expectedRevision":task["revision"],"completed":done});
            if let Some(time) = time {
                request["completedAt"] = json!(time);
            }
            write_todo(db, "fixture", &request, ZONE, &HolidayDays::new())
        };
        assert_eq!(child.get("completedAt"), Some(&Value::Null));
        let stale_parent = read(&db, "parent");
        let child = read(&db, "child");
        complete(&mut db, &child, true, Some(0)).unwrap();
        assert!(complete(&mut db, &stale_parent, true, Some(1000))
            .unwrap_err()
            .starts_with("PLUGIN_CONFLICT:"));
        let parent = read(&db, "parent");
        let parent = complete(&mut db, &parent, true, Some(1000)).unwrap();
        assert_eq!(
            complete(&mut db, &parent, true, None).unwrap()["revision"],
            parent["revision"]
        );
        let child = read(&db, "child");
        assert_eq!(child["completedAt"], 0);
        let reopened = complete(&mut db, &child, false, None).unwrap();
        let parent = read(&db, "parent");
        let corrected = complete(&mut db, &parent, true, Some(2000)).unwrap();
        assert_eq!(read(&db, "parent")["completedAt"], 2000);
        assert_ne!(corrected["revision"], parent["revision"]);
        assert_eq!(read(&db, "child"), reopened);
        assert_eq!(
            complete(&mut db, &corrected, false, None).unwrap()["completedAt"],
            Value::Null
        );
    }

    #[test]
    fn occurrence_pages_keep_original_dates_and_select_historical_segment() {
        let mut conn = database();
        let base = periodic(&mut conn);
        assert!(write_todo(&mut conn,"fixture",&json!({"action":"complete","id":base["id"],"expectedRevision":base["revision"],"completed":true}),ZONE,&HolidayDays::new()).is_err());
        let mut query = json!({"source":"todo","view":"occurrences","start":"2026-10-01","end":"2026-10-03","limit":1});
        let mut items = vec![];
        for _ in 0..5 {
            let page = query_tasks(&conn, &query, ZONE, &HolidayDays::new()).unwrap();
            items.extend(page["items"].as_array().unwrap().clone());
            if page.get("cursor").is_none() {
                break;
            }
            query["cursor"] = page["cursor"].clone();
        }
        assert_eq!(items.len(), 3);
        assert!(items[0]["id"].as_str().unwrap().ends_with("@2026-10-01"));
        write_todo(&mut conn,"fixture",&json!({"action":"complete","id":items[0]["id"],"expectedRevision":items[0]["revision"],"completed":true}),ZONE,&HolidayDays::new()).unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT series_id FROM todo_occurrence_override",
                [],
                |row| row.get::<_, String>(0)
            )
            .unwrap(),
            "old"
        );
        assert_eq!(
            conn.query_row("SELECT is_completed FROM todo_item", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    #[test]
    fn stopped_series_keeps_history_without_blocking_current_normal_task() {
        let mut conn = database();
        let base = periodic(&mut conn);
        let TaskId::Todo(id, created, _) = parse_task(base["id"].as_str().unwrap()).unwrap() else {
            unreachable!()
        };
        let stop = dates::day_text(ZONE.day(common::now_millis()) - 1);
        conn.execute(
            "INSERT OR REPLACE INTO todo_recurrence_history VALUES('stopped',?1,?2,?3,NULL,1)",
            params![id, created, stop],
        )
        .unwrap();
        conn.execute("UPDATE todo_item SET type='normal' WHERE id=?1", [id])
            .unwrap();
        conn.execute("DELETE FROM todo_recurrence WHERE todo_item_id=?1", [id])
            .unwrap();
        let task = task_dto(
            &conn,
            &todo_row(&conn, id, created).unwrap(),
            None,
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        let result=write_todo(&mut conn,"fixture",&json!({"action":"complete","id":task["id"],"expectedRevision":task["revision"],"completed":true}),ZONE,&HolidayDays::new()).unwrap();
        assert_eq!(result["completed"], true);
        let old = query_tasks(
            &conn,
            &json!({"view":"occurrences","source":"todo","start":"2026-10-01","end":"2026-10-03"}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert!(old["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|item| item["completed"] == false));
        let calendar = query_calendar(
            &mut conn,
            &json!({"start":"2026-10-01","end":"2026-10-03"}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert_eq!(
            calendar["items"].as_array().unwrap().len(),
            old["items"].as_array().unwrap().len()
        );
        assert!(calendar["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|item| item["id"].as_str().unwrap().starts_with('-')));
    }
    #[test]
    fn occurrence_deletion_skips_only_one_and_is_recoverable() {
        let mut conn = database();
        periodic(&mut conn);
        let query =
            json!({"source":"todo","view":"occurrences","start":"2026-10-01","end":"2026-10-03"});
        let task =
            query_tasks(&conn, &query, ZONE, &HolidayDays::new()).unwrap()["items"][0].clone();
        write_todo(
            &mut conn,
            "fixture",
            &json!({"action":"delete","id":task["id"],"expectedRevision":task["revision"]}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert_eq!(
            query_tasks(&conn, &query, ZONE, &HolidayDays::new()).unwrap()["items"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        let operation = conn
            .query_row("SELECT MAX(id) FROM plugin_operations", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap();
        super::super::plugin_data::restore(&mut conn, "fixture", operation).unwrap();
        assert_eq!(
            query_tasks(&conn, &query, ZONE, &HolidayDays::new()).unwrap()["items"]
                .as_array()
                .unwrap()
                .len(),
            3
        );
    }
    #[test]
    fn linked_calendar_title_is_owned_by_task_and_system_markers_are_readonly() {
        let mut conn = database();
        let task = create(&mut conn, "任务", json!("2026-10-28"));
        let TaskId::Todo(id, _, _) = parse_task(task["id"].as_str().unwrap()).unwrap() else {
            unreachable!()
        };
        let event=write_calendar(&mut conn,"fixture",&json!({"action":"create","input":{"title":"安排","calendarId":"100","start":"2026-10-28","end":"2026-10-29","allDay":true}}),ZONE).unwrap();
        let (event_id, _) = parse_event(event["id"].as_str().unwrap()).unwrap();
        conn.execute(
            "UPDATE calendar_event SET todo_item_id=?1 WHERE id=?2",
            params![id, event_id],
        )
        .unwrap();
        let current = event_dto(
            &conn,
            &snapshots::row(&conn, "calendar_event", event_id)
                .unwrap()
                .unwrap(),
            ZONE,
        )
        .unwrap();
        assert!(write_calendar(&mut conn,"fixture",&json!({"action":"update","id":current["id"],"expectedRevision":current["revision"],"patch":{"title":"不应改名"}}),ZONE).is_err());
        let marker = conn
            .query_row(
                "SELECT calendar_event_id FROM todo_calendar_mapping WHERE todo_item_id=?1",
                [id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap();
        let marker = event_dto(
            &conn,
            &snapshots::row(&conn, "calendar_event", marker)
                .unwrap()
                .unwrap(),
            ZONE,
        )
        .unwrap();
        assert!(write_calendar(
            &mut conn,
            "fixture",
            &json!({"action":"delete","id":marker["id"],"expectedRevision":marker["revision"]}),
            ZONE
        )
        .is_err());
    }
    #[test]
    fn calendar_range_and_all_day_exclusive_end_and_dst() {
        let mut conn = database();
        let event=write_calendar(&mut conn,"fixture",&json!({"action":"create","input":{"title":"全天","start":"2026-10-28","end":"2026-10-29","allDay":true}}),ZONE).unwrap();
        assert_eq!(event["end"], "2026-10-29");
        let page = query_calendar(
            &mut conn,
            &json!({"start":"2026-10-29","end":"2026-10-29"}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert!(page["items"].as_array().unwrap().is_empty());
        let zone = CalendarTimeZone(chrono_tz::America::New_York);
        let schedule = dates::schedule(
            &json!({"start":"2026-03-08","end":"2026-03-09","allDay":true}),
            zone,
            false,
        )
        .unwrap();
        assert_eq!(schedule["start_date"], schedule["end_date"]);
        assert_eq!(
            zone.day_start(zone.day(schedule["start_date"].as_i64().unwrap()) + 1)
                - schedule["start_date"].as_i64().unwrap(),
            23 * 3600_000
        );
        assert!(dates::schedule(&json!({"start":"2026-11-01T01:30:00-05:00","end":"2026-11-01T02:30:00-05:00","allDay":false}),zone,false).is_err());
        assert!(dates::schedule(&json!({"start":"2026-10-28T10:00:01+08:00","end":"2026-10-28T11:00:00+08:00","allDay":false}),ZONE,false).is_err());
    }
}

#[cfg(test)]
mod relation_tests {
    use super::*;
    const ZONE: CalendarTimeZone = CalendarTimeZone(chrono_tz::Asia::Shanghai);
    fn database() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&db).unwrap();
        db.execute("INSERT INTO calendar(id,title,color,create_time,update_time) VALUES(100,'个人','#000',1,1)",[]).unwrap();
        db
    }
    #[test]
    fn zoned_event_round_trips_across_devices_and_rejects_a_stale_revision() {
        let mut db = database();
        let ny = CalendarTimeZone(chrono_tz::America::New_York);
        let created = write_calendar(
            &mut db,
            "fixture",
            &json!({"action":"create","input":{
                "title":"回拨时段","calendarId":"100","allDay":false,
                "start":"2026-11-01T01:45:00-04:00","end":"2026-11-01T01:15:00-05:00",
                "startTimeZone":"America/New_York","endTimeZone":"America/Toronto",
                "reminders":[{"offsetMs":300000}]
            }}),
            ny,
        )
        .unwrap();
        assert_eq!(created["start"], "2026-11-01T05:45:00.000Z");
        assert_eq!(created["end"], "2026-11-01T06:15:00.000Z");
        let (id, _) = parse_event(created["id"].as_str().unwrap()).unwrap();
        let row = snapshots::row(&db, "calendar_event", id).unwrap().unwrap();
        assert_eq!(event_dto(&db, &row, ZONE).unwrap(), created);
        {
            let tx = db.transaction().unwrap();
            let expected = dates::timestamp("2026-11-01T05:40:00Z", ny).unwrap();
            let reminders = crate::database::reminders::upcoming(
                &tx,
                expected - 1,
                expected,
                10,
                ZONE,
                &HolidayDays::new(),
            )
            .unwrap();
            assert_eq!(reminders.items[0].remind_at, expected);
            assert_eq!(
                reminders.items[0].end_at,
                Some(dates::timestamp("2026-11-01T06:15:00Z", ny).unwrap())
            );
        }
        let update = |revision: &Value, patch: Value| json!({"action":"update","id":created["id"],"expectedRevision":revision,"patch":patch});
        let renamed = write_calendar(
            &mut db,
            "fixture",
            &update(&created["revision"], json!({"title":"新标题"})),
            ZONE,
        )
        .unwrap();
        for key in ["start", "end", "startTimeZone", "endTimeZone", "reminders"] {
            assert_eq!(renamed[key], created[key]);
        }
        let changed = write_calendar(
            &mut db,
            "fixture",
            &update(&renamed["revision"], json!({"endTimeZone":"Europe/London"})),
            ZONE,
        )
        .unwrap();
        assert_ne!(changed["revision"], renamed["revision"]);
        assert_eq!(changed["end"], created["end"]);
        assert!(write_calendar(
            &mut db,
            "fixture",
            &update(&renamed["revision"], json!({"title":"过期"})),
            ZONE
        )
        .is_err());
        assert!(write_calendar(
            &mut db,
            "fixture",
            &update(
                &changed["revision"],
                json!({"endTimeZone":"Invalid/Nowhere"})
            ),
            ZONE
        )
        .is_err());
        assert_eq!(
            event_dto(
                &db,
                &snapshots::row(&db, "calendar_event", id).unwrap().unwrap(),
                ZONE
            )
            .unwrap(),
            changed
        );
    }
    #[test]
    fn deleting_todo_detaches_past_and_preserves_all_restore_material() {
        let mut db = database();
        let task = write_todo(
            &mut db,
            "fixture",
            &json!({"action":"create","input":{"title":"有安排"}}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        let TaskId::Todo(id, created, _) = parse_task(task["id"].as_str().unwrap()).unwrap() else {
            unreachable!()
        };
        let today = ZONE.day(common::now_millis());
        let mut events = vec![];
        for day in [today - 2, today + 2] {
            let event=write_calendar(&mut db,"fixture",&json!({"action":"create","input":{"title":"有安排","start":dates::day_text(day),"end":dates::day_text(day+1),"allDay":true}}),ZONE).unwrap();
            let (event_id, _) = parse_event(event["id"].as_str().unwrap()).unwrap();
            db.execute(
                "UPDATE calendar_event SET todo_item_id=?1 WHERE id=?2",
                params![id, event_id],
            )
            .unwrap();
            events.push(event_id);
        }
        db.execute("INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(900,1,1,'[]',0,1)",[]).unwrap();
        db.execute(
            "UPDATE calendar_event SET detail_content_id=900 WHERE id=?1",
            [events[1]],
        )
        .unwrap();
        let current = task_dto(
            &db,
            &todo_row(&db, id, created).unwrap(),
            None,
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        write_todo(
            &mut db,
            "fixture",
            &json!({"action":"delete","id":current["id"],"expectedRevision":current["revision"]}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert!(snapshots::row(&db, "calendar_event", events[0])
            .unwrap()
            .unwrap()["todo_item_id"]
            .is_null());
        assert!(snapshots::row(&db, "calendar_event", events[1])
            .unwrap()
            .is_none());
        let operation = db
            .query_row("SELECT MAX(id) FROM plugin_operations", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap();
        super::super::plugin_data::restore(&mut db, "fixture", operation).unwrap();
        for event in events {
            assert_eq!(
                snapshots::row(&db, "calendar_event", event)
                    .unwrap()
                    .unwrap()["todo_item_id"],
                id
            );
        }
        assert_eq!(
            db.query_row("SELECT ref_count FROM contents WHERE id=900", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
    #[test]
    fn restore_refuses_a_recreated_parent_calendar_and_preserves_new_data() {
        let mut db = database();
        let event=write_calendar(&mut db,"fixture",&json!({"action":"create","input":{"title":"安排","start":"2026-10-28","end":"2026-10-29","allDay":true}}),ZONE).unwrap();
        write_calendar(
            &mut db,
            "fixture",
            &json!({"action":"delete","id":event["id"],"expectedRevision":event["revision"]}),
            ZONE,
        )
        .unwrap();
        let operation = db
            .query_row("SELECT MAX(id) FROM plugin_operations", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap();
        db.execute(
            "UPDATE calendar SET create_time=2,title='另一个日历' WHERE id=100",
            [],
        )
        .unwrap();
        assert!(super::super::plugin_data::restore(&mut db, "fixture", operation).is_err());
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM calendar_event", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            snapshots::row(&db, "calendar", 100).unwrap().unwrap()["title"],
            "另一个日历"
        );
    }
    #[test]
    fn series_with_children_is_not_deleted_or_completed_as_a_whole() {
        let mut db = database();
        let parent = write_todo(
            &mut db,
            "fixture",
            &json!({"action":"create","input":{"title":"父待办"}}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        let TaskId::Todo(parent_id, created, _) =
            parse_task(parent["id"].as_str().unwrap()).unwrap()
        else {
            unreachable!()
        };
        let child = write_todo(
            &mut db,
            "fixture",
            &json!({"action":"create","input":{"title":"子待办"}}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        let TaskId::Todo(child_id, _, _) = parse_task(child["id"].as_str().unwrap()).unwrap()
        else {
            unreachable!()
        };
        db.execute(
            "UPDATE todo_item SET parent_id=?1 WHERE id=?2",
            params![parent_id, child_id],
        )
        .unwrap();
        let current = task_dto(
            &db,
            &todo_row(&db, parent_id, created).unwrap(),
            None,
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert!(write_todo(
            &mut db,
            "fixture",
            &json!({"action":"delete","id":current["id"],"expectedRevision":current["revision"]}),
            ZONE,
            &HolidayDays::new()
        )
        .is_err());
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM todo_item", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM plugin_operations", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    #[test]
    fn reminder_only_changes_reject_stale_writes_and_delete_restore_keeps_all_reminders() {
        let mut db = database();
        let task = write_todo(&mut db,"fixture",&json!({"action":"create","input":{"title":"多提醒","dueAt":"2026-11-25","reminders":[{"offsetMs":0},{"offsetMs":60000}]}}),ZONE,&HolidayDays::new()).unwrap();
        let TaskId::Todo(id, _, _) = parse_task(task["id"].as_str().unwrap()).unwrap() else {
            panic!()
        };
        db.execute(
            "INSERT INTO item_reminder(owner_type,owner_id,offset_ms) VALUES('todo',?1,120000)",
            [id],
        )
        .unwrap();
        assert!(write_todo(&mut db,"fixture",&json!({"action":"update","id":task["id"],"expectedRevision":task["revision"],"patch":{"title":"旧版本"}}),ZONE,&HolidayDays::new()).unwrap_err().contains("PLUGIN_CONFLICT"));
        let latest = task_dto(
            &db,
            &snapshots::row(&db, "todo_item", id).unwrap().unwrap(),
            None,
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        write_todo(
            &mut db,
            "fixture",
            &json!({"action":"delete","id":latest["id"],"expectedRevision":latest["revision"]}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        let operation: String = db
            .query_row(
                "SELECT id FROM task_assistant_operation ORDER BY create_time DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let tx = db.transaction().unwrap();
        snapshots::restore(&tx, &operation).unwrap();
        tx.commit().unwrap();
        assert_eq!(
            super::super::plugin_schedule_data::reminders(&db, "todo", id).unwrap(),
            json!([{"offsetMs":0},{"offsetMs":60000},{"offsetMs":120000}])
        );
    }

    #[test]
    fn create_receipts_survive_operation_cleanup_are_plugin_scoped_and_do_not_revive_deleted_results(
    ) {
        let mut db = database();
        let write = json!({"action":"create","requestId":"stable","input":{"title":"防重","dueAt":"2026-11-25"}});
        let first = write_todo(&mut db, "one", &write, ZONE, &HolidayDays::new()).unwrap();
        let other = write_todo(&mut db, "two", &write, ZONE, &HolidayDays::new()).unwrap();
        assert_ne!(first["id"], other["id"]);
        db.execute("DELETE FROM task_assistant_operation", [])
            .unwrap();
        assert_eq!(
            first["id"],
            write_todo(&mut db, "one", &write, ZONE, &HolidayDays::new()).unwrap()["id"]
        );
        let mut different = write.clone();
        different["input"]["title"] = json!("不同参数");
        assert!(write_todo(&mut db, "one", &different, ZONE, &HolidayDays::new()).is_err());
        write_todo(
            &mut db,
            "one",
            &json!({"action":"delete","id":first["id"],"expectedRevision":first["revision"]}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert!(write_todo(&mut db, "one", &write, ZONE, &HolidayDays::new()).is_err());
    }

    #[test]
    fn stored_events_can_be_read_without_a_date_window_and_notes_have_stable_content_refs() {
        let mut db = database();
        let contract = json!({"format":2,"domain":"editor-node","owner":"example.note","type":"example.note","dataVersion":1,"kind":"block","isVoid":true,"textFields":["source"],"structuredFields":[],"resources":[]});
        let hash = snapshots::digest(&contract);
        let notes = json!({"nodes":[{"type":"example.note","tauContract":hash,"source":"备注","children":[{"type":"formatted","text":""}]}],"contracts":{hash:contract},"count":2});
        let event=write_calendar(&mut db,"fixture",&json!({"action":"create","input":{"title":"带备注","calendarId":"100","start":"2026-11-25","end":"2026-11-26","allDay":true,"notes":notes,"reminders":[{"offsetMs":-32400000}]}}),ZONE).unwrap();
        assert!(event["notesRef"]
            .as_str()
            .is_some_and(|value| !value.contains("null")));
        let page = query_calendar(
            &mut db,
            &json!({"view":"stored","calendarIds":["100"]}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert!(page["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|value| value["id"] == event["id"] && value["notesRef"] == event["notesRef"]));
        let directory =
            super::super::plugin_schedule_data::directory(&db, "calendar", 100).unwrap();
        assert_eq!(directory["id"], event["calendarId"]);
        assert_eq!(directory["writable"], true);
    }
    #[test]
    fn directory_single_page_and_write_policy_agree_after_moving_to_a_system_descendant() {
        let db = database();
        db.execute("UPDATE calendar SET visible=0 WHERE id=100", [])
            .unwrap();
        let initial = super::super::plugin_schedule_data::directory(&db, "calendar", 100).unwrap();
        assert_eq!(initial["writable"], true);
        assert_eq!(initial["visible"], false);
        let page = super::super::plugin_schedule_data::directories(
            &db,
            "calendar",
            &json!({"archived":false}),
        )
        .unwrap();
        assert!(page["items"].as_array().unwrap().contains(&initial));
        db.execute("INSERT INTO calendar_group(name,is_system,create_time,update_time) VALUES('系统',1,1,1)",[]).unwrap();
        let root = db.last_insert_rowid();
        db.execute("INSERT INTO calendar_group(name,parent_group_id,create_time,update_time) VALUES('子组',?1,1,1)",[root]).unwrap();
        let parent = db.last_insert_rowid();
        db.execute("INSERT INTO calendar_group(name,parent_group_id,create_time,update_time) VALUES('后代',?1,1,1)",[parent]).unwrap();
        db.execute(
            "UPDATE calendar SET group_id=?1 WHERE id=100",
            [db.last_insert_rowid()],
        )
        .unwrap();
        let current = super::super::plugin_schedule_data::directory(&db, "calendar", 100).unwrap();
        assert_eq!(current["writable"], false);
        let page = super::super::plugin_schedule_data::directories(
            &db,
            "calendar",
            &json!({"archived":false}),
        )
        .unwrap();
        assert!(page["items"].as_array().unwrap().contains(&current));
        assert!(super::super::calendar::find_writable_user_calendar(&db, Some(100)).is_err());
    }
}
