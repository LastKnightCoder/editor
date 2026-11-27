use super::{
    calendar_holidays::HolidayDays, calendar_time::CalendarTimeZone, common,
    plugin_data::sql_error, plugin_task_dates as dates, plugin_task_snapshots as snapshots,
    plugin_tasks,
};
use chrono::{TimeZone, Timelike};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

pub(super) fn patch_state(
    state: &Value,
    patch: &Value,
    zone: CalendarTimeZone,
) -> Result<Value, String> {
    let fields = patch
        .as_object()
        .filter(|v| !v.is_empty())
        .ok_or("实例补丁不能为空")?;
    if fields
        .keys()
        .any(|k| !["completed", "skipped", "scheduledAt"].contains(&k.as_str()))
        || (patch["completed"] == true && patch["skipped"] == true)
    {
        return Err("实例状态补丁无效".into());
    }
    let mut result = state.clone();
    for key in ["completed", "skipped"] {
        if fields.contains_key(key) && !patch[key].is_boolean() {
            return Err("实例状态须为布尔值".into());
        }
    }
    if fields.contains_key("completed") {
        result["completedAt"] = if patch["completed"] == true {
            state
                .get("completedAt")
                .filter(|v| !v.is_null())
                .cloned()
                .unwrap_or(json!(common::now_millis()))
        } else {
            Value::Null
        };
    }
    if fields.contains_key("skipped") {
        result["skipped"] = patch["skipped"].clone();
    }
    if patch["completed"] == true {
        result["skipped"] = json!(false);
    }
    if patch["skipped"] == true {
        result["completedAt"] = Value::Null;
    }
    if let Some(time) = fields.get("scheduledAt") {
        if !time.is_null() {
            dates::timestamp(time.as_str().ok_or("改期时间无效")?, zone)?;
        }
        result["scheduledAt"] = time.clone();
    }
    Ok(result)
}

pub(super) fn normalize_rule(rule: &Value) -> Value {
    let mut result = rule.clone();
    if let Some(fields) = result.as_object_mut() {
        for key in [
            "weekdays",
            "monthDay",
            "yearMonth",
            "yearDay",
            "excludeHolidays",
        ] {
            if fields.get(key).is_some_and(Value::is_null) {
                fields.remove(key);
            }
        }
        if let Some(days) = fields.get_mut("weekdays").and_then(Value::as_array_mut) {
            days.sort_by_key(Value::as_i64);
            days.dedup();
        }
    }
    result
}
pub(super) fn amend(segments: &Value, effective: &str, rule: &Value) -> Result<Value, String> {
    dates::day(effective)?;
    let normalized = normalize_rule(rule);
    let rule = &normalized;
    if !rule.is_null() {
        let fields = rule.as_object().ok_or("规则无效")?;
        if fields.keys().any(|k| {
            ![
                "type",
                "interval",
                "startDate",
                "endDate",
                "weekdays",
                "monthDay",
                "yearMonth",
                "yearDay",
                "maxOccurrences",
                "excludeHolidays",
            ]
            .contains(&k.as_str())
        }) {
            return Err("规则包含未知字段".into());
        }
        if !matches!(
            rule["type"].as_str(),
            Some("daily" | "weekdays" | "weekly" | "monthly" | "yearly" | "custom")
        ) || !rule["interval"]
            .as_i64()
            .is_some_and(|v| (1..=1000).contains(&v))
        {
            return Err("规则类型或间隔无效".into());
        }
        let start = rule["startDate"].as_str().ok_or("规则起点缺失")?;
        dates::day(start)?;
        if let Some(end) = rule["endDate"].as_str() {
            dates::day(end)?;
            if end < start {
                return Err("规则结束早于起点".into());
            }
        }
        for (key, max) in [
            ("monthDay", 31),
            ("yearMonth", 12),
            ("yearDay", 31),
            ("maxOccurrences", i64::MAX),
        ] {
            if let Some(value) = rule.get(key).filter(|v| !v.is_null()) {
                if !value.as_i64().is_some_and(|n| (1..=max).contains(&n)) {
                    return Err("规则数字无效".into());
                }
            }
        }
        if let Some(days) = rule.get("weekdays").filter(|v| !v.is_null()) {
            let days = days
                .as_array()
                .filter(|v| !v.is_empty() && v.len() <= 7)
                .ok_or("星期列表无效")?;
            if days
                .iter()
                .any(|v| !v.as_i64().is_some_and(|n| (0..=6).contains(&n)))
            {
                return Err("星期无效".into());
            }
        }
        if let Some(value) = rule.get("excludeHolidays") {
            if !value.is_boolean() {
                return Err("节假日选项无效".into());
            }
        }
    }
    let previous = segments.as_array().ok_or("规则分段无效")?;
    if previous
        .iter()
        .any(|s| s["effectiveDate"].as_str().is_some_and(|d| d > effective))
    {
        return Err("PLUGIN_CONFLICT: 已有更晚生效的规则".into());
    }
    let series = previous
        .iter()
        .find(|s| s["effectiveDate"] == effective)
        .and_then(|s| s["seriesId"].as_str())
        .map(str::to_owned)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let mut result = previous
        .iter()
        .filter(|s| s["effectiveDate"].as_str().is_some_and(|d| d < effective))
        .cloned()
        .collect::<Vec<_>>();
    let mut segment = previous
        .iter()
        .find(|value| value["effectiveDate"] == effective)
        .cloned()
        .unwrap_or(json!({}));
    segment["seriesId"] = json!(series);
    segment["effectiveDate"] = json!(effective);
    segment["rule"] = rule.clone();
    result.push(segment);
    Ok(json!(result))
}

