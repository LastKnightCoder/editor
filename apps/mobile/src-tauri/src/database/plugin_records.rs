use super::common::now_millis;
use super::plugin_own_query::{
    read_indexes, run_page, serialize_object, where_clause, PageQuery, QuerySource, SqlFragment,
};
use rusqlite::{
    params, params_from_iter, types::Type, Connection, OptionalExtension, Row, Transaction,
};
use serde_json::{json, Value};

const COLUMNS: &str = "r.id,r.collection,r.data,r.create_time,r.update_time";
const FROM: &str = "plugin_records r";
const SOURCE: QuerySource<'static> = QuerySource {
    json: "r.data",
    id: "r.id",
    builtins: &[
        ("createdAt", "r.create_time"),
        ("updatedAt", "r.update_time"),
    ],
};

fn collection(request: &Value) -> Result<&str, String> {
    let name = request["collection"].as_str().ok_or("集合名无效")?;
    if name.is_empty()
        || name.len() > 128
        || !name.as_bytes()[0].is_ascii_alphanumeric()
        || !name
            .bytes()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, b'.' | b'_' | b'-'))
    {
        return Err("集合名必须为 1 至 128 位字母、数字、点、横线或下划线".into());
    }
    Ok(name)
}

fn id(request: &Value) -> Result<&str, String> {
    let id = request["id"].as_str().ok_or("记录 ID 无效")?;
    if id.is_empty()
        || id.len() > 64
        || !id
            .bytes()
            .all(|value| value.is_ascii_alphanumeric() || value == b'-')
    {
        return Err("记录 ID 无效".into());
    }
    Ok(id)
}

fn revision(current: &Value, request: &Value) -> Result<(), String> {
    let Some(expected) = request.get("expectedRevision") else {
        return Ok(());
    };
    let expected = expected
        .as_str()
        .filter(|value| !value.is_empty() && value.len() <= 256)
        .ok_or("版本参数无效")?;
    if current["revision"].as_str() != Some(expected) {
        return Err("PLUGIN_CONFLICT: 记录已变化，请重新读取".into());
    }
    Ok(())
}

fn record(row: &Row<'_>) -> rusqlite::Result<Value> {
    let raw: String = row.get(2)?;
    let data: Value = serde_json::from_str(&raw).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(2, Type::Text, Box::new(error))
    })?;
    if !data.is_object() {
        return Err(rusqlite::Error::FromSqlConversionFailure(
            2,
            Type::Text,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "记录数据不是对象",
            )),
        ));
    }
    let updated: i64 = row.get(4)?;
    Ok(json!({
        "id":row.get::<_,String>(0)?,
        "collection":row.get::<_,String>(1)?,
        "data":data,
        "createdAt":row.get::<_,i64>(3)?,
        "updatedAt":updated,
        "revision":updated.to_string()
    }))
}

fn get(
    conn: &Connection,
    plugin: &str,
    collection: &str,
    id: &str,
) -> Result<Option<Value>, String> {
    conn.query_row(
        &format!(
            "SELECT {COLUMNS} FROM {FROM} WHERE r.plugin_id=?1 AND r.collection=?2 AND r.id=?3"
        ),
        params![plugin, collection, id],
        record,
    )
    .optional()
    .map_err(|error| error.to_string())
}

fn filters(plugin: &str, collection: &str, conditions: &Value) -> Result<Vec<SqlFragment>, String> {
    Ok(vec![
        SqlFragment {
            sql: "r.plugin_id=? AND r.collection=?".into(),
            params: vec![plugin.to_owned().into(), collection.to_owned().into()],
        },
        where_clause(&SOURCE, conditions)?,
    ])
}

