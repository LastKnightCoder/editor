use super::{
    calendar_holidays::{self, HolidayDays},
    calendar_time::CalendarTimeZone,
    common, plugin_app, plugin_data, plugin_entities, plugin_links, plugin_records, schema,
};
use rusqlite::{Connection, OptionalExtension, Transaction};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, WebviewWindow};

type Reservations = HashMap<(String, String), HashSet<i64>>;
fn reservations() -> &'static Mutex<Reservations> {
    static VALUES: OnceLock<Mutex<Reservations>> = OnceLock::new();
    VALUES.get_or_init(Default::default)
}
fn leases() -> &'static Mutex<HashMap<(String, String), bool>> {
    static VALUES: OnceLock<Mutex<HashMap<(String, String), bool>>> = OnceLock::new();
    VALUES.get_or_init(Default::default)
}
fn assert_lease(scope: &str, plugin: &str) -> Result<(), String> {
    if leases()
        .lock()
        .map_err(|_| "插件激活状态不可用")?
        .get(&(scope.into(), plugin.into()))
        != Some(&true)
    {
        return Err("插件激活会话已失效".into());
    }
    Ok(())
}
fn activate_lease(scope: &str, plugin: &str) -> Result<(), String> {
    let mut states = leases().lock().map_err(|_| "插件激活状态不可用")?;
    let key = (scope.into(), plugin.into());
    if states.get(&key) == Some(&false) {
        return Err("插件激活会话已失效，不能重新启用旧身份".into());
    }
    states.insert(key, true);
    Ok(())
}
fn release_lease(scope: &str, plugin: &str) -> Result<(), String> {
    leases()
        .lock()
        .map_err(|_| "插件激活状态不可用")?
        .insert((scope.into(), plugin.into()), false);
    reservations()
        .lock()
        .map_err(|_| "预留身份不可用")?
        .remove(&(scope.into(), plugin.into()));
    Ok(())
}
pub(crate) fn clear_reservations() {
    if let Ok(mut values) = reservations().lock() {
        values.clear();
    }
    if let Ok(mut values) = leases().lock() {
        values.clear();
    }
}

/// 删除后仍保留真实归属与子类型，投递时不从已不存在的记录猜测拥有者。
pub(super) fn event(
    conn: &Connection,
    plugin: &str,
    domain: &str,
    action: &str,
    id: &str,
    subtype: &str,
) -> Result<(), String> {
    if !matches!(domain, "entity" | "record")
        || !matches!(action, "created" | "updated" | "deleted")
    {
        return Err("插件变化事件无效".into());
    }
    common::write_operation(
        conn,
        "plugin-event",
        &json!({"domain":domain,"action":action,"pluginId":plugin,"id":id,"subtype":subtype})
            .to_string(),
        0,
        common::now_millis(),
    )
}

fn method(request: &Value) -> Result<&str, String> {
    request["method"]
        .as_str()
        .ok_or_else(|| "插件数据操作缺失".into())
}

fn reserve(conn: &Connection, token: &str, plugin: &str) -> Result<Value, String> {
    assert_lease(token, plugin)?;
    let mut values = reservations().lock().map_err(|_| "预留身份不可用")?;
    let ids = values.entry((token.into(), plugin.into())).or_default();
    if ids.len() >= 1000 {
        return Err("未提交的预留身份过多，请结束当前事务或重新启用插件".into());
    }
    let id = plugin_entities::next_id(conn)?;
    ids.insert(id);
    Ok(json!(id.to_string()))
}

fn consume(token: &str, plugin: &str, ops: &[Value]) -> Result<(), String> {
    let mut requested = HashSet::new();
    for op in ops.iter().filter(|op| op["method"] == "entity.create") {
        let id = op["id"]
            .as_str()
            .and_then(|id| id.parse::<i64>().ok())
            .filter(|id| *id > 0)
            .ok_or("预留实体身份无效")?;
        if !requested.insert(id) {
            return Err("同一事务重复使用预留实体身份".into());
        }
    }
    if requested.is_empty() {
        return Ok(());
    }
    let mut values = reservations().lock().map_err(|_| "预留身份不可用")?;
    let available = values
        .get_mut(&(token.into(), plugin.into()))
        .ok_or("实体身份不属于当前插件会话")?;
    if !requested.iter().all(|id| available.contains(id)) {
        return Err("实体身份不属于当前插件会话或已使用".into());
    }
    for id in requested {
        available.remove(&id);
    }
    Ok(())
}