pub(super) fn store(
    conn: &Connection,
    row: &Value,
    segments: &Value,
    states: &Value,
    zone: CalendarTimeZone,
) -> Result<(), String> {
    let id = row["id"].as_i64().ok_or("任务身份缺失")?;
    let created = row["create_time"].as_i64().ok_or("任务身份缺失")?;
    for (key, state) in states.as_object().ok_or("实例状态无效")? {
        let (series, date) = key.rsplit_once('/').ok_or("实例身份无效")?;
        conn.execute("INSERT INTO todo_occurrence_override VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(todo_item_id,todo_created_at,series_id,occurrence_date) DO UPDATE SET state_json=excluded.state_json,update_time=excluded.update_time",params![id,created,series,date,state.to_string(),common::now_millis()]).map_err(sql_error)?;
    }
    if !conn.query_row("SELECT EXISTS(SELECT 1 FROM todo_recurrence_history WHERE todo_item_id=?1 AND todo_created_at=?2)",params![id,created],|r|r.get::<_,bool>(0)).map_err(sql_error)? {
        if let Some((rule,time))=conn.query_row("SELECT id,create_time FROM todo_recurrence WHERE todo_item_id=?1",[id],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,i64>(1)?))).optional().map_err(sql_error)? {conn.execute("DELETE FROM todo_occurrence_override WHERE todo_item_id=?1 AND todo_created_at=?2 AND series_id=?3",params![id,created,format!("native:{rule}:{time}")]).map_err(sql_error)?;}
    }
    let segments = segments.as_array().ok_or("规则分段无效")?;
    for segment in segments {
        conn.execute(
            "INSERT INTO todo_recurrence_history VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(todo_item_id,todo_created_at,effective_date) DO UPDATE SET rule_json=excluded.rule_json WHERE todo_recurrence_history.rule_json IS NOT excluded.rule_json",
            params![
                segment["seriesId"].as_str(),
                id,
                created,
                segment["effectiveDate"].as_str(),
                if segment["rule"].is_null() {
                    None
                } else {
                    Some(segment["rule"].to_string())
                },
                common::now_millis()
            ],
        )
        .map_err(sql_error)?;
    }
    let today = dates::day_text(zone.day(common::now_millis()));
    let current = segments.iter().rev().find(|s| {
        s["effectiveDate"]
            .as_str()
            .is_some_and(|d| d <= today.as_str())
    });
    let current = current
        .filter(|value| !value["rule"].is_null())
        .or_else(|| {
            segments.iter().find(|value| {
                value["effectiveDate"]
                    .as_str()
                    .is_some_and(|date| date > today.as_str())
                    && !value["rule"].is_null()
            })
        });
    if let Some(rule) = current.map(|v| &v["rule"]).filter(|v| !v.is_null()) {
        let start = zone.day_start(dates::day(
            rule["startDate"].as_str().ok_or("规则起点无效")?,
        )?);
        let end = rule["endDate"]
            .as_str()
            .map(|v| dates::day(v).map(|d| zone.day_start(d)))
            .transpose()?;
        let old = conn
            .query_row(
                "SELECT id FROM todo_recurrence WHERE todo_item_id=?1",
                [id],
                |r| r.get::<_, i64>(0),
            )
            .optional()
            .map_err(sql_error)?;
        if let Some(old) = old {
            conn.execute("UPDATE todo_recurrence SET type=?1,interval=?2,weekdays=?3,month_day=?4,year_month=?5,year_day=?6,exclude_holidays=?7,start_date=?8,end_date=?9,max_occurrences=?10,update_time=?11 WHERE id=?12",params![rule["type"].as_str(),rule["interval"].as_i64(),rule.get("weekdays").filter(|v|!v.is_null()).map(Value::to_string),rule["monthDay"].as_i64(),rule["yearMonth"].as_i64(),rule["yearDay"].as_i64(),rule["excludeHolidays"]==true,start,end,rule["maxOccurrences"].as_i64(),common::now_millis(),old]).map_err(sql_error)?;
        } else {
            conn.execute("INSERT INTO todo_recurrence(todo_item_id,type,interval,weekdays,month_day,year_month,year_day,exclude_holidays,start_date,end_date,max_occurrences,create_time,update_time) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)",params![id,rule["type"].as_str(),rule["interval"].as_i64(),rule.get("weekdays").filter(|v|!v.is_null()).map(Value::to_string),rule["monthDay"].as_i64(),rule["yearMonth"].as_i64(),rule["yearDay"].as_i64(),rule["excludeHolidays"]==true,start,end,rule["maxOccurrences"].as_i64(),common::now_millis()]).map_err(sql_error)?;
        }
    } else {
        conn.execute("DELETE FROM todo_recurrence_completion WHERE recurrence_id IN (SELECT id FROM todo_recurrence WHERE todo_item_id=?1)",[id]).map_err(sql_error)?;
        conn.execute("DELETE FROM todo_recurrence WHERE todo_item_id=?1", [id])
            .map_err(sql_error)?;
    }
    conn.execute("UPDATE todo_item SET type='recurring' WHERE id=?1", [id])
        .map_err(sql_error)?;
    Ok(())
}

