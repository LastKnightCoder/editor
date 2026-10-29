use super::{
    calendar_holidays::{self, HolidayDays},
    calendar_time::CalendarTimeZone,
    common, plugin_data,
    plugin_data::sql_error,
    plugin_document_tasks, plugin_task_dates as dates, plugin_task_snapshots as snapshots,
    plugin_tasks::{self, TaskId},
};
use crate::models::PluginEntityTarget;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, WebviewWindow};

const KINDS: [&str; 8] = [
    "card",
    "article",
    "project",
    "document",
    "diary",
    "todo",
    "event",
    "plugin-entity",
];
const MAX_REFS: usize = 200;
const SCAN_BATCH: usize = 100;
const SCAN_BUDGET: usize = 500;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(super) struct EntityRef {
    pub kind: String,
    pub id: String,
}

#[derive(Clone, Debug)]
pub(super) struct LocatedRef {
    pub title: String,
    pub created_at: i64,
    pub target: Value,
}

pub(super) enum RefAccess {
    Denied,
    Missing,
    Allowed(LocatedRef),
}

fn missing_reference(error: &str) -> bool {
    matches!(
        error,
        "待办身份无效"
            | "日期须为 YYYY-MM-DD"
            | "日期无效"
            | "周期规则缺失"
            | "实例不属于周期规则"
            | "该日期已停止重复"
            | "该日期不是有效原始周期实例"
            | "日程身份无效"
            | "虚拟任务标记不能作为日程打开，请使用对应 todoId 打开待办"
    )
}

fn validate_ref(reference: &EntityRef) -> Result<(), String> {
    if !KINDS.contains(&reference.kind.as_str()) {
        return Err("当前移动宿主不支持此引用类型".into());
    }
    if reference.id.is_empty() || reference.id.len() > 200 {
        return Err("引用身份无效".into());
    }
    Ok(())
}

fn numeric_id(value: &str) -> Option<i64> {
    value
        .parse::<i64>()
        .ok()
        .filter(|id| *id > 0 && id.to_string() == value)
}

fn read_refs(value: &Value) -> Result<Vec<EntityRef>, String> {
    let refs: Vec<EntityRef> = serde_json::from_value(value.clone()).map_err(|_| "引用列表无效")?;
    if refs.len() > MAX_REFS {
        return Err("每次最多 200 项引用".into());
    }
    for reference in &refs {
        validate_ref(reference)?;
    }
    Ok(refs)
}

fn document_node(
    conn: &Connection,
    content: i64,
    created: i64,
    task: &str,
) -> Result<Option<Value>, String> {
    if !plugin_document_tasks::visible(conn, content, task)? {
        return Ok(None);
    }
    let raw: Option<String> = conn
        .query_row(
            "SELECT content FROM contents WHERE id=?1 AND create_time=?2",
            params![content, created],
            |row| row.get(0),
        )
        .optional()
        .map_err(sql_error)?;
    let Some(raw) = raw else { return Ok(None) };
    if raw.len() > 16 * 1024 * 1024 {
        return Err("正文超过读取预算".into());
    }
    let nodes: Value = serde_json::from_str(&raw).map_err(|_| "正文节点损坏")?;
    Ok(plugin_document_tasks::find(&nodes, task)
        .filter(|node| node["taskArchived"] != true)
        .cloned())
}

fn task_metadata(
    conn: &Connection,
    reference: &EntityRef,
    zone: CalendarTimeZone,
) -> Result<Option<(Value, String)>, String> {
    let task = plugin_tasks::parse_task(&reference.id)?;
    match task {
        TaskId::Todo(id, created, Some(date)) => {
            let Some(row) = snapshots::row(conn, "todo_item", id)? else {
                return Ok(None);
            };
            if row["create_time"] != created || row["is_archived"] == 1 {
                return Ok(None);
            }
            Ok(Some((plugin_tasks::metadata(conn, &row, zone)?, date)))
        }
        TaskId::Document(content, created, task, Some(date)) => {
            let Some(node) = document_node(conn, content, created, &task)? else {
                return Ok(None);
            };
            Ok(Some((plugin_document_tasks::meta(&node)?, date)))
        }
        _ => Ok(None),
    }
}

/// 持久实体外观与正文身份由主库决定；是否能打开由当前活跃的插件注册决定。
pub(super) fn entity_target(
    conn: &Connection,
    id: i64,
) -> Result<Option<PluginEntityTarget>, String> {
    if !(1..=9_007_199_254_740_991).contains(&id) {
        return Ok(None);
    }
    conn.query_row(
        "SELECT e.plugin_id,e.kind,e.create_time,e.content_id,c.create_time,e.title,k.label,k.icon,c.content FROM plugin_entities e JOIN contents c ON c.id=e.content_id LEFT JOIN plugin_entity_kinds k ON k.plugin_id=e.plugin_id AND k.kind=e.kind WHERE e.id=?1",
        [id], |row| {
            let title:String=row.get(5)?;
            let title=if title.trim().is_empty() { common::json_content_plain_text(row.get(8)?).chars().take(80).collect::<String>() } else { title };
            let label:Option<String>=row.get(6)?;
            Ok(PluginEntityTarget {
                kind:"plugin-entity".into(),id,plugin_id:row.get(0)?,entity_kind:row.get(1)?,created_at:row.get(2)?,
                content_id:row.get(3)?,content_created_at:row.get(4)?,
                title:if title.is_empty() { "无标题".into() } else { title },
                label:label.filter(|value|!value.trim().is_empty()).unwrap_or_else(||"插件内容".into()),
                icon:row.get::<_,Option<String>>(7)?.unwrap_or_default(),
            })
        },
    ).optional().map_err(sql_error)
}

