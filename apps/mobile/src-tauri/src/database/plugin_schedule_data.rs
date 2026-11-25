use super::{
    calendar_holidays::HolidayDays, calendar_time::CalendarTimeZone,
    plugin_task_snapshots as snapshots, plugin_tasks,
};
use rusqlite::{Connection, Transaction};
use serde_json::{json, Value};

pub(super) fn reminders(conn: &Connection, owner: &str, id: i64) -> Result<Value, String> {
    let offsets = if owner == "todo" {
        super::reminders::stored_todo_reminders(conn, id)?
    } else {
        super::reminders::list_owner(conn, owner, id)?
    };
    Ok(json!(offsets
        .into_iter()
        .map(|offset| json!({"offsetMs":offset}))
        .collect::<Vec<_>>()))
}

pub(super) fn set_reminders(
    tx: &Transaction<'_>,
    owner: &str,
    id: i64,
    value: &Value,
    has_anchor: bool,
) -> Result<(), String> {
    let list = value.as_array().ok_or("提醒列表无效")?;
    if list.len() > 3 {
        return Err("提醒最多三条".into());
    }
    if !has_anchor && !list.is_empty() {
        return Err("提醒需要基准时间".into());
    }
    let mut offsets = list
        .iter()
        .map(|value| {
            value["offsetMs"]
                .as_i64()
                .filter(|n| (-9_007_199_254_740_991..=9_007_199_254_740_991).contains(n))
                .ok_or("提醒偏移须为安全整数毫秒")
        })
        .collect::<Result<Vec<_>, _>>()?;
    offsets.sort();
    offsets.dedup();
    if owner == "todo" {
        super::reminders::set_todo_reminders(tx, id, &offsets)?;
    } else {
        super::reminders::replace_owner(tx, owner, id, &offsets)?;
    }
    Ok(())
}

pub(super) fn semantic(value: &Value) -> Value {
    match value {
        Value::Array(items) => json!(items.iter().map(semantic).collect::<Vec<_>>()),
        Value::Object(fields) => Value::Object(
            fields
                .iter()
                .filter(|(key, _)| {
                    !["update_time", "sort_index", "order_index"].contains(&key.as_str())
                })
                .map(|(key, value)| (key.clone(), semantic(value)))
                .collect(),
        ),
        _ => value.clone(),
    }
}

pub(super) fn directory(conn: &Connection, kind: &str, id: i64) -> Result<Value, String> {
    let value = match kind {
        "todo-list" => super::todo::get_group_directory(conn, id)?.map(serde_json::to_value),
        "calendar" => super::calendar::get_calendar_directory(conn, id)?.map(serde_json::to_value),
        _ => return Err("目录类型无效".into()),
    }
    .transpose()
    .map_err(|e| e.to_string())?;
    value
        .map(to_directory)
        .transpose()
        .map(|item| item.unwrap_or(Value::Null))
}

fn to_directory(mut item: Value) -> Result<Value, String> {
    item["id"] = json!(item["id"].as_i64().ok_or("目录身份无效")?.to_string());
    if item["writable"] != true {
        item["readonlyReason"] = json!(if item["archived"] == true {
            "已归档"
        } else {
            "系统日历不可写"
        });
    }
    if item["editable"] != true {
        item["editReadonlyReason"] = json!("系统目录不可编辑");
    }
    item["revision"] = json!(snapshots::digest(&item));
    item.as_object_mut().ok_or("目录无效")?.remove("createdAt");
    Ok(item)
}

pub(super) fn directories(conn: &Connection, kind: &str, query: &Value) -> Result<Value, String> {
    let size = query["limit"].as_i64().unwrap_or(50);
    if !(1..=100).contains(&size) {
        return Err("目录每页须为 1–100 条".into());
    }
    let fingerprint = snapshots::digest(&json!([kind, query["archived"], query["_scope"]]));
    let after = read_cursor(query, &fingerprint)?;
    let values = match kind {
        "todo-list" => {
            super::todo::query_group_directory(conn, after, query["archived"].as_bool(), size + 1)?
                .into_iter()
                .map(serde_json::to_value)
                .collect::<Result<Vec<_>, _>>()
        }
        "calendar" => super::calendar::query_calendar_directory(
            conn,
            after,
            query["archived"].as_bool(),
            size + 1,
        )?
        .into_iter()
        .map(serde_json::to_value)
        .collect::<Result<Vec<_>, _>>(),
        _ => return Err("目录类型无效".into()),
    }
    .map_err(|e| e.to_string())?;
    let ids = values
        .iter()
        .map(|item| item["id"].as_i64().ok_or("目录身份无效"))
        .collect::<Result<Vec<_>, _>>()?;
    let items = values
        .into_iter()
        .take(size as usize)
        .map(to_directory)
        .collect::<Result<Vec<_>, _>>()?;
    page(items, &ids, size, &fingerprint)
}

fn read_cursor(query: &Value, fingerprint: &str) -> Result<i64, String> {
    if let Some(raw) = query["cursor"].as_str() {
        let (key, after): (String, i64) = serde_json::from_str(raw).map_err(|_| "分页游标无效")?;
        if key != fingerprint || after < 0 {
            return Err("分页条件已变化".into());
        }
        Ok(after)
    } else {
        Ok(0)
    }
}
fn page(items: Vec<Value>, ids: &[i64], size: i64, fingerprint: &str) -> Result<Value, String> {
    let mut result = json!({"items":items});
    if ids.len() > size as usize {
        result["cursor"] = json!(
            serde_json::to_string(&(fingerprint, ids[size as usize - 1]))
                .map_err(|e| e.to_string())?
        );
    }
    Ok(result)
}

