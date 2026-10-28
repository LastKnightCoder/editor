use super::{common, plugin_data::sql_error, plugin_own_query as query};
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Transaction};
use serde_json::{json, Value};

const MAX_META: usize = 64 * 1024;
const RETENTION: i64 = 7 * 24 * 60 * 60 * 1000;
const COLUMNS: &str = "e.id,e.kind,e.key,e.title,e.meta,e.create_time,e.update_time,e.content_id,c.create_time AS content_created,MAX(e.update_time,c.update_time) AS updated";
const FROM: &str = "plugin_entities e JOIN contents c ON c.id=e.content_id";
const SORT_FIELDS: [&str; 3] = ["createdAt", "updatedAt", "title"];

fn source() -> query::QuerySource<'static> {
    query::QuerySource {
        json: "e.meta",
        id: "e.id",
        builtins: &[
            ("createdAt", "e.create_time"),
            ("updatedAt", "MAX(e.update_time,c.update_time)"),
            ("title", "e.title"),
        ],
    }
}

fn identifier(value: &Value) -> Result<i64, String> {
    let id = value
        .as_i64()
        .or_else(|| value.as_str().and_then(|value| value.parse().ok()))
        .ok_or("插件内容身份无效")?;
    if !(1..=9_007_199_254_740_991).contains(&id) {
        return Err("插件内容身份无效".into());
    }
    Ok(id)
}

fn text<'a>(value: &'a Value, name: &str, maximum: usize, empty: bool) -> Result<&'a str, String> {
    let value = value.as_str().ok_or_else(|| format!("{name} 无效"))?;
    if (!empty && value.trim().is_empty()) || value.encode_utf16().count() > maximum {
        return Err(format!("{name} 长度无效"));
    }
    Ok(value)
}

fn record(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let meta: String = row.get("meta")?;
    let meta = serde_json::from_str::<serde_json::Map<String, Value>>(&meta)
        .map(Value::Object)
        .map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                4,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?;
    Ok(json!({
        "id":row.get::<_,i64>("id")?.to_string(),
        "kind":row.get::<_,String>("kind")?,
        "key":row.get::<_,String>("key")?,
        "title":row.get::<_,String>("title")?,
        "meta":meta,
        "contentRef":format!("{}:{}",row.get::<_,i64>("content_id")?,row.get::<_,i64>("content_created")?),
        "createdAt":row.get::<_,i64>("create_time")?,
        "updatedAt":row.get::<_,i64>("updated")?,
        "revision":row.get::<_,i64>("update_time")?.to_string()
    }))
}

pub(super) fn get(conn: &Connection, plugin: &str, id: i64) -> Result<Option<Value>, String> {
    conn.query_row(
        &format!("SELECT {COLUMNS} FROM {FROM} WHERE e.plugin_id=?1 AND e.id=?2"),
        params![plugin, id],
        record,
    )
    .optional()
    .map_err(sql_error)
}

fn require(conn: &Connection, plugin: &str, id: i64) -> Result<Value, String> {
    get(conn, plugin, id)?.ok_or_else(|| "插件内容不存在".into())
}

fn filters(plugin: &str, filter: &Value) -> Result<Vec<query::SqlFragment>, String> {
    if !filter.is_object() {
        return Err("实体查询无效".into());
    }
    let mut values = vec![query::SqlFragment {
        sql: "e.plugin_id=?".into(),
        params: vec![plugin.to_owned().into()],
    }];
    if let Some(kind) = filter.get("kind") {
        let kind = text(kind, "类型", 128, false)?;
        values.push(query::SqlFragment {
            sql: "e.kind=?".into(),
            params: vec![kind.to_owned().into()],
        });
    }
    let conditions = filter.get("where").cloned().unwrap_or(json!([]));
    if conditions.as_array().is_some_and(|items| !items.is_empty()) && filter.get("kind").is_none()
    {
        return Err("按 meta 筛选须指定类型".into());
    }
    values.push(query::where_clause(&source(), &conditions)?);
    if let Some(title) = filter.get("titleContains") {
        values.push(query::contains_clause(
            "e.title",
            text(title, "标题关键词", 1000, true)?,
        ));
    }
    Ok(values
        .into_iter()
        .filter(|value| !value.sql.is_empty())
        .collect())
}