pub(super) fn read(
    conn: &Connection,
    plugin: &str,
    request: &Value,
    scope: &str,
) -> Result<Value, String> {
    crate::provider_settings::validate_plugin_id(plugin)?;
    let collection = collection(request)?;
    let empty = json!([]);
    match request["method"].as_str() {
        Some("record.get") => {
            Ok(get(conn, plugin, collection, id(request)?)?.unwrap_or(Value::Null))
        }
        Some("record.count") => {
            let filters = filters(plugin, collection, request.get("where").unwrap_or(&empty))?;
            let filters: Vec<_> = filters
                .into_iter()
                .filter(|filter| !filter.sql.is_empty())
                .collect();
            let conditions = filters
                .iter()
                .map(|filter| format!("({})", filter.sql))
                .collect::<Vec<_>>()
                .join(" AND ");
            let values: Vec<_> = filters
                .into_iter()
                .flat_map(|filter| filter.params)
                .collect();
            let count = conn
                .query_row(
                    &format!("SELECT COUNT(*) FROM {FROM} WHERE {conditions}"),
                    params_from_iter(values),
                    |row| row.get::<_, i64>(0),
                )
                .map_err(|error| error.to_string())?;
            Ok(json!(count))
        }
        Some("record.query") => {
            let query = request
                .get("query")
                .filter(|value| value.is_object())
                .ok_or("查询参数无效")?;
            if query.as_object().is_some_and(|object| {
                object
                    .keys()
                    .any(|field| !["where", "orderBy", "cursor", "limit"].contains(&field.as_str()))
            }) {
                return Err("查询参数包含未知字段".into());
            }
            let limit = match query.get("limit") {
                None => 50,
                Some(value) => value
                    .as_u64()
                    .filter(|value| (1..=200).contains(value))
                    .ok_or("limit 必须是 1–200 的整数")? as usize,
            };
            let cursor = match query.get("cursor") {
                None => None,
                Some(value) => Some(value.as_str().ok_or("分页游标必须为字符串")?),
            };
            let default_order = json!([{"builtin":"createdAt","direction":"asc"}]);
            let page = run_page(
                conn,
                &SOURCE,
                PageQuery {
                    columns: COLUMNS,
                    from: FROM,
                    filters: filters(plugin, collection, query.get("where").unwrap_or(&empty))?,
                    order: query.get("orderBy").unwrap_or(&default_order),
                    cursor,
                    limit,
                    scope: &json!([scope, plugin, collection]),
                },
                record,
            )?;
            let mut result = json!({"items":page.rows});
            if let Some(cursor) = page.cursor {
                result["cursor"] = json!(cursor);
            }
            Ok(result)
        }
        _ => Err("未知插件记录读取操作".into()),
    }
}