/// 返回存在的导航目标；插件页面可用性由运行时复验，周期实例校验原始日期。
pub(super) fn locate(
    conn: &Connection,
    reference: &EntityRef,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Option<LocatedRef>, String> {
    validate_ref(reference)?;
    match reference.kind.as_str() {
        "diary" => {
            let Some(id) = numeric_id(&reference.id) else {
                return Ok(None);
            };
            let row: Option<(i64, i64, String, String, String)> = conn.query_row(
                "SELECT s.content_id,s.create_time,d.type,d.date,c.content FROM diary_segments s JOIN diary_entries d ON d.id=s.diary_id JOIN contents c ON c.id=s.content_id WHERE s.id=?1",
                [id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            ).optional().map_err(sql_error)?;
            Ok(row.map(|(content_id, created_at, diary_type, date, content)| {
                let title = super::entity_context::content_first_text(Some(content), 40);
                LocatedRef {
                    title: if title.is_empty() { "空白日记".into() } else { title },
                    created_at,
                    target: json!({"kind":"diary","id":id,"contentId":content_id,"diaryType":diary_type,"date":date}),
                }
            }))
        }
        "plugin-entity" => {
            let Some(id) = numeric_id(&reference.id) else {
                return Ok(None);
            };
            entity_target(conn, id)?
                .map(|target| {
                    Ok(LocatedRef {
                        title: target.title.clone(),
                        created_at: target.created_at,
                        target: serde_json::to_value(target).map_err(|error| error.to_string())?,
                    })
                })
                .transpose()
        }
        "todo" => match plugin_tasks::parse_task(&reference.id)? {
            TaskId::Todo(id, created, date) => {
                let Some(row) = snapshots::row(conn, "todo_item", id)? else {
                    return Ok(None);
                };
                if row["create_time"] != created || row["is_archived"] == 1 {
                    return Ok(None);
                }
                let group = row["group_id"].as_i64().ok_or("待办分组无效")?;
                let visible = conn
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM todo_group WHERE id=?1 AND is_archived=0)",
                        [group],
                        |row| row.get::<_, bool>(0),
                    )
                    .map_err(sql_error)?;
                if !visible {
                    return Ok(None);
                }
                if let Some(date) = date {
                    plugin_tasks::occurrence(
                        &plugin_tasks::metadata(conn, &row, zone)?,
                        &date,
                        zone,
                        holidays,
                    )?;
                }
                Ok(Some(LocatedRef {
                    title: row["title"].as_str().unwrap_or("").into(),
                    created_at: created,
                    target: json!({"kind":"todo","id":id,"groupId":group}),
                }))
            }
            TaskId::Document(content, created, task, date) => {
                let Some(node) = document_node(conn, content, created, &task)? else {
                    return Ok(None);
                };
                let meta = plugin_document_tasks::meta(&node)?;
                if let Some(date) = date {
                    plugin_tasks::occurrence(&meta, &date, zone, holidays)?;
                }
                Ok(Some(LocatedRef {
                    title: super::document_task_header::parse(conn, &node)?.0,
                    created_at: created,
                    target: json!({"kind":"document-task","contentId":content,"taskId":task}),
                }))
            }
        },
        "event" => {
            let (id, created) = reference.id.split_once(':').ok_or("日程身份无效")?;
            let Some(id) = numeric_id(id) else {
                return Err("虚拟任务标记不能作为日程打开，请使用对应 todoId 打开待办".into());
            };
            let created = created.parse::<i64>().map_err(|_| "日程身份无效")?;
            let title = conn.query_row(
                "SELECT e.title FROM calendar_event e JOIN calendar c ON c.id=e.calendar_id WHERE e.id=?1 AND e.create_time=?2 AND c.archived=0",
                params![id, created], |row| row.get::<_, String>(0),
            ).optional().map_err(sql_error)?;
            Ok(title.map(|title| LocatedRef {
                title,
                created_at: created,
                target: json!({"kind":"event","id":id}),
            }))
        }
        kind => {
            let Some(id) = numeric_id(&reference.id) else {
                return Ok(None);
            };
            let row = match kind {
                "card" | "article" | "document" | "project" => plugin_data::get(conn, kind, id)?,
                _ => return Err("引用类型无效".into()),
            };
            let Some(row) = row else { return Ok(None) };
            if kind == "project" {
                if row["archived"] == true {
                    return Ok(None);
                }
            } else if row["contentRef"].as_str().is_none_or(str::is_empty)
                || (kind == "document" && row["kind"] != "document")
            {
                return Ok(None);
            }
            Ok(Some(LocatedRef {
                title: row["title"].as_str().unwrap_or("").into(),
                created_at: row["createdAt"].as_i64().ok_or("内容身份无效")?,
                target: json!({"kind":kind,"id":id}),
            }))
        }
    }
}

fn grant_identity(
    conn: &Connection,
    plugin: &str,
    reference: &EntityRef,
) -> Result<Option<i64>, String> {
    conn.query_row(
        "SELECT target_created_at FROM plugin_ref_grants WHERE plugin_id=?1 AND kind=?2 AND ref_id=?3",
        params![plugin, reference.kind, reference.id], |row| row.get(0),
    ).optional().map_err(sql_error)
}

fn owns_entity(conn: &Connection, plugin: &str, reference: &EntityRef) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM plugin_entities WHERE id=?1 AND plugin_id=?2)",
        params![numeric_id(&reference.id), plugin],
        |row| row.get(0),
    )
    .map_err(sql_error)
}

fn presentation(conn: &Connection, plugin: &str, reference: &EntityRef) -> Result<Value, String> {
    validate_ref(reference)?;
    if reference.kind != "plugin-entity" {
        return Ok(Value::Null);
    }
    let owned = owns_entity(conn, plugin, reference)?;
    let granted = grant_identity(conn, plugin, reference)?;
    if !owned && granted.is_none() {
        return Ok(Value::Null);
    }
    let row:Option<(i64,Option<String>,Option<String>)>=conn.query_row(
        "SELECT e.create_time,k.label,k.icon FROM plugin_entities e LEFT JOIN plugin_entity_kinds k ON k.plugin_id=e.plugin_id AND k.kind=e.kind WHERE e.id=?1",
        [numeric_id(&reference.id)],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?)),
    ).optional().map_err(sql_error)?;
    let Some((created, label, icon)) = row else {
        return Ok(Value::Null);
    };
    if !owned && granted != Some(created) {
        return Ok(Value::Null);
    }
    Ok(
        json!({"label":label.filter(|value|!value.trim().is_empty()).unwrap_or_else(||"插件内容".into()),"icon":icon.unwrap_or_default()}),
    )
}