pub(super) fn stored_events(
    conn: &Connection,
    query: &Value,
    zone: CalendarTimeZone,
) -> Result<Value, String> {
    let size = query["limit"].as_i64().unwrap_or(50);
    if !(1..=100).contains(&size) {
        return Err("每页须为 1–100 条".into());
    }
    let mut filter = query.clone();
    if let Some(fields) = filter.as_object_mut() {
        fields.remove("cursor");
        fields.remove("limit");
    }
    let fingerprint = snapshots::digest(&filter);
    let after = read_cursor(query, &fingerprint)?;
    let range = super::plugin_task_dates::window(query, zone, false)?;
    let calendars = query
        .get("calendarIds")
        .map(|value| {
            value
                .as_array()
                .ok_or("日历筛选无效")?
                .iter()
                .map(|id| {
                    id.as_str()
                        .ok_or("日历身份无效")?
                        .parse::<i64>()
                        .map_err(|_| "日历身份无效")
                })
                .collect::<Result<Vec<_>, _>>()
        })
        .transpose()?;
    let ids = super::calendar::list_event_ids(conn, after, range, calendars.as_deref(), size + 1)?;
    let items = ids
        .iter()
        .take(size as usize)
        .map(|id| {
            plugin_tasks::event_dto(
                conn,
                &snapshots::row(conn, "calendar_event", *id)?.ok_or("日程已删除")?,
                zone,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    page(items, &ids, size, &fingerprint)
}

pub(super) fn get(
    conn: &Connection,
    kind: &str,
    id: &str,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    match kind {
        "todo-list" | "calendar" => directory(conn, kind, id.parse().map_err(|_| "目录身份无效")?),
        "event" => {
            let (id, created) = plugin_tasks::parse_event(id)?;
            match snapshots::row(conn, "calendar_event", id)? {
                Some(row) if row["create_time"] == created => {
                    plugin_tasks::event_dto(conn, &row, zone)
                }
                _ => Ok(Value::Null),
            }
        }
        "todo" => match plugin_tasks::parse_task(id)? {
            plugin_tasks::TaskId::Todo(id, created, date) => {
                match snapshots::row(conn, "todo_item", id)? {
                    Some(row) if row["create_time"] == created => {
                        match plugin_tasks::task_dto(conn, &row, date.as_deref(), zone, holidays) {
                            Err(error)
                                if super::plugin_task_recurrence::missing_instance(&error) =>
                            {
                                Ok(Value::Null)
                            }
                            result => result,
                        }
                    }
                    _ => Ok(Value::Null),
                }
            }
            plugin_tasks::TaskId::Document(..) => {
                match super::plugin_document_tasks::read(conn, id, zone, holidays) {
                    Ok(value) => Ok(value["task"].clone()),
                    Err(error)
                        if super::plugin_task_recurrence::missing_instance(&error)
                            || [
                                "正文来源已删除、排除或已提升为独立待办",
                                "正文身份已变化",
                                "原文待办已删除",
                            ]
                            .contains(&error.as_str()) =>
                    {
                        Ok(Value::Null)
                    }
                    Err(error) => Err(error),
                }
            }
        },
        _ => Err("数据类型无效".into()),
    }
}

pub(super) fn replay(
    conn: &Connection,
    plugin: &str,
    write: &Value,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Option<Value>, String> {
    let Some(key) = write["requestId"].as_str() else {
        return Ok(None);
    };
    let Some(saved) = super::plugin_create_receipts::read(conn, plugin, key)? else {
        return Ok(None);
    };
    let (hash, entity, id, created, retired) = (
        saved.hash,
        saved.entity,
        saved.id,
        saved.created,
        saved.retired,
    );
    if !matches!(entity.as_str(), "todo" | "event") {
        return Err("同一创建请求 ID 不能更换类型".into());
    }
    let digest = write["requestHash"]
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| snapshots::digest(&write["input"]));
    if hash != digest {
        return Err("同一创建请求 ID 不能更换参数".into());
    }
    if retired {
        return Err("原创建结果已删除或撤销，请使用新的创建请求 ID".into());
    }
    let reference = if entity == "todo" {
        format!("todo:{id}:{created}")
    } else {
        format!("{id}:{created}")
    };
    let value = get(
        conn,
        if entity == "todo" { "todo" } else { "event" },
        &reference,
        zone,
        holidays,
    )?;
    if value.is_null() {
        return Err("原创建结果已失效".into());
    }
    Ok(Some(value))
}

pub(super) fn save_receipt(
    tx: &Transaction<'_>,
    plugin: &str,
    write: &Value,
    entity: &str,
    result: &Value,
) -> Result<(), String> {
    let Some(key) = write["requestId"].as_str() else {
        return Ok(());
    };
    let reference = result["id"].as_str().ok_or("创建结果身份无效")?;
    let (id, created) = if entity == "todo" {
        match plugin_tasks::parse_task(reference)? {
            plugin_tasks::TaskId::Todo(id, created, _) => (id, created),
            _ => return Err("创建结果身份无效".into()),
        }
    } else {
        plugin_tasks::parse_event(reference)?
    };
    let hash = write["requestHash"]
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| snapshots::digest(&write["input"]));
    super::plugin_create_receipts::save(
        tx,
        plugin,
        key,
        &super::plugin_create_receipts::Receipt {
            hash,
            entity: entity.into(),
            id,
            created,
            operation: uuid::Uuid::new_v4().to_string(),
            retired: false,
        },
    )?;
    Ok(())
}
