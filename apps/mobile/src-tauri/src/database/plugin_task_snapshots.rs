use super::{common, plugin_data::sql_error};
use rusqlite::{params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
pub(super) const RETENTION: i64 = 7 * 24 * 60 * 60 * 1000;
pub(super) fn digest(value: &Value) -> String {
    format!("{:x}", Sha256::digest(value.to_string().as_bytes()))
}
pub(super) fn rows(
    conn: &Connection,
    table: &str,
    condition: &str,
    values: Vec<SqlValue>,
) -> Result<Vec<Value>, String> {
    keys(table)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT * FROM {table} WHERE {condition} ORDER BY {}",
            keys(table)?.join(",")
        ))
        .map_err(sql_error)?;
    let names = stmt
        .column_names()
        .into_iter()
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let found = stmt
        .query_map(params_from_iter(values), |row| {
            let mut result = serde_json::Map::new();
            for (index, name) in names.iter().enumerate() {
                result.insert(
                    name.clone(),
                    match row.get_ref(index)? {
                        rusqlite::types::ValueRef::Null => Value::Null,
                        rusqlite::types::ValueRef::Integer(value) => json!(value),
                        rusqlite::types::ValueRef::Real(value) => json!(value),
                        rusqlite::types::ValueRef::Text(value) => {
                            json!(String::from_utf8_lossy(value))
                        }
                        _ => return Err(rusqlite::Error::InvalidQuery),
                    },
                );
            }
            Ok(Value::Object(result))
        })
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    Ok(found)
}
fn keys(table: &str) -> Result<Vec<&'static str>, String> {
    Ok(match table {
        "todo_item"
        | "todo_recurrence"
        | "todo_recurrence_completion"
        | "todo_calendar_mapping"
        | "todo_note_link"
        | "calendar_event"
        | "todo_group"
        | "calendar" => vec!["id"],
        "doc_task_calendar_link" | "todo_schedule_occurrence" => vec!["calendar_event_id"],
        "todo_recurrence_history" => vec!["series_id"],
        "todo_occurrence_override" => vec![
            "todo_item_id",
            "todo_created_at",
            "series_id",
            "occurrence_date",
        ],
        _ => return Err("恢复快照包含未知表".into()),
    })
}
fn sql_value(value: &Value) -> Result<SqlValue, String> {
    Ok(match value {
        Value::Null => SqlValue::Null,
        Value::String(text) => SqlValue::Text(text.clone()),
        Value::Number(number) => SqlValue::Integer(number.as_i64().ok_or("恢复字段无效")?),
        _ => return Err("恢复字段无效".into()),
    })
}
pub(super) fn row(conn: &Connection, table: &str, id: i64) -> Result<Option<Value>, String> {
    Ok(rows(conn, table, "id=?1", vec![id.into()])?
        .into_iter()
        .next())
}
fn dependencies(conn: &Connection, mut snapshot: Value) -> Result<Value, String> {
    for (table, source, field) in [
        ("todo_group", "todo_item", "group_id"),
        ("calendar", "calendar_event", "calendar_id"),
    ] {
        let mut found = vec![];
        let mut ids = std::collections::BTreeSet::new();
        for item in snapshot[source].as_array().into_iter().flatten() {
            if let Some(id) = item[field].as_i64() {
                ids.insert(id);
            }
        }
        for id in ids {
            if let Some(row) = row(conn, table, id)? {
                found.push(json!({"id":id,"create_time":row["create_time"]}));
            }
        }
        snapshot[table] = json!(found);
    }
    Ok(snapshot)
}
pub(super) fn capture_events(conn: &Connection, ids: &[i64]) -> Result<Value, String> {
    let mut result = json!({});
    for table in [
        "calendar_event",
        "doc_task_calendar_link",
        "todo_schedule_occurrence",
    ] {
        let mut found = vec![];
        for id in ids {
            found.extend(rows(
                conn,
                table,
                if table == "calendar_event" {
                    "id=?1"
                } else {
                    "calendar_event_id=?1"
                },
                vec![(*id).into()],
            )?);
        }
        result[table] = json!(found);
    }
    dependencies(conn, result)
}
pub(super) fn capture_todo(conn: &Connection, id: i64) -> Result<Value, String> {
    let mut result = json!({});
    for (table, condition) in [
        ("todo_item", "id=?1"),
        ("todo_recurrence", "todo_item_id=?1"),
        (
            "todo_recurrence_completion",
            "recurrence_id IN (SELECT id FROM todo_recurrence WHERE todo_item_id=?1)",
        ),
        ("todo_calendar_mapping", "todo_item_id=?1"),
        ("todo_note_link", "todo_id=?1"),
        ("todo_recurrence_history", "todo_item_id=?1"),
        ("todo_occurrence_override", "todo_item_id=?1"),
    ] {
        result[table] = json!(rows(conn, table, condition, vec![id.into()])?);
    }
    let events=rows(conn,"calendar_event","todo_item_id=?1 OR id IN (SELECT calendar_event_id FROM todo_calendar_mapping WHERE todo_item_id=?1)",vec![id.into()])?;
    let ids = events
        .iter()
        .filter_map(|row| row["id"].as_i64())
        .collect::<Vec<_>>();
    let event_snapshot = capture_events(conn, &ids)?;
    for (key, value) in event_snapshot.as_object().ok_or("快照无效")? {
        result[key] = value.clone();
    }
    dependencies(conn, result)
}
pub(super) fn known(conn: &Connection, snapshot: &Value) -> Result<Value, String> {
    let mut result = json!({});
    for (table, list) in snapshot.as_object().ok_or("快照无效")? {
        let mut current = vec![];
        for item in list.as_array().ok_or("快照行无效")? {
            let fields = keys(table)?;
            let values = fields
                .iter()
                .map(|key| sql_value(&item[*key]))
                .collect::<Result<Vec<_>, _>>()?;
            for row in rows(
                conn,
                table,
                &fields
                    .iter()
                    .map(|key| format!("{key}=?"))
                    .collect::<Vec<_>>()
                    .join(" AND "),
                values,
            )? {
                current.push(if table == "calendar" || table == "todo_group" {
                    json!({"id":row["id"],"create_time":row["create_time"]})
                } else {
                    row
                });
            }
        }
        result[table] = json!(current);
    }
    Ok(result)
}
fn references(snapshot: &Value) -> std::collections::BTreeMap<i64, i64> {
    let mut result = std::collections::BTreeMap::new();
    for (table, field) in [
        ("todo_item", "description_content_id"),
        ("todo_note_link", "content_id"),
        ("calendar_event", "detail_content_id"),
    ] {
        for row in snapshot[table].as_array().into_iter().flatten() {
            if table == "calendar_event"
                && snapshot["todo_calendar_mapping"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .any(|link| link["calendar_event_id"] == row["id"])
            {
                continue;
            }
            if let Some(id) = row[field].as_i64().filter(|id| *id > 0) {
                *result.entry(id).or_insert(0) += 1;
            }
        }
    }
    result
}
pub(super) fn record(
    conn: &Connection,
    plugin: &str,
    entity: &str,
    identity: &str,
    title: &str,
    before: &Value,
    after: &Value,
) -> Result<(), String> {
    let operation = uuid::Uuid::new_v4().to_string();
    let now = common::now_millis();
    for id in references(before).keys() {
        let created = conn
            .query_row(
                "SELECT create_time FROM contents WHERE id=?1",
                [id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(sql_error)?;
        conn.execute(
            "UPDATE contents SET ref_count=ref_count+1 WHERE id=?1",
            [id],
        )
        .map_err(sql_error)?;
        conn.execute(
            "DELETE FROM content_pending_releases WHERE content_id=?1",
            [id],
        )
        .map_err(sql_error)?;
        conn.execute(
            "INSERT INTO task_assistant_content_pin VALUES(?1,?2,?3)",
            params![operation, id, created],
        )
        .map_err(sql_error)?;
    }
    let mut task_dependencies = vec![];
    for event in before["calendar_event"].as_array().into_iter().flatten() {
        if let Some(id) = event["todo_item_id"].as_i64() {
            if let Some(row) = row(conn, "todo_item", id)? {
                task_dependencies.push(json!({"id":id,"create_time":row["create_time"]}));
            }
        }
    }
    for task in before["todo_item"].as_array().into_iter().flatten() {
        if let Some(parent) = task["parent_id"].as_i64() {
            if let Some(row) = row(conn, "todo_item", parent)? {
                task_dependencies.push(json!({"id":parent,"create_time":row["create_time"]}));
            }
        }
    }
    let before_state = json!({"rows":before,"mobileTaskDependencies":task_dependencies});
    let after_state = json!({"rows":after});
    conn.execute("INSERT INTO task_assistant_operation(id,batch_id,request_id,tool_name,request_hash,request_json,conversation_key,status,phase,before_json,after_json,create_time,update_time,undo_until) VALUES(?1,?1,?1,?2,?3,'{}',?4,'succeeded','completed',?5,?6,?7,?7,?8)",params![operation,if entity=="todo"{"delete_todo"}else{"delete_calendar_event"},digest(before),format!("plugin:{plugin}"),before_state.to_string(),after_state.to_string(),now,now+RETENTION]).map_err(sql_error)?;
    conn.execute("INSERT INTO plugin_operations(plugin_id,action,entity,entity_id,title,payload,create_time) VALUES(?1,'delete',?2,?3,?4,?5,?6)",params![plugin,entity,identity,title,json!({"operationId":operation}).to_string(),now]).map_err(sql_error)?;
    Ok(())
}
pub(super) fn release_pins(conn: &Connection, operation: &str) -> Result<(), String> {
    let mut stmt=conn.prepare("SELECT content_id,content_created_at FROM task_assistant_content_pin WHERE operation_id=?1").map_err(sql_error)?;
    let pins = stmt
        .query_map([operation], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    for (id, created) in pins {
        if conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM contents WHERE id=?1 AND create_time=?2)",
                params![id, created],
                |row| row.get::<_, bool>(0),
            )
            .map_err(sql_error)?
        {
            common::release_content_reference(conn, id)?;
        }
    }
    conn.execute(
        "DELETE FROM task_assistant_content_pin WHERE operation_id=?1",
        [operation],
    )
    .map_err(sql_error)?;
    Ok(())
}
pub(super) fn restore(conn: &Connection, operation: &str) -> Result<(), String> {
    let (before,after,status,until):(String,String,String,i64)=conn.query_row("SELECT before_json,after_json,status,undo_until FROM task_assistant_operation WHERE id=?1",[operation],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?))).map_err(sql_error)?;
    if status != "succeeded" || until < common::now_millis() {
        return Err("操作已恢复或超过七天".into());
    }
    let before: Value = serde_json::from_str(&before).map_err(|_| "恢复快照损坏")?;
    let after: Value = serde_json::from_str(&after).map_err(|_| "恢复快照损坏")?;
    let old = &before["rows"];
    let mut union = old.clone();
    for (table, list) in after["rows"].as_object().ok_or("恢复快照损坏")? {
        let existing = union[table].as_array().cloned().unwrap_or_default();
        let mut merged = existing;
        for row in list.as_array().ok_or("快照行无效")? {
            let key = identity(table, row)?;
            if !merged
                .iter()
                .any(|value| identity(table, value).is_ok_and(|candidate| candidate == key))
            {
                merged.push(row.clone());
            }
        }
        union[table] = json!(merged);
    }
    let current = known(conn, &union)?;
    if normalize(&current)? != normalize(&after["rows"])? {
        return Err("PLUGIN_CONFLICT: 任务、日程或依赖已有后续变化，未覆盖".into());
    }
    for table in ["todo_group", "calendar"] {
        for dependency in old[table].as_array().into_iter().flatten() {
            let value = row(
                conn,
                table,
                dependency["id"].as_i64().ok_or("依赖身份无效")?,
            )?
            .ok_or("原分组或日历已删除")?;
            if value["create_time"] != dependency["create_time"] {
                return Err("原分组或日历身份已变化".into());
            }
        }
    }
    for dependency in before["mobileTaskDependencies"]
        .as_array()
        .into_iter()
        .flatten()
    {
        if !old["todo_item"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|row| row["id"] == dependency["id"])
        {
            let value = row(
                conn,
                "todo_item",
                dependency["id"].as_i64().ok_or("任务身份无效")?,
            )?
            .ok_or("关联待办已删除")?;
            if value["create_time"] != dependency["create_time"] {
                return Err("关联待办身份已变化".into());
            }
        }
    }
    for link in old["doc_task_calendar_link"]
        .as_array()
        .into_iter()
        .flatten()
    {
        let content = link["content_id"].as_i64().ok_or("关联正文身份无效")?;
        let task = link["task_id"].as_str().ok_or("关联待办身份无效")?;
        let current = conn
            .query_row(
                "SELECT create_time,content FROM contents WHERE id=?1",
                [content],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(sql_error)?
            .ok_or("关联正文已删除")?;
        let body: Value = serde_json::from_str(&current.1).map_err(|_| "关联正文损坏")?;
        if link["content_created_at"] != current.0
            || super::plugin_document_tasks::find(&body, task).is_none()
        {
            return Err("原正文待办已删除或身份变化，无法恢复关联日程".into());
        }
    }
    for value in old["todo_item"].as_array().into_iter().flatten() {
        if let Some(parent) = value["parent_id"].as_i64() {
            if row(conn, "todo_item", parent)?.is_none() {
                return Err("原父待办已删除".into());
            }
        }
    }
    for (table, list) in after["rows"].as_object().ok_or("快照无效")? {
        if table == "calendar" || table == "todo_group" {
            continue;
        }
        for row in list.as_array().ok_or("快照行无效")? {
            let key = identity(table, row)?;
            if !old[table]
                .as_array()
                .into_iter()
                .flatten()
                .any(|previous| identity(table, previous).is_ok_and(|candidate| candidate == key))
            {
                let columns = keys(table)?;
                conn.execute(
                    &format!(
                        "DELETE FROM {table} WHERE {}",
                        columns
                            .iter()
                            .map(|key| format!("{key}=?"))
                            .collect::<Vec<_>>()
                            .join(" AND ")
                    ),
                    params_from_iter(
                        columns
                            .iter()
                            .map(|key| sql_value(&row[*key]))
                            .collect::<Result<Vec<_>, _>>()?,
                    ),
                )
                .map_err(sql_error)?;
            }
        }
    }
    for (table, list) in old.as_object().ok_or("快照无效")? {
        if table == "calendar" || table == "todo_group" {
            continue;
        }
        for item in list.as_array().ok_or("快照行无效")? {
            let fields = item
                .as_object()
                .ok_or("快照行无效")?
                .keys()
                .collect::<Vec<_>>();
            let identity = keys(table)?;
            let mut definition = conn
                .prepare(&format!("PRAGMA table_info({table})"))
                .map_err(sql_error)?;
            let columns = definition
                .query_map([], |row| row.get::<_, String>(1))
                .map_err(sql_error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(sql_error)?;
            if fields.iter().any(|field| !columns.contains(field))
                || identity.iter().any(|field| item.get(*field).is_none())
            {
                return Err("恢复快照字段与当前结构不符".into());
            }
            let updates = fields
                .iter()
                .filter(|field| !identity.contains(&field.as_str()))
                .map(|field| format!("{field}=excluded.{field}"))
                .collect::<Vec<_>>()
                .join(",");
            conn.execute(
                &format!(
                    "INSERT INTO {table} ({}) VALUES ({}) ON CONFLICT({}) DO UPDATE SET {updates}",
                    fields
                        .iter()
                        .map(|field| field.as_str())
                        .collect::<Vec<_>>()
                        .join(","),
                    vec!["?"; fields.len()].join(","),
                    identity.join(",")
                ),
                params_from_iter(
                    fields
                        .iter()
                        .map(|key| sql_value(&item[*key]))
                        .collect::<Result<Vec<_>, _>>()?,
                ),
            )
            .map_err(sql_error)?;
        }
    }
    let previous = references(old);
    let after = references(&after["rows"]);
    for (id, count) in previous {
        let delta = count - after.get(&id).copied().unwrap_or(0);
        if delta > 0 {
            let pinned:Option<i64>=conn.query_row("SELECT content_created_at FROM task_assistant_content_pin WHERE operation_id=?1 AND content_id=?2",params![operation,id],|row|row.get(0)).optional().map_err(sql_error)?;
            let Some(created) = pinned else {
                return Err("恢复正文引用缺少保留记录".into());
            };
            if conn
                .execute(
                    "UPDATE contents SET ref_count=ref_count+?1 WHERE id=?2 AND create_time=?3",
                    params![delta, id, created],
                )
                .map_err(sql_error)?
                == 0
            {
                return Err("保留正文已丢失".into());
            }
            conn.execute(
                "DELETE FROM content_pending_releases WHERE content_id=?1",
                [id],
            )
            .map_err(sql_error)?;
        }
    }
    release_pins(conn, operation)?;
    conn.execute(
        "UPDATE task_assistant_operation SET status='undone',update_time=?1 WHERE id=?2",
        params![common::now_millis(), operation],
    )
    .map_err(sql_error)?;
    common::write_operation(conn, "todo", "update", 0, common::now_millis())?;
    common::write_operation(conn, "calendar_event", "update", 0, common::now_millis())?;
    Ok(())
}
pub(super) fn expire(conn: &Connection) -> Result<(), String> {
    let mut statement=conn.prepare("SELECT id FROM task_assistant_operation WHERE conversation_key LIKE 'plugin:%' AND undo_until<?1 AND before_json IS NOT NULL AND status<>'pending' AND phase<>'restore-prepared' LIMIT 50").map_err(sql_error)?;
    let ids = statement
        .query_map([common::now_millis()], |row| row.get::<_, String>(0))
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    for id in ids {
        release_pins(conn, &id)?;
        conn.execute(
            "UPDATE task_assistant_operation SET before_json=NULL,after_json=NULL WHERE id=?1",
            [id],
        )
        .map_err(sql_error)?;
    }
    conn.execute("UPDATE plugin_operations SET action='expired',payload=json_object('operationId',json_extract(payload,'$.operationId')) WHERE entity IN ('todo','event') AND action='delete' AND create_time<?1",[common::now_millis()-RETENTION]).map_err(sql_error)?;
    Ok(())
}

fn identity(table: &str, row: &Value) -> Result<String, String> {
    Ok(keys(table)?
        .iter()
        .map(|key| row[*key].to_string())
        .collect::<Vec<_>>()
        .join("\n"))
}
fn normalize(value: &Value) -> Result<Value, String> {
    let mut result = json!({});
    for (table, list) in value.as_object().ok_or("快照无效")? {
        let mut rows = std::collections::BTreeMap::new();
        for row in list.as_array().ok_or("快照行无效")? {
            rows.insert(identity(table, row)?, row.clone());
        }
        result[table] = json!(rows.into_values().collect::<Vec<_>>());
    }
    Ok(result)
}
