use super::{common, query, schema};
use rusqlite::{params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, WebviewWindow};

pub(super) fn table(entity: &str) -> Result<&'static str, String> {
    match entity {
        "card" => Ok("cards"),
        "article" => Ok("articles"),
        "project" => Ok("project"),
        "document" => Ok("project_item"),
        _ => Err("当前移动宿主不支持此数据类型".into()),
    }
}
pub(super) fn sql_error(error: rusqlite::Error) -> String {
    format!("PLUGIN_DATA: {error}")
}
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataQuery {
    created_after: Option<i64>,
    created_before: Option<i64>,
    updated_after: Option<i64>,
    updated_before: Option<i64>,
    tag: Option<String>,
    sort: Option<String>,
    limit: Option<i64>,
    cursor: Option<String>,
}
fn base(entity: &str) -> Result<String, String> {
    let table = table(entity)?;
    if entity == "project" {
        return Ok("SELECT id,create_time AS created,update_time AS revision,update_time AS updated,title,pinned,archived,json_array_length(COALESCE(children,'[]')) AS item_count,'project' AS entity FROM project".into());
    }
    let title = if entity == "card" {
        "COALESCE(json_extract(m.meta,'$.title'),'')"
    } else {
        "e.title"
    };
    let filter = match entity {
        "article" => "e.is_delete=0",
        "document" => "COALESCE(e.ref_type,'')=''",
        _ => "1=1",
    };
    let fields = if entity == "document" {
        "0 AS pinned,COALESCE(e.project_item_type,'document') AS kind,COALESCE(e.projects,'[]') AS projects"
    } else {
        "e.is_top AS pinned,'document' AS kind,'[]' AS projects"
    };
    Ok(format!("SELECT e.id,e.create_time AS created,e.update_time AS revision,MAX(e.update_time,COALESCE(c.update_time,0)) AS updated,e.tags,{fields},{title} AS title,e.content_id,c.create_time AS content_created,COALESCE(c.count,0) AS word_count,c.content,'{entity}' AS entity FROM {table} e LEFT JOIN contents c ON c.id=e.content_id LEFT JOIN content_ai_meta m ON m.content_id=c.id WHERE {filter}"))
}
fn entity_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let entity: String = row.get("entity")?;
    let id: i64 = row.get("id")?;
    let title: String = row.get("title")?;
    let mut result = json!({"id":id.to_string(),"revision":row.get::<_,i64>("revision")?.to_string(),"title":title,"createdAt":row.get::<_,i64>("created")?,"updatedAt":row.get::<_,i64>("updated")?});
    if entity == "project" {
        result["archived"] = json!(row.get::<_, i64>("archived")? != 0);
        result["pinned"] = json!(row.get::<_, i64>("pinned")? != 0);
        result["documentCount"] = json!(row.get::<_, i64>("item_count")?);
        return Ok(result);
    }
    if entity == "card" && title.is_empty() {
        result["title"] = json!(common::json_content_plain_text(row.get("content")?)
            .chars()
            .take(30)
            .collect::<String>());
    }
    let content_id: Option<i64> = row.get("content_id")?;
    let created: Option<i64> = row.get("content_created")?;
    let reference = content_id.zip(created).map(|(id, at)| format!("{id}:{at}"));
    result["contentRef"] = if entity == "document" {
        json!(reference)
    } else {
        json!(reference.unwrap_or_default())
    };
    result["tags"] = json!(common::parse_string_array(row.get("tags")?));
    result["wordCount"] = json!(row.get::<_, i64>("word_count")?);
    if entity == "document" {
        result["kind"] = json!(row.get::<_, String>("kind")?);
        result["projectIds"] = json!(common::parse_id_array(row.get("projects")?)
            .iter()
            .map(i64::to_string)
            .collect::<Vec<_>>());
    } else {
        result["pinned"] = json!(row.get::<_, i64>("pinned")? != 0);
    }
    Ok(result)
}
pub(super) fn get(conn: &Connection, entity: &str, id: i64) -> Result<Option<Value>, String> {
    conn.query_row(
        &format!("SELECT * FROM ({}) WHERE id=?1", base(entity)?),
        [id],
        entity_row,
    )
    .optional()
    .map_err(sql_error)
}
fn query_data(conn: &Connection, entity: &str, query: DataQuery) -> Result<Value, String> {
    if entity == "project" && query.tag.is_some() {
        return Err("项目不支持标签查询".into());
    }
    let limit = query.limit.unwrap_or(50);
    if !(1..=200).contains(&limit) {
        return Err("分页数量必须是 1–200".into());
    }
    let sort = match query.sort.as_deref() {
        None | Some("updated") => "updated",
        Some("created") => "created",
        _ => return Err("排序无效".into()),
    };
    let mut conditions = vec!["1=1".to_string()];
    let mut values: Vec<SqlValue> = vec![];
    for (column, operator, time) in [
        ("created", ">=", query.created_after),
        ("created", "<", query.created_before),
        ("updated", ">=", query.updated_after),
        ("updated", "<", query.updated_before),
    ] {
        if let Some(time) = time {
            if time < 0 {
                return Err("时间范围无效".into());
            }
            conditions.push(format!("{column}{operator}?"));
            values.push(time.into());
        }
    }
    if let Some(tag) = &query.tag {
        conditions.push("EXISTS(SELECT 1 FROM json_each(tags) WHERE value=? OR substr(value,1,length(?)+1)=?||'/')".into());
        values.extend([tag.clone().into(), tag.clone().into(), tag.clone().into()]);
    }
    let fingerprint = serde_json::to_string(&(
        entity,
        DataQuery {
            cursor: None,
            limit: None,
            ..query.clone()
        },
    ))
    .map_err(|e| e.to_string())?;
    if let Some(cursor) = query.cursor {
        let cursor: (String, i64, i64) =
            serde_json::from_str(&cursor).map_err(|_| "分页游标无效")?;
        if cursor.0 != fingerprint {
            return Err("分页条件已变化，请从第一页重新读取".into());
        }
        conditions.push(format!("({sort}<? OR ({sort}=? AND id<?))"));
        values.extend([cursor.1.into(), cursor.1.into(), cursor.2.into()]);
    }
    values.push((limit + 1).into());
    let sql = format!(
        "SELECT * FROM ({}) WHERE {} ORDER BY {sort} DESC,id DESC LIMIT ?",
        base(entity)?,
        conditions.join(" AND ")
    );
    let mut statement = conn.prepare(&sql).map_err(sql_error)?;
    let mut items = statement
        .query_map(params_from_iter(values), entity_row)
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    let more = items.len() > limit as usize;
    items.truncate(limit as usize);
    let mut result = json!({"items":items});
    if more {
        if let Some(last) = items.last() {
            result["cursor"] = json!(serde_json::to_string(&(
                fingerprint,
                last[if sort == "created" {
                    "createdAt"
                } else {
                    "updatedAt"
                }]
                .as_i64()
                .unwrap(),
                last["id"]
                    .as_str()
                    .unwrap()
                    .parse::<i64>()
                    .map_err(|_| "内容身份无效")?
            ))
            .map_err(|e| e.to_string())?);
        }
    }
    Ok(result)
}
fn content_ref(reference: &str) -> Result<(i64, i64), String> {
    let (id, created) = reference.split_once(':').ok_or("正文引用无效")?;
    let id = id.parse::<i64>().map_err(|_| "正文引用无效")?;
    let created = created.parse::<i64>().map_err(|_| "正文引用无效")?;
    if id <= 0 || created < 0 {
        return Err("正文引用无效".into());
    }
    Ok((id, created))
}
fn read_content(conn: &Connection, reference: &str, plugin_id: &str) -> Result<Value, String> {
    let (id, created) = content_ref(reference)?;
    if !conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM contents WHERE id=?1 AND create_time=?2)",
            params![id, created],
            |row| row.get::<_, bool>(0),
        )
        .map_err(sql_error)?
    {
        return Ok(Value::Null);
    }
    let mut owners = vec![];
    for (entity,sql) in [("card","SELECT EXISTS(SELECT 1 FROM cards WHERE content_id=?1)"),("article","SELECT EXISTS(SELECT 1 FROM articles WHERE content_id=?1 AND is_delete=0)"),("document","SELECT EXISTS(SELECT 1 FROM project_item WHERE content_id=?1 AND (ref_type IS NULL OR ref_type=''))")] {
        if conn.query_row(sql,[id],|row|row.get::<_,bool>(0)).map_err(sql_error)? { owners.push(entity); }
    }
    let own=conn.query_row("SELECT EXISTS(SELECT 1 FROM plugin_entities WHERE content_id=?1 AND plugin_id=?2 AND orphaned_time IS NULL)",params![id,plugin_id],|row|row.get::<_,bool>(0)).map_err(sql_error)?;
    let addressable = !owners.is_empty()
        || conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM plugin_entities WHERE content_id=?1)",
                [id],
                |row| row.get::<_, bool>(0),
            )
            .map_err(sql_error)?;
    let document = query::query_content_detail(conn, id)?;
    let binding:Option<String>=conn.query_row("SELECT document_id FROM collaboration_bindings WHERE content_id=?1 AND content_created_at=?2",params![id,created],|row|row.get(0)).optional().map_err(sql_error)?;
    Ok(
        json!({"owners":owners,"own":own,"addressable":addressable,"document":document,"binding":binding}),
    )
}
#[tauri::command]
pub fn plugin_data_read(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    plugin_id: String,
    request: Value,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::provider_settings::validate_plugin_id(&plugin_id)?;
    crate::plugin_transport::with_database(&token, &database, || {
        let conn = schema::open_active_database(&app)?;
        if conn.database_name() != database {
            return Err("插件工作区已失效".into());
        }
        match request["method"].as_str() {
            Some("check") => Ok(Value::Null),
            Some("projectTree") => super::plugin_projects::tree(
                &conn,
                super::plugin_projects::id(&request, "projectId")?,
            ),
            Some("changes") => changes(&conn, &token, request["after"].as_i64()),
            Some("query") => query_data(
                &conn,
                request["entity"].as_str().ok_or("类型无效")?,
                serde_json::from_value(request["query"].clone()).map_err(|_| "查询无效")?,
            ),
            Some("get") => Ok(get(
                &conn,
                request["entity"].as_str().ok_or("类型无效")?,
                request["id"]
                    .as_str()
                    .and_then(|v| v.parse().ok())
                    .ok_or("身份无效")?,
            )?
            .unwrap_or(Value::Null)),
            Some("content") => read_content(
                &conn,
                request["ref"].as_str().ok_or("正文引用无效")?,
                &plugin_id,
            ),
            _ => Err("未知插件数据操作".into()),
        }
    })
}