fn writes(request: &Value) -> Result<Vec<Value>, String> {
    if method(request)? != "transaction" {
        if matches!(
            method(request)?,
            "entity.update" | "entity.delete" | "record.update" | "record.delete"
        ) && request["expectedRevision"]
            .as_str()
            .is_none_or(str::is_empty)
        {
            return Err("写入必须提供 expectedRevision".into());
        }
        return Ok(vec![request.clone()]);
    }
    let ops = request["ops"].as_array().ok_or("事务写入列表无效")?;
    if ops.is_empty() || ops.len() > 500 {
        return Err("事务需要 1–500 条写入".into());
    }
    ops.iter()
        .map(|op| {
            let mut result = op.as_object().cloned().ok_or("事务操作无效")?;
            let name = result.remove("op").ok_or("事务操作缺失")?;
            result.insert("method".into(), name);
            Ok(Value::Object(result))
        })
        .collect()
}

fn link_holidays(
    conn: &Connection,
    plugin: &str,
    ops: &[Value],
    zone: CalendarTimeZone,
) -> Result<Vec<(i64, i64)>, String> {
    let mut ranges = std::collections::BTreeSet::new();
    let mut removed = HashSet::new();
    for op in ops {
        if op["method"] == "link.remove" {
            if let Some(id) = op["id"].as_str() {
                removed.insert(id.to_owned());
            }
        }
        if op["method"] != "link.add" || op["to"]["kind"] != "todo" {
            continue;
        }
        let duplicate=conn.query_row("SELECT l.id FROM plugin_links l JOIN plugin_entities e ON e.id=l.from_id WHERE l.plugin_id=?1 AND e.plugin_id=?1 AND e.orphaned_time IS NULL AND l.from_id=?2 AND l.to_kind='todo' AND l.to_id=?3 AND l.role=?4",rusqlite::params![plugin,op["from"].as_str().unwrap_or(""),op["to"]["id"].as_str().unwrap_or(""),op["role"].as_str().unwrap_or("")],|row|row.get::<_,String>(0)).optional().map_err(plugin_data::sql_error)?;
        if duplicate.is_some_and(|id| !removed.contains(&id)) {
            continue;
        }
        let request = json!({"method":"describe","refs":[op["to"]],"readable":if op["readable"]==true {vec!["todo"]}else{vec![]}});
        ranges.extend(plugin_app::requested_holiday_ranges(
            conn, plugin, &request, zone,
        )?);
    }
    Ok(ranges.into_iter().collect())
}

fn apply(
    tx: &Transaction<'_>,
    plugin: &str,
    op: &Value,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    match method(op)? {
        "entity.create" | "entity.update" | "entity.delete" => {
            plugin_entities::write(tx, plugin, op)
        }
        "record.insert" | "record.update" | "record.delete" => {
            plugin_records::write(tx, plugin, op)
        }
        "link.add" | "link.remove" | "link.reorder" => {
            plugin_links::write(tx, plugin, op, zone, holidays)
        }
        _ => Err("不支持的插件事务操作".into()),
    }
}

fn commit(
    conn: &mut Connection,
    token: &str,
    plugin: &str,
    ops: &[Value],
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    assert_lease(token, plugin)?;
    consume(token, plugin, ops)?;
    let tx = conn.transaction().map_err(plugin_data::sql_error)?;
    let mut result = Value::Null;
    for op in ops {
        result = apply(&tx, plugin, op, zone, holidays)?;
    }
    tx.commit().map_err(plugin_data::sql_error)?;
    Ok(result)
}