pub(super) fn missing_instance(error: &str) -> bool {
    [
        "实例不属于周期规则",
        "该日期已停止重复",
        "该日期不是有效原始周期实例",
    ]
    .contains(&error)
}

pub(super) fn read_document_reminders(
    node: &Value,
    zone: CalendarTimeZone,
) -> Result<Vec<Value>, String> {
    let stored = &node["taskReminder"];
    if stored["version"] == 2 {
        return stored["reminders"]
            .as_array()
            .cloned()
            .ok_or_else(|| "正文提醒列表无效".into());
    }
    let Some(at) = stored["at"].as_str() else {
        return Ok(vec![]);
    };
    if node["taskRecurrence"]["segments"]
        .as_array()
        .is_some_and(|s| !s.is_empty())
    {
        let time = dates::timestamp(at, zone)?;
        let local = zone
            .0
            .timestamp_millis_opt(time)
            .single()
            .ok_or("提醒时间无效")?;
        let clock = local.num_seconds_from_midnight() * 1000 + local.timestamp_subsec_millis();
        Ok(vec![json!({"offsetMs": -i64::from(clock)})])
    } else {
        Ok(vec![json!({"at": at})])
    }
}

pub(super) fn document_reminders(
    node: &mut Value,
    reminders: &Value,
    zone: CalendarTimeZone,
) -> Result<(), String> {
    let recurring = node["taskRecurrence"]["segments"]
        .as_array()
        .is_some_and(|v| !v.is_empty());
    let mut seen = std::collections::HashSet::new();
    let mut values = vec![];
    for reminder in reminders.as_array().ok_or("正文提醒列表无效")? {
        let (time, value) = if recurring {
            let offset = reminder["offsetMs"]
                .as_i64()
                .filter(|v| (-86_399_999..=0).contains(v) && reminder.get("at").is_none())
                .ok_or("重复正文提醒需要当日时刻偏移")?;
            (offset, json!({"offsetMs":offset}))
        } else {
            let at = reminder["at"]
                .as_str()
                .filter(|v| v.len() > 10 && reminder.get("offsetMs").is_none())
                .ok_or("普通正文提醒需要绝对时刻")?;
            (dates::timestamp(at, zone)?, json!({"at":at}))
        };
        if seen.insert(time) {
            values.push(value);
        }
    }
    node["taskReminder"] = if values.is_empty() {
        Value::Null
    } else {
        json!({"version":2,"reminders":values})
    };
    Ok(())
}