pub(super) fn read(
    conn: &Connection,
    plugin: &str,
    request: &Value,
    scope: &str,
) -> Result<Value, String> {
    match request["method"].as_str() {
        Some("entity.get") => {
            let Ok(id) = identifier(&request["id"]) else {
                return Ok(Value::Null);
            };
            Ok(get(conn, plugin, id)?.unwrap_or(Value::Null))
        }
        Some("entity.find") => {
            let kind = text(&request["kind"], "类型", 128, false)?;
            let key = text(&request["key"], "key", 200, false)?;
            Ok(conn.query_row(&format!("SELECT {COLUMNS} FROM {FROM} WHERE e.plugin_id=?1 AND e.kind=?2 AND e.key=?3"),params![plugin,kind,key],record).optional().map_err(sql_error)?.unwrap_or(Value::Null))
        }
        Some("entity.query") => {
            let request = &request["query"];
            let limit = request["limit"].as_u64().unwrap_or(50) as usize;
            if !(1..=200).contains(&limit) {
                return Err("每页须为 1–200 项".into());
            }
            let order = request
                .get("orderBy")
                .cloned()
                .unwrap_or(json!([{"builtin":"createdAt","direction":"desc"}]));
            if order
                .as_array()
                .is_some_and(|items| items.iter().any(|item| item.get("field").is_some()))
                && request.get("kind").is_none()
            {
                return Err("按 meta 排序须指定类型".into());
            }
            let scope = json!([
                scope,
                plugin,
                request.get("kind"),
                request.get("where"),
                request.get("titleContains"),
                order
            ]);
            let page = query::run_page(
                conn,
                &source(),
                query::PageQuery {
                    columns: COLUMNS,
                    from: FROM,
                    filters: filters(plugin, request)?,
                    order: &order,
                    cursor: request
                        .get("cursor")
                        .map(|value| text(value, "游标", 16 * 1024, false))
                        .transpose()?,
                    limit,
                    scope: &scope,
                },
                record,
            )?;
            let mut result = json!({"items":page.rows});
            if let Some(cursor) = page.cursor {
                result["cursor"] = json!(cursor)
            }
            Ok(result)
        }
        Some("entity.count") => {
            let filters = filters(plugin, &request["filter"])?;
            let sql = filters
                .iter()
                .map(|item| item.sql.as_str())
                .collect::<Vec<_>>()
                .join(" AND ");
            let values = filters.iter().flat_map(|item| item.params.iter());
            let count: i64 = conn
                .query_row(
                    &format!("SELECT COUNT(*) FROM {FROM} WHERE {sql}"),
                    params_from_iter(values),
                    |row| row.get(0),
                )
                .map_err(sql_error)?;
            Ok(json!(count))
        }
        Some("entity.backlinks") => {
            require(conn, plugin, identifier(&request["id"])?)?;
            Err("反链读取需要对应工作区的引用索引连接".into())
        }
        _ => Err("未知插件实体读取".into()),
    }
}