#[tauri::command]
pub fn plugin_own_read(
    app: AppHandle,
    window: WebviewWindow,
    database: String,
    token: String,
    plugin_id: String,
    lease: String,
    request: Value,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::provider_settings::validate_plugin_id(&plugin_id)?;
    if lease.is_empty() || lease.len() > 128 {
        return Err("插件激活身份无效".into());
    }
    crate::plugin_transport::with_database(&token, &database, || {
        assert_lease(&format!("{token}:{lease}"), &plugin_id)?;
        let conn = schema::open_active_database(&app)?;
        if conn.database_name() != database {
            return Err("插件工作区已失效".into());
        }
        let scope = format!("{token}:{lease}:{plugin_id}");
        match method(&request)? {
            "entity.backlinks" => {
                let id = request["id"]
                    .as_str()
                    .and_then(|id| id.parse::<i64>().ok())
                    .ok_or("实体身份无效")?;
                let index = super::index_db::open_index_database(&app, &database)?;
                plugin_entities::backlinks(&conn, &index, &plugin_id, id)
            }
            "entity.get" | "entity.find" | "entity.query" | "entity.count" => {
                plugin_entities::read(&conn, &plugin_id, &request, &scope)
            }
            "record.get" | "record.query" | "record.count" => {
                plugin_records::read(&conn, &plugin_id, &request, &scope)
            }
            "link.list" => plugin_links::read(&conn, &plugin_id, &request, &scope),
            _ => Err("不支持的插件读取操作".into()),
        }
    })
}