fn state_source(
    conn: &Connection,
    id: &str,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<(Value, Value), String> {
    let task = super::plugin_schedule_data::get(conn, "todo", id, zone, holidays)?;
    if task.is_null() || task.get("occurrence").is_some() {
        return Err("根任务已失效".into());
    }
    let meta = match plugin_tasks::parse_task(id)? {
        plugin_tasks::TaskId::Todo(id, _, None) => plugin_tasks::metadata_by_id(conn, id, zone)?,
        plugin_tasks::TaskId::Document(_, _, task, None) => {
            let body = super::plugin_document_tasks::read(conn, id, zone, holidays)?;
            super::plugin_document_tasks::meta(
                super::plugin_document_tasks::find(&body["document"]["content"], &task)
                    .ok_or("任务已删除")?,
            )?
        }
        _ => return Err("需要根任务身份".into()),
    };
    Ok((task, meta))
}

pub(super) fn state_dates(
    conn: &Connection,
    query: &Value,
    zone: CalendarTimeZone,
) -> Result<Vec<String>, String> {
    let id = query["taskId"].as_str().ok_or("根任务身份缺失")?;
    let (_, meta) = state_source(conn, id, zone, &HolidayDays::new())?;
    if !meta["segments"]
        .as_array()
        .is_some_and(|v| v.iter().any(|s| s["rule"]["excludeHolidays"] == true))
    {
        return Ok(vec![]);
    }
    let cursor = query["cursor"]
        .as_str()
        .map(serde_json::from_str::<Value>)
        .transpose()
        .map_err(|_| "实例游标无效")?
        .unwrap_or(json!({}));
    let after = cursor["after"].as_str().unwrap_or("");
    let limit = query["limit"]
        .as_u64()
        .filter(|v| (1..=100).contains(v))
        .ok_or("每页须为1-100条")? as usize;
    let states = meta["occurrenceState"].as_object().ok_or("实例状态无效")?;
    let mut keys = states
        .keys()
        .filter(|key| key.as_str() > after)
        .collect::<Vec<_>>();
    keys.sort();
    keys.into_iter()
        .take(limit)
        .map(|key| {
            key.rsplit_once('/')
                .map(|(_, date)| date.to_owned())
                .ok_or_else(|| "实例身份无效".into())
        })
        .collect()
}

pub(super) fn states(
    conn: &Connection,
    plugin: &str,
    query: &Value,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
    scope: &str,
) -> Result<Value, String> {
    let id = query["taskId"].as_str().ok_or("根任务身份缺失")?;
    let (task, meta) = state_source(conn, id, zone, holidays)?;
    let binding = snapshots::digest(&json!([scope, plugin, id]));
    let mut after = String::new();
    if let Some(cursor) = query["cursor"].as_str() {
        let cursor: Value = serde_json::from_str(cursor).map_err(|_| "实例游标无效")?;
        if cursor["binding"] != binding {
            return Err("实例游标范围无效".into());
        }
        if cursor["revision"] != task["revision"] {
            return Err("PLUGIN_CONFLICT: 实例状态已变化".into());
        }
        after = cursor["after"].as_str().ok_or("游标位置无效")?.into();
    }
    let limit = query["limit"]
        .as_u64()
        .filter(|n| (1..=100).contains(n))
        .ok_or("每页须为1-100条")? as usize;
    let states = meta["occurrenceState"].as_object().ok_or("实例状态无效")?;
    let mut keys = states.keys().filter(|k| *k > &after).collect::<Vec<_>>();
    keys.sort();
    let mut items = vec![];
    for key in keys.iter().take(limit) {
        let (series, date) = key.rsplit_once('/').ok_or("实例状态身份无效")?;
        let active = match plugin_tasks::occurrence(&meta, date, zone, holidays) {
            Ok((actual, _)) => actual == series,
            Err(error) if missing_instance(&error) => false,
            Err(error) => return Err(error),
        };
        items.push(json!({"taskId":id,"seriesId":series,"originalDate":date,"state":states[*key],"active":active}));
    }
    let mut result = json!({"taskRevision":task["revision"],"items":items});
    if keys.len() > limit {
        result["cursor"] = json!(
            json!({"binding":binding,"revision":task["revision"],"after":keys[limit-1]})
                .to_string()
        );
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_state_contract_matches_the_desktop_fixture() {
        let cases: Value = serde_json::from_str(include_str!(
            "../../../../../packages/shared/src/utils/__fixtures__/plugin-todo-states.json"
        ))
        .unwrap();
        let zone = CalendarTimeZone(chrono_tz::Asia::Shanghai);
        for case in cases.as_array().unwrap() {
            let result = patch_state(&case["state"], &case["patch"], zone);
            if case["reject"] == true {
                assert!(result.is_err());
            } else {
                let mut result = result.unwrap();
                if case["expected"]["completedAt"] == "now" {
                    assert!(result["completedAt"].as_i64().is_some_and(|v| v > 0));
                    result["completedAt"] = json!("now");
                }
                assert_eq!(result, case["expected"]);
            }
        }
    }
}