pub(super) fn write(tx: &Transaction<'_>, plugin: &str, request: &Value) -> Result<Value, String> {
    crate::provider_settings::validate_plugin_id(plugin)?;
    let collection = collection(request)?;
    let id = id(request)?;
    match request["method"].as_str() {
        Some("record.insert") => {
            let indexes = read_indexes(request.get("indexes"), &["createdAt", "updatedAt"])?;
            let data = serialize_object(&request["data"], &indexes, 64 * 1024)?;
            let exists: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM plugin_records WHERE id=?1)",
                    [id],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            if exists {
                return Err("PLUGIN_CONFLICT: 记录 ID 已存在".into());
            }
            let now = now_millis();
            tx.execute("INSERT INTO plugin_records(id,plugin_id,collection,data,create_time,update_time) VALUES(?1,?2,?3,?4,?5,?5)", params![id,plugin,collection,data,now]).map_err(|error| error.to_string())?;
            super::plugin_own_data::event(tx, plugin, "record", "created", id, collection)?;
            get(tx, plugin, collection, id)?.ok_or_else(|| "记录创建失败".into())
        }
        Some("record.update") => {
            let indexes = read_indexes(request.get("indexes"), &["createdAt", "updatedAt"])?;
            let data = serialize_object(&request["data"], &indexes, 64 * 1024)?;
            let current = get(tx, plugin, collection, id)?.ok_or("记录不存在")?;
            revision(&current, request)?;
            let previous = current["updatedAt"].as_i64().ok_or("记录版本无效")?;
            let now = previous
                .checked_add(1)
                .ok_or("记录版本溢出")?
                .max(now_millis());
            tx.execute("UPDATE plugin_records SET data=?1,update_time=?2 WHERE id=?3 AND plugin_id=?4 AND collection=?5", params![data,now,id,plugin,collection]).map_err(|error| error.to_string())?;
            super::plugin_own_data::event(tx, plugin, "record", "updated", id, collection)?;
            get(tx, plugin, collection, id)?.ok_or_else(|| "记录更新失败".into())
        }
        Some("record.delete") => {
            let current = get(tx, plugin, collection, id)?.ok_or("记录不存在")?;
            revision(&current, request)?;
            tx.execute(
                "DELETE FROM plugin_records WHERE id=?1 AND plugin_id=?2 AND collection=?3",
                params![id, plugin, collection],
            )
            .map_err(|error| error.to_string())?;
            super::plugin_own_data::event(tx, plugin, "record", "deleted", id, collection)?;
            Ok(Value::Null)
        }
        _ => Err("未知插件记录写入操作".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&conn).unwrap();
        conn
    }

    fn insert(
        conn: &mut Connection,
        plugin: &str,
        collection: &str,
        id: &str,
        data: Value,
    ) -> Value {
        let tx = conn.transaction().unwrap();
        let result = write(
            &tx,
            plugin,
            &json!({"method":"record.insert","collection":collection,"id":id,"data":data}),
        )
        .unwrap();
        tx.commit().unwrap();
        result
    }

    fn query(
        conn: &Connection,
        plugin: &str,
        collection: &str,
        query: Value,
        scope: &str,
    ) -> Result<Value, String> {
        read(
            conn,
            plugin,
            &json!({"method":"record.query","collection":collection,"query":query}),
            scope,
        )
    }

    fn count(conn: &Connection, where_: Value) -> Value {
        read(
            conn,
            "owner",
            &json!({"method":"record.count","collection":"items","where":where_}),
            "scope",
        )
        .unwrap()
    }

    #[test]
    fn ownership_collection_and_global_record_identity_are_enforced() {
        let mut db = database();
        let item = insert(&mut db, "owner", "items", "a", json!({"name":"记录"}));
        assert_eq!(item["collection"], "items");
        for (plugin, collection) in [("other", "items"), ("owner", "other")] {
            assert_eq!(
                read(
                    &db,
                    plugin,
                    &json!({"method":"record.get","collection":collection,"id":"a"}),
                    "scope"
                )
                .unwrap(),
                Value::Null
            );
            assert_eq!(
                query(&db, plugin, collection, json!({}), "scope").unwrap()["items"],
                json!([])
            );
            let tx = db.transaction().unwrap();
            assert!(write(
                &tx,
                plugin,
                &json!({"method":"record.update","collection":collection,"id":"a","data":{}})
            )
            .is_err());
            assert!(write(
                &tx,
                plugin,
                &json!({"method":"record.delete","collection":collection,"id":"a"})
            )
            .is_err());
        }
        let tx = db.transaction().unwrap();
        assert!(write(
            &tx,
            "other",
            &json!({"method":"record.insert","collection":"items","id":"a","data":{}})
        )
        .unwrap_err()
        .starts_with("PLUGIN_CONFLICT:"));
    }

    #[test]
    fn versions_are_monotonic_and_conflicts_do_not_write_events() {
        let mut db = database();
        let first = insert(&mut db, "owner", "items", "a", json!({"value":1}));
        let tx = db.transaction().unwrap();
        let second = write(&tx, "owner", &json!({"method":"record.update","collection":"items","id":"a","data":{"value":2},"expectedRevision":first["revision"]})).unwrap();
        assert!(second["updatedAt"].as_i64().unwrap() > first["updatedAt"].as_i64().unwrap());
        let before: i64 = tx
            .query_row("SELECT COUNT(*) FROM operation", [], |row| row.get(0))
            .unwrap();
        assert!(write(&tx, "owner", &json!({"method":"record.delete","collection":"items","id":"a","expectedRevision":first["revision"]})).unwrap_err().starts_with("PLUGIN_CONFLICT:"));
        assert_eq!(
            tx.query_row("SELECT COUNT(*) FROM operation", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            before
        );
        assert_eq!(
            get(&tx, "owner", "items", "a").unwrap().unwrap()["data"],
            json!({"value":2})
        );
        assert!(write(&tx, "owner", &json!({"method":"record.update","collection":"items","id":"a","data":{},"expectedRevision":null})).is_err());
        tx.commit().unwrap();
    }

    #[test]
    fn transaction_rollback_removes_records_and_owner_events() {
        let mut db = database();
        {
            let tx = db.transaction().unwrap();
            write(
                &tx,
                "owner",
                &json!({"method":"record.insert","collection":"items","id":"a","data":{}}),
            )
            .unwrap();
            assert!(write(
                &tx,
                "owner",
                &json!({"method":"record.insert","collection":"items","id":"a","data":{}})
            )
            .is_err());
        }
        assert_eq!(count(&db, json!([])), 0);
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM operation", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        let item = insert(&mut db, "owner", "items", "a", json!({}));
        let tx = db.transaction().unwrap();
        write(&tx,"owner",&json!({"method":"record.delete","collection":"items","id":"a","expectedRevision":item["revision"]})).unwrap();
        tx.commit().unwrap();
        let raw: String = db
            .query_row(
                "SELECT operation_action FROM operation ORDER BY id DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let event: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(
            event,
            json!({"domain":"record","action":"deleted","pluginId":"owner","id":"a","subtype":"items"})
        );
        assert_eq!(count(&db, json!([])), 0);
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM plugin_operations", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn typed_json_filters_preserve_null_missing_boolean_and_number_semantics() {
        let mut db = database();
        for (id, data) in [
            ("a", json!({})),
            ("b", json!({"rank":null})),
            ("c", json!({"rank":true})),
            ("d", json!({"rank":1})),
            ("e", json!({"rank":2})),
            ("f", json!({"rank":"1"})),
        ] {
            insert(&mut db, "owner", "items", id, data);
        }
        let filter = |kind: &str, op: &str, value: Value| json!([{"field":"rank","type":kind,"op":op,"value":value}]);
        assert_eq!(count(&db, filter("number", "eq", Value::Null)), 4);
        assert_eq!(count(&db, filter("number", "ne", json!(1))), 5);
        assert_eq!(count(&db, filter("number", "in", json!([null, 2]))), 5);
        assert_eq!(count(&db, filter("boolean", "eq", json!(true))), 1);
        assert_eq!(count(&db, filter("string", "eq", json!("1"))), 1);
        assert_eq!(count(&db, filter("number", "gt", json!(1))), 1);
    }

    #[test]
    fn keyset_pagination_has_stable_null_and_tie_ordering_in_both_directions() {
        let mut db = database();
        for (id, data) in [
            ("a", json!({})),
            ("b", json!({"rank":null})),
            ("c", json!({"rank":1})),
            ("d", json!({"rank":1})),
            ("e", json!({"rank":2})),
        ] {
            insert(&mut db, "owner", "items", id, data);
        }
        for (direction, expected) in [
            ("asc", vec!["a", "b", "c", "d", "e"]),
            ("desc", vec!["e", "d", "c", "b", "a"]),
        ] {
            let mut input = json!({"limit":2,"orderBy":[{"field":"rank","type":"number","direction":direction}]});
            let mut ids = vec![];
            loop {
                let page = query(&db, "owner", "items", input.clone(), "scope").unwrap();
                ids.extend(
                    page["items"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|item| item["id"].as_str().unwrap().to_owned()),
                );
                let Some(cursor) = page.get("cursor") else {
                    break;
                };
                input["cursor"] = cursor.clone();
            }
            assert_eq!(ids, expected);
        }
    }

    #[test]
    fn cursors_bind_workspace_plugin_collection_filter_and_order() {
        let mut db = database();
        for id in ["a", "b", "c"] {
            insert(&mut db, "owner", "items", id, json!({"rank":1}));
        }
        let page = query(
            &db,
            "owner",
            "items",
            json!({"limit":1}),
            "workspace-one/token-one",
        )
        .unwrap();
        let input = json!({"limit":1,"cursor":page["cursor"]});
        for (plugin, collection, scope) in [
            ("owner", "items", "workspace-two/token-two"),
            ("other", "items", "workspace-one/token-one"),
            ("owner", "other", "workspace-one/token-one"),
        ] {
            assert!(query(&db, plugin, collection, input.clone(), scope).is_err());
        }
        let mut changed = input.clone();
        changed["where"] = json!([{"field":"rank","type":"number","op":"eq","value":1}]);
        assert!(query(&db, "owner", "items", changed, "workspace-one/token-one").is_err());
        let mut changed = input.clone();
        changed["orderBy"] = json!([{"builtin":"createdAt","direction":"desc"}]);
        assert!(query(&db, "owner", "items", changed, "workspace-one/token-one").is_err());
        let continued = query(&db, "owner", "items", input, "workspace-one/token-one").unwrap();
        assert_eq!(continued["items"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn invalid_identifiers_indexes_json_sizes_and_query_shapes_are_rejected() {
        let mut db = database();
        for patch in [
            json!({"id":"bad_id"}),
            json!({"collection":"' OR 1=1"}),
            json!({"data":[]}),
            json!({"indexes":{"createdAt":"number"}}),
            json!({"indexes":{"bad.path":"string"}}),
            json!({"indexes":{"rank":"number"},"data":{"rank":"wrong"}}),
            json!({"data":{"large":"x".repeat(64*1024)}}),
        ] {
            let mut request =
                json!({"method":"record.insert","collection":"items","id":"a","data":{}});
            request
                .as_object_mut()
                .unwrap()
                .extend(patch.as_object().unwrap().clone());
            let tx = db.transaction().unwrap();
            assert!(write(&tx, "owner", &request).is_err(), "{request}");
        }
        for input in [
            json!({"limit":0}),
            json!({"limit":201}),
            json!({"limit":1.5}),
            json!({"cursor":null}),
            json!({"cursor":"bad"}),
            json!({"orderBy":[{"builtin":"data;DROP TABLE plugin_records","direction":"asc"}]}),
            json!({"where":[{"field":"rank","type":"boolean","op":"gt","value":true}]}),
            json!({"where":[{"field":"rank","type":"number","op":"in","value":[]}]}),
            json!({"where":[{"field":"rank","type":"number","op":"eq","value":true}]}),
            json!({"where":[{"field":"rank'","type":"number","op":"eq","value":1}]}),
        ] {
            assert!(
                query(&db, "owner", "items", input.clone(), "scope").is_err(),
                "{input}"
            );
        }
        assert_eq!(count(&db, json!([])), 0);
    }

    #[test]
    fn reads_do_not_adopt_orphans_and_corrupted_json_is_not_silently_replaced() {
        let mut db = database();
        insert(&mut db, "owner", "items", "a", json!({"name":"保留"}));
        db.execute(
            "UPDATE plugin_records SET orphaned_time=123 WHERE id='a'",
            [],
        )
        .unwrap();
        assert!(read(
            &db,
            "owner",
            &json!({"method":"record.get","collection":"items","id":"a"}),
            "scope"
        )
        .unwrap()
        .is_object());
        query(&db, "owner", "items", json!({}), "scope").unwrap();
        assert_eq!(count(&db, json!([])), 1);
        assert_eq!(
            db.query_row(
                "SELECT orphaned_time FROM plugin_records WHERE id='a'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            123
        );
        for raw in ["{broken", "[]", "null"] {
            db.execute("UPDATE plugin_records SET data=?1 WHERE id='a'", [raw])
                .unwrap();
            assert!(read(
                &db,
                "owner",
                &json!({"method":"record.get","collection":"items","id":"a"}),
                "scope"
            )
            .is_err());
        }
    }
}