#[tauri::command]
pub async fn plugin_own_write(
    app: AppHandle,
    window: WebviewWindow,
    database: String,
    token: String,
    plugin_id: String,
    lease: String,
    request: Value,
    time_zone: CalendarTimeZone,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::provider_settings::validate_plugin_id(&plugin_id)?;
    if lease.is_empty() || lease.len() > 128 {
        return Err("插件激活身份无效".into());
    }
    if matches!(
        method(&request)?,
        "reserve" | "release" | "adopt" | "entity.registerKind"
    ) {
        return crate::plugin_transport::with_database(&token, &database, || {
            let mut conn = schema::open_active_database(&app)?;
            if conn.database_name() != database {
                return Err("插件工作区已失效".into());
            }
            match method(&request)? {
                "reserve" => reserve(&conn, &format!("{token}:{lease}"), &plugin_id),
                "release" => {
                    release_lease(&format!("{token}:{lease}"), &plugin_id)?;
                    Ok(Value::Null)
                }
                _ => {
                    let scope = format!("{token}:{lease}");
                    if request["method"] == "adopt" {
                        activate_lease(&scope, &plugin_id)?;
                    } else {
                        assert_lease(&scope, &plugin_id)?;
                    }
                    let tx = conn.transaction().map_err(plugin_data::sql_error)?;
                    let result = if request["method"] == "adopt" {
                        plugin_entities::adopt(&tx, &plugin_id)?;
                        Value::Null
                    } else {
                        plugin_entities::write(&tx, &plugin_id, &request)?
                    };
                    tx.commit().map_err(plugin_data::sql_error)?;
                    Ok(result)
                }
            }
        });
    }
    let ops = writes(&request)?;
    let ranges = crate::plugin_transport::with_database(&token, &database, || {
        assert_lease(&format!("{token}:{lease}"), &plugin_id)?;
        let conn = schema::open_active_database(&app)?;
        if conn.database_name() != database {
            return Err("插件工作区已失效".into());
        }
        link_holidays(&conn, &plugin_id, &ops, time_zone)
    })?;
    let mut holidays = HolidayDays::new();
    for (start, end) in &ranges {
        holidays
            .extend(calendar_holidays::load_task_holidays(&app, *start, *end, time_zone).await?);
    }
    let result = crate::plugin_transport::with_database(&token, &database, || {
        assert_lease(&format!("{token}:{lease}"), &plugin_id)?;
        let mut conn = schema::open_active_database(&app)?;
        if conn.database_name() != database {
            return Err("插件工作区已失效".into());
        }
        if link_holidays(&conn, &plugin_id, &ops, time_zone)?
            .iter()
            .any(|range| !ranges.contains(range))
        {
            return Err("周期规则已变化，请重试关联".into());
        }
        let before = plugin_data::last_operation(&conn)?;
        let result = commit(
            &mut conn,
            &format!("{token}:{lease}"),
            &plugin_id,
            &ops,
            time_zone,
            &holidays,
        )?;
        plugin_data::remember_origin(&conn, &token, &plugin_id, before)?;
        Ok(result)
    })?;
    super::reconcile::trigger_reconcile(&app, &database);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    const ZONE: CalendarTimeZone = CalendarTimeZone(chrono_tz::Asia::Shanghai);

    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&conn).unwrap();
        conn
    }

    fn entity_op(id: &str, key: &str) -> Value {
        json!({"op":"entity.create","id":id,"input":{"kind":"question","key":key,"title":key,"meta":{}},"indexes":{}})
    }

    fn record_op(id: &str) -> Value {
        json!({"op":"record.insert","collection":"progress","id":id,"data":{"state":"open"},"indexes":{}})
    }

    fn link_op(from: &str, target: &str) -> Value {
        json!({"op":"link.add","id":"question-link","from":from,"to":{"kind":"plugin-entity","id":target},"role":"answer","data":{},"readable":false})
    }

    fn transaction(ops: Vec<Value>) -> Vec<Value> {
        writes(&json!({"method":"transaction","ops":ops})).unwrap()
    }

    fn reserved(conn: &Connection, scope: &str, plugin: &str) -> String {
        activate_lease(scope, plugin).unwrap();
        reserve(conn, scope, plugin)
            .unwrap()
            .as_str()
            .unwrap()
            .to_owned()
    }

    fn execute(
        conn: &mut Connection,
        scope: &str,
        plugin: &str,
        ops: &[Value],
    ) -> Result<Value, String> {
        commit(conn, scope, plugin, ops, ZONE, &HolidayDays::new())
    }

    fn entity(conn: &mut Connection, scope: &str, plugin: &str, key: &str) -> String {
        let id = reserved(conn, scope, plugin);
        execute(conn, scope, plugin, &transaction(vec![entity_op(&id, key)])).unwrap();
        id
    }

    fn count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .unwrap()
    }

    fn events(conn: &Connection) -> Vec<Value> {
        let mut statement = conn.prepare("SELECT operation_action FROM operation WHERE operation_content_type='plugin-event' ORDER BY id").unwrap();
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .map(|value| serde_json::from_str(&value.unwrap()).unwrap())
            .collect()
    }

    #[test]
    fn reservation_isolated_by_workspace_activation_and_plugin_and_consumed_once() {
        let _guard = crate::plugin_transport::test_host("own-reservation");
        let conn = database();
        let scope = "workspace-a:activation-a";
        let id = reserved(&conn, scope, "alpha");
        let ops = transaction(vec![entity_op(&id, "first")]);
        for (other_scope, other_plugin) in [
            ("workspace-b:activation-a", "alpha"),
            ("workspace-a:activation-b", "alpha"),
            (scope, "beta"),
        ] {
            assert!(consume(other_scope, other_plugin, &ops).is_err());
        }
        consume(scope, "alpha", &ops).unwrap();
        assert!(consume(scope, "alpha", &ops).is_err());
        let next = reserved(&conn, scope, "alpha");
        assert!(next.parse::<i64>().unwrap() > id.parse::<i64>().unwrap());
        assert_eq!(count(&conn, "plugin_entities"), 0);
    }

    #[test]
    fn duplicate_or_mixed_reservations_do_not_partially_consume_and_workspace_end_clears_all() {
        let _guard = crate::plugin_transport::test_host("own-reservation-batch");
        let conn = database();
        let scope = "workspace:one";
        let first = reserved(&conn, scope, "alpha");
        let second = reserved(&conn, scope, "alpha");
        let foreign = reserved(&conn, "workspace:two", "alpha");
        assert!(consume(
            scope,
            "alpha",
            &transaction(vec![entity_op(&first, "one"), entity_op(&first, "two")])
        )
        .is_err());
        assert!(consume(
            scope,
            "alpha",
            &transaction(vec![entity_op(&first, "one"), entity_op(&foreign, "other")])
        )
        .is_err());
        consume(
            scope,
            "alpha",
            &transaction(vec![entity_op(&first, "one"), entity_op(&second, "two")]),
        )
        .unwrap();
        let other = reserved(&conn, "other:one", "beta");
        clear_reservations();
        assert!(consume(
            "workspace:two",
            "alpha",
            &transaction(vec![entity_op(&foreign, "other")])
        )
        .is_err());
        assert!(consume(
            "other:one",
            "beta",
            &transaction(vec![entity_op(&other, "other")])
        )
        .is_err());
    }

    #[test]
    fn combined_entity_record_and_link_transaction_commits_data_and_owned_events_together() {
        let _guard = crate::plugin_transport::test_host("own-combined-success");
        let mut conn = database();
        let scope = "workspace:active";
        let target = entity(&mut conn, scope, "alpha", "answer");
        let before = events(&conn).len();
        let source = reserved(&conn, scope, "alpha");
        let ops = transaction(vec![
            entity_op(&source, "question"),
            record_op("progress-one"),
            link_op(&source, &target),
        ]);
        let result = execute(&mut conn, scope, "alpha", &ops).unwrap();
        assert_eq!(result["from"], source);
        assert_eq!(result["to"]["id"], target);
        assert_eq!(count(&conn, "plugin_entities"), 2);
        assert_eq!(count(&conn, "plugin_records"), 1);
        assert_eq!(count(&conn, "plugin_links"), 1);
        assert_eq!(count(&conn, "contents"), 2);
        let saved = events(&conn);
        assert_eq!(saved.len(), before + 3);
        assert!(saved[before..]
            .iter()
            .all(|value| value["pluginId"] == "alpha"));
        assert_eq!(saved[before]["domain"], "entity");
        assert_eq!(saved[before]["action"], "created");
        assert_eq!(saved[before + 1]["domain"], "record");
        assert_eq!(saved[before + 2]["domain"], "entity");
        assert_eq!(saved[before + 2]["action"], "updated");
        assert!(consume(scope, "alpha", &ops).is_err());
    }

    #[test]
    fn later_failure_rolls_back_contents_records_links_and_events_but_burns_reserved_id() {
        let _guard = crate::plugin_transport::test_host("own-combined-rollback");
        let mut conn = database();
        let scope = "workspace:active";
        let target = entity(&mut conn, scope, "beta", "private-answer");
        let before_events = events(&conn);
        let source = reserved(&conn, scope, "alpha");
        let ops = transaction(vec![
            entity_op(&source, "question"),
            record_op("progress-one"),
            link_op(&source, &target),
        ]);
        assert!(execute(&mut conn, scope, "alpha", &ops)
            .unwrap_err()
            .contains("请先让用户选择"));
        assert_eq!(count(&conn, "plugin_entities"), 1);
        assert_eq!(count(&conn, "contents"), 1);
        assert_eq!(count(&conn, "plugin_records"), 0);
        assert_eq!(count(&conn, "plugin_links"), 0);
        assert_eq!(events(&conn), before_events);
        assert!(execute(&mut conn, scope, "alpha", &ops)
            .unwrap_err()
            .contains("已使用"));
        let fresh = reserved(&conn, scope, "alpha");
        assert!(fresh.parse::<i64>().unwrap() > source.parse::<i64>().unwrap());
        execute(
            &mut conn,
            scope,
            "alpha",
            &transaction(vec![
                entity_op(&fresh, "question"),
                record_op("progress-one"),
            ]),
        )
        .unwrap();
        assert_eq!(count(&conn, "plugin_records"), 1);
    }

    #[test]
    fn optional_transaction_versions_do_not_weaken_normal_writes_or_conflict_rollback() {
        let _guard = crate::plugin_transport::test_host("own-version-boundary");
        let mut conn = database();
        let scope = "workspace:active";
        let id = entity(&mut conn, scope, "alpha", "original");
        execute(
            &mut conn,
            scope,
            "alpha",
            &transaction(vec![record_op("progress-one")]),
        )
        .unwrap();
        for method in [
            "entity.update",
            "entity.delete",
            "record.update",
            "record.delete",
        ] {
            assert!(writes(&json!({"method":method,"id":id}))
                .unwrap_err()
                .contains("expectedRevision"));
        }
        let ops = transaction(vec![
            json!({"op":"entity.update","id":id,"patch":{"title":"changed"},"indexes":{}}),
            json!({"op":"record.update","id":"progress-one","collection":"progress","data":{"state":"done"},"indexes":{}}),
        ]);
        execute(&mut conn, scope, "alpha", &ops).unwrap();
        assert_eq!(
            plugin_entities::get(&conn, "alpha", id.parse().unwrap())
                .unwrap()
                .unwrap()["title"],
            "changed"
        );
        let record = plugin_records::read(
            &conn,
            "alpha",
            &json!({"method":"record.get","collection":"progress","id":"progress-one"}),
            scope,
        )
        .unwrap();
        assert_eq!(record["data"]["state"], "done");
        let before = events(&conn);
        let conflict = transaction(vec![
            json!({"op":"entity.update","id":id,"patch":{"title":"must-rollback"},"indexes":{}}),
            json!({"op":"record.update","id":"progress-one","collection":"progress","data":{"state":"wrong"},"indexes":{},"expectedRevision":"stale"}),
        ]);
        assert!(execute(&mut conn, scope, "alpha", &conflict)
            .unwrap_err()
            .contains("PLUGIN_CONFLICT"));
        assert_eq!(
            plugin_entities::get(&conn, "alpha", id.parse().unwrap())
                .unwrap()
                .unwrap()["title"],
            "changed"
        );
        assert_eq!(events(&conn), before);
    }

    fn linked_holiday_instance(conn: &mut Connection, scope: &str) -> (String, Value) {
        let source = entity(conn, scope, "alpha", "source");
        conn.execute(
            "INSERT INTO todo_group(id,title,create_time,update_time) VALUES(30,'任务',10,10)",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO todo_item(id,group_id,title,create_time,update_time) VALUES(30,30,'周期任务',10,10)",[]).unwrap();
        let rule =
            json!({"type":"daily","interval":1,"startDate":"2026-10-01","excludeHolidays":true});
        conn.execute("INSERT INTO todo_recurrence_history(series_id,todo_item_id,todo_created_at,effective_date,rule_json,create_time) VALUES('holiday-series',30,10,'2026-10-01',?1,10)",[rule.to_string()]).unwrap();
        conn.execute("INSERT INTO plugin_links(id,plugin_id,from_id,to_kind,to_id,to_created_at,role,sort_index,data,create_time) VALUES('existing','alpha',?1,'todo','todo:30:10@2026-10-12',10,'task',0,'{}',10)",[source.parse::<i64>().unwrap()]).unwrap();
        let op = json!({"method":"link.add","id":"repeat","from":source,"to":{"kind":"todo","id":"todo:30:10@2026-10-12"},"role":"task","data":{"new":true},"readable":true});
        (source, op)
    }

    #[test]
    fn duplicate_link_add_skips_holiday_fetch_and_stays_idempotent_without_holiday_data() {
        let _guard = crate::plugin_transport::test_host("own-holiday-idempotent");
        let mut conn = database();
        let scope = "workspace:active";
        let (_, op) = linked_holiday_instance(&mut conn, scope);
        assert!(
            link_holidays(&conn, "alpha", std::slice::from_ref(&op), ZONE)
                .unwrap()
                .is_empty()
        );
        let before = events(&conn);
        let result = execute(&mut conn, scope, "alpha", std::slice::from_ref(&op)).unwrap();
        assert_eq!(result["id"], "existing");
        assert_eq!(result["data"], json!({}));
        assert_eq!(count(&conn, "plugin_links"), 1);
        assert_eq!(events(&conn), before);
        let mut fresh = op;
        fresh["role"] = json!("new-role");
        assert_eq!(
            link_holidays(&conn, "alpha", &[fresh], ZONE).unwrap().len(),
            1
        );
    }

    #[test]
    fn remove_then_add_same_link_still_loads_holidays_and_foreign_remove_does_not() {
        let _guard = crate::plugin_transport::test_host("own-holiday-sequence");
        let mut conn = database();
        let scope = "workspace:active";
        let (source, op) = linked_holiday_instance(&mut conn, scope);
        let removing = json!({"method":"link.remove","id":"existing"});
        assert_eq!(
            link_holidays(&conn, "alpha", &[removing, op.clone()], ZONE)
                .unwrap()
                .len(),
            1
        );
        conn.execute("INSERT INTO plugin_entities(id,plugin_id,kind,key,title,content_id,create_time,update_time) VALUES(999,'beta','question','other','other',0,10,10)",[]).unwrap();
        conn.execute("INSERT INTO plugin_links(id,plugin_id,from_id,to_kind,to_id,to_created_at,role,sort_index,data,create_time) VALUES('foreign','beta',999,'plugin-entity',?1,10,'',0,'{}',10)",params![source]).unwrap();
        assert!(link_holidays(
            &conn,
            "alpha",
            &[json!({"method":"link.remove","id":"foreign"}), op],
            ZONE
        )
        .unwrap()
        .is_empty());
    }

    #[test]
    fn released_activation_rejects_late_transaction_without_create_and_cannot_reactivate() {
        let _guard = crate::plugin_transport::test_host("own-released-activation");
        let mut conn = database();
        let old_scope = "workspace:old";
        let live_scope = "workspace:new";
        activate_lease(old_scope, "alpha").unwrap();
        activate_lease(live_scope, "alpha").unwrap();
        execute(
            &mut conn,
            old_scope,
            "alpha",
            &transaction(vec![record_op("progress-one")]),
        )
        .unwrap();
        let pending = transaction(vec![json!({
            "op":"record.update","id":"progress-one","collection":"progress",
            "data":{"state":"late"},"indexes":{}
        })]);
        let before = events(&conn);
        release_lease(old_scope, "alpha").unwrap();
        assert!(execute(&mut conn, old_scope, "alpha", &pending)
            .unwrap_err()
            .contains("失效"));
        assert!(activate_lease(old_scope, "alpha")
            .unwrap_err()
            .contains("不能重新启用"));
        assert!(assert_lease(old_scope, "alpha").is_err());
        assert!(reserve(&conn, old_scope, "alpha").is_err());
        assert_eq!(events(&conn), before);
        assert_eq!(
            plugin_records::read(
                &conn,
                "alpha",
                &json!({"method":"record.get","collection":"progress","id":"progress-one"}),
                live_scope
            )
            .unwrap()["data"]["state"],
            "open"
        );
        assert_lease(live_scope, "alpha").unwrap();
        assert!(assert_lease(live_scope, "beta").is_err());
        execute(&mut conn, live_scope, "alpha", &pending).unwrap();
        assert_eq!(
            plugin_records::read(
                &conn,
                "alpha",
                &json!({"method":"record.get","collection":"progress","id":"progress-one"}),
                live_scope
            )
            .unwrap()["data"]["state"],
            "late"
        );
    }

    #[test]
    fn release_before_adopt_cannot_revive_and_release_only_clears_its_own_reservations() {
        let _guard = crate::plugin_transport::test_host("own-release-order");
        let conn = database();
        release_lease("workspace:cancelled-before-adopt", "alpha").unwrap();
        assert!(activate_lease("workspace:cancelled-before-adopt", "alpha").is_err());
        let first = reserved(&conn, "workspace:first", "alpha");
        let second = reserved(&conn, "workspace:second", "alpha");
        release_lease("workspace:first", "alpha").unwrap();
        assert!(consume(
            "workspace:first",
            "alpha",
            &transaction(vec![entity_op(&first, "first")])
        )
        .is_err());
        consume(
            "workspace:second",
            "alpha",
            &transaction(vec![entity_op(&second, "second")]),
        )
        .unwrap();
        clear_reservations();
        assert!(assert_lease("workspace:second", "alpha").is_err());
    }
}