/// 主机只在插件显式激活时领取数据，不依据本机安装清单删除跨设备同步的数据。
pub(super) fn adopt(tx: &Transaction<'_>, plugin: &str) -> Result<(), String> {
    for (table, domain, subtype) in [
        ("plugin_entities", "entity", "kind"),
        ("plugin_records", "record", "collection"),
    ] {
        let mut statement=tx.prepare(&format!("SELECT CAST(id AS TEXT),{subtype} FROM {table} WHERE plugin_id=?1 AND orphaned_time IS NOT NULL ORDER BY id")).map_err(sql_error)?;
        let rows = statement
            .query_map([plugin], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(sql_error)?;
        for row in rows {
            let (id, subtype) = row.map_err(sql_error)?;
            super::plugin_own_data::event(tx, plugin, domain, "created", &id, &subtype)?;
        }
        tx.execute(&format!("UPDATE {table} SET orphaned_time=NULL WHERE plugin_id=?1 AND orphaned_time IS NOT NULL"),[plugin]).map_err(sql_error)?;
    }
    Ok(())
}

pub(super) fn next_id(conn: &Connection) -> Result<i64, String> {
    let key = "task:id-seq:plugin_entities";
    let id:i64=conn.query_row("SELECT MAX(COALESCE((SELECT MAX(id) FROM plugin_entities),0),COALESCE((SELECT MAX(CAST(entity_id AS INTEGER)) FROM plugin_operations WHERE entity='plugin-entity'),0),COALESCE((SELECT CAST(value AS INTEGER) FROM migration_meta WHERE key=?1),0))+1",[key],|row|row.get(0)).map_err(sql_error)?;
    identifier(&json!(id))?;
    conn.execute("INSERT INTO migration_meta(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,id.to_string()]).map_err(sql_error)?;
    Ok(id)
}

fn emit(conn: &Connection, plugin: &str, action: &str, value: &Value) -> Result<(), String> {
    super::plugin_own_data::event(
        conn,
        plugin,
        "entity",
        action,
        value["id"].as_str().ok_or("实体身份无效")?,
        value["kind"].as_str().ok_or("类型无效")?,
    )
}

fn assert_revision(current: &Value, request: &Value) -> Result<(), String> {
    if let Some(expected) = request.get("expectedRevision") {
        if !expected.is_string() || expected != &current["revision"] {
            return Err("PLUGIN_CONFLICT: 内容已被修改，请重新读取".into());
        }
    }
    Ok(())
}

fn create(tx: &Transaction<'_>, plugin: &str, request: &Value) -> Result<Value, String> {
    let id = identifier(&request["id"])?;
    let input = &request["input"];
    let kind = text(&input["kind"], "类型", 128, false)?;
    let key = text(&input["key"], "key", 200, false)?;
    let title = input
        .get("title")
        .map(|value| text(value, "标题", 500, true))
        .transpose()?
        .unwrap_or("");
    if tx.query_row("SELECT EXISTS(SELECT 1 FROM plugin_entities WHERE id=?1 OR (plugin_id=?2 AND kind=?3 AND key=?4))",params![id,plugin,kind,key],|row|row.get::<_,bool>(0)).map_err(sql_error)? {
        return Err("PLUGIN_CONFLICT: 内容 ID 或同类型 key 已存在".into());
    }
    if input
        .get("content")
        .is_some_and(|content| content.get("shareOf").is_some())
        || request
            .get("content")
            .is_some_and(|content| content.get("shareOf").is_some())
    {
        return Err("插件实体不能使用 shareOf 创建正文".into());
    }
    if input.get("content").is_some() && request.get("content").is_none() {
        return Err("初始正文尚未准备完成".into());
    }
    let indexes = query::read_indexes(request.get("indexes"), &SORT_FIELDS)?;
    let meta =
        query::serialize_object(input.get("meta").unwrap_or(&json!({})), &indexes, MAX_META)?;
    let now = common::now_millis();
    let prepared = request
        .get("content")
        .cloned()
        .unwrap_or(json!({"nodes":[],"contracts":{},"count":0}));
    let count = prepared["count"]
        .as_i64()
        .filter(|count| *count >= 0)
        .ok_or("正文字数无效")?;
    let content_id = common::insert_content_record(
        tx,
        &prepared["nodes"],
        prepared.get("contracts"),
        count,
        now,
    )?;
    tx.execute("INSERT INTO plugin_entities(id,plugin_id,kind,key,title,content_id,meta,create_time,update_time) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?8)",params![id,plugin,kind,key,title,content_id,meta,now]).map_err(sql_error)?;
    let result = require(tx, plugin, id)?;
    emit(tx, plugin, "created", &result)?;
    Ok(result)
}

fn update(tx: &Transaction<'_>, plugin: &str, request: &Value) -> Result<Value, String> {
    let id = identifier(&request["id"])?;
    let current = require(tx, plugin, id)?;
    assert_revision(&current, request)?;
    let patch = request["patch"]
        .as_object()
        .filter(|patch| !patch.is_empty())
        .ok_or("实体修改不能为空")?;
    if patch
        .keys()
        .any(|key| !matches!(key.as_str(), "title" | "meta"))
    {
        return Err("不支持的实体修改字段".into());
    }
    let title = patch
        .get("title")
        .map(|value| text(value, "标题", 500, true))
        .transpose()?
        .unwrap_or(current["title"].as_str().unwrap_or(""));
    let indexes = query::read_indexes(
        request["indexes"].get(current["kind"].as_str().ok_or("类型无效")?),
        &SORT_FIELDS,
    )?;
    let meta = if let Some(meta) = patch.get("meta") {
        query::serialize_object(meta, &indexes, MAX_META)?
    } else {
        current["meta"].to_string()
    };
    tx.execute("UPDATE plugin_entities SET title=?1,meta=?2,update_time=MAX(update_time+1,?3) WHERE id=?4 AND plugin_id=?5",params![title,meta,common::now_millis(),id,plugin]).map_err(sql_error)?;
    let result = require(tx, plugin, id)?;
    emit(tx, plugin, "updated", &result)?;
    Ok(result)
}

fn delete(tx: &Transaction<'_>, plugin: &str, request: &Value) -> Result<Value, String> {
    let deleted_at = common::now_millis();
    let id = identifier(&request["id"])?;
    let current = require(tx, plugin, id)?;
    assert_revision(&current, request)?;
    let row = super::plugin_data::row_snapshot(tx, "plugin_entities", id)?;
    let content_id = row["content_id"].as_i64().ok_or("正文身份无效")?;
    let created: i64 = tx
        .query_row(
            "SELECT create_time FROM contents WHERE id=?1",
            [content_id],
            |row| row.get(0),
        )
        .map_err(sql_error)?;
    let links = super::plugin_links::snapshot(tx, plugin, id)?;
    super::plugin_links::remove_from(tx, plugin, id)?;
    tx.execute(
        "DELETE FROM plugin_entities WHERE id=?1 AND plugin_id=?2",
        params![id, plugin],
    )
    .map_err(sql_error)?;
    common::release_content_reference(tx, content_id)?;
    tx.execute("INSERT INTO plugin_operations(plugin_id,action,entity,entity_id,title,payload,create_time) VALUES(?1,'delete','plugin-entity',?2,?3,?4,?5)",params![plugin,id.to_string(),current["title"].as_str().unwrap_or(""),json!({"row":row,"contentCreatedAt":created,"links":links}).to_string(),deleted_at]).map_err(sql_error)?;
    emit(tx, plugin, "deleted", &current)?;
    Ok(Value::Null)
}

fn register_kind(tx: &Transaction<'_>, plugin: &str, request: &Value) -> Result<Value, String> {
    let definition = &request["definition"];
    let kind = text(&definition["kind"], "类型", 128, false)?;
    let label = text(&definition["label"], "类型名称", 50, false)?;
    let icon = definition
        .get("icon")
        .map(|value| text(value, "类型图标", 16 * 1024, true))
        .transpose()?
        .unwrap_or("");
    if !icon.is_empty()
        && !(icon.starts_with("<svg ")
            || icon.starts_with("<svg>")
            || icon.starts_with("<svg\n")
            || icon.starts_with("<svg\t"))
    {
        return Err("类型图标必须是 SVG".into());
    }
    let changed=tx.execute("INSERT INTO plugin_entity_kinds(plugin_id,kind,label,icon,update_time) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(plugin_id,kind) DO UPDATE SET label=excluded.label,icon=excluded.icon,update_time=excluded.update_time WHERE label<>excluded.label OR icon<>excluded.icon",params![plugin,kind,label,icon,common::now_millis()]).map_err(sql_error)?;
    Ok(json!(changed > 0))
}

pub(super) fn write(tx: &Transaction<'_>, plugin: &str, request: &Value) -> Result<Value, String> {
    match request["method"]
        .as_str()
        .or_else(|| request["op"].as_str())
    {
        Some("entity.create") => create(tx, plugin, request),
        Some("entity.update") => update(tx, plugin, request),
        Some("entity.delete") => delete(tx, plugin, request),
        Some("entity.registerKind") => register_kind(tx, plugin, request),
        Some("adopt") => {
            adopt(tx, plugin)?;
            Ok(Value::Null)
        }
        _ => Err("未知插件实体写入".into()),
    }
}

/// 仅共用本插件仍持有的正文；调用方须在创建原生实体的同一事务里增持。
pub(super) fn share_content(
    tx: &Transaction<'_>,
    plugin: &str,
    reference: &str,
) -> Result<i64, String> {
    let (id, created) = reference.split_once(':').ok_or("正文引用无效")?;
    let id = identifier(&json!(id))?;
    let created = created.parse::<i64>().map_err(|_| "正文引用无效")?;
    let owned=tx.query_row("SELECT EXISTS(SELECT 1 FROM plugin_entities e JOIN contents c ON c.id=e.content_id WHERE e.plugin_id=?1 AND e.content_id=?2 AND e.orphaned_time IS NULL AND c.create_time=?3 AND c.ref_count>0)",params![plugin,id,created],|row|row.get::<_,bool>(0)).map_err(sql_error)?;
    if !owned {
        return Err("只能共用本插件持有的正文".into());
    }
    tx.execute(
        "UPDATE contents SET ref_count=ref_count+1 WHERE id=?1",
        [id],
    )
    .map_err(sql_error)?;
    tx.execute(
        "DELETE FROM content_pending_releases WHERE content_id=?1",
        [id],
    )
    .map_err(sql_error)?;
    Ok(id)
}

pub(super) fn restore(
    tx: &Transaction<'_>,
    plugin: &str,
    operation_id: i64,
) -> Result<Value, String> {
    let (raw,time,restored):(String,i64,Option<i64>)=tx.query_row("SELECT payload,create_time,restored_time FROM plugin_operations WHERE id=?1 AND plugin_id=?2 AND entity='plugin-entity' AND action='delete'",params![operation_id,plugin],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?))).optional().map_err(sql_error)?.ok_or("恢复记录不存在")?;
    if restored.is_some() || time < common::now_millis() - RETENTION {
        return Err("操作已恢复或超过七天保留期".into());
    }
    let payload: Value = serde_json::from_str(&raw).map_err(|_| "恢复快照损坏")?;
    let row = &payload["row"];
    let id = identifier(&row["id"])?;
    if row["plugin_id"] != plugin {
        return Err("恢复快照归属不匹配".into());
    }
    let kind = text(&row["kind"], "类型", 128, false)?;
    let key = text(&row["key"], "key", 200, false)?;
    let title = text(&row["title"], "标题", 500, true)?;
    if tx.query_row("SELECT EXISTS(SELECT 1 FROM plugin_entities WHERE id=?1 OR (plugin_id=?2 AND kind=?3 AND key=?4))",params![id,plugin,kind,key],|row|row.get::<_,bool>(0)).map_err(sql_error)? { return Err("PLUGIN_CONFLICT: 原内容 ID 或 key 已被占用".into()) }
    let content = identifier(&row["content_id"])?;
    let created = payload["contentCreatedAt"].as_i64().ok_or("正文身份无效")?;
    if !tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM contents WHERE id=?1 AND create_time=?2)",
            params![content, created],
            |row| row.get::<_, bool>(0),
        )
        .map_err(sql_error)?
    {
        return Err("原正文已被清理，无法恢复".into());
    }
    let meta = row["meta"].as_str().ok_or("实体元信息快照损坏")?;
    let meta_value: Value = serde_json::from_str(meta).map_err(|_| "实体元信息快照损坏")?;
    query::serialize_object(
        &meta_value,
        &query::read_indexes(None, &SORT_FIELDS)?,
        MAX_META,
    )?;
    let create_time = row["create_time"].as_i64().ok_or("实体创建时间无效")?;
    let update_time = row["update_time"].as_i64().ok_or("实体版本无效")?;
    tx.execute("INSERT INTO plugin_entities(id,plugin_id,kind,key,title,content_id,meta,create_time,update_time) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",params![id,plugin,kind,key,title,content,meta,create_time,update_time]).map_err(sql_error)?;
    super::plugin_links::restore(tx, plugin, id, &payload["links"])?;
    tx.execute(
        "UPDATE contents SET ref_count=ref_count+1 WHERE id=?1",
        [content],
    )
    .map_err(sql_error)?;
    tx.execute(
        "DELETE FROM content_pending_releases WHERE content_id=?1",
        [content],
    )
    .map_err(sql_error)?;
    tx.execute(
        "UPDATE plugin_operations SET restored_time=?1 WHERE id=?2 AND plugin_id=?3",
        params![common::now_millis(), operation_id, plugin],
    )
    .map_err(sql_error)?;
    common::write_operation(tx, "content", "update", content, common::now_millis())?;
    emit(tx, plugin, "created", &require(tx, plugin, id)?)?;
    Ok(json!({"entity":"plugin-entity","id":id.to_string()}))
}