pub(super) fn string<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> {
    value[key]
        .as_str()
        .ok_or_else(|| format!("参数 {key} 无效"))
}
pub(super) fn integer(value: &Value, key: &str) -> Result<i64, String> {
    value[key]
        .as_i64()
        .ok_or_else(|| format!("参数 {key} 无效"))
}
fn assert_revision(
    conn: &Connection,
    entity: &str,
    id: i64,
    expected: &str,
) -> Result<Value, String> {
    let current = get(conn, entity, id)?.ok_or("内容不存在")?;
    if current["revision"].as_str() != Some(expected) {
        return Err("PLUGIN_CONFLICT: 内容已变化，请重新读取".into());
    }
    Ok(current)
}
pub(super) fn row_snapshot(conn: &Connection, table: &str, id: i64) -> Result<Value, String> {
    let mut statement = conn
        .prepare(&format!("SELECT * FROM {table} WHERE id=?"))
        .map_err(sql_error)?;
    let columns: Vec<_> = statement
        .column_names()
        .into_iter()
        .map(str::to_owned)
        .collect();
    statement
        .query_row([id], |row| {
            let mut object = serde_json::Map::new();
            for (index, column) in columns.iter().enumerate() {
                let value = match row.get_ref(index)? {
                    rusqlite::types::ValueRef::Null => Value::Null,
                    rusqlite::types::ValueRef::Integer(value) => json!(value),
                    rusqlite::types::ValueRef::Real(value) => json!(value),
                    rusqlite::types::ValueRef::Text(value) => json!(String::from_utf8_lossy(value)),
                    rusqlite::types::ValueRef::Blob(_) => {
                        return Err(rusqlite::Error::InvalidQuery)
                    }
                };
                object.insert(column.clone(), value);
            }
            Ok(Value::Object(object))
        })
        .map_err(sql_error)
}
fn change(conn: &mut Connection, plugin_id: &str, request: &Value) -> Result<Value, String> {
    let entity = string(request, "entity")?;
    if matches!(entity, "project" | "document") {
        return super::plugin_projects::change(conn, plugin_id, request);
    }
    let table = table(entity)?;
    let method = string(request, "method")?;
    let now = common::now_millis();
    let tx = conn.transaction().map_err(sql_error)?;
    let result = match method {
        "create" => {
            let input = &request["input"];
            let content = &request["content"];
            let count = integer(content, "count")?;
            if count < 0 || !content["nodes"].is_array() {
                return Err("正文无效".into());
            }
            let content_id = common::insert_content_record(
                &tx,
                &content["nodes"],
                content.get("contracts"),
                count,
                now,
            )?;
            let tags = serde_json::to_string(input.get("tags").unwrap_or(&json!([])))
                .map_err(|e| e.to_string())?;
            let pinned = input["pinned"].as_bool().unwrap_or(false);
            if entity == "card" {
                tx.execute("INSERT INTO cards(create_time,update_time,tags,content_id,is_top) VALUES(?1,?1,?2,?3,?4)",params![now,tags,content_id,pinned]).map_err(sql_error)?;
            } else {
                tx.execute("INSERT INTO articles(title,create_time,update_time,tags,links,banner_bg,is_top,is_delete,content_id) VALUES(?1,?2,?2,?3,'[]','',?4,0,?5)",params![string(input,"title")?,now,tags,pinned,content_id]).map_err(sql_error)?;
            }
            let id = tx.last_insert_rowid();
            common::write_operation(&tx, entity, "insert", id, now)?;
            tx.execute("INSERT OR REPLACE INTO plugin_ref_grants(plugin_id,kind,ref_id,target_created_at,create_time) VALUES(?1,?2,?3,?4,?4)",params![plugin_id,entity,id.to_string(),now]).map_err(sql_error)?;
            get(&tx, entity, id)?.ok_or("新建内容读取失败")?
        }
        "update" | "delete" => {
            let id = string(request, "id")?
                .parse::<i64>()
                .map_err(|_| "身份无效")?;
            let current = assert_revision(&tx, entity, id, string(request, "expectedRevision")?)?;
            let timestamp = now.max(
                current["revision"]
                    .as_str()
                    .and_then(|v| v.parse::<i64>().ok())
                    .unwrap_or(0)
                    + 1,
            );
            if method == "update" {
                let patch = &request["patch"];
                let tags = serde_json::to_string(patch.get("tags").unwrap_or(&current["tags"]))
                    .map_err(|e| e.to_string())?;
                let pinned = patch["pinned"]
                    .as_bool()
                    .unwrap_or(current["pinned"].as_bool().unwrap_or(false));
                if entity == "article" {
                    tx.execute(
                        "UPDATE articles SET title=?1,tags=?2,is_top=?3,update_time=?4 WHERE id=?5",
                        params![
                            patch["title"]
                                .as_str()
                                .unwrap_or(current["title"].as_str().unwrap_or("")),
                            tags,
                            pinned,
                            timestamp,
                            id
                        ],
                    )
                    .map_err(sql_error)?;
                } else {
                    tx.execute(
                        "UPDATE cards SET tags=?1,is_top=?2,update_time=?3 WHERE id=?4",
                        params![tags, pinned, timestamp, id],
                    )
                    .map_err(sql_error)?;
                }
                common::write_operation(&tx, entity, "update", id, timestamp)?;
                get(&tx, entity, id)?.ok_or("内容不存在")?
            } else {
                let row = row_snapshot(&tx, table, id)?;
                let content_id = row["content_id"].as_i64().ok_or("正文不存在")?;
                super::collaboration::assert_content_local(&tx, content_id)?;
                let created = tx
                    .query_row(
                        "SELECT create_time FROM contents WHERE id=?1",
                        [content_id],
                        |row| row.get::<_, i64>(0),
                    )
                    .map_err(sql_error)?;
                tx.execute(&format!("DELETE FROM {table} WHERE id=?1"), [id])
                    .map_err(sql_error)?;
                common::release_content_reference(&tx, content_id)?;
                common::write_operation(&tx, entity, "delete", id, now)?;
                tx.execute("INSERT INTO plugin_operations(plugin_id,action,entity,entity_id,title,payload,create_time) VALUES(?1,'delete',?2,?3,?4,?5,?6)",params![plugin_id,entity,id.to_string(),current["title"].as_str().unwrap_or(""),json!({"row":row,"contentCreatedAt":created}).to_string(),now]).map_err(sql_error)?;
                Value::Null
            }
        }
        _ => return Err("未知插件数据写入".into()),
    };
    tx.commit().map_err(sql_error)?;
    Ok(result)
}
fn edit_content(conn: &mut Connection, plugin_id: &str, request: &Value) -> Result<Value, String> {
    let reference = string(request, "ref")?;
    let snapshot = read_content(conn, reference, plugin_id)?;
    if snapshot.is_null() {
        return Err("正文不存在".into());
    }
    let (id, created) = content_ref(reference)?;
    super::collaboration::assert_content_local(conn, id)?;
    let expected = string(request, "expectedRevision")?;
    if snapshot["document"]["revision"].as_str() != Some(expected) {
        return Err("PLUGIN_CONFLICT: 正文已变化".into());
    }
    let tx = conn.transaction().map_err(sql_error)?;
    if !tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM contents WHERE id=?1 AND create_time=?2)",
            params![id, created],
            |row| row.get::<_, bool>(0),
        )
        .map_err(sql_error)?
    {
        return Err("正文身份已失效".into());
    }
    let count = integer(request, "count")?;
    if count < 0 || !request["nodes"].is_array() {
        return Err("正文无效".into());
    }
    let zone: Option<super::calendar_time::CalendarTimeZone> = request
        .get("timeZone")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|_| "正文写入时区无效")?;
    super::write_content_snapshot_in_zone(
        &tx,
        id,
        &request["nodes"],
        count,
        common::now_millis(),
        "PLUGIN_DATA",
        request.get("contracts"),
        Some(expected),
        Some(string(&snapshot["document"], "documentId")?),
        Some(string(&snapshot["document"], "librarySourceId")?),
        zone,
    )?;
    tx.commit().map_err(sql_error)?;
    read_content(conn, reference, plugin_id)
}
#[tauri::command]
pub fn plugin_data_write(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    plugin_id: String,
    request: Value,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::provider_settings::validate_plugin_id(&plugin_id)?;
    let result = crate::plugin_transport::with_database(&token, &database, || {
        let mut conn = schema::open_active_database(&app)?;
        if conn.database_name() != database {
            return Err("插件工作区已失效".into());
        }
        let before = last_operation(&conn)?;
        let result = if request["method"] == "content" {
            edit_content(&mut conn, &plugin_id, &request)
        } else {
            change(&mut conn, &plugin_id, &request)
        }?;
        remember_origin(&conn, &token, &plugin_id, before)?;
        Ok(result)
    })?;
    super::reconcile::trigger_reconcile(&app, &database);
    Ok(result)
}
fn operations(conn: &Connection, plugin_id: &str) -> Result<Value, String> {
    let mut statement=conn.prepare("SELECT id,entity,entity_id,title,create_time,restored_time,action FROM plugin_operations WHERE plugin_id=?1 AND entity IN ('card','article','project','document','todo','event') AND action IN ('delete','pending-delete','pending-restore') AND create_time>=?2 ORDER BY create_time DESC,id DESC LIMIT 200").map_err(sql_error)?;
    let items=statement.query_map(params![plugin_id,common::now_millis()-7*24*60*60*1000],|row|Ok(json!({"id":row.get::<_,i64>(0)?,"entity":row.get::<_,String>(1)?,"entityId":row.get::<_,String>(2)?,"title":row.get::<_,String>(3)?,"createdAt":row.get::<_,i64>(4)?,"restoredAt":row.get::<_,Option<i64>>(5)?,"pending":row.get::<_,String>(6)?.starts_with("pending-")}))).map_err(sql_error)?.collect::<Result<Vec<_>,_>>().map_err(sql_error)?;
    Ok(json!(items))
}
pub(super) fn restore(conn: &mut Connection, plugin_id: &str, id: i64) -> Result<Value, String> {
    let tx = conn.transaction().map_err(sql_error)?;
    let (entity,payload,created,restored):(String,String,i64,Option<i64>)=tx.query_row("SELECT entity,payload,create_time,restored_time FROM plugin_operations WHERE id=?1 AND plugin_id=?2",params![id,plugin_id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?))).map_err(sql_error)?;
    if restored.is_some() || created < common::now_millis() - 7 * 24 * 60 * 60 * 1000 {
        return Err("操作已恢复或超过七天保留期".into());
    }
    let payload: Value = serde_json::from_str(&payload).map_err(|_| "恢复快照损坏")?;
    if matches!(entity.as_str(), "todo" | "event") {
        if payload.get("documentTask").is_some() {
            super::plugin_document_tasks::restore(&tx, &payload)?;
        } else {
            super::plugin_task_snapshots::restore(
                &tx,
                payload["operationId"].as_str().ok_or("恢复操作缺失")?,
            )?;
        }
        tx.execute(
            "UPDATE plugin_operations SET restored_time=?1 WHERE id=?2",
            params![common::now_millis(), id],
        )
        .map_err(sql_error)?;
        let document = if let Some(id) = payload["documentTask"]["contentId"].as_i64() {
            Some(query::query_content_detail(&tx, id)?)
        } else {
            None
        };
        tx.commit().map_err(sql_error)?;
        return Ok(json!({"entity":entity,"document":document}));
    }
    let table = table(&entity)?;
    if matches!(entity.as_str(), "project" | "document") {
        let row_id = super::plugin_projects::restore(&tx, &entity, &payload)?;
        tx.execute(
            "UPDATE plugin_operations SET restored_time=?1 WHERE id=?2",
            params![common::now_millis(), id],
        )
        .map_err(sql_error)?;
        tx.commit().map_err(sql_error)?;
        return Ok(json!({"entity":entity,"id":row_id.to_string()}));
    }
    let row_id = integer(&payload["row"], "id")?;
    let content_id = integer(&payload["row"], "content_id")?;
    let content_created = integer(&payload, "contentCreatedAt")?;
    if !tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM contents WHERE id=?1 AND create_time=?2)",
            params![content_id, content_created],
            |row| row.get::<_, bool>(0),
        )
        .map_err(sql_error)?
    {
        return Err("原正文已清理，无法恢复".into());
    }
    insert_snapshot(&tx, table, &payload["row"])?;
    tx.execute(
        "UPDATE contents SET ref_count=ref_count+1 WHERE id=?1",
        [content_id],
    )
    .map_err(sql_error)?;
    tx.execute(
        "DELETE FROM content_pending_releases WHERE content_id=?1",
        [content_id],
    )
    .map_err(sql_error)?;
    let now = common::now_millis();
    tx.execute(
        "UPDATE plugin_operations SET restored_time=?1 WHERE id=?2",
        params![now, id],
    )
    .map_err(sql_error)?;
    common::write_operation(&tx, &entity, "insert", row_id, now)?;
    common::write_operation(&tx, "content", "update", content_id, now)?;
    tx.commit().map_err(sql_error)?;
    Ok(json!({"entity":entity,"id":row_id.to_string()}))
}
#[tauri::command]
pub fn plugin_data_operations(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    plugin_id: String,
    restore_id: Option<i64>,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::provider_settings::validate_plugin_id(&plugin_id)?;
    let result = crate::plugin_transport::with_database(&token, &database, || {
        let mut conn = schema::open_active_database(&app)?;
        if conn.database_name() != database {
            return Err("插件工作区已失效".into());
        }
        if restore_id.is_none() {
            let tx = conn.transaction().map_err(sql_error)?;
            super::plugin_task_snapshots::expire(&tx)?;
            tx.commit().map_err(sql_error)?;
        }
        match restore_id {
            Some(id) => restore(&mut conn, &plugin_id, id),
            None => operations(&conn, &plugin_id),
        }
    })?;
    if restore_id.is_some() {
        super::reconcile::trigger_reconcile(&app, &database);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&db).unwrap();
        for id in 1..=4 {
            db.execute("INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(?1,1,1,'[]',0,1)",[id]).unwrap();
            db.execute("INSERT INTO cards(id,create_time,update_time,tags,content_id,is_top) VALUES(?1,1,1,'[\"读书/小说\"]',?1,0)",[id]).unwrap();
        }
        db
    }
    #[test]
    fn stable_paging_and_query_binding() {
        let db = fixture();
        let first = query_data(
            &db,
            "card",
            serde_json::from_value(json!({"limit":2,"tag":"读书"})).unwrap(),
        )
        .unwrap();
        assert_eq!(first["items"][0]["id"], "4");
        let second = query_data(
            &db,
            "card",
            serde_json::from_value(json!({"limit":2,"tag":"读书","cursor":first["cursor"]}))
                .unwrap(),
        )
        .unwrap();
        assert_eq!(second["items"][0]["id"], "2");
        assert!(second.get("cursor").is_none());
        assert!(query_data(
            &db,
            "card",
            serde_json::from_value(json!({"limit":2,"tag":"其他","cursor":first["cursor"]}))
                .unwrap()
        )
        .is_err());
        assert!(query_data(
            &db,
            "card",
            serde_json::from_value(json!({"limit":201})).unwrap()
        )
        .is_err());
    }
    #[test]
    fn project_and_document_queries_keep_distinct_shapes_and_cursor_scopes() {
        let db = fixture();
        db.execute_batch("INSERT INTO project(id,title,children,create_time,update_time) VALUES(1,'项目','[10,11,12]',1,2); INSERT INTO project_item(id,title,children,parents,projects,tags,project_item_type,ref_type,ref_id,content_id,create_time,update_time) VALUES(10,'正文','[]','[]','[1]','[\"学习/项目\"]','document','',0,1,1,2),(11,'画板','[]','[]','[1]','[]','white-board','',0,NULL,1,2),(12,'引用','[]','[]','[1]','[]','document','card',1,NULL,1,2);").unwrap();
        let page = query_data(
            &db,
            "document",
            serde_json::from_value(json!({"limit":1})).unwrap(),
        )
        .unwrap();
        assert_eq!(page["items"][0]["kind"], "white-board");
        assert!(page["items"][0]["contentRef"].is_null());
        assert!(query_data(
            &db,
            "project",
            serde_json::from_value(json!({"limit":1,"cursor":page["cursor"]})).unwrap()
        )
        .is_err());
        let tagged = query_data(
            &db,
            "document",
            serde_json::from_value(json!({"limit":20,"tag":"学习"})).unwrap(),
        )
        .unwrap();
        assert_eq!(tagged["items"].as_array().unwrap().len(), 1);
        assert_eq!(tagged["items"][0]["projectIds"], json!(["1"]));
        let project = query_data(&db, "project", DataQuery::default()).unwrap();
        assert_eq!(project["items"][0]["documentCount"], 3);
        assert!(project["items"][0].get("contentRef").is_none());
        assert!(query_data(
            &db,
            "project",
            serde_json::from_value(json!({"tag":"学习"})).unwrap()
        )
        .is_err());
    }
    #[test]
    fn stale_update_does_not_change_data() {
        let mut db = fixture();
        let request = json!({"method":"update","entity":"card","id":"1","expectedRevision":"1","patch":{"tags":["修改"]}});
        let result = change(&mut db, "fixture", &request).unwrap();
        assert_ne!(result["revision"], "1");
        assert!(change(&mut db, "fixture", &request)
            .unwrap_err()
            .starts_with("PLUGIN_CONFLICT:"));
    }
    #[test]
    fn delete_and_restore_preserve_body_and_claim_once() {
        let mut db = fixture();
        change(
            &mut db,
            "fixture",
            &json!({"method":"delete","entity":"card","id":"1","expectedRevision":"1"}),
        )
        .unwrap();
        assert!(get(&db, "card", 1).unwrap().is_none());
        let ops = operations(&db, "fixture").unwrap();
        let id = ops[0]["id"].as_i64().unwrap();
        assert!(restore(&mut db, "other", id).is_err());
        restore(&mut db, "fixture", id).unwrap();
        assert!(get(&db, "card", 1).unwrap().is_some());
        assert!(restore(&mut db, "fixture", id).is_err());
        assert_eq!(
            db.query_row("SELECT ref_count FROM contents WHERE id=1", [], |row| row
                .get::<_, i64>(
                0
            ))
            .unwrap(),
            1
        );
    }
    #[test]
    fn restore_conflict_rolls_back_and_retains_snapshot() {
        let mut db = fixture();
        change(
            &mut db,
            "fixture",
            &json!({"method":"delete","entity":"card","id":"1","expectedRevision":"1"}),
        )
        .unwrap();
        db.execute("INSERT INTO cards(id,create_time,update_time,tags,content_id,is_top) VALUES(1,99,99,'[]',2,0)",[]).unwrap();
        let id = operations(&db, "fixture").unwrap()[0]["id"]
            .as_i64()
            .unwrap();
        assert!(restore(&mut db, "fixture", id).is_err());
        assert!(operations(&db, "fixture").unwrap()[0]["restoredAt"].is_null());
        assert_eq!(get(&db, "card", 1).unwrap().unwrap()["createdAt"], 99);
    }
    #[test]
    fn create_and_edit_keep_unknown_contracts_and_compare_body_revision() {
        use sha2::{Digest, Sha256};
        let mut db = fixture();
        db.execute(
            "INSERT OR IGNORE INTO library_identity VALUES(1,'library','baseline',NULL,1)",
            [],
        )
        .unwrap();
        let contract = json!({"format":2,"domain":"editor-node","owner":"example.source","type":"example.source","dataVersion":1,"kind":"block","isVoid":true,"textFields":["source"],"structuredFields":[],"resources":[]});
        let hash = format!("{:x}", Sha256::digest(contract.to_string().as_bytes()));
        let nodes = json!([{"type":"example.source","tauContract":hash,"source":"原文","children":[{"type":"formatted","text":""}]}]);
        let created = change(&mut db, "fixture", &json!({"method":"create","entity":"article","input":{"title":"测试"},"content":{"nodes":nodes,"contracts":{hash:contract},"count":2}})).unwrap();
        let reference = created["contentRef"].as_str().unwrap();
        let snapshot = read_content(&db, reference, "fixture").unwrap();
        assert_eq!(snapshot["owners"], json!(["article"]));
        let mut content = snapshot["document"]["content"].clone();
        content[0]["source"] = json!("修改");
        let request = json!({"method":"content","ref":reference,"expectedRevision":snapshot["document"]["revision"],"nodes":content,"contracts":snapshot["document"]["contracts"],"count":2});
        let updated = edit_content(&mut db, "fixture", &request).unwrap();
        assert_eq!(updated["document"]["content"][0]["source"], "修改");
        assert_eq!(
            updated["document"]["contracts"],
            snapshot["document"]["contracts"]
        );
        assert!(edit_content(&mut db, "fixture", &request)
            .unwrap_err()
            .starts_with("PLUGIN_CONFLICT:"));
    }
    #[test]
    fn committed_journal_keeps_plugin_origin_and_other_owners() {
        let _guard = crate::plugin_transport::test_host("journal-fixture");
        let mut db = fixture();
        let before = last_operation(&db).unwrap();
        change(&mut db, "fixture", &json!({"method":"update","entity":"card","id":"1","expectedRevision":"1","patch":{"pinned":true}})).unwrap();
        remember_origin(&db, "journal-fixture", "fixture", before).unwrap();
        let batch = changes(&db, "journal-fixture", Some(before)).unwrap();
        assert_eq!(batch["events"][0]["type"], "card.updated");
        assert_eq!(
            batch["events"][0]["origin"],
            json!({"kind":"plugin","pluginId":"fixture"})
        );
        assert!(batch["events"][0].get("content").is_none());
    }
}