/// 先验访问资格，未经选择或授权时不探测目标是否存在。
pub(super) fn access(
    conn: &Connection,
    plugin: &str,
    reference: &EntityRef,
    readable: bool,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<RefAccess, String> {
    validate_ref(reference)?;
    let granted = grant_identity(conn, plugin, reference)?;
    let allowed = if reference.kind == "plugin-entity" {
        owns_entity(conn, plugin, reference)?
    } else if reference.kind == "diary" {
        false
    } else {
        readable
    };
    if !allowed && granted.is_none() {
        return Ok(RefAccess::Denied);
    }
    let located = match locate(conn, reference, zone, holidays) {
        Err(error) if missing_reference(&error) => return Ok(RefAccess::Missing),
        value => value?,
    };
    let Some(located) = located else {
        return Ok(RefAccess::Missing);
    };
    if !allowed && granted != Some(located.created_at) {
        return Ok(RefAccess::Missing);
    }
    Ok(RefAccess::Allowed(located))
}

/// 关联写入按目标归属与选择身份校验，不因调用方传入 readable 放行其他插件的实体。
pub(super) fn access_link_target(
    conn: &Connection,
    plugin: &str,
    reference: &EntityRef,
    readable: bool,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<RefAccess, String> {
    if reference.kind != "plugin-entity" {
        return access(conn, plugin, reference, readable, zone, holidays);
    }
    let Some(id) = numeric_id(&reference.id) else {
        return Ok(RefAccess::Denied);
    };
    let own = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM plugin_entities WHERE id=?1 AND plugin_id=?2 AND orphaned_time IS NULL)",
            params![id, plugin],
            |row| row.get::<_, bool>(0),
        )
        .map_err(sql_error)?;
    let granted = grant_identity(conn, plugin, reference)?;
    if !own && granted.is_none() {
        return Ok(RefAccess::Denied);
    }
    let row: Option<(String, i64)> = conn
        .query_row(
            "SELECT title,create_time FROM plugin_entities WHERE id=?1 AND orphaned_time IS NULL",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(sql_error)?;
    let Some((title, created_at)) = row else {
        return Ok(RefAccess::Missing);
    };
    if !own && granted != Some(created_at) {
        return Ok(RefAccess::Missing);
    }
    Ok(RefAccess::Allowed(LocatedRef {
        title,
        created_at,
        target: Value::Null,
    }))
}

/// 用户确认时重新验证整批选择，任何身份漂移都不留下部分授权。
pub(super) fn grant(
    conn: &mut Connection,
    plugin: &str,
    selections: &[(EntityRef, String)],
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    if selections.len() > MAX_REFS {
        return Err("每次最多 200 项引用".into());
    }
    let tx = conn.transaction().map_err(sql_error)?;
    let mut picked = vec![];
    for (reference, identity) in selections {
        let located =
            locate(&tx, reference, zone, holidays)?.ok_or("选择的内容已删除，请重新选择")?;
        if located.created_at.to_string() != *identity {
            return Err("选择的内容身份已变化，请重新选择".into());
        }
        tx.execute(
            "INSERT INTO plugin_ref_grants(plugin_id,kind,ref_id,target_created_at,create_time) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(plugin_id,kind,ref_id) DO UPDATE SET target_created_at=excluded.target_created_at,create_time=excluded.create_time",
            params![plugin, reference.kind, reference.id, located.created_at, common::now_millis()],
        ).map_err(sql_error)?;
        picked.push(json!({"ref":reference,"title":located.title}));
    }
    tx.commit().map_err(sql_error)?;
    Ok(json!(picked))
}

fn selections(request: &Value) -> Result<Vec<(EntityRef, String)>, String> {
    let values = request["selections"].as_array().ok_or("选择列表无效")?;
    if values.len() > MAX_REFS {
        return Err("每次最多 200 项引用".into());
    }
    values
        .iter()
        .map(|value| {
            let reference: EntityRef =
                serde_json::from_value(value["ref"].clone()).map_err(|_| "引用无效")?;
            validate_ref(&reference)?;
            let identity = value["identity"].as_str().ok_or("选择身份缺失")?.to_owned();
            if identity.parse::<i64>().is_err() {
                return Err("选择身份无效".into());
            }
            Ok((reference, identity))
        })
        .collect()
}

fn query_refs(
    conn: &Connection,
    scope: &str,
    plugin: &str,
    kind: &str,
    keyword: &str,
    cursor: Option<&str>,
    limit: usize,
    zone: CalendarTimeZone,
) -> Result<Value, String> {
    if !KINDS.contains(&kind) {
        return Err("当前移动宿主不支持此引用类型".into());
    }
    if !(1..=100).contains(&limit) || keyword.len() > 500 {
        return Err("选择查询超出限制".into());
    }
    let fingerprint = snapshots::digest(&json!([scope, plugin, kind, keyword, zone.0.name()]));
    let mut position = if let Some(cursor) = cursor {
        let (saved, position): (String, usize) =
            serde_json::from_str(cursor).map_err(|_| "分页游标无效")?;
        if saved != fingerprint
            || (kind == "todo" && position > 1_000_000)
            || position > i64::MAX as usize
        {
            return Err("分页条件或工作区已变化".into());
        }
        position
    } else {
        0
    };
    let mut items = vec![];
    let mut examined = 0;
    let holidays = HolidayDays::new();
    let keyword = keyword.to_lowercase();
    loop {
        let refs = if kind == "todo" {
            plugin_document_tasks::candidates(conn, "all", position, SCAN_BATCH)?
                .into_iter()
                .map(|candidate| {
                    if candidate["source"] == "todo" {
                        Ok(EntityRef {
                            kind: kind.into(),
                            id: format!(
                                "todo:{}:{}",
                                candidate["row"]["id"], candidate["row"]["create_time"]
                            ),
                        })
                    } else {
                        let content = candidate["contentId"].as_i64().ok_or("正文身份无效")?;
                        let created: i64 = conn
                            .query_row(
                                "SELECT create_time FROM contents WHERE id=?1",
                                [content],
                                |row| row.get(0),
                            )
                            .map_err(sql_error)?;
                        let task = candidate["node"]["taskId"].as_str().ok_or("待办身份无效")?;
                        Ok(EntityRef {
                            kind: kind.into(),
                            id: format!("document:{content}:{created}:{task}"),
                        })
                    }
                })
                .collect::<Result<Vec<_>, String>>()?
        } else {
            let table = if kind == "event" {
                "calendar_event"
            } else if kind == "plugin-entity" {
                "plugin_entities"
            } else if kind == "diary" {
                "diary_segments"
            } else {
                plugin_data::table(kind)?
            };
            let mut statement = conn
                .prepare(&format!(
                    "SELECT id,create_time FROM {table} WHERE id>?2 ORDER BY id LIMIT ?1"
                ))
                .map_err(sql_error)?;
            let refs = statement
                .query_map(params![SCAN_BATCH as i64, position as i64], |row| {
                    let id: i64 = row.get(0)?;
                    let created: i64 = row.get(1)?;
                    Ok(EntityRef {
                        kind: kind.into(),
                        id: if kind == "event" {
                            format!("{id}:{created}")
                        } else {
                            id.to_string()
                        },
                    })
                })
                .map_err(sql_error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(sql_error)?;
            refs
        };
        if refs.is_empty() {
            return Ok(json!({"items":items}));
        }
        let count = refs.len();
        for reference in refs {
            position = if kind == "todo" {
                position + 1
            } else {
                reference
                    .id
                    .split(':')
                    .next()
                    .and_then(|id| id.parse().ok())
                    .ok_or("引用身份无效")?
            };
            examined += 1;
            if let Some(located) = locate(conn, &reference, zone, &holidays)? {
                let diary_date =
                    (kind == "diary").then(|| located.target["date"].as_str().unwrap_or_default());
                if located.title.to_lowercase().contains(&keyword)
                    || diary_date.is_some_and(|date| date.to_lowercase().contains(&keyword))
                {
                    let mut item = json!({"ref":reference,"title":located.title,"identity":located.created_at.to_string()});
                    if let Some(date) = diary_date {
                        item["subtitle"] = json!(date);
                    }
                    items.push(item);
                }
            }
            if items.len() == limit || examined >= SCAN_BUDGET {
                return Ok(
                    json!({"items":items,"nextCursor":serde_json::to_string(&(fingerprint,position)).map_err(|error|error.to_string())?}),
                );
            }
        }
        if count < SCAN_BATCH {
            return Ok(json!({"items":items}));
        }
    }
}

fn readable(request: &Value) -> Result<Vec<String>, String> {
    let kinds: Vec<String> =
        serde_json::from_value(request["readable"].clone()).map_err(|_| "读取权限范围无效")?;
    if kinds.len() > KINDS.len() || kinds.iter().any(|kind| !KINDS.contains(&kind.as_str())) {
        return Err("读取权限范围无效".into());
    }
    Ok(kinds)
}

fn handle_refs(
    conn: &mut Connection,
    plugin: &str,
    request: &Value,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    match request["method"].as_str() {
        Some("grant") => grant(conn, plugin, &selections(request)?, zone, holidays),
        Some("presentation") => {
            let reference =
                serde_json::from_value(request["ref"].clone()).map_err(|_| "引用无效")?;
            presentation(conn, plugin, &reference)
        }
        Some("describe") => {
            let kinds = readable(request)?;
            let values = read_refs(&request["refs"])?;
            values
                .iter()
                .map(|reference| {
                    Ok(
                        match access(
                            conn,
                            plugin,
                            reference,
                            kinds.contains(&reference.kind),
                            zone,
                            holidays,
                        )? {
                            RefAccess::Denied => json!({"status":"denied"}),
                            RefAccess::Missing => json!({"status":"missing"}),
                            RefAccess::Allowed(located) => {
                                json!({"status":"ok","title":located.title})
                            }
                        },
                    )
                })
                .collect::<Result<Vec<_>, String>>()
                .map(|values| json!(values))
        }
        Some("resolve") => {
            let reference: EntityRef =
                serde_json::from_value(request["ref"].clone()).map_err(|_| "引用无效")?;
            let located =
                locate(conn, &reference, zone, holidays)?.ok_or("内容已删除或无法在移动端打开")?;
            if grant_identity(conn, plugin, &reference)?
                .is_some_and(|created| created != located.created_at)
            {
                return Err("引用身份已变化，请重新选择".into());
            }
            Ok(located.target)
        }
        _ => Err("未知引用操作".into()),
    }
}

pub(super) fn requested_holiday_ranges(
    conn: &Connection,
    plugin: &str,
    request: &Value,
    zone: CalendarTimeZone,
) -> Result<Vec<(i64, i64)>, String> {
    let refs = match request["method"].as_str() {
        Some("presentation") => vec![],
        Some("grant") => selections(request)?
            .into_iter()
            .map(|(reference, _)| reference)
            .collect(),
        Some("describe") => {
            let kinds = readable(request)?;
            let mut allowed = vec![];
            for reference in read_refs(&request["refs"])? {
                if kinds.contains(&reference.kind)
                    || grant_identity(conn, plugin, &reference)?.is_some()
                {
                    allowed.push(reference)
                }
            }
            allowed
        }
        Some("resolve") => {
            vec![serde_json::from_value(request["ref"].clone()).map_err(|_| "引用无效")?]
        }
        _ => return Err("未知引用操作".into()),
    };
    let mut ranges = std::collections::BTreeSet::new();
    for reference in refs
        .into_iter()
        .filter(|reference| reference.kind == "todo")
    {
        let metadata = match task_metadata(conn, &reference, zone) {
            Err(error) if missing_reference(&error) => None,
            value => value?,
        };
        let Some((metadata, date)) = metadata else {
            continue;
        };
        let segment = metadata["segments"]
            .as_array()
            .into_iter()
            .flatten()
            .rev()
            .find(|segment| {
                segment["effectiveDate"]
                    .as_str()
                    .is_some_and(|start| start <= date.as_str())
            });
        if segment.is_some_and(|segment| segment["rule"]["excludeHolidays"] == true) {
            let day = dates::day(&date)?;
            ranges.insert((zone.day_start(day), zone.day_start(day + 1) - 1));
        }
    }
    Ok(ranges.into_iter().collect())
}

#[tauri::command]
pub fn plugin_entity_target(
    app: AppHandle,
    window: WebviewWindow,
    database: String,
    token: String,
    id: i64,
) -> Result<Option<PluginEntityTarget>, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::plugin_transport::with_database(&token, &database, || {
        let conn = super::schema::open_active_database(&app)?;
        if conn.database_name() != database {
            return Err("插件工作区已失效".into());
        }
        entity_target(&conn, id)
    })
}

#[tauri::command]
pub fn plugin_app_query(
    app: AppHandle,
    window: WebviewWindow,
    database: String,
    token: String,
    plugin_id: String,
    kind: String,
    keyword: String,
    cursor: Option<String>,
    limit: usize,
    time_zone: CalendarTimeZone,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::provider_settings::validate_plugin_id(&plugin_id)?;
    crate::plugin_transport::with_database(&token, &database, || {
        let conn = super::schema::open_active_database(&app)?;
        if conn.database_name() != database {
            return Err("插件工作区已失效".into());
        }
        query_refs(
            &conn,
            &token,
            &plugin_id,
            &kind,
            &keyword,
            cursor.as_deref(),
            limit,
            time_zone,
        )
    })
}

#[tauri::command]
pub async fn plugin_app_refs(
    app: AppHandle,
    window: WebviewWindow,
    database: String,
    token: String,
    plugin_id: String,
    request: Value,
    time_zone: CalendarTimeZone,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::provider_settings::validate_plugin_id(&plugin_id)?;
    let ranges = crate::plugin_transport::with_database(&token, &database, || {
        let conn = super::schema::open_active_database(&app)?;
        if conn.database_name() != database {
            return Err("插件工作区已失效".into());
        }
        requested_holiday_ranges(&conn, &plugin_id, &request, time_zone)
    })?;
    let mut holidays = HolidayDays::new();
    for &(start, end) in &ranges {
        holidays.extend(calendar_holidays::load_task_holidays(&app, start, end, time_zone).await?);
    }
    crate::plugin_transport::with_database(&token, &database, || {
        let mut conn = super::schema::open_active_database(&app)?;
        if conn.database_name() != database {
            return Err("插件工作区已失效".into());
        }
        if requested_holiday_ranges(&conn, &plugin_id, &request, time_zone)?
            .iter()
            .any(|range| !ranges.contains(range))
        {
            return Err("周期规则已变化，请重新打开".into());
        }
        handle_refs(&mut conn, &plugin_id, &request, time_zone, &holidays)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    const ZONE: CalendarTimeZone = CalendarTimeZone(chrono_tz::Asia::Shanghai);

    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&conn).unwrap();
        conn.execute(
            "INSERT INTO todo_group(id,title,create_time,update_time) VALUES(1,'任务',1,1)",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO calendar(id,title,color,create_time,update_time) VALUES(1,'日历','#000',1,1)",[]).unwrap();
        conn
    }
    fn reference(kind: &str, id: &str) -> EntityRef {
        EntityRef {
            kind: kind.into(),
            id: id.into(),
        }
    }
    fn content(conn: &Connection, id: i64, nodes: Value) {
        conn.execute("INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(?1,10,10,?2,1,1)",params![id,nodes.to_string()]).unwrap();
    }
    fn card(conn: &Connection, id: i64) {
        content(
            conn,
            id,
            json!([{"type":"paragraph","children":[{"text":format!("卡片{id}")}]}]),
        );
        conn.execute(
            "INSERT INTO cards(id,create_time,update_time,content_id) VALUES(?1,10,10,?1)",
            [id],
        )
        .unwrap();
    }
    fn diary(conn: &Connection, id: i64, entry: i64, kind: &str, date: &str, text: &str) {
        let content_id = id + 100;
        content(
            conn,
            content_id,
            json!([{"type":"paragraph","children":[{"text":text}]}]),
        );
        conn.execute("INSERT OR IGNORE INTO diary_entries(id,type,date,create_time,update_time) VALUES(?1,?2,?3,1,1)", params![entry, kind, date]).unwrap();
        conn.execute("INSERT INTO diary_segments(id,diary_id,content_id,create_time,update_time) VALUES(?1,?2,?3,?4,?4)", params![id, entry, content_id, id + 10]).unwrap();
    }
    #[test]
    fn diary_picker_addresses_segments_and_searches_titles_and_dates() {
        let conn = database();
        diary(&conn, 1, 10, "daily", "2026-10-29", "早晨散步");
        diary(&conn, 2, 10, "daily", "2026-10-29", "夜间读书");
        diary(&conn, 3, 11, "weekly", "2026-W44", "周记");
        diary(&conn, 4, 12, "monthly", "2026-10", "");
        let first = query_refs(
            &conn,
            "scope",
            "alpha",
            "diary",
            "2026-10-29",
            None,
            1,
            ZONE,
        )
        .unwrap();
        assert_eq!(
            first["items"][0],
            json!({"ref":{"kind":"diary","id":"1"},"title":"早晨散步","identity":"11","subtitle":"2026-10-29"})
        );
        let cursor = first["nextCursor"].as_str().unwrap();
        let next = query_refs(
            &conn,
            "scope",
            "alpha",
            "diary",
            "2026-10-29",
            Some(cursor),
            1,
            ZONE,
        )
        .unwrap();
        assert_eq!(next["items"][0]["ref"]["id"], "2");
        assert!(query_refs(
            &conn,
            "other-scope",
            "alpha",
            "diary",
            "2026-10-29",
            Some(cursor),
            1,
            ZONE
        )
        .is_err());
        let found = query_refs(&conn, "scope", "alpha", "diary", "读书", None, 20, ZONE).unwrap();
        assert_eq!(found["items"].as_array().unwrap().len(), 1);
        assert_eq!(found["items"][0]["ref"]["id"], "2");
        for (id, kind, date, title) in [
            (3, "weekly", "2026-W44", "周记"),
            (4, "monthly", "2026-10", "空白日记"),
        ] {
            let located = locate(
                &conn,
                &reference("diary", &id.to_string()),
                ZONE,
                &HolidayDays::new(),
            )
            .unwrap()
            .unwrap();
            assert_eq!(located.title, title);
            assert_eq!(
                located.target,
                json!({"kind":"diary","id":id,"contentId":id+100,"diaryType":kind,"date":date})
            );
        }
    }
    #[test]
    fn diary_titles_require_identity_bound_selection_even_with_readable_flag() {
        let mut conn = database();
        diary(&conn, 1, 10, "daily", "2026-10-29", "私有日记");
        let refs = json!([{"kind":"diary","id":"1"},{"kind":"diary","id":"999"}]);
        assert_eq!(
            describe(&mut conn, "alpha", refs.clone(), json!(["diary"])),
            json!([{"status":"denied"},{"status":"denied"}])
        );
        let selected = grant(
            &mut conn,
            "alpha",
            &[(reference("diary", "1"), "11".into())],
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert_eq!(
            selected,
            json!([{"ref":{"kind":"diary","id":"1"},"title":"私有日记"}])
        );
        assert_eq!(
            describe(&mut conn, "alpha", refs.clone(), json!([]))[0],
            json!({"status":"ok","title":"私有日记"})
        );
        assert_eq!(
            describe(&mut conn, "beta", refs.clone(), json!([]))[0]["status"],
            "denied"
        );
        let target = handle_refs(
            &mut conn,
            "alpha",
            &json!({"method":"resolve","ref":{"kind":"diary","id":"1"}}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert_eq!(target["contentId"], 101);
        assert!(target.get("content").is_none());
        conn.execute("DELETE FROM diary_segments WHERE id=1", [])
            .unwrap();
        assert_eq!(
            describe(&mut conn, "alpha", refs.clone(), json!([]))[0]["status"],
            "missing"
        );
        conn.execute("INSERT INTO diary_segments(id,diary_id,content_id,create_time,update_time) VALUES(1,10,101,99,99)", []).unwrap();
        assert_eq!(
            describe(&mut conn, "alpha", refs, json!(["diary"]))[0]["status"],
            "missing"
        );
        assert!(handle_refs(
            &mut conn,
            "alpha",
            &json!({"method":"resolve","ref":{"kind":"diary","id":"1"}}),
            ZONE,
            &HolidayDays::new()
        )
        .unwrap_err()
        .contains("身份已变化"));
    }
    #[test]
    fn diary_stale_picker_confirmation_rolls_back_all_grants() {
        let mut conn = database();
        diary(&conn, 1, 10, "daily", "2026-10-29", "第一条");
        diary(&conn, 2, 10, "daily", "2026-10-29", "第二条");
        let error = grant(
            &mut conn,
            "alpha",
            &[
                (reference("diary", "1"), "11".into()),
                (reference("diary", "2"), "99".into()),
            ],
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap_err();
        assert!(error.contains("身份已变化"));
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM plugin_ref_grants", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    fn document_task(conn: &Connection) -> EntityRef {
        content(
            conn,
            50,
            json!([{"type":"check-list-item","taskId":"task-a","children":[{"type":"paragraph","children":[{"text":"正文任务"}]}]}]),
        );
        conn.execute("INSERT INTO diary_entries(id,type,date,content_id,create_time,update_time) VALUES(1,'daily','2026-10-28',50,10,10)",[]).unwrap();
        reference("todo", "document:50:10:task-a")
    }
    fn todo(conn: &Connection) -> EntityRef {
        conn.execute("INSERT INTO todo_item(id,group_id,title,create_time,update_time) VALUES(1,1,'独立任务',10,10)",[]).unwrap();
        reference("todo", "todo:1:10")
    }
    fn describe(conn: &mut Connection, plugin: &str, refs: Value, readable: Value) -> Value {
        handle_refs(
            conn,
            plugin,
            &json!({"method":"describe","refs":refs,"readable":readable}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap()
    }

    #[test]
    fn descriptions_are_scoped_and_do_not_reveal_unselected_missing_content() {
        let mut conn = database();
        card(&conn, 1);
        let refs = json!([{"kind":"card","id":"1"},{"kind":"card","id":"2"}]);
        assert_eq!(
            describe(&mut conn, "alpha", refs.clone(), json!([])),
            json!([{"status":"denied"},{"status":"denied"}])
        );
        grant(
            &mut conn,
            "alpha",
            &[(reference("card", "1"), "10".into())],
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert_eq!(
            describe(&mut conn, "alpha", refs.clone(), json!([])),
            json!([{"status":"ok","title":"卡片1"},{"status":"denied"}])
        );
        assert_eq!(
            describe(&mut conn, "beta", refs.clone(), json!([]))[0]["status"],
            "denied"
        );
        let mut other = database();
        card(&other, 1);
        assert_eq!(
            describe(&mut other, "alpha", refs.clone(), json!([]))[0]["status"],
            "denied"
        );
        assert_eq!(
            describe(&mut conn, "alpha", refs, json!(["card"]))[1]["status"],
            "missing"
        );
    }

    #[test]
    fn reused_identity_is_not_granted_and_batch_rolls_back() {
        let mut conn = database();
        card(&conn, 1);
        card(&conn, 2);
        conn.execute("UPDATE cards SET create_time=11 WHERE id=2", [])
            .unwrap();
        let result = grant(
            &mut conn,
            "alpha",
            &[
                (reference("card", "1"), "10".into()),
                (reference("card", "2"), "10".into()),
            ],
            ZONE,
            &HolidayDays::new(),
        );
        assert!(result.unwrap_err().contains("身份已变化"));
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM plugin_ref_grants", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        grant(
            &mut conn,
            "alpha",
            &[(reference("card", "1"), "10".into())],
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        conn.execute("UPDATE cards SET create_time=12 WHERE id=1", [])
            .unwrap();
        assert_eq!(
            describe(
                &mut conn,
                "alpha",
                json!([{"kind":"card","id":"1"}]),
                json!([])
            )[0]["status"],
            "missing"
        );
        assert!(handle_refs(
            &mut conn,
            "alpha",
            &json!({"method":"resolve","ref":{"kind":"card","id":"1"}}),
            ZONE,
            &HolidayDays::new()
        )
        .unwrap_err()
        .contains("身份已变化"));
        let picked = grant(
            &mut conn,
            "alpha",
            &[(reference("card", "1"), "12".into())],
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert_eq!(
            picked,
            json!([{"ref":{"kind":"card","id":"1"},"title":"卡片1"}])
        );
    }

    #[test]
    fn picker_pages_bind_workspace_plugin_conditions_and_return_private_identity() {
        let conn = database();
        for id in 1..=3 {
            card(&conn, id)
        }
        let first = query_refs(&conn, "scope-a", "alpha", "card", "", None, 2, ZONE).unwrap();
        assert_eq!(first["items"].as_array().unwrap().len(), 2);
        assert_eq!(
            first["items"][0],
            json!({"ref":{"kind":"card","id":"1"},"title":"卡片1","identity":"10"})
        );
        let cursor = first["nextCursor"].as_str().unwrap();
        conn.execute("DELETE FROM cards WHERE id=1", []).unwrap();
        let next =
            query_refs(&conn, "scope-a", "alpha", "card", "", Some(cursor), 2, ZONE).unwrap();
        assert_eq!(next["items"][0]["ref"]["id"], "3");
        for (scope, plugin, keyword) in [
            ("scope-b", "alpha", ""),
            ("scope-a", "beta", ""),
            ("scope-a", "alpha", "卡片"),
        ] {
            assert!(
                query_refs(&conn, scope, plugin, "card", keyword, Some(cursor), 2, ZONE).is_err()
            );
        }
        assert!(query_refs(
            &conn,
            "scope-a",
            "alpha",
            "card",
            "",
            Some(cursor),
            2,
            CalendarTimeZone(chrono_tz::UTC)
        )
        .is_err());
        assert_eq!(
            query_refs(&conn, "scope-a", "alpha", "card", "2", None, 2, ZONE).unwrap()["items"][0]
                ["ref"]["id"],
            "2"
        );
    }

    #[test]
    fn document_tasks_require_live_sources_and_respect_exclusion_promotion_and_archive() {
        let mut conn = database();
        let task = document_task(&conn);
        let target = handle_refs(
            &mut conn,
            "alpha",
            &json!({"method":"resolve","ref":task}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert_eq!(
            target,
            json!({"kind":"document-task","contentId":50,"taskId":"task-a"})
        );
        assert_eq!(
            query_refs(&conn, "scope", "alpha", "todo", "", None, 20, ZONE).unwrap()["items"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        for kind in ["excluded", "promoted"] {
            conn.execute("INSERT INTO doc_task_settings(content_id,task_id,kind,create_time) VALUES(50,'task-a',?1,1)",[kind]).unwrap();
            assert!(locate(&conn, &task, ZONE, &HolidayDays::new())
                .unwrap()
                .is_none());
            assert!(
                query_refs(&conn, "scope", "alpha", "todo", "", None, 20, ZONE).unwrap()["items"]
                    .as_array()
                    .unwrap()
                    .is_empty()
            );
            conn.execute("DELETE FROM doc_task_settings", []).unwrap();
        }
        conn.execute("UPDATE contents SET content=json_set(content,'$[0].taskArchived',json('true')) WHERE id=50",[]).unwrap();
        assert!(locate(&conn, &task, ZONE, &HolidayDays::new())
            .unwrap()
            .is_none());
        conn.execute(
            "UPDATE contents SET content=json_remove(content,'$[0].taskArchived') WHERE id=50",
            [],
        )
        .unwrap();
        conn.execute("DELETE FROM diary_entries", []).unwrap();
        assert!(locate(&conn, &task, ZONE, &HolidayDays::new())
            .unwrap()
            .is_none());
    }

    #[test]
    fn task_identity_group_and_historical_occurrence_are_validated() {
        let conn = database();
        let task = todo(&conn);
        assert_eq!(
            locate(&conn, &task, ZONE, &HolidayDays::new())
                .unwrap()
                .unwrap()
                .target,
            json!({"kind":"todo","id":1,"groupId":1})
        );
        for (series, effective, rule) in [
            (
                "daily",
                "2026-10-01",
                json!({"type":"daily","interval":1,"startDate":"2026-10-01"}),
            ),
            (
                "weekly",
                "2026-10-10",
                json!({"type":"weekly","interval":1,"weekdays":[1],"startDate":"2026-10-10"}),
            ),
        ] {
            conn.execute("INSERT INTO todo_recurrence_history(series_id,todo_item_id,todo_created_at,effective_date,rule_json,create_time) VALUES(?1,1,10,?2,?3,1)",params![series,effective,rule.to_string()]).unwrap();
        }
        for date in ["2026-10-03", "2026-10-12"] {
            assert!(locate(
                &conn,
                &reference("todo", &format!("todo:1:10@{date}")),
                ZONE,
                &HolidayDays::new()
            )
            .unwrap()
            .is_some());
        }
        assert!(locate(
            &conn,
            &reference("todo", "todo:1:10@2026-10-13"),
            ZONE,
            &HolidayDays::new()
        )
        .is_err());
        assert!(locate(
            &conn,
            &reference("todo", "todo:1:11"),
            ZONE,
            &HolidayDays::new()
        )
        .unwrap()
        .is_none());
        conn.execute("UPDATE todo_group SET is_archived=1 WHERE id=1", [])
            .unwrap();
        assert!(locate(&conn, &task, ZONE, &HolidayDays::new())
            .unwrap()
            .is_none());
    }

    #[test]
    fn physical_events_resolve_without_hash_lookup_and_reused_events_are_missing() {
        let conn = database();
        conn.execute("INSERT INTO calendar_event(id,create_time,update_time,calendar_id,title,start_date) VALUES(9,10,10,1,'安排',0)",[]).unwrap();
        let event = reference("event", "9:10");
        assert_eq!(
            locate(&conn, &event, ZONE, &HolidayDays::new())
                .unwrap()
                .unwrap()
                .target,
            json!({"kind":"event","id":9})
        );
        assert_eq!(
            query_refs(&conn, "scope", "alpha", "event", "", None, 20, ZONE).unwrap()["items"][0]
                ["ref"]["id"],
            "9:10"
        );
        assert!(locate(
            &conn,
            &reference("event", "-234:10"),
            ZONE,
            &HolidayDays::new()
        )
        .unwrap_err()
        .contains("todoId"));
        conn.execute("UPDATE calendar_event SET create_time=11 WHERE id=9", [])
            .unwrap();
        assert!(locate(&conn, &event, ZONE, &HolidayDays::new())
            .unwrap()
            .is_none());
    }

    #[test]
    fn picker_omits_deleted_articles_references_and_non_document_items() {
        let conn = database();
        card(&conn, 1);
        conn.execute("INSERT INTO articles(id,title,create_time,update_time,content_id,is_delete) VALUES(1,'已删除',1,1,1,1)",[]).unwrap();
        conn.execute("INSERT INTO project_item(id,title,create_time,update_time,content_id,ref_type) VALUES(1,'引用',1,1,1,'card')",[]).unwrap();
        conn.execute("INSERT INTO project_item(id,title,create_time,update_time,content_id,project_item_type) VALUES(2,'白板',1,1,1,'whiteboard')",[]).unwrap();
        conn.execute("INSERT INTO project_item(id,title,create_time,update_time,content_id) VALUES(3,'正文',1,1,1)",[]).unwrap();
        assert!(
            query_refs(&conn, "scope", "alpha", "article", "", None, 20, ZONE).unwrap()["items"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        let docs = query_refs(&conn, "scope", "alpha", "document", "", None, 20, ZONE).unwrap();
        assert_eq!(docs["items"].as_array().unwrap().len(), 1);
        assert_eq!(docs["items"][0]["ref"]["id"], "3");
    }

    #[test]
    fn holiday_lookup_is_targeted_and_denied_instances_never_trigger_it() {
        let conn = database();
        todo(&conn);
        let rule =
            json!({"type":"daily","interval":1,"startDate":"2026-10-01","excludeHolidays":true});
        conn.execute("INSERT INTO todo_recurrence_history(series_id,todo_item_id,todo_created_at,effective_date,rule_json,create_time) VALUES('daily',1,10,'2026-10-01',?1,1)",[rule.to_string()]).unwrap();
        let mut request = json!({"method":"describe","refs":[{"kind":"todo","id":"todo:1:10@2026-10-12"}],"readable":[]});
        assert!(requested_holiday_ranges(&conn, "alpha", &request, ZONE)
            .unwrap()
            .is_empty());
        request["readable"] = json!(["todo"]);
        let ranges = requested_holiday_ranges(&conn, "alpha", &request, ZONE).unwrap();
        assert_eq!(ranges.len(), 1);
        let day = dates::day("2026-10-12").unwrap();
        assert_eq!(
            ranges[0],
            (ZONE.day_start(day), ZONE.day_start(day + 1) - 1)
        );
    }

    #[test]
    fn descriptions_keep_valid_results_when_an_instance_or_identity_is_invalid() {
        let mut conn = database();
        card(&conn, 1);
        todo(&conn);
        let request = json!({
            "method":"describe",
            "refs":[
                {"kind":"card","id":"1"},
                {"kind":"todo","id":"todo:1:10@2026-10-28"},
                {"kind":"todo","id":"bad"},
                {"kind":"event","id":"-321:10"}
            ],
            "readable":["card","todo","event"]
        });
        assert!(requested_holiday_ranges(&conn, "alpha", &request, ZONE)
            .unwrap()
            .is_empty());
        let results = handle_refs(&mut conn, "alpha", &request, ZONE, &HolidayDays::new()).unwrap();
        assert_eq!(
            results,
            json!([
                {"status":"ok","title":"卡片1"},
                {"status":"missing"},
                {"status":"missing"},
                {"status":"missing"}
            ])
        );
    }
}

#[cfg(test)]
mod plugin_entity_tests {
    use super::*;
    const ZONE: CalendarTimeZone = CalendarTimeZone(chrono_tz::Asia::Shanghai);
    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&conn).unwrap();
        conn.execute("INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(1,10,10,'[]',0,1)",[]).unwrap();
        conn.execute("INSERT INTO plugin_entities(id,plugin_id,kind,key,title,content_id,create_time,update_time,orphaned_time) VALUES(1,'owner','note','one','插件实体',1,20,20,1)",[]).unwrap();
        conn.execute("INSERT INTO plugin_entity_kinds(plugin_id,kind,label,icon,update_time) VALUES('owner','note','笔记','<svg></svg>',1)",[]).unwrap();
        conn
    }
    fn reference() -> EntityRef {
        EntityRef {
            kind: "plugin-entity".into(),
            id: "1".into(),
        }
    }

    #[test]
    fn plugin_target_keeps_orphan_metadata_and_body_identity_without_choosing_a_page() {
        let conn = database();
        let target = entity_target(&conn, 1).unwrap().unwrap();
        assert_eq!(
            serde_json::to_value(&target).unwrap(),
            json!({"kind":"plugin-entity","id":1,"pluginId":"owner","entityKind":"note","createdAt":20,"contentId":1,"contentCreatedAt":10,"title":"插件实体","label":"笔记","icon":"<svg></svg>"})
        );
        assert!(entity_target(&conn, 999).unwrap().is_none());
        assert!(entity_target(&conn, -1).unwrap().is_none());
    }

    #[test]
    fn plugin_descriptions_require_ownership_or_identity_grant_even_with_readable_flag() {
        let mut conn = database();
        assert!(matches!(
            access(
                &conn,
                "owner",
                &reference(),
                false,
                ZONE,
                &HolidayDays::new()
            )
            .unwrap(),
            RefAccess::Allowed(_)
        ));
        assert!(matches!(
            access(
                &conn,
                "other",
                &reference(),
                true,
                ZONE,
                &HolidayDays::new()
            )
            .unwrap(),
            RefAccess::Denied
        ));
        grant(
            &mut conn,
            "other",
            &[(reference(), "20".into())],
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert!(matches!(
            access(
                &conn,
                "other",
                &reference(),
                false,
                ZONE,
                &HolidayDays::new()
            )
            .unwrap(),
            RefAccess::Allowed(_)
        ));
        conn.execute("UPDATE plugin_entities SET create_time=21 WHERE id=1", [])
            .unwrap();
        assert!(matches!(
            access(
                &conn,
                "other",
                &reference(),
                true,
                ZONE,
                &HolidayDays::new()
            )
            .unwrap(),
            RefAccess::Missing
        ));
        assert!(grant(
            &mut conn,
            "other",
            &[(reference(), "20".into())],
            ZONE,
            &HolidayDays::new()
        )
        .is_err());
    }

    #[test]
    fn plugin_picker_uses_host_only_identity_and_resolve_keeps_owner_boundary() {
        let mut conn = database();
        let items = query_refs(
            &conn,
            "scope",
            "caller",
            "plugin-entity",
            "实体",
            None,
            20,
            ZONE,
        )
        .unwrap();
        assert_eq!(
            items["items"],
            json!([{"ref":{"kind":"plugin-entity","id":"1"},"title":"插件实体","identity":"20"}])
        );
        let target = handle_refs(
            &mut conn,
            "caller",
            &json!({"method":"resolve","ref":reference()}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert_eq!(target["pluginId"], "owner");
        assert!(target.get("page").is_none());
        assert!(target.get("meta").is_none());
        assert!(target.get("content").is_none());
    }

    #[test]
    fn presentation_rechecks_owner_and_selected_identity_without_body_or_meta() {
        let mut conn = database();
        let request = json!({"method":"presentation","ref":reference()});
        assert!(requested_holiday_ranges(&conn, "other", &request, ZONE)
            .unwrap()
            .is_empty());
        assert_eq!(
            handle_refs(&mut conn, "other", &request, ZONE, &HolidayDays::new()).unwrap(),
            Value::Null
        );
        assert_eq!(
            presentation(&conn, "owner", &reference()).unwrap(),
            json!({"label":"笔记","icon":"<svg></svg>"})
        );
        grant(
            &mut conn,
            "other",
            &[(reference(), "20".into())],
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert_eq!(
            presentation(&conn, "other", &reference()).unwrap(),
            json!({"label":"笔记","icon":"<svg></svg>"})
        );
        conn.execute("UPDATE plugin_entities SET create_time=21 WHERE id=1", [])
            .unwrap();
        assert_eq!(
            presentation(&conn, "other", &reference()).unwrap(),
            Value::Null
        );
        conn.execute("DELETE FROM plugin_ref_grants", []).unwrap();
        assert_eq!(
            presentation(&conn, "other", &reference()).unwrap(),
            Value::Null
        );
    }
}