pub(super) fn backlinks(
    conn: &Connection,
    index: &Connection,
    plugin: &str,
    id: i64,
) -> Result<Value, String> {
    let own = require(conn, plugin, id)?;
    let content = own["contentRef"]
        .as_str()
        .and_then(|value| value.split_once(':'))
        .and_then(|(id, _)| id.parse::<i64>().ok())
        .ok_or("正文身份无效")?;
    let (items, _) =
        super::entity_context::backlinks_of(conn, index, "plugin-entity", id, &[content]);
    Ok(json!(items.into_iter().map(|item| {
        let entity=match item.source.kind.as_str() { "card"=>Some("card"),"article"=>Some("article"),"project-item"=>Some("document"),_=>None };
        json!({"entity":entity,"id":item.source.id.to_string(),"title":item.source.title,"snippets":item.snippets})
    }).collect::<Vec<_>>()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&conn).unwrap();
        conn
    }
    fn execute(conn: &mut Connection, plugin: &str, request: Value) -> Result<Value, String> {
        let tx = conn.transaction().map_err(sql_error)?;
        let result = write(&tx, plugin, &request)?;
        tx.commit().map_err(sql_error)?;
        Ok(result)
    }
    fn create_entity(conn: &mut Connection, plugin: &str, key: &str, meta: Value) -> Value {
        let id = next_id(conn).unwrap();
        execute(conn,plugin,json!({"method":"entity.create","id":id.to_string(),"input":{"kind":"note","key":key,"title":key,"meta":meta},"indexes":{"rank":"number"}})).unwrap()
    }
    fn content_id(entity: &Value) -> i64 {
        entity["contentRef"]
            .as_str()
            .unwrap()
            .split(':')
            .next()
            .unwrap()
            .parse()
            .unwrap()
    }
    fn remove(conn: &mut Connection, plugin: &str, entity: &Value) -> i64 {
        execute(conn,plugin,json!({"method":"entity.delete","id":entity["id"],"expectedRevision":entity["revision"]})).unwrap();
        conn.query_row(
            "SELECT MAX(id) FROM plugin_operations WHERE plugin_id=?1",
            [plugin],
            |row| row.get(0),
        )
        .unwrap()
    }
    fn restore_operation(
        conn: &mut Connection,
        plugin: &str,
        operation: i64,
    ) -> Result<Value, String> {
        let tx = conn.transaction().map_err(sql_error)?;
        let result = restore(&tx, plugin, operation)?;
        tx.commit().map_err(sql_error)?;
        Ok(result)
    }
    fn ref_count(conn: &Connection, entity: &Value) -> i64 {
        conn.query_row(
            "SELECT ref_count FROM contents WHERE id=?1",
            [content_id(entity)],
            |row| row.get(0),
        )
        .unwrap()
    }

    #[test]
    fn entities_are_scoped_and_body_has_independent_identity_and_version() {
        let mut conn = database();
        let original = create_entity(&mut conn, "alpha", "same", json!({"rank":1}));
        let other = create_entity(&mut conn, "beta", "same", json!({"rank":2}));
        let id = identifier(&original["id"]).unwrap();
        assert!(get(&conn, "beta", id).unwrap().is_none());
        assert_eq!(
            read(
                &conn,
                "alpha",
                &json!({"method":"entity.find","kind":"note","key":"same"}),
                "scope"
            )
            .unwrap(),
            original
        );
        assert_ne!(original["contentRef"], other["contentRef"]);
        assert_eq!(ref_count(&conn, &original), 1);
        conn.execute(
            "UPDATE contents SET update_time=update_time+1000 WHERE id=?1",
            [content_id(&original)],
        )
        .unwrap();
        let current = get(&conn, "alpha", id).unwrap().unwrap();
        assert!(current["updatedAt"].as_i64().unwrap() > original["updatedAt"].as_i64().unwrap());
        assert_eq!(current["revision"], original["revision"]);
        let update=execute(&mut conn,"alpha",json!({"method":"entity.update","id":original["id"],"patch":{"title":"新标题"},"expectedRevision":original["revision"]})).unwrap();
        assert_ne!(update["revision"], original["revision"]);
        assert!(execute(&mut conn,"alpha",json!({"method":"entity.update","id":original["id"],"patch":{"title":"覆盖"},"expectedRevision":original["revision"]})).unwrap_err().contains("PLUGIN_CONFLICT"));
        assert!(execute(
            &mut conn,
            "beta",
            json!({"method":"entity.delete","id":original["id"]})
        )
        .is_err());
    }

    #[test]
    fn query_count_and_cursor_keep_plugin_kind_filters_and_sorting() {
        let mut conn = database();
        for (key, rank) in [("甲", 1), ("乙", 3), ("丙", 2)] {
            create_entity(&mut conn, "alpha", key, json!({"rank":rank}));
        }
        create_entity(&mut conn, "beta", "不应出现", json!({"rank":2}));
        let filter =
            json!({"kind":"note","where":[{"field":"rank","type":"number","op":"gte","value":2}]});
        assert_eq!(
            read(
                &conn,
                "alpha",
                &json!({"method":"entity.count","filter":filter}),
                "scope"
            )
            .unwrap(),
            2
        );
        let mut request = json!({"method":"entity.query","query":{"kind":"note","where":filter["where"],"orderBy":[{"field":"rank","type":"number","direction":"asc"}],"limit":1}});
        let first = read(&conn, "alpha", &request, "scope").unwrap();
        assert_eq!(first["items"][0]["title"], "丙");
        request["query"]["cursor"] = first["cursor"].clone();
        assert_eq!(
            read(&conn, "alpha", &request, "scope").unwrap()["items"][0]["title"],
            "乙"
        );
        assert!(read(&conn, "beta", &request, "scope").is_err());
        assert!(read(&conn, "alpha", &request, "other-scope").is_err());
        request["query"]["titleContains"] = json!("乙");
        assert!(read(&conn, "alpha", &request, "scope").is_err());
    }

    #[test]
    fn duplicate_key_index_type_and_unprepared_or_shared_content_are_rejected() {
        let mut conn = database();
        let original = create_entity(&mut conn, "alpha", "same", json!({"rank":1}));
        for (key, meta, body) in [
            ("same", json!({}), None),
            ("bad-type", json!({"rank":"one"}), None),
            ("unprepared", json!({}), Some(json!({"markdown":"正文"}))),
            (
                "share",
                json!({}),
                Some(json!({"shareOf":original["contentRef"]})),
            ),
        ] {
            let id = next_id(&conn).unwrap();
            let mut input = json!({"kind":"note","key":key,"meta":meta});
            if let Some(body) = body {
                input["content"] = body
            }
            assert!(execute(
                &mut conn,
                "alpha",
                json!({"method":"entity.create","id":id,"input":input,"indexes":{"rank":"number"}})
            )
            .is_err());
        }
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM contents", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert!(execute(&mut conn,"alpha",json!({"method":"entity.update","id":original["id"],"patch":{"meta":{"rank":"bad"}},"indexes":{"note":{"rank":"number"}}})).is_err());
    }

    #[test]
    fn composable_writes_rollback_data_body_and_events_together() {
        let mut conn = database();
        let id = next_id(&conn).unwrap();
        {
            let tx = conn.transaction().unwrap();
            write(
                &tx,
                "alpha",
                &json!({"op":"entity.create","id":id,"input":{"kind":"note","key":"one"}}),
            )
            .unwrap();
            assert!(write(&tx,"alpha",&json!({"op":"entity.update","id":id,"patch":{"title":"修改"},"expectedRevision":"stale"})).is_err());
        }
        for table in ["plugin_entities", "contents", "operation"] {
            assert_eq!(
                conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row
                    .get::<_, i64>(0))
                    .unwrap(),
                0
            );
        }
        assert!(next_id(&conn).unwrap() > id);
    }

    #[test]
    fn delete_and_restore_preserve_body_identity_key_and_outgoing_links() {
        let mut conn = database();
        let original = create_entity(&mut conn, "alpha", "one", json!({"rank":1}));
        let id = identifier(&original["id"]).unwrap();
        conn.execute("INSERT INTO plugin_links(id,plugin_id,from_id,to_kind,to_id,to_created_at,role,sort_index,data,create_time) VALUES('link','alpha',?1,'card','999',1,'material',4,'{}',1)",[id]).unwrap();
        let operation = remove(&mut conn, "alpha", &original);
        assert_eq!(ref_count(&conn, &original), 0);
        assert!(conn.query_row("SELECT r.released_at>=o.create_time FROM content_pending_releases r JOIN plugin_operations o ON o.id=?1 WHERE r.content_id=?2",params![operation,content_id(&original)],|row|row.get::<_,bool>(0)).unwrap());
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM plugin_links", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert!(restore_operation(&mut conn, "beta", operation).is_err());
        restore_operation(&mut conn, "alpha", operation).unwrap();
        assert_eq!(
            get(&conn, "alpha", id).unwrap().unwrap()["contentRef"],
            original["contentRef"]
        );
        assert_eq!(get(&conn, "alpha", id).unwrap().unwrap()["key"], "one");
        assert_eq!(ref_count(&conn, &original), 1);
        assert_eq!(
            conn.query_row(
                "SELECT to_id,sort_index FROM plugin_links WHERE id='link'",
                [],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            )
            .unwrap(),
            ("999".into(), 4)
        );
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM content_pending_releases WHERE content_id=?1",
                [content_id(&original)],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
        assert!(restore_operation(&mut conn, "alpha", operation).is_err());
    }

    #[test]
    fn restore_rejects_reused_key_id_and_link_without_partial_retains() {
        for collision in ["key", "id", "link"] {
            let mut conn = database();
            let original = create_entity(&mut conn, "alpha", "one", json!({}));
            let id = identifier(&original["id"]).unwrap();
            conn.execute("INSERT INTO plugin_links(id,plugin_id,from_id,to_kind,to_id,to_created_at,role,sort_index,data,create_time) VALUES('link','alpha',?1,'card','999',1,'',0,'{}',1)",[id]).unwrap();
            let operation = remove(&mut conn, "alpha", &original);
            let other = create_entity(
                &mut conn,
                "alpha",
                if collision == "key" { "one" } else { "two" },
                json!({}),
            );
            if collision == "id" {
                conn.execute(
                    "UPDATE plugin_entities SET id=?1 WHERE id=?2",
                    params![id, identifier(&other["id"]).unwrap()],
                )
                .unwrap();
            }
            if collision == "link" {
                conn.execute("INSERT INTO plugin_links(id,plugin_id,from_id,to_kind,to_id,to_created_at,role,sort_index,data,create_time) VALUES('link','alpha',?1,'card','998',1,'',0,'{}',1)",[identifier(&other["id"]).unwrap()]).unwrap();
            }
            assert!(restore_operation(&mut conn, "alpha", operation).is_err());
            assert_eq!(ref_count(&conn, &original), 0);
            assert!(conn
                .query_row(
                    "SELECT restored_time IS NULL FROM plugin_operations WHERE id=?1",
                    [operation],
                    |row| row.get::<_, bool>(0)
                )
                .unwrap());
            assert_eq!(
                conn.query_row("SELECT COUNT(*) FROM plugin_entities", [], |row| row
                    .get::<_, i64>(0))
                    .unwrap(),
                1
            );
        }
    }

    #[test]
    fn retention_and_replaced_body_prevent_restore() {
        for replaced in [false, true] {
            let mut conn = database();
            let original = create_entity(&mut conn, "alpha", "one", json!({}));
            let operation = remove(&mut conn, "alpha", &original);
            if replaced {
                conn.execute(
                    "UPDATE contents SET create_time=create_time+1 WHERE id=?1",
                    [content_id(&original)],
                )
                .unwrap();
            } else {
                conn.execute(
                    "UPDATE plugin_operations SET create_time=?1 WHERE id=?2",
                    params![common::now_millis() - RETENTION - 1, operation],
                )
                .unwrap();
            }
            assert!(restore_operation(&mut conn, "alpha", operation).is_err());
            assert!(get(&conn, "alpha", identifier(&original["id"]).unwrap())
                .unwrap()
                .is_none());
        }
    }

    #[test]
    fn sharing_retains_only_owned_live_body_and_survives_entity_delete() {
        let mut conn = database();
        let original = create_entity(&mut conn, "alpha", "one", json!({}));
        let reference = original["contentRef"].as_str().unwrap();
        {
            let tx = conn.transaction().unwrap();
            assert!(share_content(&tx, "beta", reference).is_err());
            assert!(share_content(&tx, "alpha", &format!("{}:0", content_id(&original))).is_err());
            let content = share_content(&tx, "alpha", reference).unwrap();
            tx.execute(
                "INSERT INTO cards(id,content_id,create_time,update_time) VALUES(10,?1,1,1)",
                [content],
            )
            .unwrap();
            tx.commit().unwrap();
        }
        assert_eq!(ref_count(&conn, &original), 2);
        remove(&mut conn, "alpha", &original);
        assert_eq!(ref_count(&conn, &original), 1);
        let tx = conn.transaction().unwrap();
        assert!(share_content(&tx, "alpha", reference).is_err());
        assert_eq!(
            tx.query_row(
                "SELECT COUNT(*) FROM content_pending_releases WHERE content_id=?1",
                [content_id(&original)],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
    }

    #[test]
    fn orphaned_data_is_only_adopted_explicitly_and_appearance_is_persistent() {
        let mut conn = database();
        let entity = create_entity(&mut conn, "alpha", "one", json!({}));
        create_entity(&mut conn, "beta", "one", json!({}));
        conn.execute("UPDATE plugin_entities SET orphaned_time=1", [])
            .unwrap();
        conn.execute("INSERT INTO plugin_records(id,plugin_id,collection,data,create_time,update_time,orphaned_time) VALUES('record','alpha','settings','{}',1,1,1)",[]).unwrap();
        read(
            &conn,
            "alpha",
            &json!({"method":"entity.get","id":entity["id"]}),
            "scope",
        )
        .unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM plugin_entities WHERE orphaned_time IS NOT NULL",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            2
        );
        {
            let tx = conn.transaction().unwrap();
            assert!(share_content(&tx, "alpha", entity["contentRef"].as_str().unwrap()).is_err());
            adopt(&tx, "alpha").unwrap();
            tx.commit().unwrap();
        }
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM plugin_entities WHERE orphaned_time IS NOT NULL",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
        assert!(conn
            .query_row(
                "SELECT orphaned_time IS NULL FROM plugin_records WHERE id='record'",
                [],
                |row| row.get::<_, bool>(0)
            )
            .unwrap());
        let declaration = json!({"method":"entity.registerKind","definition":{"kind":"note","label":"笔记","icon":"<svg></svg>"}});
        assert_eq!(
            execute(&mut conn, "alpha", declaration.clone()).unwrap(),
            true
        );
        assert_eq!(execute(&mut conn, "alpha", declaration).unwrap(), false);
        remove(&mut conn, "alpha", &entity);
        assert_eq!(
            conn.query_row(
                "SELECT label FROM plugin_entity_kinds WHERE plugin_id='alpha' AND kind='note'",
                [],
                |row| row.get::<_, String>(0)
            )
            .unwrap(),
            "笔记"
        );
    }

    #[test]
    fn backlinks_use_shared_index_and_preserve_omitted_source_classification() {
        let mut conn = database();
        let entity = create_entity(&mut conn, "alpha", "one", json!({}));
        let id = identifier(&entity["id"]).unwrap();
        let tx = conn.transaction().unwrap();
        let card_content =
            common::insert_content_record(&tx, &json!([]), Some(&json!({})), 0, 1).unwrap();
        let diary_content =
            common::insert_content_record(&tx, &json!([]), Some(&json!({})), 0, 1).unwrap();
        tx.execute(
            "INSERT INTO cards(id,content_id,create_time,update_time) VALUES(100,?1,1,1)",
            [card_content],
        )
        .unwrap();
        tx.execute("INSERT INTO diary_entries(id,type,date,create_time,update_time) VALUES(100,'daily','2026-10-28',1,1)",[]).unwrap();
        tx.execute("INSERT INTO diary_segments(id,diary_id,content_id,create_time,update_time) VALUES(101,100,?1,1,1)",[diary_content]).unwrap();
        tx.commit().unwrap();
        let index = Connection::open_in_memory().unwrap();
        index.execute_batch("CREATE TABLE entity_refs(src_content_id INTEGER,dst_kind TEXT,dst_id INTEGER,dst_content_id INTEGER,snippet_before TEXT,snippet_label TEXT,snippet_after TEXT);").unwrap();
        for source in [card_content, diary_content] {
            index
                .execute(
                    "INSERT INTO entity_refs VALUES(?1,'plugin-entity',?2,NULL,'前','引用','后')",
                    params![source, id],
                )
                .unwrap();
        }
        let sources = backlinks(&conn, &index, "alpha", id).unwrap();
        assert_eq!(sources.as_array().unwrap().len(), 2);
        assert!(sources
            .as_array()
            .unwrap()
            .iter()
            .any(|source| source["entity"] == "card" && source["id"] == "100"));
        assert!(sources
            .as_array()
            .unwrap()
            .iter()
            .any(|source| source["entity"].is_null()));
        assert!(backlinks(&conn, &index, "beta", id).is_err());
    }

    #[test]
    fn damaged_meta_is_not_silently_replaced_by_title_updates() {
        let mut conn = database();
        let entity = create_entity(&mut conn, "alpha", "one", json!({}));
        for raw in ["{broken", "[]"] {
            conn.execute(
                "UPDATE plugin_entities SET meta=?1 WHERE id=?2",
                params![raw, identifier(&entity["id"]).unwrap()],
            )
            .unwrap();
            assert!(get(&conn, "alpha", identifier(&entity["id"]).unwrap()).is_err());
            assert!(execute(
                &mut conn,
                "alpha",
                json!({"method":"entity.update","id":entity["id"],"patch":{"title":"不能覆盖"}})
            )
            .is_err());
            assert_eq!(
                conn.query_row(
                    "SELECT meta FROM plugin_entities WHERE id=?1",
                    [identifier(&entity["id"]).unwrap()],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
                raw
            );
        }
    }

    #[test]
    fn adoption_emits_created_only_for_reclaimed_rows_and_rolls_back_with_events() {
        let mut conn = database();
        create_entity(&mut conn, "alpha", "orphan", json!({}));
        create_entity(&mut conn, "beta", "other", json!({}));
        conn.execute("UPDATE plugin_entities SET orphaned_time=1", [])
            .unwrap();
        create_entity(&mut conn, "alpha", "active", json!({}));
        conn.execute("INSERT INTO plugin_records(id,plugin_id,collection,data,create_time,update_time,orphaned_time) VALUES('reclaimed','alpha','state','{}',1,1,1),('active','alpha','state','{}',1,1,NULL)",[]).unwrap();
        let before = super::super::plugin_data::last_operation(&conn).unwrap();
        conn.execute_batch("CREATE TRIGGER reject_adoption_event BEFORE INSERT ON operation WHEN NEW.operation_content_type='plugin-event' AND json_extract(NEW.operation_action,'$.domain')='record' BEGIN SELECT RAISE(ABORT,'模拟事件写入失败'); END;").unwrap();
        {
            let tx = conn.transaction().unwrap();
            assert!(adopt(&tx, "alpha").is_err());
        }
        assert_eq!(
            super::super::plugin_data::last_operation(&conn).unwrap(),
            before
        );
        assert_eq!(conn.query_row("SELECT COUNT(*) FROM plugin_entities WHERE plugin_id='alpha' AND orphaned_time IS NOT NULL",[],|row|row.get::<_,i64>(0)).unwrap(),1);
        conn.execute_batch("DROP TRIGGER reject_adoption_event")
            .unwrap();
        {
            let tx = conn.transaction().unwrap();
            adopt(&tx, "alpha").unwrap();
            adopt(&tx, "alpha").unwrap();
            tx.commit().unwrap();
        }
        let mut stmt=conn.prepare("SELECT operation_action FROM operation WHERE id>?1 AND operation_content_type='plugin-event' ORDER BY id").unwrap();
        let events = stmt
            .query_map([before], |row| row.get::<_, String>(0))
            .unwrap()
            .map(|value| serde_json::from_str::<Value>(&value.unwrap()).unwrap())
            .collect::<Vec<_>>();
        assert_eq!(events.len(), 2);
        assert!(events
            .iter()
            .all(|event| event["action"] == "created" && event["pluginId"] == "alpha"));
        assert!(events.iter().any(|event| event["domain"] == "entity"));
        assert!(events
            .iter()
            .any(|event| event["domain"] == "record" && event["id"] == "reclaimed"));
        assert_eq!(conn.query_row("SELECT COUNT(*) FROM plugin_entities WHERE plugin_id='beta' AND orphaned_time IS NOT NULL",[],|row|row.get::<_,i64>(0)).unwrap(),1);
    }
}
