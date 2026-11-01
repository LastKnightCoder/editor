use super::{common, plugin_data, schema};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use tauri::{AppHandle, WebviewWindow};

const ITEM_LIMIT: usize = 20_000;

fn text(value: &Value, field: &str, limit: usize, required: bool) -> Result<String, String> {
    let result = match value {
        Value::Null if !required => "",
        Value::String(value) => value,
        _ => return Err(format!("摘录字段 {field} 必须是字符串")),
    };
    if result.encode_utf16().count() > limit || (required && result.trim().is_empty()) {
        return Err(format!("摘录字段 {field} 为空或超过长度限制"));
    }
    Ok(result.to_string())
}

fn http_url(value: &Value) -> Result<Option<String>, String> {
    if value.is_null() || value.as_str() == Some("") {
        return Ok(None);
    }
    let raw = text(value, "url", 4000, false)?;
    let parsed = url::Url::parse(&raw).map_err(|_| "摘录外链必须是 http(s) 地址")?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("摘录外链必须是 http(s) 地址".into());
    }
    Ok(Some(raw))
}

struct Source {
    key: String,
    title: String,
    url: Option<String>,
}

fn source(value: &Value) -> Result<Source, String> {
    if !value.is_object() {
        return Err("摘录来源必须是对象".into());
    }
    Ok(Source {
        key: text(&value["key"], "source.key", 512, true)?,
        title: text(&value["title"], "source.title", 500, false)?,
        url: http_url(&value["url"])?,
    })
}

fn item(value: &Value, source: &Source) -> Result<Value, String> {
    if !value.is_object() {
        return Err("摘录条目必须是对象".into());
    }
    let anchor = &value["anchor"];
    if !anchor.is_null()
        && (!anchor.is_object() || anchor.to_string().encode_utf16().count() > 8000)
    {
        return Err("摘录定位必须是对象且不超过 8000 字".into());
    }
    let time = if value["time"].is_null() {
        None
    } else {
        let time = value["time"]
            .as_f64()
            .filter(|time| time.is_finite() && time.abs() <= 9_007_199_254_740_991.0)
            .ok_or("摘录时间必须是安全的有限数字")?;
        Some(time.trunc() as i64)
    };
    let color = if value["color"].is_null() {
        None
    } else {
        Some(text(&value["color"], "color", 50, false)?)
    };
    Ok(json!({
        "externalId":text(&value["externalId"],"externalId",512,true)?,
        "quote":text(&value["quote"],"quote",20_000,true)?.trim(),
        "note":text(&value["note"],"note",20_000,false)?.trim(),
        "location":text(&value["location"],"location",500,false)?.trim(),
        "url":http_url(&value["url"])?.or_else(||source.url.clone()),
        "anchor":anchor,"color":color,"time":time,
    }))
}

fn items(value: &Value, source: &Source) -> Result<Vec<Value>, String> {
    let values = value
        .as_array()
        .filter(|values| values.len() <= ITEM_LIMIT)
        .ok_or("单次摘录必须是最多 20000 条的数组")?;
    let mut seen = HashSet::new();
    values
        .iter()
        .map(|value| {
            let parsed = item(value, source)?;
            if !seen.insert(parsed["externalId"].as_str().unwrap().to_string()) {
                return Err("摘录 externalId 重复".into());
            }
            Ok(parsed)
        })
        .collect()
}

fn entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let anchor: Option<String> = row.get("anchor")?;
    Ok(json!({
        "ref":{"kind":"excerpt","id":row.get::<_,i64>("id")?,"identity":json!(["excerpt",1,row.get::<_,String>("source_type")?,row.get::<_,String>("external_id")?]).to_string()},
        "externalId":row.get::<_,String>("external_id")?,
        "quote":row.get::<_,String>("quote")?,"note":row.get::<_,String>("note")?,
        "location":row.get::<_,String>("location")?,"url":row.get::<_,Option<String>>("url")?,
        "anchor":anchor.and_then(|raw|serde_json::from_str::<Value>(&raw).ok()).filter(Value::is_object),
        "color":row.get::<_,Option<String>>("color")?,"time":row.get::<_,Option<i64>>("source_time")?,
        "deleted":row.get::<_,i64>("is_deleted")? != 0,
    }))
}