#[derive(Default)]
struct EventOrigins {
    token: String,
    entries: std::collections::BTreeMap<i64, String>,
}
fn origins() -> &'static std::sync::Mutex<EventOrigins> {
    static ORIGINS: std::sync::OnceLock<std::sync::Mutex<EventOrigins>> =
        std::sync::OnceLock::new();
    ORIGINS.get_or_init(Default::default)
}
pub(super) fn last_operation(conn: &Connection) -> Result<i64, String> {
    conn.query_row("SELECT COALESCE(MAX(id),0) FROM operation", [], |row| {
        row.get(0)
    })
    .map_err(sql_error)
}
pub(super) fn remember_origin(
    conn: &Connection,
    token: &str,
    plugin_id: &str,
    after: i64,
) -> Result<(), String> {
    let mut state = origins().lock().map_err(|_| "事件来源不可用")?;
    if state.token != token {
        state.token = token.into();
        state.entries.clear();
    }
    let mut stmt = conn
        .prepare("SELECT id FROM operation WHERE id>?1 ORDER BY id")
        .map_err(sql_error)?;
    for id in stmt
        .query_map([after], |row| row.get::<_, i64>(0))
        .map_err(sql_error)?
    {
        state
            .entries
            .insert(id.map_err(sql_error)?, plugin_id.into());
    }
    Ok(())
}
pub(super) fn changes(conn: &Connection, token: &str, after: Option<i64>) -> Result<Value, String> {
    let Some(after) = after else {
        let cursor = last_operation(conn)?;
        let mut state = origins().lock().map_err(|_| "事件来源不可用")?;
        state.token = token.into();
        state.entries.clear();
        return Ok(json!({"cursor":cursor,"events":[]}));
    };
    let mut state = origins().lock().map_err(|_| "事件来源不可用")?;
    if state.token != token {
        state.token = token.into();
        state.entries.clear();
    }
    state.entries.retain(|id, _| *id > after);
    let mut stmt=conn.prepare("SELECT id,operation_time,operation_id,operation_content_type,operation_action FROM operation WHERE id>?1 ORDER BY id LIMIT 200").map_err(sql_error)?;
    let rows = stmt
        .query_map([after], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, Option<i64>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(sql_error)?;
    let mut cursor = after;
    let mut events = vec![];
    for row in rows {
        let (sequence, at, id, kind, action) = row.map_err(sql_error)?;
        cursor = sequence;
        let Some(id) = id else {
            continue;
        };
        let action = match action.as_deref() {
            Some("insert") => "created",
            Some("delete") => "deleted",
            Some("update") => "updated",
            _ => continue,
        };
        let origin = state
            .entries
            .get(&sequence)
            .map(|id| json!({"kind":"plugin","pluginId":id}))
            .unwrap_or(json!({"kind":"app"}));
        match kind.as_deref(){
            Some("card")|Some("article")|Some("project")=>events.push(json!({"type":format!("{}.{action}",kind.unwrap()),"id":id.to_string(),"at":at,"origin":origin})),
            Some("todo")|Some("todo_item")|Some("todo_recurrence")=>events.push(json!({"type":"todos.changed","at":at,"origin":{"kind":"app"}})),
            Some("calendar_event")=>events.push(json!({"type":"calendar.changed","at":at,"origin":{"kind":"app"}})),
            Some("project-item")=>events.push(json!({"type":format!("document.{action}"),"id":id.to_string(),"at":at,"origin":origin})),
            Some("content")=>{
                if conn.query_row("SELECT COALESCE(instr(content,'check-list-item'),0)>0 FROM contents WHERE id=?1",[id],|row|row.get::<_,bool>(0)).optional().map_err(sql_error)?.unwrap_or(false) {
                    events.push(json!({"type":"todos.changed","at":at,"origin":{"kind":"app"}}));
                }
                for (entity,table) in [("card","cards"),("article","articles"),("document","project_item")] {
                    let filter=match entity { "article"=>" AND is_delete=0", "document"=>" AND COALESCE(ref_type,'')=''", _=>"" };
                    let mut owners=conn.prepare(&format!("SELECT id FROM {table} WHERE content_id=?1{filter}")).map_err(sql_error)?;
                    for owner in owners.query_map([id],|row|row.get::<_,i64>(0)).map_err(sql_error)? {
                        events.push(json!({"type":format!("{entity}.updated"),"id":owner.map_err(sql_error)?.to_string(),"at":at,"origin":origin}));
                    }
                }
            },_=>{}
        }
    }
    Ok(json!({"cursor":cursor,"events":events}))
}

pub(super) fn insert_snapshot(
    conn: &Connection,
    table: &str,
    value: &Value,
) -> Result<i64, String> {
    let row = value.as_object().ok_or("恢复快照损坏")?;
    let row_id = integer(value, "id")?;
    if conn
        .query_row(
            &format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id=?1)"),
            [row_id],
            |row| row.get::<_, bool>(0),
        )
        .map_err(sql_error)?
    {
        return Err("原编号已被占用，未覆盖现有内容".into());
    }
    let mut statement = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(sql_error)?;
    let columns = statement
        .query_map([], |r| r.get::<_, String>(1))
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    drop(statement);
    let keys: Vec<_> = columns
        .iter()
        .filter(|key| row.contains_key(*key))
        .collect();
    let values = keys
        .iter()
        .map(|key| match &row[*key] {
            Value::Null => Ok(SqlValue::Null),
            Value::String(value) => Ok(SqlValue::Text(value.clone())),
            Value::Number(value) => value.as_i64().map(SqlValue::Integer).ok_or("恢复字段无效"),
            _ => Err("恢复字段无效"),
        })
        .collect::<Result<Vec<_>, _>>()?;
    conn.execute(
        &format!(
            "INSERT INTO {table} ({}) VALUES ({})",
            keys.iter()
                .map(|key| format!("\"{key}\""))
                .collect::<Vec<_>>()
                .join(","),
            vec!["?"; keys.len()].join(",")
        ),
        params_from_iter(values),
    )
    .map_err(sql_error)?;
    Ok(row_id)
}
