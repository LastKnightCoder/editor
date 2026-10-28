use super::{
    calendar_holidays::HolidayDays,
    calendar_time::CalendarTimeZone,
    common,
    plugin_data::sql_error,
    plugin_task_dates as dates, plugin_task_snapshots as snapshots,
    plugin_tasks::{parse_task, TaskId},
};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

pub(super) fn find<'a>(value: &'a Value, task: &str) -> Option<&'a Value> {
    if value["type"] == "check-list-item" && value["taskId"].as_str() == Some(task) {
        return Some(value);
    }
    for node in value
        .as_array()
        .or_else(|| value["children"].as_array())
        .into_iter()
        .flatten()
    {
        if let Some(found) = find(node, task) {
            return Some(found);
        }
    }
    None
}
fn locate(value: &Value, task: &str, path: &mut Vec<usize>) -> Option<Vec<usize>> {
    let nodes = value.as_array().or_else(|| value["children"].as_array())?;
    for (index, node) in nodes.iter().enumerate() {
        path.push(index);
        if node["type"] == "check-list-item" && node["taskId"].as_str() == Some(task) {
            return Some(path.clone());
        }
        if let Some(found) = locate(node, task, path) {
            return Some(found);
        }
        path.pop();
    }
    None
}
fn at_mut<'a>(value: &'a mut Value, path: &[usize]) -> Result<&'a mut Value, String> {
    if path.is_empty() {
        return Ok(value);
    }
    let nodes = if value.is_array() {
        value.as_array_mut()
    } else {
        value.get_mut("children").and_then(Value::as_array_mut)
    }
    .ok_or("正文待办路径无效")?;
    let child = nodes.get_mut(path[0]).ok_or("正文待办路径无效")?;
    at_mut(child, &path[1..])
}
fn source(conn: &Connection, content: i64) -> Result<Option<Value>, String> {
    let query="SELECT kind,id,title FROM (SELECT 'card' AS kind,id,'' AS title,0 AS priority FROM cards WHERE content_id=?1 UNION ALL SELECT 'article',id,title,1 FROM articles WHERE content_id=?1 AND is_delete=0 UNION ALL SELECT 'document',id,title,2 FROM project_item WHERE content_id=?1 AND COALESCE(ref_type,'')='' UNION ALL SELECT 'diary',id,'日记',3 FROM diary_segments WHERE content_id=?1 UNION ALL SELECT 'diary',id,date,4 FROM diary_entries WHERE content_id=?1) ORDER BY priority,id LIMIT 1";
    conn.query_row(query,[content],|row|Ok(json!({"kind":row.get::<_,String>(0)?,"id":row.get::<_,i64>(1)?.to_string(),"title":row.get::<_,String>(2)?}))).optional().map_err(sql_error)
}
pub(super) fn visible(conn: &Connection, content: i64, task: &str) -> Result<bool, String> {
    Ok(source(conn,content)?.is_some()&&!conn.query_row("SELECT EXISTS(SELECT 1 FROM doc_task_settings WHERE content_id=?1 AND (kind='excluded' OR (kind='promoted' AND task_id=?2)))",params![content,task],|row|row.get::<_,bool>(0)).map_err(sql_error)?)
}
pub(super) fn candidates(
    conn: &Connection,
    source: &str,
    offset: usize,
    limit: usize,
) -> Result<Vec<Value>, String> {
    if !matches!(source, "all" | "todo" | "document") {
        return Err("待办来源无效".into());
    }
    let sql="SELECT kind,identity,node FROM (SELECT 0 AS kind,t.id AS identity,0 AS position,NULL AS node FROM todo_item t WHERE ?1<>'document' AND t.is_archived=0 UNION ALL SELECT 1,c.id,j.id,j.value FROM contents c,json_tree(CASE WHEN json_valid(c.content) THEN c.content ELSE '[]' END) j WHERE ?1<>'todo' AND j.type='object' AND CASE WHEN j.type='object' THEN json_extract(j.value,'$.type') END='check-list-item' AND COALESCE(json_extract(j.value,'$.taskId'),'')<>'' AND COALESCE(json_extract(j.value,'$.taskArchived'),0)=0 AND NOT EXISTS(SELECT 1 FROM doc_task_settings s WHERE s.content_id=c.id AND (s.kind='excluded' OR (s.kind='promoted' AND s.task_id=json_extract(j.value,'$.taskId'))))) ORDER BY kind,identity,position LIMIT ?2 OFFSET ?3";
    let mut stmt = conn.prepare(sql).map_err(sql_error)?;
    let rows = stmt
        .query_map(params![source, limit as i64, offset as i64], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(sql_error)?;
    let mut result = vec![];
    let mut bytes = 0;
    for row in rows {
        let (kind, id, node) = row.map_err(sql_error)?;
        if kind == 0 {
            if let Some(row) = snapshots::row(conn, "todo_item", id)? {
                result.push(json!({"source":"todo","row":row}));
            }
        } else {
            let raw = node.ok_or("待办节点缺失")?;
            bytes += raw.len();
            if bytes > 16 * 1024 * 1024 {
                return Err("本页正文待办超过内存预算，请缩小来源范围".into());
            }
            let node: Value = serde_json::from_str(&raw).map_err(|_| "待办节点损坏")?;
            result.push(json!({"source":"document","contentId":id,"node":node}));
        }
    }
    Ok(result)
}

pub(super) fn meta(node: &Value) -> Result<Value, String> {
    let segments = if node["taskRecurrence"].is_null() {
        vec![]
    } else {
        if node["taskRecurrence"]["version"] != 1 {
            return Err("正文待办周期协议不受支持，原数据已保留".into());
        }
        let segments = node["taskRecurrence"]["segments"]
            .as_array()
            .ok_or("正文待办周期段无效")?;
        let mut previous = None;
        for segment in segments {
            let date = segment["effectiveDate"]
                .as_str()
                .ok_or("周期生效日期缺失")?;
            dates::day(date)?;
            if previous.is_some_and(|previous: &str| previous >= date)
                || segment["seriesId"].as_str().is_none_or(str::is_empty)
            {
                return Err("周期段身份或顺序无效".into());
            }
            previous = Some(date);
            if !segment["rule"].is_null()
                && (!segment["rule"].is_object()
                    || !matches!(
                        segment["rule"]["type"].as_str(),
                        Some("daily" | "weekdays" | "weekly" | "monthly" | "yearly" | "custom")
                    ))
            {
                return Err("周期规则不受支持".into());
            }
        }
        segments.clone()
    };
    if !node["taskOccurrenceState"].is_null() && !node["taskOccurrenceState"].is_object() {
        return Err("周期实例状态损坏".into());
    }
    Ok(
        json!({"segments":segments,"occurrenceState":node.get("taskOccurrenceState").cloned().unwrap_or(json!({}))}),
    )
}

fn dto(
    conn: &Connection,
    content: i64,
    created: i64,
    node: &Value,
    date: Option<&str>,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    let _metadata = meta(node)?;
    let task = node["taskId"].as_str().ok_or("待办节点身份缺失")?;
    let (title, _, _, due) = super::document_task_header::parse(conn, node)?;
    let mut result = json!({"id":format!("document:{content}:{created}:{task}"),"revision":snapshots::digest(&json!([created,node])),"title":title,"completed":node["checked"]==true,"archived":node["taskArchived"]==true,"dueAt":due,"source":source(conn,content)?});
    if let Some(date) = date {
        let (series, state) = super::plugin_tasks::occurrence(&meta(node)?, date, zone, holidays)?;
        result["id"] = json!(format!("document:{content}:{created}:{task}@{date}"));
        result["completed"] = json!(!state["completedAt"].is_null());
        result["dueAt"] = state
            .get("scheduledAt")
            .filter(|value| !value.is_null())
            .cloned()
            .unwrap_or(json!(date));
        let mut base = node.clone();
        base.as_object_mut()
            .ok_or("待办节点无效")?
            .remove("taskOccurrenceState");
        result["revision"] = json!(snapshots::digest(&json!([
            created, base, series, date, state
        ])));
    }
    Ok(result)
}
pub(super) fn query_candidate(
    conn: &Connection,
    candidate: &Value,
    query: &Value,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Vec<Value>, String> {
    let content = candidate["contentId"].as_i64().ok_or("正文身份无效")?;
    let node = &candidate["node"];
    let task = node["taskId"].as_str().ok_or("待办身份无效")?;
    if !visible(conn, content, task)? {
        return Ok(vec![]);
    }
    if query["nonRecurring"] == true
        && meta(node)?["segments"]
            .as_array()
            .is_some_and(|segments| !segments.is_empty())
    {
        return Ok(vec![]);
    }

    let created = conn
        .query_row(
            "SELECT create_time FROM contents WHERE id=?1",
            [content],
            |row| row.get::<_, i64>(0),
        )
        .map_err(sql_error)?;
    if query["view"] == "occurrences" {
        let range = dates::window(query, zone, true)?.ok_or("缺少实例窗口")?;
        let values = super::todo_calendar_sync::occurrences_for_metadata(
            &meta(node)?,
            zone.day(range.0),
            zone.day(range.1 - 1),
            zone,
            holidays,
        )?
        .unwrap_or_default();
        values
            .keys()
            .map(|day| {
                dto(
                    conn,
                    content,
                    created,
                    node,
                    Some(&dates::day_text(*day)),
                    zone,
                    holidays,
                )
            })
            .collect()
    } else {
        Ok(vec![dto(
            conn, content, created, node, None, zone, holidays,
        )?])
    }
}
pub(super) fn read(
    conn: &Connection,
    id: &str,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    let TaskId::Document(content, created, task, date) = parse_task(id)? else {
        return Err("需要正文待办身份".into());
    };
    if !visible(conn, content, &task)? {
        return Err("正文来源已删除、排除或已提升为独立待办".into());
    }
    let document = super::query::query_content_detail(conn, content)?;
    if document.create_time != created {
        return Err("正文身份已变化".into());
    }
    let nodes = &document.content;
    let nodes = json!(nodes);
    let node = find(&nodes, &task).ok_or("原文待办已删除")?;
    let binding:Option<String>=conn.query_row("SELECT document_id FROM collaboration_bindings WHERE content_id=?1 AND content_created_at=?2",params![content,created],|row|row.get(0)).optional().map_err(sql_error)?;
    Ok(
        json!({"task":dto(conn,content,created,node,date.as_deref(),zone,holidays)?,"document":document,"binding":binding}),
    )
}
fn replace_text(value: &mut Value, next: &str) -> Result<(), String> {
    fn text(value: &Value) -> String {
        if let Some(text) = value["text"].as_str() {
            return text.into();
        }
        value["children"]
            .as_array()
            .into_iter()
            .flatten()
            .map(text)
            .collect()
    }
    let before = text(value);
    let a = before.chars().collect::<Vec<_>>();
    let b = next.chars().collect::<Vec<_>>();
    let mut start = 0;
    while start < a.len() && start < b.len() && a[start] == b[start] {
        start += 1;
    }
    let mut tail = 0;
    while tail < a.len() - start
        && tail < b.len() - start
        && a[a.len() - tail - 1] == b[b.len() - tail - 1]
    {
        tail += 1;
    }
    let end = a.len() - tail;
    let insert = b[start..b.len() - tail].iter().collect::<String>();
    fn apply(
        value: &mut Value,
        offset: &mut usize,
        start: usize,
        end: usize,
        insert: &str,
        inserted: &mut bool,
    ) {
        if let Some(raw) = value["text"].as_str() {
            let chars = raw.chars().collect::<Vec<_>>();
            let count = chars.len();
            let left = *offset;
            *offset += count;
            let mut result = String::new();
            for index in 0..=count {
                let pos = left + index;
                if pos == start && !*inserted {
                    result.push_str(insert);
                    *inserted = true;
                }
                if index < count && (pos < start || pos >= end) {
                    result.push(chars[index]);
                }
            }
            value["text"] = json!(result);
        } else if let Some(children) = value["children"].as_array_mut() {
            for child in children {
                apply(child, offset, start, end, insert, inserted);
            }
        }
    }
    let mut inserted = false;
    apply(value, &mut 0, start, end, &insert, &mut inserted);
    if !inserted && !insert.is_empty() {
        return Err("待办首段缺少文本叶子".into());
    }
    Ok(())
}
fn edit(
    conn: &Connection,
    nodes: &Value,
    task: &str,
    date: Option<&str>,
    write: &Value,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    let mut result = nodes.clone();
    let path = locate(nodes, task, &mut vec![]).ok_or("原文待办已删除")?;
    let node = at_mut(&mut result, &path)?;
    let action = write["action"].as_str().ok_or("动作无效")?;
    let metadata = meta(node)?;
    let recurring = metadata["segments"]
        .as_array()
        .is_some_and(|values| !values.is_empty());
    if let Some(date) = date {
        let (series, mut state) = super::plugin_tasks::occurrence(&metadata, date, zone, holidays)?;
        match action {
            "complete" => {
                state["completedAt"] = if write["completed"] == true {
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
                if write["patch"].get("title").is_some() {
                    return Err("实例标题跟随系列".into());
                }
                let due = write["patch"].get("dueAt").ok_or("实例改期须给出 dueAt")?;
                if let Some(value) = due.as_str() {
                    dates::timestamp(value, zone)?;
                } else if !due.is_null() {
                    return Err("实例改期时间无效".into());
                }
                state["scheduledAt"] = due.clone();
            }
            _ => return Err("待办动作无效".into()),
        }
        if !node["taskOccurrenceState"].is_object() {
            node["taskOccurrenceState"] = json!({});
        }
        node["taskOccurrenceState"][format!("{series}/{date}")] = state;
    } else {
        match action {
            "complete" => {
                if recurring {
                    return Err("周期待办必须指定实例，不能标记整系列".into());
                }
                node["checked"] = json!(write["completed"] == true);
                node["taskCompletedAt"] = if write["completed"] == true {
                    json!(common::now_millis())
                } else {
                    Value::Null
                };
            }
            "update" => {
                let (title, group, hint, _) = super::document_task_header::parse(conn, node)?;
                let patch = &write["patch"];
                let title = patch["title"].as_str().unwrap_or(&title);
                let due = if patch.get("dueAt").is_some() {
                    if !patch["dueAt"].is_null() {
                        dates::timestamp(patch["dueAt"].as_str().ok_or("截止时间无效")?, zone)?;
                    }
                    node["taskDateAnchor"] = Value::Null;
                    patch["dueAt"].as_str().map(str::to_owned)
                } else {
                    hint
                };
                let text = [Some(title.to_owned()), group, due]
                    .into_iter()
                    .flatten()
                    .filter(|part| !part.is_empty())
                    .collect::<Vec<_>>()
                    .join(" ");
                let paragraph = node
                    .get_mut("children")
                    .and_then(Value::as_array_mut)
                    .and_then(|nodes| nodes.first_mut())
                    .ok_or("待办首段缺失")?;
                replace_text(paragraph, &text)?;
            }
            "delete" => {
                fn nested(value: &Value) -> bool {
                    value["children"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .any(|node| node["type"] == "check-list-item" || nested(node))
                }
                if nested(node) {
                    return Err("正文待办有子项，不能删除".into());
                }
                let parent = at_mut(&mut result, &path[..path.len() - 1])?;
                let siblings = if parent.is_array() {
                    parent.as_array_mut()
                } else {
                    parent["children"].as_array_mut()
                }
                .ok_or("待办位置无效")?;
                siblings.remove(*path.last().ok_or("待办位置无效")?);
                if siblings.is_empty() {
                    if path.len() < 2 {
                        return Err("待办容器无效".into());
                    }
                    let container_path = &path[..path.len() - 1];
                    let outer = at_mut(&mut result, &container_path[..container_path.len() - 1])?;
                    let outer = if outer.is_array() {
                        outer.as_array_mut()
                    } else {
                        outer["children"].as_array_mut()
                    }
                    .ok_or("待办容器无效")?;
                    outer.remove(*container_path.last().ok_or("待办容器无效")?);
                }
            }
            _ => return Err("待办动作无效".into()),
        }
    }
    Ok(result)
}
pub(super) fn prepare(
    conn: &Connection,
    write: &Value,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    let id = write["id"].as_str().ok_or("待办身份无效")?;
    let mut current = read(conn, id, zone, holidays)?;
    if let Some(override_body) = write.get("body") {
        if current["binding"].is_null() {
            return Err("本地正文不能使用协作覆盖快照".into());
        }
        current["document"]["content"] = override_body["nodes"].clone();
        current["document"]["contracts"] = override_body["contracts"].clone();
    }
    let TaskId::Document(content, created, task, date) = parse_task(id)? else {
        unreachable!()
    };
    let node = find(&current["document"]["content"], &task).ok_or("原文待办已删除")?;
    let actual = dto(
        conn,
        content,
        created,
        node,
        date.as_deref(),
        zone,
        holidays,
    )?;
    if write["expectedRevision"] != actual["revision"] {
        return Err("PLUGIN_CONFLICT: 正文待办已变化".into());
    }
    let nodes = edit(
        conn,
        &current["document"]["content"],
        &task,
        date.as_deref(),
        write,
        zone,
        holidays,
    )?;
    Ok(
        json!({"before":current,"nodes":nodes,"contracts":current["document"]["contracts"],"task":if write["action"]=="delete"{Value::Null}else{dto(conn,content,created,find(&nodes,&task).ok_or("待办已删除")?,date.as_deref(),zone,holidays)?}}),
    )
}
pub(super) fn write_local(
    conn: &mut Connection,
    plugin: &str,
    write: &Value,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    let prepared = prepare(conn, write, zone, holidays)?;
    let before = &prepared["before"];
    if !before["binding"].is_null() {
        return Err("协作正文须通过协作提交".into());
    }
    let doc = &before["document"];
    if write["documentRevision"] != doc["revision"] {
        return Err("PLUGIN_CONFLICT: 正文已变化".into());
    }
    let TaskId::Document(content, created, _, _) =
        parse_task(write["id"].as_str().ok_or("待办身份无效")?)?
    else {
        return Err("需要正文待办身份".into());
    };
    let tx = conn.transaction().map_err(sql_error)?;
    super::collaboration::assert_content_local(&tx, content)?;
    let events = tx
        .prepare("SELECT calendar_event_id FROM doc_task_calendar_link WHERE content_id=?1")
        .map_err(sql_error)?
        .query_map([content], |row| row.get::<_, i64>(0))
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    let before_rows = snapshots::capture_events(&tx, &events)?;
    super::write_content_snapshot_in_zone(
        &tx,
        content,
        &write["nodes"],
        write["count"]
            .as_i64()
            .filter(|count| *count >= 0)
            .ok_or("字数无效")?,
        common::now_millis(),
        "PLUGIN_TASK",
        write.get("contracts"),
        doc["revision"].as_str(),
        doc["documentId"].as_str(),
        doc["librarySourceId"].as_str(),
        Some(zone),
    )?;
    if write["action"] == "delete" {
        let after_rows = snapshots::known(&tx, &before_rows)?;
        snapshots::record(
            &tx,
            plugin,
            "todo",
            write["id"].as_str().ok_or("身份无效")?,
            before["task"]["title"].as_str().unwrap_or(""),
            &before_rows,
            &after_rows,
        )?;
        let operation: i64 = tx
            .query_row(
                "SELECT MAX(id) FROM plugin_operations WHERE plugin_id=?1",
                [plugin],
                |row| row.get(0),
            )
            .map_err(sql_error)?;
        let payload = json!({"documentTask":{"contentId":content,"createdAt":created,"before":doc,"afterNodes":write["nodes"],"afterContracts":write["contracts"]},"operationId":tx.query_row("SELECT json_extract(payload,'$.operationId') FROM plugin_operations WHERE id=?1",[operation],|row|row.get::<_,String>(0)).map_err(sql_error)?});
        attach_document_snapshots(
            &tx,
            payload["operationId"].as_str().ok_or("恢复操作缺失")?,
            write["id"].as_str().ok_or("待办身份无效")?,
            &doc["content"],
            &write["nodes"],
        )?;
        tx.execute(
            "UPDATE plugin_operations SET payload=?1 WHERE id=?2",
            params![payload.to_string(), operation],
        )
        .map_err(sql_error)?;
    }
    common::write_operation(&tx, "todo", "update", 0, common::now_millis())?;
    common::write_operation(&tx, "calendar_event", "update", 0, common::now_millis())?;
    tx.commit().map_err(sql_error)?;
    Ok(
        json!({"task":prepared["task"],"document":super::query::query_content_detail(conn,content)?}),
    )
}
pub(super) fn restore(conn: &rusqlite::Transaction<'_>, payload: &Value) -> Result<(), String> {
    let saved = &payload["documentTask"];
    let id = saved["contentId"].as_i64().ok_or("正文恢复身份无效")?;
    let current = super::query::query_content_detail(conn, id)?;
    if current.create_time != saved["createdAt"].as_i64().ok_or("正文恢复身份无效")?
        || source(conn, id)?.is_none()
    {
        return Err("原正文来源或身份已变化".into());
    }
    if json!(current.content) != saved["afterNodes"]
        || json!(current.contracts) != saved["afterContracts"]
    {
        return Err("PLUGIN_CONFLICT: 删除后正文已有修改，未覆盖".into());
    }
    super::collaboration::assert_content_local(conn, id)?;
    super::write_content_snapshot(
        conn,
        id,
        &saved["before"]["content"],
        saved["before"]["count"].as_i64().ok_or("恢复字数无效")?,
        common::now_millis(),
        "PLUGIN_TASK",
        saved["before"].get("contracts"),
        current.revision.as_deref(),
        current.document_id.as_deref(),
        current.library_source_id.as_deref(),
    )?;
    snapshots::restore(conn, payload["operationId"].as_str().ok_or("恢复操作缺失")?)?;
    Ok(())
}

fn document_snapshot(
    nodes: &Value,
    content: i64,
    created: i64,
    task: &str,
) -> Result<Value, String> {
    let path = locate(nodes, task, &mut vec![]).ok_or("待办恢复位置缺失")?;
    let mut siblings = nodes.as_array().ok_or("正文无效")?;
    let mut parent_task: Option<String> = None;
    let mut anchor = Value::Null;
    let mut context = Value::Null;
    for index in path.iter().take(path.len() - 1) {
        let parent = siblings.get(*index).ok_or("恢复位置无效")?;
        let mut attributes = parent.clone();
        attributes
            .as_object_mut()
            .ok_or("恢复节点无效")?
            .remove("children");
        anchor = json!({"attributes":attributes,"previous":index.checked_sub(1).and_then(|i|siblings.get(i)),"next":siblings.get(index+1)});
        context = json!({"attributes":attributes,"previous":snapshots::digest(index.checked_sub(1).and_then(|i|siblings.get(i)).unwrap_or(&Value::Null)),"next":snapshots::digest(siblings.get(index+1).unwrap_or(&Value::Null))});
        if parent["type"] == "check-list-item" {
            parent_task = parent["taskId"].as_str().map(str::to_owned);
        }
        siblings = parent["children"].as_array().ok_or("恢复容器无效")?;
    }
    let index = *path.last().ok_or("恢复位置无效")?;
    Ok(
        json!({"ref":{"kind":"document","contentId":content,"createdAt":created,"taskId":task},"node":siblings[index],"parentTaskId":parent_task,"previousTaskId":index.checked_sub(1).and_then(|i|siblings.get(i)).and_then(|node|node["taskId"].as_str()),"nextTaskId":siblings.get(index+1).and_then(|node|node["taskId"].as_str()),"containerPath":&path[..path.len()-1],"containerAnchor":snapshots::digest(&anchor),"containerContext":context}),
    )
}
fn attach_document_snapshots(
    conn: &Connection,
    operation: &str,
    task_id: &str,
    before: &Value,
    after: &Value,
) -> Result<(), String> {
    let TaskId::Document(content, created, task, _) = parse_task(task_id)? else {
        return Err("正文身份无效".into());
    };
    let before_doc = document_snapshot(before, content, created, &task)?;
    let after_doc = if find(after, &task).is_some() {
        document_snapshot(after, content, created, &task)?
    } else {
        let mut value = before_doc.clone();
        value["node"] = Value::Null;
        value
    };
    let (a, b): (String, String) = conn
        .query_row(
            "SELECT before_json,after_json FROM task_assistant_operation WHERE id=?1",
            [operation],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(sql_error)?;
    let mut a: Value = serde_json::from_str(&a).map_err(|_| "恢复记录损坏")?;
    let mut b: Value = serde_json::from_str(&b).map_err(|_| "恢复记录损坏")?;
    a["taskRef"] = before_doc["ref"].clone();
    b["taskRef"] = before_doc["ref"].clone();
    a["document"] = before_doc;
    b["document"] = after_doc;
    conn.execute(
        "UPDATE task_assistant_operation SET before_json=?1,after_json=?2 WHERE id=?3",
        params![a.to_string(), b.to_string(), operation],
    )
    .map_err(sql_error)?;
    Ok(())
}
pub(super) fn stage_shared(
    conn: &mut Connection,
    plugin: &str,
    write: &Value,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    let prepared = prepare(conn, write, zone, holidays)?;
    let before = &prepared["before"];
    if before["binding"].is_null() || write["action"] != "delete" {
        return Err("需要共享正文删除操作".into());
    }
    let TaskId::Document(content, created, _, _) =
        parse_task(write["id"].as_str().ok_or("身份无效")?)?
    else {
        return Err("正文身份无效".into());
    };
    let tx = conn.transaction().map_err(sql_error)?;
    let events = tx
        .prepare("SELECT calendar_event_id FROM doc_task_calendar_link WHERE content_id=?1")
        .map_err(sql_error)?
        .query_map([content], |row| row.get::<_, i64>(0))
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    let rows = snapshots::capture_events(&tx, &events)?;
    snapshots::record(
        &tx,
        plugin,
        "todo",
        write["id"].as_str().ok_or("身份无效")?,
        before["task"]["title"].as_str().unwrap_or(""),
        &rows,
        &rows,
    )?;
    let (id,ledger):(i64,String)=tx.query_row("SELECT id,json_extract(payload,'$.operationId') FROM plugin_operations WHERE plugin_id=?1 ORDER BY id DESC LIMIT 1",[plugin],|row|Ok((row.get(0)?,row.get(1)?))).map_err(sql_error)?;
    let payload = json!({"operationId":ledger,"documentTask":{"contentId":content,"createdAt":created,"before":before["document"],"afterNodes":write["nodes"],"afterContracts":write["contracts"],"binding":before["binding"],"timeZone":zone.0.name(),"remoteOperation":write["remoteOperation"],"remoteRequest":write["remoteRequest"],"afterRevision":write["afterRevision"]}});
    tx.execute(
        "UPDATE plugin_operations SET action='pending-delete',payload=?1 WHERE id=?2",
        params![payload.to_string(), id],
    )
    .map_err(sql_error)?;
    attach_document_snapshots(
        &tx,
        &ledger,
        write["id"].as_str().ok_or("身份无效")?,
        &before["document"]["content"],
        &write["nodes"],
    )?;
    tx.execute(
        "UPDATE task_assistant_operation SET status='pending',phase='prepared' WHERE id=?1",
        [&ledger],
    )
    .map_err(sql_error)?;
    tx.commit().map_err(sql_error)?;
    Ok(json!({"id":id}))
}
pub(super) fn operation(conn: &Connection, plugin: &str, id: i64) -> Result<Value, String> {
    conn.query_row("SELECT payload,action,restored_time,create_time FROM plugin_operations WHERE id=?1 AND plugin_id=?2",params![id,plugin],|row|Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,Option<i64>>(2)?,row.get::<_,i64>(3)?))).optional().map_err(sql_error)?.map(|(payload,action,restored,time)|{
        let payload:Value=serde_json::from_str(&payload).map_err(|_|"恢复记录损坏")?;if !matches!(action.as_str(),"delete"|"pending-delete"|"pending-restore"){return Ok(Value::Null);}
        if payload["documentTask"]["binding"].is_null(){return Ok(Value::Null);}
        if restored.is_some()||time<common::now_millis()-snapshots::RETENTION{return Err("操作已恢复或超过七天".into());}
        Ok(json!({"id":id,"payload":payload,"pending":action.starts_with("pending-"),"restoring":action=="pending-restore"}))
    }).unwrap_or(Ok(Value::Null))
}
pub(super) fn pending(conn: &Connection, plugin: &str) -> Result<Value, String> {
    let mut stmt=conn.prepare("SELECT id FROM plugin_operations WHERE plugin_id=?1 AND action IN ('pending-delete','pending-restore') ORDER BY id LIMIT 100").map_err(sql_error)?;
    let ids = stmt
        .query_map(params![plugin], |row| row.get::<_, i64>(0))
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    Ok(json!(ids
        .into_iter()
        .map(|id| operation(conn, plugin, id))
        .collect::<Result<Vec<_>, _>>()?))
}
pub(super) fn finish_shared(
    conn: &Connection,
    plugin: &str,
    id: i64,
    document_id: &str,
) -> Result<(), String> {
    let stored = operation(conn, plugin, id)?;
    if stored.is_null() {
        return Err("共享删除恢复记录不存在".into());
    }
    if stored["pending"] != true {
        return Ok(());
    }
    let payload = &stored["payload"];
    if payload["documentTask"]["binding"] != document_id {
        return Err("共享删除记录不属于此文档".into());
    }
    let operation = payload["operationId"].as_str().ok_or("恢复操作缺失")?;
    let raw: String = conn
        .query_row(
            "SELECT before_json FROM task_assistant_operation WHERE id=?1",
            [operation],
            |row| row.get(0),
        )
        .map_err(sql_error)?;
    let before: Value = serde_json::from_str(&raw).map_err(|_| "恢复记录损坏")?;
    let after_rows = snapshots::known(conn, &before["rows"])?;
    conn.execute("UPDATE task_assistant_operation SET after_json=json_set(after_json,'$.rows',json(?1)),status='succeeded',phase='completed',update_time=?2 WHERE id=?3",params![after_rows.to_string(),common::now_millis(),operation]).map_err(sql_error)?;
    conn.execute(
        "UPDATE plugin_operations SET action='delete' WHERE id=?1",
        [id],
    )
    .map_err(sql_error)?;
    Ok(())
}
pub(super) fn finish_restore(
    conn: &Connection,
    plugin: &str,
    id: i64,
    document_id: &str,
) -> Result<(), String> {
    let stored = operation(conn, plugin, id)?;
    if stored.is_null() || (stored["pending"] == true && stored["restoring"] != true) {
        return Err("共享删除尚未确认".into());
    }
    if stored["payload"]["documentTask"]["binding"] != document_id {
        return Err("恢复记录不属于此文档".into());
    }
    if stored["restoring"] == true {
        conn.execute(
            "UPDATE task_assistant_operation SET undo_until=MAX(undo_until,?1) WHERE id=?2",
            params![
                common::now_millis() + 5 * 60_000,
                stored["payload"]["operationId"].as_str()
            ],
        )
        .map_err(sql_error)?;
    }
    snapshots::restore(
        conn,
        stored["payload"]["operationId"]
            .as_str()
            .ok_or("恢复操作缺失")?,
    )?;
    if let Some(content) = stored["payload"]["documentTask"]["contentId"].as_i64() {
        let document = super::query::query_content_detail(conn, content)?;
        super::assistant_tasks::reconcile_document_links(
            conn,
            content,
            Some(&json!(document.content)),
        )?;
    }
    conn.execute(
        "UPDATE plugin_operations SET restored_time=?1 WHERE id=?2",
        params![common::now_millis(), id],
    )
    .map_err(sql_error)?;
    Ok(())
}

pub(super) fn stage_restore(
    conn: &mut Connection,
    plugin: &str,
    request: &Value,
) -> Result<Value, String> {
    let id = request["id"].as_i64().ok_or("恢复身份无效")?;
    let stored = operation(conn, plugin, id)?;
    if stored.is_null() || stored["pending"] == true {
        return Err("恢复操作尚未就绪".into());
    }
    let mut payload = stored["payload"].clone();
    payload["documentTask"]["restoreRemote"] = request["remote"].clone();
    let mut tx = conn.transaction().map_err(sql_error)?;
    // 预检关联快照后回滚，网络提交期间不持有数据库事务。
    {
        let probe = tx.savepoint().map_err(sql_error)?;
        snapshots::restore(
            &probe,
            payload["operationId"].as_str().ok_or("恢复记录缺失")?,
        )?;
    }
    tx.execute("UPDATE task_assistant_operation SET undo_until=MAX(undo_until,?1),phase='restore-prepared' WHERE id=?2",params![common::now_millis()+5*60_000,payload["operationId"].as_str()]).map_err(sql_error)?;
    tx.execute(
        "UPDATE plugin_operations SET action='pending-restore',payload=?1 WHERE id=?2",
        params![payload.to_string(), id],
    )
    .map_err(sql_error)?;
    tx.commit().map_err(sql_error)?;
    Ok(json!(true))
}
pub(super) fn cancel_shared(conn: &mut Connection, plugin: &str, id: i64) -> Result<Value, String> {
    let stored = operation(conn, plugin, id)?;
    if stored.is_null() || stored["pending"] != true {
        return Ok(Value::Null);
    }
    let tx = conn.transaction().map_err(sql_error)?;
    if stored["restoring"] == true {
        tx.execute(
            "UPDATE task_assistant_operation SET phase='completed' WHERE id=?1",
            [stored["payload"]["operationId"].as_str()],
        )
        .map_err(sql_error)?;
        tx.execute("UPDATE plugin_operations SET action='delete',payload=json_remove(payload,'$.documentTask.restoreRemote') WHERE id=?1",[id]).map_err(sql_error)?;
    } else {
        let ledger = stored["payload"]["operationId"]
            .as_str()
            .ok_or("恢复记录缺失")?;
        snapshots::release_pins(&tx, ledger)?;
        tx.execute(
            "UPDATE task_assistant_operation SET status='failed',phase='cancelled' WHERE id=?1",
            [ledger],
        )
        .map_err(sql_error)?;
        tx.execute("UPDATE plugin_operations SET action='cancelled',payload=json_object('operationId',json_extract(payload,'$.operationId')) WHERE id=?1", [id])
            .map_err(sql_error)?;
    }
    tx.commit().map_err(sql_error)?;
    Ok(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    const ZONE: CalendarTimeZone = CalendarTimeZone(chrono_tz::Asia::Shanghai);
    fn fixture() -> (Connection, i64, Value) {
        let mut conn = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&conn).unwrap();
        let mut contracts = json!({});
        let mut nodes = std::collections::HashMap::new();
        for kind in ["check-list", "check-list-item", "paragraph"] {
            let contract = json!({"format":2,"domain":"editor-node","owner":"host.list","type":kind,"dataVersion":1,"kind":"block","isVoid":false,"textFields":[],"structuredFields":[],"resources":[]});
            let id = format!("{:x}", Sha256::digest(contract.to_string().as_bytes()));
            contracts[&id] = contract;
            nodes.insert(kind, id);
        }
        let content = json!([{"type":"check-list","tauContract":nodes["check-list"],"children":[{"type":"check-list-item","taskId":"task-one","tauContract":nodes["check-list-item"],"checked":false,"children":[{"type":"paragraph","tauContract":nodes["paragraph"],"children":[{"type":"formatted","bold":true,"text":"原任务 #工作 2026-10-28"}]}]}]}]);
        let tx = conn.transaction().unwrap();
        let id = common::insert_content_record(&tx, &content, Some(&contracts), 3, 10).unwrap();
        tx.execute(
            "INSERT INTO cards(create_time,update_time,content_id,tags) VALUES(1,1,?1,'[]')",
            [id],
        )
        .unwrap();
        tx.execute("INSERT INTO todo_group(id,title,is_system,sort_index,create_time,update_time) VALUES(7,'工作',0,0,1,1)",[]).unwrap();
        tx.commit().unwrap();
        let current = read(
            &conn,
            &format!("document:{id}:10:task-one"),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        (conn, id, current)
    }
    fn request(current: &Value, action: &str) -> Value {
        json!({"action":action,"id":current["task"]["id"],"expectedRevision":current["task"]["revision"]})
    }
    fn apply(conn: &mut Connection, write: &Value) -> Result<Value, String> {
        let planned = prepare(conn, write, ZONE, &HolidayDays::new())?;
        let mut value = write.clone();
        value["nodes"] = planned["nodes"].clone();
        value["contracts"] = planned["contracts"].clone();
        value["count"] = json!(3);
        value["documentRevision"] = planned["before"]["document"]["revision"].clone();
        write_local(conn, "fixture", &value, ZONE, &HolidayDays::new())
    }
    #[test]
    fn source_tasks_are_read_from_body_and_mutation_preserves_tokens_and_format() {
        let (mut conn, id, current) = fixture();
        assert_eq!(current["task"]["title"], "原任务");
        assert_eq!(current["task"]["dueAt"], "2026-10-28");
        assert_eq!(current["task"]["source"]["kind"], "card");
        let page = super::super::plugin_tasks::query_tasks(
            &conn,
            &json!({"source":"document"}),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert_eq!(page["items"].as_array().unwrap().len(), 1);
        let mut write = request(&current, "update");
        write["patch"] = json!({"title":"新任务","dueAt":null});
        let saved = apply(&mut conn, &write).unwrap();
        assert_eq!(saved["task"]["title"], "新任务");
        assert!(saved["task"]["dueAt"].is_null());
        let nodes = &saved["document"]["content"];
        assert_eq!(
            nodes[0]["children"][0]["children"][0]["children"][0]["text"],
            "新任务 #工作"
        );
        assert_eq!(
            nodes[0]["children"][0]["children"][0]["children"][0]["bold"],
            true
        );
        assert!(apply(&mut conn, &write)
            .unwrap_err()
            .starts_with("PLUGIN_CONFLICT:"));
        conn.execute("INSERT INTO doc_task_settings(content_id,task_id,kind,create_time) VALUES(?1,'','excluded',1)",[id]).unwrap();
        assert!(super::super::plugin_tasks::query_tasks(
            &conn,
            &json!({"source":"document"}),
            ZONE,
            &HolidayDays::new()
        )
        .unwrap()["items"]
            .as_array()
            .unwrap()
            .is_empty());
    }
    #[test]
    fn body_deletion_restores_node_and_refuses_to_overwrite_later_edit() {
        let (mut conn, id, current) = fixture();
        let write = request(&current, "delete");
        let saved = apply(&mut conn, &write).unwrap();
        assert!(saved["task"].is_null());
        let operation = conn
            .query_row("SELECT MAX(id) FROM plugin_operations", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap();
        super::super::plugin_data::restore(&mut conn, "fixture", operation).unwrap();
        let restored = read(
            &conn,
            current["task"]["id"].as_str().unwrap(),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert_eq!(restored["task"]["title"], "原任务");
        apply(&mut conn, &request(&restored, "delete")).unwrap();
        let operation = conn
            .query_row("SELECT MAX(id) FROM plugin_operations", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap();
        conn.execute("UPDATE contents SET content='[{\"type\":\"paragraph\",\"children\":[{\"text\":\"用户新输入\"}]}]' WHERE id=?1",[id]).unwrap();
        assert!(
            super::super::plugin_data::restore(&mut conn, "fixture", operation)
                .unwrap_err()
                .contains("未覆盖")
        );
    }
    #[test]
    fn body_tasks_with_children_cannot_be_deleted_and_promoted_tasks_are_excluded() {
        let (conn, id, current) = fixture();
        let mut content = current["document"]["content"].clone();
        let node = content[0]["children"][0].clone();
        content[0]["children"][0]["children"].as_array_mut().unwrap().push(json!({"type":"check-list","children":[{ "type":"check-list-item","taskId":"nested","children":node["children"]}]}));
        conn.execute(
            "UPDATE contents SET content=?1 WHERE id=?2",
            params![content.to_string(), id],
        )
        .unwrap();
        let current = read(
            &conn,
            current["task"]["id"].as_str().unwrap(),
            ZONE,
            &HolidayDays::new(),
        )
        .unwrap();
        assert!(prepare(
            &conn,
            &request(&current, "delete"),
            ZONE,
            &HolidayDays::new()
        )
        .unwrap_err()
        .contains("子项"));
        conn.execute("INSERT INTO doc_task_settings(content_id,task_id,kind,create_time) VALUES(?1,'task-one','promoted',1)",[id]).unwrap();
        assert!(read(
            &conn,
            current["task"]["id"].as_str().unwrap(),
            ZONE,
            &HolidayDays::new()
        )
        .is_err());
    }
    #[test]
    fn shared_projection_confirms_delete_and_restoration_in_their_transactions() {
        let (mut conn, id, current) = fixture();
        conn.execute("INSERT INTO collaboration_bindings(content_id,content_created_at,server_url,document_id) VALUES(?1,10,'https://example.com','shared')",[id]).unwrap();
        let mut write = request(&current, "delete");
        write["nodes"] = json!([]);
        write["contracts"] = current["document"]["contracts"].clone();
        write["remoteOperation"] = json!("remote");
        write["remoteRequest"] = json!({});
        write["afterRevision"] = json!("candidate");
        let staged = stage_shared(&mut conn, "fixture", &write, ZONE, &HolidayDays::new()).unwrap();
        let operation_id = staged["id"].as_i64().unwrap();
        {
            let tx = conn.transaction().unwrap();
            super::super::write_content_snapshot_in_zone(
                &tx,
                id,
                &json!([]),
                0,
                common::now_millis(),
                "TEST",
                current["document"].get("contracts"),
                current["document"]["revision"].as_str(),
                current["document"]["documentId"].as_str(),
                current["document"]["librarySourceId"].as_str(),
                Some(ZONE),
            )
            .unwrap();
            finish_shared(&tx, "fixture", operation_id, "shared").unwrap();
            tx.commit().unwrap();
        }
        assert_eq!(
            operation(&conn, "fixture", operation_id).unwrap()["pending"],
            false
        );
        stage_restore(
            &mut conn,
            "fixture",
            &json!({"id":operation_id,"remote":{"operationId":"restore"}}),
        )
        .unwrap();
        assert_eq!(
            operation(&conn, "fixture", operation_id).unwrap()["restoring"],
            true
        );
        cancel_shared(&mut conn, "fixture", operation_id).unwrap();
        assert_eq!(
            operation(&conn, "fixture", operation_id).unwrap()["pending"],
            false
        );
        stage_restore(
            &mut conn,
            "fixture",
            &json!({"id":operation_id,"remote":{"operationId":"restore-2"}}),
        )
        .unwrap();
        {
            let after = super::super::query::query_content_detail(&conn, id).unwrap();
            let tx = conn.transaction().unwrap();
            super::super::write_content_snapshot_in_zone(
                &tx,
                id,
                &current["document"]["content"],
                3,
                common::now_millis(),
                "TEST",
                current["document"].get("contracts"),
                after.revision.as_deref(),
                after.document_id.as_deref(),
                after.library_source_id.as_deref(),
                Some(ZONE),
            )
            .unwrap();
            finish_restore(&tx, "fixture", operation_id, "shared").unwrap();
            tx.commit().unwrap();
        }
        assert!(conn
            .query_row(
                "SELECT restored_time IS NOT NULL FROM plugin_operations WHERE id=?1",
                [operation_id],
                |row| row.get::<_, bool>(0)
            )
            .unwrap());
        assert!(find(
            &json!(
                super::super::query::query_content_detail(&conn, id)
                    .unwrap()
                    .content
            ),
            "task-one"
        )
        .is_some());
    }
    #[test]
    fn shared_delete_is_journaled_before_projection_and_cancel_is_safe() {
        let (mut conn, id, current) = fixture();
        conn.execute("INSERT INTO collaboration_bindings(content_id,content_created_at,server_url,document_id) VALUES(?1,10,'https://example.com','shared')",[id]).unwrap();
        let mut write = request(&current, "delete");
        write["nodes"] = json!([]);
        write["contracts"] = current["document"]["contracts"].clone();
        write["remoteOperation"] = json!("remote");
        write["remoteRequest"] = json!({});
        write["afterRevision"] = json!("candidate");
        let staged = stage_shared(&mut conn, "fixture", &write, ZONE, &HolidayDays::new()).unwrap();
        let operation_id = staged["id"].as_i64().unwrap();
        assert_eq!(
            operation(&conn, "fixture", operation_id).unwrap()["pending"],
            true
        );
        assert!(find(
            &json!(
                super::super::query::query_content_detail(&conn, id)
                    .unwrap()
                    .content
            ),
            "task-one"
        )
        .is_some());
        cancel_shared(&mut conn, "fixture", operation_id).unwrap();
        assert!(operation(&conn, "fixture", operation_id).unwrap().is_null());
    }
}
