use super::{
    assistant_tasks, calendar_holidays::HolidayDays, calendar_time::CalendarTimeZone, common,
    plugin_data::sql_error, plugin_task_dates as dates, plugin_task_snapshots as snapshots,
    todo_calendar_sync,
};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::{json, Value};
use tauri::{AppHandle, WebviewWindow};

#[derive(Clone, Debug)]
pub(super) enum TaskId {
    Todo(i64, i64, Option<String>),
    Document(i64, i64, String, Option<String>),
}
pub(super) fn parse_task(value: &str) -> Result<TaskId, String> {
    let (base, occurrence) = if let Some((base, date)) = value.rsplit_once('@') {
        dates::day(date)?;
        (base, Some(date.to_owned()))
    } else {
        (value, None)
    };
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
        "document" if parts.len() == 4 && !parts[3].is_empty() => {
            Ok(TaskId::Document(id, created, parts[3].into(), occurrence))
        }
        _ => Err("待办身份无效".into()),
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
    let id = row["id"].as_i64().ok_or("待办身份无效")?;
    let mut result = assistant_tasks::recurrence_state(conn, id)?;
    if result["segments"]
        .as_array()
        .is_some_and(|segments| !segments.is_empty())
    {
        return Ok(result);
    }
    if let Some(rule) =
        snapshots::rows(conn, "todo_recurrence", "todo_item_id=?1", vec![id.into()])?.first()
    {
        let series = format!("native:{}:{}", rule["id"], rule["create_time"]);
        let start = dates::day_text(zone.day(rule["start_date"].as_i64().ok_or("周期起点无效")?));
        let rule_value = json!({"type":rule["type"],"interval":rule["interval"],"startDate":start,"endDate":rule["end_date"].as_i64().map(|value|dates::day_text(zone.day(value))),"weekdays":rule["weekdays"].as_str().and_then(|raw|serde_json::from_str::<Value>(raw).ok()),"monthDay":rule["month_day"],"yearMonth":rule["year_month"],"yearDay":rule["year_day"],"maxOccurrences":rule["max_occurrences"],"excludeHolidays":rule["exclude_holidays"]==1});
        result["segments"] = json!([{"seriesId":series,"effectiveDate":start,"rule":rule_value}]);
        for completion in snapshots::rows(
            conn,
            "todo_recurrence_completion",
            "recurrence_id=?1",
            vec![rule["id"].as_i64().ok_or("周期身份无效")?.into()],
        )? {
            let key = format!(
                "{series}/{}",
                dates::day_text(
                    zone.day(
                        completion["scheduled_date"]
                            .as_i64()
                            .ok_or("实例日期无效")?
                    )
                )
            );
            if result["occurrenceState"].get(&key).is_none() {
                result["occurrenceState"][key] = json!({"completedAt":completion["completed_at"],"skipped":completion["skipped"]==1});
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
pub(super) fn task_dto(
    conn: &Connection,
    row: &Value,
    date: Option<&str>,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    let id = row["id"].as_i64().ok_or("待办身份无效")?;
    let created = row["create_time"].as_i64().ok_or("待办身份无效")?;
    let meta = metadata(conn, row, zone)?;
    let mut title = json!({"id":format!("todo:{id}:{created}"),"title":row["title"],"completed":row["is_completed"]==1,"archived":row["is_archived"]==1,"dueAt":row["due_at"].as_i64().map(dates::iso).transpose()?});
    if let Some(date) = date {
        let (series, state) = occurrence(&meta, date, zone, holidays)?;
        title["id"] = json!(format!("todo:{id}:{created}@{date}"));
        title["completed"] = json!(!state["completedAt"].is_null());
        title["dueAt"] = state
            .get("scheduledAt")
            .filter(|value| !value.is_null())
            .cloned()
            .unwrap_or(json!(date));
        title["revision"] = json!(snapshots::digest(
            &json!({"row":row,"segments":meta["segments"],"series":series,"date":date,"state":state})
        ));
    } else {
        let mut captured = snapshots::capture_todo(conn, id)?;
        let children=snapshots::rows(conn,"todo_item","id IN (WITH RECURSIVE nested(id) AS (SELECT id FROM todo_item WHERE parent_id=?1 UNION SELECT t.id FROM todo_item t JOIN nested n ON t.parent_id=n.id) SELECT id FROM nested LIMIT 1001)",vec![id.into()])?;
        if children.len() > 1000 {
            return Err("待办子项超过操作预算".into());
        }
        captured["descendants"] = json!(children);
        title["revision"] = json!(snapshots::digest(&captured));
    }
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
    if task["archived"] == true {
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
    let source = query["source"].as_str().unwrap_or("all");
    let mut items = vec![];
    let mut examined = 0;
    loop {
        let candidates = super::plugin_document_tasks::candidates(conn, source, position, 100)?;
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
fn user_calendar(conn: &Connection, id: Option<i64>) -> Result<i64, String> {
    let sql="WITH RECURSIVE system(id) AS (SELECT id FROM calendar_group WHERE is_system=1 UNION SELECT g.id FROM calendar_group g JOIN system s ON g.parent_group_id=s.id) SELECT id FROM calendar WHERE archived=0 AND (group_id IS NULL OR group_id NOT IN (SELECT id FROM system)) AND (?1 IS NULL OR id=?1) ORDER BY order_index,id LIMIT 1";
    conn.query_row(sql, [id], |row| row.get(0))
        .optional()
        .map_err(sql_error)?
        .ok_or_else(|| "请先选择或创建一个可写用户日历".into())
}
fn event_dto(conn: &Connection, row: &Value, zone: CalendarTimeZone) -> Result<Value, String> {
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
        result["todoId"] = json!(format!(
            "document:{}:{}:{}",
            link["content_id"],
            link["content_created_at"],
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
    Ok(result)
}
pub(super) fn query_calendar(
    conn: &mut Connection,
    query: &Value,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    let range = dates::window(query, zone, true)?.ok_or("日程查询缺少窗口")?;
    if range.0 == range.1 {
        return Ok(json!({"items":[]}));
    }
    let size = limit(query)?;
    let (fingerprint, offset, virtual_offset) = cursor(query, zone, "calendar")?;
    let tx = conn.transaction().map_err(sql_error)?;
    let calendars = todo_calendar_sync::ensure_todo_calendars(&tx)?;
    let mut stmt=tx.prepare("SELECT id FROM calendar_event WHERE start_date<?2 AND COALESCE(end_date,start_date)>=?1 AND NOT EXISTS(SELECT 1 FROM todo_calendar_mapping m WHERE m.calendar_event_id=calendar_event.id AND m.sync_type='recurring') ORDER BY start_date,COALESCE(start_time,0),id LIMIT 2001 OFFSET ?3").map_err(sql_error)?;
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
                virtuals.push(json!({"id":format!("{negative}:0"),"revision":task["revision"],"title":task["title"],"start":dates::day_text(zone.day(start)),"end":dates::day_text(zone.day(end)),"allDay":true,"calendarId":if view=="occurrences"{calendars.recurring.to_string()}else{calendars.deadline.to_string()},"todoId":task["id"]}));
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
            if input["patch"].get("title").is_some() {
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
        let latest = meta["segments"]
            .as_array()
            .and_then(|segments| segments.last())
            .and_then(|segment| segment["seriesId"].as_str());
        if latest == Some(series.as_str()) && action != "update" {
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
    let result = if action == "create" {
        super::todo::ensure_system_groups(&tx)?;
        let group:i64=tx.query_row("SELECT id FROM todo_group WHERE is_system=1 AND system_type='normal' AND is_archived=0 ORDER BY id LIMIT 1",[],|row|row.get(0)).map_err(sql_error)?;
        let due = dates::deadline(&write["input"]["dueAt"], zone)?;
        let id = assistant_tasks::next_id(&tx, "todo_item")?;
        tx.execute("INSERT INTO todo_item(id,group_id,title,type,due_at,create_time,update_time,sort_index) VALUES(?1,?2,?3,?4,?5,?6,?6,COALESCE((SELECT MAX(sort_index)+1024 FROM todo_item WHERE group_id=?2),1024))",params![id,group,write["input"]["title"].as_str().ok_or("缺少标题")?,if due.is_some(){"deadline"}else{"normal"},due,now]).map_err(sql_error)?;
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
        let before = if action == "delete" {
            Some(snapshots::capture_todo(&tx, id)?)
        } else {
            None
        };
        if let Some(date) = &date {
            update_instance(&tx, &row, date, action, write, zone, holidays)?;
        } else {
            match action {
                "update" => {
                    let patch = &write["patch"];
                    let due = if patch.get("dueAt").is_some() {
                        dates::deadline(&patch["dueAt"], zone)?
                    } else {
                        row["due_at"].as_i64()
                    };
                    let recurring = row["type"] == "recurring";
                    tx.execute("UPDATE todo_item SET title=?1,due_at=?2,type=?3,remind_before=CASE WHEN ?2 IS NULL AND ?3<>'recurring' THEN NULL ELSE remind_before END,update_time=MAX(update_time+1,?4) WHERE id=?5",params![patch["title"].as_str().unwrap_or(row["title"].as_str().unwrap_or("")),due,if recurring{"recurring"}else if due.is_some(){"deadline"}else{"normal"},now,id]).map_err(sql_error)?;
                    tx.execute("UPDATE calendar_event SET title=?1,update_time=MAX(update_time+1,?2) WHERE todo_item_id=?3",params![patch["title"].as_str().unwrap_or(row["title"].as_str().unwrap_or("")),now,id]).map_err(sql_error)?;
                    todo_calendar_sync::sync_single_item(&tx, id, zone)?;
                }
                "complete" => {
                    let affected=snapshots::rows(&tx,"todo_item","id IN (WITH RECURSIVE descendants(id) AS (SELECT ?1 UNION SELECT t.id FROM todo_item t JOIN descendants d ON t.parent_id=d.id) SELECT id FROM descendants LIMIT 1001)",vec![id.into()])?;
                    if affected.len() > 1000 {
                        return Err("子待办超过单次操作预算".into());
                    }
                    for task in &affected {
                        if task["type"] == "recurring"
                            || active_recurrence(&metadata(&tx, task, zone)?, zone)
                        {
                            return Err("周期待办须指定实例，不能整系列或连同子项完成".into());
                        }
                    }
                    for task in affected {
                        tx.execute("UPDATE todo_item SET is_completed=?1,completed_at=?2,update_time=MAX(update_time+1,?3) WHERE id=?4",params![write["completed"]==true,if write["completed"]==true{Some(now)}else{None},now,task["id"].as_i64()]).map_err(sql_error)?;
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
            let after = if date.is_some() {
                snapshots::capture_todo(&tx, id)?
            } else {
                snapshots::known(&tx, &before)?
            };
            snapshots::record(
                &tx,
                plugin,
                "todo",
                write["id"].as_str().ok_or("身份无效")?,
                row["title"].as_str().unwrap_or(""),
                &before,
                &after,
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
    tx.commit().map_err(sql_error)?;
    Ok(result)
}
fn parse_event(value: &str) -> Result<(i64, i64), String> {
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
    let result = if action == "create" {
        let input = &write["input"];
        let calendar = user_calendar(
            &tx,
            input["calendarId"]
                .as_str()
                .map(str::parse::<i64>)
                .transpose()
                .map_err(|_| "日历身份无效")?,
        )?;
        let fields = dates::schedule(input, zone)?;
        let id = assistant_tasks::next_id(&tx, "calendar_event")?;
        tx.execute("INSERT INTO calendar_event(id,create_time,update_time,calendar_id,title,detail_content_id,start_date,end_date,start_time,end_time,all_day) VALUES(?1,?2,?2,?3,?4,0,?5,?6,?7,?8,?9)",params![id,now,calendar,input["title"].as_str().ok_or("缺少日程标题")?,fields["start_date"].as_i64(),fields["end_date"].as_i64(),fields["start_time"].as_i64(),fields["end_time"].as_i64(),fields["all_day"].as_i64()]).map_err(sql_error)?;
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
        user_calendar(&tx, row["calendar_id"].as_i64())?;
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
        } else if action == "update" {
            let patch = &write["patch"];
            if patch.get("title").is_some() && current.get("todoId").is_some() {
                return Err("关联安排的标题跟随待办，请修改待办标题".into());
            }
            let mut merged = current;
            for (key, value) in patch.as_object().ok_or("日程修改字段无效")? {
                merged[key] = value.clone();
            }
            let calendar = user_calendar(
                &tx,
                merged["calendarId"]
                    .as_str()
                    .map(str::parse::<i64>)
                    .transpose()
                    .map_err(|_| "日历身份无效")?,
            )?;
            let fields = dates::schedule(&merged, zone)?;
            tx.execute("UPDATE calendar_event SET title=?1,calendar_id=?2,start_date=?3,end_date=?4,start_time=?5,end_time=?6,all_day=?7,update_time=MAX(update_time+1,?8) WHERE id=?9",params![merged["title"].as_str(),calendar,fields["start_date"].as_i64(),fields["end_date"].as_i64(),fields["start_time"].as_i64(),fields["end_time"].as_i64(),fields["all_day"].as_i64(),now,id]).map_err(sql_error)?;
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
    let range = if request["method"] == "calendar" || request["query"]["view"] == "occurrences" {
        dates::window(&request["query"], zone, true)?
    } else {
        request["write"]["id"]
            .as_str()
            .or(request["id"].as_str())
            .and_then(|id| id.rsplit_once('@'))
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
        conn.query_row("SELECT EXISTS(SELECT 1 FROM todo_recurrence WHERE exclude_holidays=1) OR EXISTS(SELECT 1 FROM todo_recurrence_history WHERE json_valid(rule_json) AND json_extract(rule_json,'$.excludeHolidays')=1) OR EXISTS(SELECT 1 FROM contents WHERE instr(content,'excludeHolidays')>0)",[],|row|row.get::<_,bool>(0)).map_err(sql_error)
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
        let result = if request["method"] == "restore-stage" {
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
        )
        .unwrap();
        assert_eq!(schedule["start_date"], schedule["end_date"]);
        assert_eq!(
            zone.day_start(zone.day(schedule["start_date"].as_i64().unwrap()) + 1)
                - schedule["start_date"].as_i64().unwrap(),
            23 * 3600_000
        );
        assert!(dates::schedule(&json!({"start":"2026-11-01T01:30:00-05:00","end":"2026-11-01T02:30:00-05:00","allDay":false}),zone).is_err());
        assert!(dates::schedule(&json!({"start":"2026-10-28T10:00:01+08:00","end":"2026-10-28T11:00:00+08:00","allDay":false}),ZONE).is_err());
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
}
