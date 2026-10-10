use rusqlite::Transaction;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use tauri::AppHandle;

pub(crate) fn recurrence_state(conn: &Connection, todo_id: i64) -> Result<Value, String> {
    let mut segments = Vec::new();
    let mut statement = conn.prepare("SELECT h.series_id,h.effective_date,h.rule_json FROM todo_recurrence_history h JOIN todo_item t ON t.id=h.todo_item_id AND t.create_time=h.todo_created_at WHERE t.id=?1 ORDER BY h.effective_date").map_err(|e|e.to_string())?;
    let rows = statement
        .query_map([todo_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (series, date, rule) = row.map_err(|e| e.to_string())?;
        let rule: Value = rule
            .map(|value| serde_json::from_str(&value))
            .transpose()
            .map_err(|e| e.to_string())?
            .unwrap_or(Value::Null);
        segments.push(json!({"seriesId":series,"effectiveDate":date,"rule":rule}));
    }
    let mut states = serde_json::Map::new();
    let mut statement = conn.prepare("SELECT o.series_id,o.occurrence_date,o.state_json FROM todo_occurrence_override o JOIN todo_item t ON t.id=o.todo_item_id AND t.create_time=o.todo_created_at WHERE t.id=?1").map_err(|e|e.to_string())?;
    let rows = statement
        .query_map([todo_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (series, date, state) = row.map_err(|e| e.to_string())?;
        states.insert(
            format!("{series}/{date}"),
            serde_json::from_str(&state).map_err(|e| e.to_string())?,
        );
    }
    Ok(json!({"segments":segments,"occurrenceState":states}))
}

#[tauri::command]
pub fn todo_get_assistant_states(app: AppHandle, ids: Vec<i64>) -> Result<Value, String> {
    if ids.len() > 1000 {
        return Err("INVALID_ARGUMENT: 待办数量过多".into());
    }
    let conn = super::schema::open_active_database(&app)?;
    let mut result = serde_json::Map::new();
    for id in ids {
        result.insert(id.to_string(), recurrence_state(&conn, id)?);
    }
    Ok(Value::Object(result))
}

pub(crate) fn next_id(conn: &Connection, table: &str) -> Result<i64, String> {
    if !["todo_item", "calendar_event", "contents"].contains(&table) {
        return Err("INVALID_ARGUMENT: 非任务实体".into());
    }
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS migration_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)",
    )
    .map_err(|e| e.to_string())?;
    let key = format!("task:id-seq:{table}");
    let id=conn.query_row(&format!("SELECT MAX(COALESCE((SELECT MAX(id) FROM {table}),0),COALESCE((SELECT CAST(value AS INTEGER) FROM migration_meta WHERE key=?1),0))+1"),[&key],|row|row.get::<_,i64>(0)).map_err(|e|e.to_string())?;
    conn.execute("INSERT INTO migration_meta(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,id.to_string()]).map_err(|e|e.to_string())?;
    Ok(id)
}

pub(crate) fn sync_completion(
    conn: &Connection,
    recurrence_id: i64,
    date: i64,
    completed: Option<i64>,
    skipped: bool,
    zone: super::calendar_time::CalendarTimeZone,
) -> Result<(), String> {
    let day = chrono::NaiveDate::from_ymd_opt(1970, 1, 1).unwrap()
        + chrono::Duration::days(zone.day(date));
    conn.execute("UPDATE todo_occurrence_override SET state_json=json_set(state_json,'$.completedAt',?1,'$.skipped',json(?2)),update_time=?3 WHERE todo_item_id IN (SELECT todo_item_id FROM todo_recurrence WHERE id=?4) AND occurrence_date=?5",params![completed,if skipped {"true"} else {"false"},super::common::now_millis(),recurrence_id,day.format("%Y-%m-%d").to_string()]).map_err(|e|e.to_string())?;
    Ok(())
}

pub(crate) fn original_date(
    tx: &Transaction<'_>,
    recurrence_id: i64,
    date: i64,
    zone: super::calendar_time::CalendarTimeZone,
) -> Result<i64, String> {
    let id = tx
        .query_row(
            "SELECT todo_item_id FROM todo_recurrence WHERE id=?1",
            [recurrence_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?;
    let day = zone.day(date);
    let candidates = super::todo_calendar_sync::assistant_occurrences(
        tx,
        id,
        day,
        day,
        zone,
        &super::calendar_holidays::HolidayDays::new(),
    )?;
    if let Some(candidates) = candidates {
        if candidates.len() > 1 {
            return Err("OCCURRENCE_AMBIGUOUS: 当天有多个实例，请在助理中明确原始日期".into());
        }
        if let Some((original, _)) = candidates.first_key_value() {
            return Ok(zone.day_start(*original));
        }
    }
    Ok(date)
}

pub(crate) fn stop_rule(
    conn: &Connection,
    todo_id: i64,
    zone: super::calendar_time::CalendarTimeZone,
) -> Result<(), String> {
    let metadata = recurrence_state(conn, todo_id)?;
    let Some(segments) = metadata["segments"]
        .as_array()
        .filter(|rows| !rows.is_empty())
    else {
        return Ok(());
    };
    let now = super::common::now_millis();
    let day_string = |time| {
        (chrono::NaiveDate::from_ymd_opt(1970, 1, 1).unwrap()
            + chrono::Duration::days(zone.day(time)))
        .format("%Y-%m-%d")
        .to_string()
    };
    let today = day_string(now);
    if segments.iter().any(|entry| {
        entry["effectiveDate"]
            .as_str()
            .is_some_and(|date| date > today.as_str())
    }) {
        return Err("VERSION_CONFLICT: 已有未来规则，请通过助理明确停止日期".into());
    }
    let created = conn
        .query_row(
            "SELECT create_time FROM todo_item WHERE id=?1",
            [todo_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?;
    let mut statement=conn.prepare("SELECT c.scheduled_date,c.completed_at,c.skipped FROM todo_recurrence_completion c JOIN todo_recurrence r ON r.id=c.recurrence_id WHERE r.todo_item_id=?1").map_err(|e|e.to_string())?;
    let records = statement
        .query_map([todo_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    for (date, completed, skipped) in records {
        let day = day_string(date);
        if let Some(segment) = segments.iter().rev().find(|entry| {
            entry["effectiveDate"]
                .as_str()
                .is_some_and(|effective| effective <= day.as_str())
        }) {
            conn.execute(
                "INSERT OR IGNORE INTO todo_occurrence_override VALUES(?1,?2,?3,?4,?5,?6)",
                params![
                    todo_id,
                    created,
                    segment["seriesId"].as_str(),
                    day,
                    json!({"completedAt":completed,"skipped":skipped!=0}).to_string(),
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    let series = segments
        .iter()
        .find(|entry| entry["effectiveDate"].as_str() == Some(today.as_str()))
        .and_then(|entry| entry["seriesId"].as_str())
        .map(str::to_owned)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    conn.execute("INSERT INTO todo_recurrence_history VALUES(?1,?2,?3,?4,NULL,?5) ON CONFLICT(todo_item_id,todo_created_at,effective_date) DO UPDATE SET rule_json=NULL",params![series,todo_id,created,today,now]).map_err(|e|e.to_string())?;
    Ok(())
}

pub(crate) fn record_rule_change(
    conn: &Connection,
    recurrence: &super::todo::TodoRecurrence,
    zone: super::calendar_time::CalendarTimeZone,
) -> Result<(), String> {
    let metadata = recurrence_state(conn, recurrence.todo_item_id)?;
    let Some(segments) = metadata["segments"]
        .as_array()
        .filter(|rows| !rows.is_empty())
    else {
        return Ok(());
    };
    let format = |timestamp| {
        (chrono::NaiveDate::from_ymd_opt(1970, 1, 1).unwrap()
            + chrono::Duration::days(zone.day(timestamp)))
        .format("%Y-%m-%d")
        .to_string()
    };
    let now = super::common::now_millis();
    let date = format(now);
    if segments.iter().any(|row| {
        row["effectiveDate"]
            .as_str()
            .is_some_and(|day| day > date.as_str())
    }) {
        return Err("VERSION_CONFLICT: 已有未来生效的规则，请明确修改区间".into());
    }
    let series = segments
        .iter()
        .find(|row| row["effectiveDate"].as_str() == Some(date.as_str()))
        .and_then(|row| row["seriesId"].as_str())
        .map(str::to_owned)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let rule = json!({"type":recurrence.r#type,"interval":recurrence.interval,"startDate":format(recurrence.start_date),"endDate":recurrence.end_date.map(format),"weekdays":recurrence.weekdays,"monthDay":recurrence.month_day,"yearMonth":recurrence.year_month,"yearDay":recurrence.year_day,"maxOccurrences":recurrence.max_occurrences,"excludeHolidays":recurrence.exclude_holidays});
    conn.execute("INSERT INTO todo_recurrence_history SELECT ?1,id,create_time,?2,?3,?4 FROM todo_item WHERE id=?5 ON CONFLICT(todo_item_id,todo_created_at,effective_date) DO UPDATE SET rule_json=excluded.rule_json",params![series,date,rule.to_string(),now,recurrence.todo_item_id]).map_err(|e|e.to_string())?;
    Ok(())
}

pub(crate) fn reconcile_document_links(
    conn: &Connection,
    content_id: i64,
    content: Option<&Value>,
) -> Result<(), String> {
    fn find<'a>(value: &'a Value, task: &str) -> Option<&'a Value> {
        if value["type"] == "check-list-item" && value["taskId"].as_str() == Some(task) {
            return Some(value);
        }
        if let Some(items) = value.as_array().or_else(|| value["children"].as_array()) {
            for child in items {
                if let Some(found) = find(child, task) {
                    return Some(found);
                }
            }
        }
        None
    }
    let mut stmt=conn.prepare("SELECT l.calendar_event_id,l.task_id,e.start_date,e.start_time,e.all_day,e.detail_content_id FROM doc_task_calendar_link l JOIN calendar_event e ON e.id=l.calendar_event_id WHERE l.content_id=?1").map_err(|e|e.to_string())?;
    let rows = stmt
        .query_map([content_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    for (id, task, date, minute, all_day, detail) in rows {
        if let Some(node) = content.and_then(|value| find(value, &task)) {
            let title =
                super::common::json_content_plain_text(Some(node["children"][0].to_string()));
            let mut title = title;
            let mut groups = conn
                .prepare("SELECT title FROM todo_group ORDER BY length(title) DESC")
                .map_err(|e| e.to_string())?;
            for group in groups
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?
            {
                title = title.replacen(&format!("#{}", group.map_err(|e| e.to_string())?), "", 1);
            }
            let title = title
                .split_whitespace()
                .filter(|word| {
                    !["%Y-%m-%d", "%Y/%m/%d", "%Y年%m月%d日"]
                        .iter()
                        .any(|format| chrono::NaiveDate::parse_from_str(word, format).is_ok())
                        && chrono::DateTime::parse_from_rfc3339(word).is_err()
                })
                .collect::<Vec<_>>()
                .join(" ");
            conn.execute(
                "UPDATE calendar_event SET title=?1,update_time=?2 WHERE id=?3 AND title<>?1",
                params![title, super::common::now_millis(), id],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "DELETE FROM doc_task_calendar_link WHERE calendar_event_id=?1",
                [id],
            )
            .map_err(|e| e.to_string())?;
            let starts = date
                + if all_day != 0 {
                    0
                } else {
                    minute.unwrap_or(0) * 60_000
                };
            if starts > super::common::now_millis() {
                if detail > 0 {
                    super::common::decrement_or_delete_content(conn, detail)?;
                }
                conn.execute("DELETE FROM calendar_event WHERE id=?1", [id])
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

pub(crate) fn release_todo_schedules(conn: &Connection, todo_id: i64) -> Result<(), String> {
    let mut statement=conn.prepare("SELECT id,start_date+CASE WHEN all_day=1 THEN 0 ELSE COALESCE(start_time,0)*60000 END,detail_content_id FROM calendar_event WHERE todo_item_id=?1").map_err(|e|e.to_string())?;
    let rows = statement
        .query_map([todo_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    for (id, start, detail) in rows {
        conn.execute(
            "DELETE FROM todo_schedule_occurrence WHERE calendar_event_id=?1",
            [id],
        )
        .map_err(|e| e.to_string())?;
        if start > super::common::now_millis() {
            if detail > 0 {
                super::common::decrement_or_delete_content(conn, detail)?;
            }
            conn.execute("DELETE FROM calendar_event WHERE id=?1", [id])
                .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "UPDATE calendar_event SET todo_item_id=NULL WHERE id=?1",
                [id],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