fn sync(
    conn: &mut Connection,
    plugin: &str,
    request: &Value,
    replace: bool,
) -> Result<Value, String> {
    let source = source(&request["source"])?;
    let empty = json!([]);
    let upsert = if replace {
        items(&request["items"], &source)?
    } else {
        if !request["change"].is_object() {
            return Err("摘录增量必须是对象".into());
        }
        items(request["change"].get("upsert").unwrap_or(&empty), &source)?
    };
    let remove = if replace {
        vec![]
    } else {
        let values = request["change"]
            .get("remove")
            .unwrap_or(&empty)
            .as_array()
            .ok_or("remove 必须是数组")?;
        if values.len() + upsert.len() > ITEM_LIMIT {
            return Err("单次摘录操作超过 20000 条".into());
        }
        values
            .iter()
            .map(|value| text(value, "remove", 512, true))
            .collect::<Result<Vec<_>, _>>()?
    };
    let touched: HashSet<_> = upsert
        .iter()
        .map(|value| value["externalId"].as_str().unwrap())
        .collect();
    if remove.iter().any(|id| touched.contains(id.as_str())) {
        return Err("同一条摘录不能同时写入与删除".into());
    }
    let removed: HashSet<_> = remove.iter().map(String::as_str).collect();
    let tx = conn.transaction().map_err(plugin_data::sql_error)?;
    let existing = tx
        .prepare("SELECT * FROM excerpt WHERE source_type=?1 AND source_key=?2 ORDER BY id")
        .map_err(plugin_data::sql_error)?
        .query_map(params![plugin, source.key], |row| {
            Ok((
                row.get::<_, String>("external_id")?,
                row.get::<_, String>("source_title")?,
                entry(row)?,
            ))
        })
        .map_err(plugin_data::sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(plugin_data::sql_error)?;
    let by_external: HashMap<_, _> = existing.iter().map(|row| (row.0.as_str(), row)).collect();
    let (mut inserted, mut updated, mut deleted) = (0, 0, 0);
    let now = common::now_millis();
    for value in &upsert {
        let external = value["externalId"].as_str().unwrap();
        if let Some((_, title, old)) = by_external.get(external) {
            let mut normalized = old.clone();
            normalized.as_object_mut().unwrap().remove("ref");
            normalized.as_object_mut().unwrap().remove("deleted");
            if old["deleted"] == false && title == &source.title && normalized == *value {
                continue;
            }
            updated += 1;
        } else {
            inserted += 1;
        }
        let anchor = (!value["anchor"].is_null()).then(|| value["anchor"].to_string());
        tx.execute("INSERT INTO excerpt(source_type,source_key,source_title,external_id,quote,note,location,url,anchor,color,source_time,create_time,update_time,is_deleted) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12,0) ON CONFLICT(source_type,external_id) DO UPDATE SET source_key=excluded.source_key,source_title=excluded.source_title,quote=excluded.quote,note=excluded.note,location=excluded.location,url=excluded.url,anchor=excluded.anchor,color=excluded.color,source_time=excluded.source_time,update_time=excluded.update_time,is_deleted=0",
            params![plugin,source.key,source.title,external,value["quote"].as_str(),value["note"].as_str(),value["location"].as_str(),value["url"].as_str(),anchor,value["color"].as_str(),value["time"].as_i64(),now]).map_err(plugin_data::sql_error)?;
    }
    for (external, title, row) in &existing {
        if touched.contains(external.as_str()) {
            continue;
        }
        let id = row["ref"]["id"].as_i64().unwrap();
        let should_delete =
            (replace || removed.contains(external.as_str())) && row["deleted"] == false;
        if should_delete {
            tx.execute(
                "UPDATE excerpt SET is_deleted=1,update_time=?1 WHERE id=?2",
                params![now, id],
            )
            .map_err(plugin_data::sql_error)?;
            deleted += 1;
        }
        if !replace && title != &source.title {
            tx.execute(
                "UPDATE excerpt SET source_title=?1,update_time=?2 WHERE id=?3",
                params![source.title, now, id],
            )
            .map_err(plugin_data::sql_error)?;
            if !should_delete && row["deleted"] == false {
                updated += 1;
            }
        }
    }
    tx.commit().map_err(plugin_data::sql_error)?;
    Ok(json!({"inserted":inserted,"updated":updated,"deleted":deleted}))
}

fn excerpt_id(value: &Value) -> Result<i64, String> {
    if value["kind"] != "excerpt" {
        return Err("移动端目前仅提供摘录材料动作".into());
    }
    value["id"]
        .as_i64()
        .filter(|id| *id > 0 && *id <= 9_007_199_254_740_991)
        .ok_or_else(|| "摘录编号无效".into())
}

fn resolve_ref(conn: &Connection, plugin: &str, value: &Value) -> Result<i64, String> {
    excerpt_id(value)?;
    let raw = value["identity"]
        .as_str()
        .filter(|raw| raw.encode_utf16().count() <= 4096)
        .ok_or("材料引用缺少有效身份，请重新读取")?;
    let identity: Value = serde_json::from_str(raw).map_err(|_| "材料引用身份无效")?;
    if identity.as_array().is_none_or(|parts| parts.len() != 4)
        || identity[0] != "excerpt"
        || identity[1] != 1
        || identity[2] != plugin
    {
        return Err("材料引用身份无效或不属于当前提供方".into());
    }
    let external = text(&identity[3], "externalId", 512, true)?;
    conn.query_row(
        "SELECT id FROM excerpt WHERE source_type=?1 AND external_id=?2",
        params![plugin, external],
        |row| row.get(0),
    )
    .optional()
    .map_err(plugin_data::sql_error)?
    .ok_or_else(|| "摘录身份已失效，请重新读取".into())
}

fn material(conn: &Connection, id: i64, plugin: Option<&str>) -> Result<Value, String> {
    let row = conn.query_row("SELECT e.*,COALESCE(p.label,e.source_type) AS provider_label FROM excerpt e LEFT JOIN excerpt_provider p ON p.source_type=e.source_type WHERE e.id=?1 AND (?2 IS NULL OR e.source_type=?2)",params![id,plugin],|row| {
        let value = entry(row)?;
        Ok(json!({"entry":value,"sourceType":row.get::<_,String>("source_type")?,"sourceKey":row.get::<_,String>("source_key")?,"title":row.get::<_,String>("source_title")?,"label":row.get::<_,String>("provider_label")?,"createdAt":row.get::<_,i64>("create_time")?,"updatedAt":row.get::<_,i64>("update_time")?}))
    }).optional().map_err(plugin_data::sql_error)?;
    row.ok_or_else(|| "摘录不存在或不属于当前提供方".into())
}

fn dispatch(conn: &mut Connection, plugin: &str, request: &Value) -> Result<Value, String> {
    match request["method"].as_str() {
        Some("register") => {
            let label = text(&request["label"], "label", 100, true)?
                .trim()
                .to_string();
            conn.execute("INSERT INTO excerpt_provider(source_type,label,update_time) VALUES(?1,?2,?3) ON CONFLICT(source_type) DO UPDATE SET label=excluded.label,update_time=excluded.update_time WHERE excerpt_provider.label!=excluded.label",params![plugin,label,common::now_millis()]).map_err(plugin_data::sql_error)?;
            Ok(Value::Null)
        }
        Some("replace") => sync(conn, plugin, request, true),
        Some("patch") => sync(conn, plugin, request, false),
        Some("sources") => {
            let values = conn.prepare("SELECT e.source_key,(SELECT source_title FROM excerpt t WHERE t.source_type=e.source_type AND t.source_key=e.source_key ORDER BY is_deleted,update_time DESC,id DESC LIMIT 1),SUM(CASE WHEN e.is_deleted=0 THEN 1 ELSE 0 END) FROM excerpt e WHERE e.source_type=?1 GROUP BY e.source_key ORDER BY e.source_key").map_err(plugin_data::sql_error)?
                .query_map([plugin],|row|Ok(json!({"key":row.get::<_,String>(0)?,"title":row.get::<_,String>(1)?,"count":row.get::<_,i64>(2)?}))).map_err(plugin_data::sql_error)?.collect::<Result<Vec<_>,_>>().map_err(plugin_data::sql_error)?;
            Ok(json!(values))
        }
        Some("items") => {
            let key = text(&request["sourceKey"], "sourceKey", 512, true)?;
            let values = conn
                .prepare("SELECT * FROM excerpt WHERE source_type=?1 AND source_key=?2 ORDER BY id")
                .map_err(plugin_data::sql_error)?
                .query_map(params![plugin, key], entry)
                .map_err(plugin_data::sql_error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(plugin_data::sql_error)?;
            Ok(json!(values))
        }
        Some("material") => material(
            conn,
            resolve_ref(conn, plugin, &request["ref"])?,
            Some(plugin),
        ),
        _ => Err("未知摘录操作".into()),
    }
}

#[tauri::command]
pub fn plugin_excerpts(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    plugin_id: String,
    request: Value,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::provider_settings::validate_plugin_id(&plugin_id)?;
    if plugin_id == "web"
        || plugin_id.len() > 128
        || !plugin_id.as_bytes()[0].is_ascii_alphanumeric()
    {
        return Err("摘录来源类型无效或为内置保留名".into());
    }
    crate::plugin_transport::with_database(&token, &database, || {
        let mut conn = schema::open_database_by_name(&app, &database)?;
        dispatch(&mut conn, &plugin_id, &request)
    })
}

#[tauri::command]
pub fn excerpt_open_target(
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    database: String,
    id: i64,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::plugin_transport::with_database(&token, &database, || {
        let conn = schema::open_database_by_name(&app, &database)?;
        let target = material(&conn, id, None)?;
        if target["entry"]["deleted"] == true {
            return Err("原划线已删除".into());
        }
        Ok(target)
    })
}

fn create_card(conn: &mut Connection, plugin: &str, request: &Value) -> Result<Value, String> {
    let tx = conn.transaction().map_err(plugin_data::sql_error)?;
    let id = resolve_ref(&tx, plugin, &request["ref"])?;
    let current = material(&tx, id, Some(plugin))?;
    if current != request["expected"] {
        return Err("摘录已变化，请重新获取材料动作".into());
    }
    let content = &request["content"];
    let count = content["count"]
        .as_i64()
        .filter(|count| *count >= 0)
        .ok_or("正文统计无效")?;
    let now = common::now_millis();
    let content_id = common::insert_content_record(
        &tx,
        &content["nodes"],
        content.get("contracts"),
        count,
        now,
    )?;
    tx.execute(
        "INSERT INTO cards(create_time,update_time,tags,content_id,is_top) VALUES(?1,?1,'[]',?2,0)",
        params![now, content_id],
    )
    .map_err(plugin_data::sql_error)?;
    let card_id = tx.last_insert_rowid();
    tx.execute("INSERT INTO entity_lineage(src_kind,src_id,dst_kind,dst_id,relation,create_time) VALUES('excerpt',?1,'card',?2,'excerpt_of',?3)",params![id.to_string(),card_id.to_string(),now]).map_err(plugin_data::sql_error)?;
    common::write_operation(&tx, "card", "insert", card_id, now)?;
    tx.commit().map_err(plugin_data::sql_error)?;
    Ok(json!({"id":card_id,"contentId":content_id}))
}

#[tauri::command]
pub fn plugin_material_card(
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
        let mut conn = schema::open_database_by_name(&app, &database)?;
        create_card(&mut conn, &plugin_id, &request)
    })?;
    super::reconcile::trigger_reconcile(&app, &database);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&conn).unwrap();
        conn
    }
    fn replace(conn: &mut Connection, values: Value) -> Value {
        dispatch(conn,"weread",&json!({"method":"replace","source":{"key":"book","title":"书","url":"https://example.com/book"},"items":values})).unwrap()
    }
    fn list(conn: &mut Connection) -> Value {
        dispatch(
            conn,
            "weread",
            &json!({"method":"items","sourceKey":"book"}),
        )
        .unwrap()
    }
    fn count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .unwrap()
    }
    fn content() -> Value {
        let contract = json!({"format":2,"domain":"editor-node","owner":"tau.editor","type":"paragraph","dataVersion":1,"kind":"block","isVoid":false,"textFields":[],"structuredFields":[],"resources":[]});
        let hash = format!("{:x}", Sha256::digest(contract.to_string().as_bytes()));
        json!({"nodes":[{"type":"paragraph","tauContract":hash,"children":[{"text":"原文"}]}],"contracts":{hash:contract},"count":2})
    }

    #[test]
    fn snapshot_and_patch_keep_identity_soft_delete_restore_and_provider_scope() {
        let mut conn = database();
        dispatch(
            &mut conn,
            "weread",
            &json!({"method":"register","label":"微信读书"}),
        )
        .unwrap();
        let first = json!([{"externalId":"one","quote":" 原文 ","anchor":{"b":2,"a":1}},{"externalId":"two","quote":"第二条"}]);
        assert_eq!(
            replace(&mut conn, first.clone()),
            json!({"inserted":2,"updated":0,"deleted":0})
        );
        let before = list(&mut conn);
        assert_eq!(
            replace(&mut conn, first),
            json!({"inserted":0,"updated":0,"deleted":0})
        );
        assert_eq!(before[0]["url"], "https://example.com/book");
        let result = dispatch(&mut conn,"weread",&json!({"method":"patch","source":{"key":"book","title":"改名"},"change":{"upsert":[{"externalId":"one","quote":"原文","note":"想法"}],"remove":["two"]}})).unwrap();
        assert_eq!(result, json!({"inserted":0,"updated":1,"deleted":1}));
        let changed = list(&mut conn);
        assert_eq!(changed[0]["ref"], before[0]["ref"]);
        assert_eq!(changed[1]["deleted"], true);
        assert_eq!(
            replace(&mut conn, json!([])),
            json!({"inserted":0,"updated":0,"deleted":1})
        );
        replace(&mut conn, json!([{"externalId":"one","quote":"恢复"}]));
        assert_eq!(list(&mut conn)[0]["ref"], before[0]["ref"]);
        assert_eq!(list(&mut conn)[0]["deleted"], false);
        assert_eq!(
            dispatch(
                &mut conn,
                "other",
                &json!({"method":"items","sourceKey":"book"})
            )
            .unwrap(),
            json!([])
        );
        assert_eq!(
            dispatch(&mut conn, "weread", &json!({"method":"sources"})).unwrap(),
            json!([{"key":"book","title":"书","count":1}])
        );
    }

    #[test]
    fn invalid_batch_never_partially_writes_or_deletes_existing_items() {
        let mut conn = database();
        replace(&mut conn, json!([{"externalId":"saved","quote":"保留"}]));
        let before = list(&mut conn);
        for values in [
            json!([{"externalId":"new","quote":"新"},{"externalId":"bad","quote":"","url":"file:///private"}]),
            json!([{"externalId":"dup","quote":"甲"},{"externalId":"dup","quote":"乙"}]),
        ] {
            assert!(dispatch(
                &mut conn,
                "weread",
                &json!({"method":"replace","source":{"key":"book"},"items":values})
            )
            .is_err());
        }
        assert_eq!(list(&mut conn), before);
        assert_eq!(count(&conn, "excerpt"), 1);
    }

    #[test]
    fn card_content_and_lineage_commit_together_and_rollback_together() {
        let mut conn = database();
        replace(&mut conn, json!([{"externalId":"one","quote":"原文"}]));
        let reference = list(&mut conn)[0]["ref"].clone();
        let expected = material(&conn, reference["id"].as_i64().unwrap(), Some("weread")).unwrap();
        let request = json!({"ref":reference,"expected":expected,"content":content()});
        conn.execute_batch("CREATE TRIGGER reject_lineage BEFORE INSERT ON entity_lineage BEGIN SELECT RAISE(ABORT,'模拟谱系失败'); END;").unwrap();
        assert!(create_card(&mut conn, "weread", &request)
            .unwrap_err()
            .contains("模拟谱系失败"));
        for table in [
            "cards",
            "contents",
            "content_documents",
            "entity_lineage",
            "operation",
        ] {
            assert_eq!(count(&conn, table), 0);
        }
        conn.execute_batch("DROP TRIGGER reject_lineage").unwrap();
        let card = create_card(&mut conn, "weread", &request).unwrap();
        assert_eq!(count(&conn, "cards"), 1);
        assert_eq!(count(&conn, "contents"), 1);
        let lineage: (String, String, String) = conn
            .query_row(
                "SELECT src_id,dst_id,relation FROM entity_lineage",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(
            lineage,
            (
                reference["id"].to_string(),
                card["id"].to_string(),
                "excerpt_of".into()
            )
        );
        assert!(create_card(&mut conn, "other", &request).is_err());
        replace(&mut conn, json!([{"externalId":"one","quote":"原文已变"}]));
        assert!(create_card(&mut conn, "weread", &request)
            .unwrap_err()
            .contains("已变化"));
        assert_eq!(count(&conn, "cards"), 1);
    }

    #[test]
    fn stable_ref_resolves_canonical_identity_before_action_and_commit() {
        let mut conn = database();
        replace(&mut conn, json!([{"externalId":"one","quote":"原文"}]));
        let reference = list(&mut conn)[0]["ref"].clone();
        let old_id = reference["id"].as_i64().unwrap();
        let canonical = old_id + 10;
        conn.execute(
            "UPDATE excerpt SET id=?1 WHERE id=?2",
            params![canonical, old_id],
        )
        .unwrap();
        conn.execute("INSERT INTO excerpt(id,source_type,source_key,external_id,quote,create_time,update_time) VALUES(?1,'weread','other','other','另一条',2,2)",[old_id]).unwrap();
        let current = dispatch(
            &mut conn,
            "weread",
            &json!({"method":"material","ref":reference}),
        )
        .unwrap();
        assert_eq!(current["entry"]["externalId"], "one");
        assert_eq!(current["entry"]["ref"]["id"], canonical);
        create_card(
            &mut conn,
            "weread",
            &json!({"ref":reference,"expected":current,"content":content()}),
        )
        .unwrap();
        assert_eq!(
            conn.query_row("SELECT src_id FROM entity_lineage", [], |row| row
                .get::<_, String>(0))
                .unwrap(),
            canonical.to_string()
        );
        assert!(dispatch(
            &mut conn,
            "weread",
            &json!({"method":"material","ref":{"kind":"excerpt","id":old_id}})
        )
        .is_err());
        assert!(dispatch(
            &mut conn,
            "other",
            &json!({"method":"material","ref":reference})
        )
        .is_err());
    }

    #[test]
    fn material_identity_matches_shared_host_fixture() {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../../../../packages/db-schema/fixtures/material-ref-v1.json"
        ))
        .unwrap();
        let mut conn = database();
        conn.execute("INSERT INTO excerpt(id,source_type,source_key,external_id,quote,create_time,update_time) VALUES(7,'reader.plugin','book','book:mark','原文',1,1)",[]).unwrap();
        let rows = dispatch(
            &mut conn,
            "reader.plugin",
            &json!({"method":"items","sourceKey":"book"}),
        )
        .unwrap();
        assert_eq!(rows[0]["ref"], fixture);
        assert_eq!(resolve_ref(&conn, "reader.plugin", &fixture).unwrap(), 7);
    }
}
