use super::{
    calendar_holidays::HolidayDays,
    calendar_time::CalendarTimeZone,
    common,
    plugin_app::{self, EntityRef, RefAccess},
    plugin_data::sql_error,
};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeSet;

const MAX_LINKS: usize = 1000;
const MAX_DATA: usize = 4096;
const COLUMNS: &str =
    "id,plugin_id,from_id,to_kind,to_id,to_created_at,role,sort_index,data,create_time";

#[derive(Deserialize, Serialize)]
struct LinkRow {
    id: String,
    plugin_id: String,
    from_id: i64,
    to_kind: String,
    to_id: String,
    to_created_at: i64,
    role: String,
    sort_index: i64,
    data: String,
    create_time: i64,
}

fn row(value: &rusqlite::Row<'_>) -> rusqlite::Result<LinkRow> {
    Ok(LinkRow {
        id: value.get(0)?,
        plugin_id: value.get(1)?,
        from_id: value.get(2)?,
        to_kind: value.get(3)?,
        to_id: value.get(4)?,
        to_created_at: value.get(5)?,
        role: value.get(6)?,
        sort_index: value.get(7)?,
        data: value.get(8)?,
        create_time: value.get(9)?,
    })
}

fn dto(row: &LinkRow) -> Value {
    let data = serde_json::from_str::<Value>(&row.data)
        .ok()
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({}));
    json!({"id":row.id,"from":row.from_id.to_string(),"to":{"kind":row.to_kind,"id":row.to_id},"role":row.role,"data":data,"createdAt":row.create_time})
}

fn from_id(request: &Value) -> Result<i64, String> {
    let value = request["from"].as_str().ok_or("来源身份无效")?;
    value
        .parse::<i64>()
        .ok()
        .filter(|id| *id > 0 && *id <= 9_007_199_254_740_991 && id.to_string() == value)
        .ok_or_else(|| "来源身份无效".into())
}

fn link_id(value: &Value) -> Result<&str, String> {
    value
        .as_str()
        .filter(|id| {
            !id.is_empty()
                && id.len() <= 64
                && id
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        })
        .ok_or_else(|| "关联 ID 无效".into())
}

fn role(value: &Value) -> Result<&str, String> {
    value
        .as_str()
        .filter(|role| role.encode_utf16().count() <= 128)
        .ok_or_else(|| "关联角色无效".into())
}

fn data(value: &Value) -> Result<String, String> {
    if !value.is_object() {
        return Err("关联 data 必须是对象".into());
    }
    let encoded = value.to_string();
    if encoded.encode_utf16().count() > MAX_DATA {
        return Err("关联 data 超过 4 KB".into());
    }
    Ok(encoded)
}

fn own_kind(conn: &Connection, plugin: &str, from: i64) -> Result<String, String> {
    conn.query_row(
        "SELECT kind FROM plugin_entities WHERE id=?1 AND plugin_id=?2 AND orphaned_time IS NULL",
        params![from, plugin],
        |row| row.get(0),
    )
    .optional()
    .map_err(sql_error)?
    .ok_or_else(|| "内容不存在".into())
}

fn rows(conn: &Connection, plugin: &str, from: i64) -> Result<Vec<LinkRow>, String> {
    let mut statement = conn
        .prepare(&format!(
            "SELECT {COLUMNS} FROM plugin_links WHERE from_id=?1 AND plugin_id=?2 ORDER BY role,sort_index,id LIMIT ?3"
        ))
        .map_err(sql_error)?;
    let rows = statement
        .query_map(params![from, plugin, MAX_LINKS as i64 + 1], row)
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    if rows.len() > MAX_LINKS {
        return Err("来源关联超过读取预算".into());
    }
    Ok(rows)
}

fn updated(tx: &Transaction<'_>, plugin: &str, from: i64, kind: &str) -> Result<(), String> {
    super::plugin_own_data::event(tx, plugin, "entity", "updated", &from.to_string(), kind)
}

pub(super) fn read(
    conn: &Connection,
    plugin: &str,
    request: &Value,
    _scope: &str,
) -> Result<Value, String> {
    if request["method"] != "link.list" {
        return Err("未知关联读取操作".into());
    }
    let from = from_id(request)?;
    own_kind(conn, plugin, from)?;
    let selected_role = request.get("role").map(role).transpose()?;
    Ok(json!(rows(conn, plugin, from)?
        .iter()
        .filter(|row| selected_role.is_none_or(|role| row.role == role))
        .map(dto)
        .collect::<Vec<_>>()))
}

fn add(
    tx: &Transaction<'_>,
    plugin: &str,
    request: &Value,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    let id = link_id(&request["id"])?;
    let from = from_id(request)?;
    let kind = own_kind(tx, plugin, from)?;
    let reference: EntityRef =
        serde_json::from_value(request["to"].clone()).map_err(|_| "关联目标无效")?;
    let role = role(&request["role"])?;
    let data = data(&request["data"])?;
    let existing = tx
        .query_row(
            &format!("SELECT {COLUMNS} FROM plugin_links WHERE from_id=?1 AND to_kind=?2 AND to_id=?3 AND role=?4"),
            params![from, reference.kind, reference.id, role],
            row,
        )
        .optional()
        .map_err(sql_error)?;
    if let Some(existing) = existing {
        if existing.plugin_id != plugin {
            return Err("关联归属冲突".into());
        }
        return Ok(dto(&existing));
    }
    let target = match plugin_app::access_link_target(
        tx,
        plugin,
        &reference,
        request["readable"] == true,
        zone,
        holidays,
    )? {
        RefAccess::Denied => {
            return Err("不能关联这项内容：请先让用户选择它，或申请读取权限".into())
        }
        RefAccess::Missing => return Err("要关联的内容不存在".into()),
        RefAccess::Allowed(target) => target,
    };
    let count: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM plugin_links WHERE from_id=?1",
            [from],
            |row| row.get(0),
        )
        .map_err(sql_error)?;
    if count >= MAX_LINKS as i64 {
        return Err("一项内容最多 1000 条关联".into());
    }
    let last: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(sort_index),-1) FROM plugin_links WHERE from_id=?1 AND role=?2",
            params![from, role],
            |row| row.get(0),
        )
        .map_err(sql_error)?;
    let index = last.checked_add(1).ok_or("关联顺序超出范围")?;
    let row = LinkRow {
        id: id.into(),
        plugin_id: plugin.into(),
        from_id: from,
        to_kind: reference.kind,
        to_id: reference.id,
        to_created_at: target.created_at,
        role: role.into(),
        sort_index: index,
        data,
        create_time: common::now_millis(),
    };
    insert(tx, &row)?;
    updated(tx, plugin, from, &kind)?;
    Ok(dto(&row))
}

fn insert(tx: &Transaction<'_>, row: &LinkRow) -> Result<(), String> {
    tx.execute(
        &format!("INSERT INTO plugin_links({COLUMNS}) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)"),
        params![
            row.id,
            row.plugin_id,
            row.from_id,
            row.to_kind,
            row.to_id,
            row.to_created_at,
            row.role,
            row.sort_index,
            row.data,
            row.create_time
        ],
    )
    .map_err(sql_error)?;
    Ok(())
}

pub(super) fn write(
    tx: &Transaction<'_>,
    plugin: &str,
    request: &Value,
    zone: CalendarTimeZone,
    holidays: &HolidayDays,
) -> Result<Value, String> {
    match request["method"].as_str() {
        Some("link.add") => add(tx, plugin, request, zone, holidays),
        Some("link.remove") => {
            let id = link_id(&request["id"])?;
            let from: Option<i64> = tx
                .query_row(
                    "SELECT from_id FROM plugin_links WHERE id=?1 AND plugin_id=?2",
                    params![id, plugin],
                    |row| row.get(0),
                )
                .optional()
                .map_err(sql_error)?;
            if let Some(from) = from {
                let kind = own_kind(tx, plugin, from)?;
                tx.execute(
                    "DELETE FROM plugin_links WHERE id=?1 AND plugin_id=?2",
                    params![id, plugin],
                )
                .map_err(sql_error)?;
                updated(tx, plugin, from, &kind)?;
            }
            Ok(Value::Null)
        }
        Some("link.reorder") => {
            let from = from_id(request)?;
            let kind = own_kind(tx, plugin, from)?;
            let ids = request["ids"]
                .as_array()
                .filter(|ids| !ids.is_empty() && ids.len() <= MAX_LINKS)
                .ok_or("关联 ids 无效")?;
            let ids = ids.iter().map(link_id).collect::<Result<Vec<_>, _>>()?;
            let unique = ids.iter().copied().collect::<BTreeSet<_>>();
            if unique.len() != ids.len() {
                return Err("关联 ids 不能重复".into());
            }
            let rows = rows(tx, plugin, from)?;
            let selected = rows
                .iter()
                .filter(|row| unique.contains(row.id.as_str()))
                .collect::<Vec<_>>();
            if selected.len() != ids.len()
                || selected.iter().any(|row| row.role != selected[0].role)
            {
                return Err("ids 须是同一来源、同一角色的关联".into());
            }
            if rows
                .iter()
                .filter(|row| row.role == selected[0].role)
                .count()
                != ids.len()
            {
                return Err("ids 须包含这一角色的全部关联".into());
            }
            let mut changed = 0;
            for (index, id) in ids.iter().enumerate() {
                changed += tx.execute("UPDATE plugin_links SET sort_index=?1 WHERE id=?2 AND plugin_id=?3 AND sort_index<>?1", params![index as i64, id, plugin]).map_err(sql_error)?;
            }
            if changed > 0 {
                updated(tx, plugin, from, &kind)?;
            }
            Ok(Value::Null)
        }
        _ => Err("未知关联写入操作".into()),
    }
}

pub(super) fn snapshot(conn: &Connection, plugin: &str, from: i64) -> Result<Value, String> {
    own_kind(conn, plugin, from)?;
    serde_json::to_value(rows(conn, plugin, from)?).map_err(|error| error.to_string())
}

pub(super) fn remove_from(tx: &Transaction<'_>, plugin: &str, from: i64) -> Result<(), String> {
    own_kind(tx, plugin, from)?;
    tx.execute(
        "DELETE FROM plugin_links WHERE from_id=?1 AND plugin_id=?2",
        params![from, plugin],
    )
    .map_err(sql_error)?;
    Ok(())
}

pub(super) fn restore(
    tx: &Transaction<'_>,
    plugin: &str,
    from: i64,
    value: &Value,
) -> Result<(), String> {
    own_kind(tx, plugin, from)?;
    let values = value
        .as_array()
        .filter(|rows| rows.len() <= MAX_LINKS)
        .ok_or("关联恢复材料无效")?;
    let mut rows = Vec::with_capacity(values.len());
    let mut ids = BTreeSet::new();
    let mut destinations = BTreeSet::new();
    for value in values {
        let row: LinkRow = serde_json::from_value(value.clone()).map_err(|_| "关联恢复材料无效")?;
        link_id(&json!(row.id))?;
        role(&json!(row.role))?;
        data(&serde_json::from_str::<Value>(&row.data).map_err(|_| "关联恢复 data 无效")?)?;
        if row.plugin_id != plugin
            || row.from_id != from
            || row.to_id.is_empty()
            || row.to_id.len() > 200
            || row.to_created_at < 0
            || row.create_time < 0
            || row.sort_index < 0
            || !ids.insert(row.id.clone())
            || !destinations.insert((row.to_kind.clone(), row.to_id.clone(), row.role.clone()))
        {
            return Err("关联恢复身份冲突".into());
        }
        let occupied: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM plugin_links WHERE id=?1 OR (from_id=?2 AND to_kind=?3 AND to_id=?4 AND role=?5))",
            params![row.id,from,row.to_kind,row.to_id,row.role], |row| row.get(0),
        ).map_err(sql_error)?;
        if occupied {
            return Err("关联已被占用，不能覆盖恢复".into());
        }
        rows.push(row);
    }
    let existing: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM plugin_links WHERE from_id=?1",
            [from],
            |row| row.get(0),
        )
        .map_err(sql_error)?;
    if existing + rows.len() as i64 > MAX_LINKS as i64 {
        return Err("恢复后关联超过 1000 条".into());
    }
    for row in rows {
        insert(tx, &row)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    const ZONE: CalendarTimeZone = CalendarTimeZone(chrono_tz::Asia::Shanghai);

    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&conn).unwrap();
        for (id, plugin) in [(1, "alpha"), (2, "alpha"), (3, "beta")] {
            conn.execute("INSERT INTO plugin_entities(id,plugin_id,kind,key,title,content_id,create_time,update_time) VALUES(?1,?2,'question',?3,?3,0,10,10)",params![id,plugin,format!("问题{id}")]).unwrap();
        }
        conn
    }

    fn add_request(id: &str, target: &str, role: &str) -> Value {
        json!({"method":"link.add","id":id,"from":"1","to":{"kind":"plugin-entity","id":target},"role":role,"data":{"label":"原值"},"readable":false})
    }

    fn apply(conn: &mut Connection, plugin: &str, request: &Value) -> Result<Value, String> {
        let tx = conn.transaction().unwrap();
        let value = write(&tx, plugin, request, ZONE, &HolidayDays::new())?;
        tx.commit().unwrap();
        Ok(value)
    }

    fn list(conn: &Connection, from: &str, role: Option<&str>) -> Value {
        let mut request = json!({"method":"link.list","from":from});
        if let Some(role) = role {
            request["role"] = json!(role);
        }
        read(conn, "alpha", &request, "workspace").unwrap()
    }

    fn event_count(conn: &Connection) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM operation WHERE operation_content_type='plugin-event'",
            [],
            |row| row.get(0),
        )
        .unwrap()
    }

    #[test]
    fn sources_and_targets_are_plugin_scoped_and_grants_check_created_identity() {
        let mut conn = database();
        assert!(apply(&mut conn, "beta", &add_request("first", "2", ""))
            .unwrap_err()
            .contains("内容不存在"));
        assert!(read(
            &conn,
            "beta",
            &json!({"method":"link.list","from":"1"}),
            "scope"
        )
        .is_err());
        let mut other = add_request("other", "3", "");
        other["readable"] = json!(true);
        let denied = apply(&mut conn, "alpha", &other).unwrap_err();
        other["to"]["id"] = json!("999");
        assert_eq!(apply(&mut conn, "alpha", &other).unwrap_err(), denied);
        other["to"]["id"] = json!("3");
        conn.execute("INSERT INTO plugin_ref_grants(plugin_id,kind,ref_id,target_created_at,create_time) VALUES('alpha','plugin-entity','3',9,10)",[]).unwrap();
        assert!(apply(&mut conn, "alpha", &other)
            .unwrap_err()
            .contains("不存在"));
        conn.execute("UPDATE plugin_ref_grants SET target_created_at=10", [])
            .unwrap();
        apply(&mut conn, "alpha", &other).unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT to_created_at FROM plugin_links WHERE id='other'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            10
        );
        apply(&mut conn, "alpha", &add_request("own", "2", "")).unwrap();
        conn.execute("UPDATE plugin_entities SET orphaned_time=20 WHERE id=2", [])
            .unwrap();
        assert!(apply(&mut conn, "alpha", &add_request("orphan", "2", "new")).is_err());
    }

    #[test]
    fn ordinary_reference_permissions_and_saved_creation_are_checked() {
        let mut conn = database();
        conn.execute(
            "INSERT INTO contents(id,content,create_time,update_time) VALUES(20,'[]',12,12)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO cards(id,content_id,create_time,update_time) VALUES(20,20,12,12)",
            [],
        )
        .unwrap();
        let mut request = add_request("card", "20", "material");
        request["to"]["kind"] = json!("card");
        assert!(apply(&mut conn, "alpha", &request)
            .unwrap_err()
            .contains("请先让用户选择"));
        conn.execute("INSERT INTO plugin_ref_grants(plugin_id,kind,ref_id,target_created_at,create_time) VALUES('alpha','card','20',11,12)",[]).unwrap();
        assert!(apply(&mut conn, "alpha", &request)
            .unwrap_err()
            .contains("不存在"));
        request["readable"] = json!(true);
        apply(&mut conn, "alpha", &request).unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT to_created_at FROM plugin_links WHERE id='card'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            12
        );
    }

    #[test]
    fn duplicate_role_add_keeps_original_data_identity_order_and_event_count() {
        let mut conn = database();
        let first = apply(&mut conn, "alpha", &add_request("first", "2", "answer")).unwrap();
        let count = event_count(&conn);
        let mut repeated = add_request("second", "2", "answer");
        repeated["data"] = json!({"label":"不能覆盖"});
        conn.execute("DELETE FROM plugin_entities WHERE id=2", [])
            .unwrap();
        assert_eq!(apply(&mut conn, "alpha", &repeated).unwrap(), first);
        assert_eq!(list(&conn, "1", Some("answer")), json!([first]));
        assert_eq!(event_count(&conn), count);
        assert_eq!(
            conn.query_row(
                "SELECT update_time FROM plugin_entities WHERE id=1",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            10
        );
    }

    #[test]
    fn reorder_requires_all_links_in_one_role_and_preserves_other_roles() {
        let mut conn = database();
        apply(&mut conn, "alpha", &add_request("a", "1", "answer")).unwrap();
        apply(&mut conn, "alpha", &add_request("b", "2", "answer")).unwrap();
        apply(&mut conn, "alpha", &add_request("m", "2", "material")).unwrap();
        for ids in [
            json!([]),
            json!(["a"]),
            json!(["a", "a"]),
            json!(["a", "m"]),
            json!(["a", "missing"]),
        ] {
            assert!(apply(
                &mut conn,
                "alpha",
                &json!({"method":"link.reorder","from":"1","ids":ids})
            )
            .is_err());
        }
        apply(
            &mut conn,
            "alpha",
            &json!({"method":"link.reorder","from":"1","ids":["b","a"]}),
        )
        .unwrap();
        let answer = list(&conn, "1", Some("answer"));
        assert_eq!(answer[0]["id"], "b");
        assert_eq!(answer[1]["id"], "a");
        assert_eq!(list(&conn, "1", Some("material"))[0]["id"], "m");
        let count = event_count(&conn);
        apply(
            &mut conn,
            "alpha",
            &json!({"method":"link.reorder","from":"1","ids":["b","a"]}),
        )
        .unwrap();
        assert_eq!(event_count(&conn), count);
    }

    #[test]
    fn remove_is_idempotent_without_touching_other_plugins_or_their_events() {
        let mut conn = database();
        apply(&mut conn, "alpha", &add_request("one", "2", "")).unwrap();
        let count = event_count(&conn);
        apply(
            &mut conn,
            "beta",
            &json!({"method":"link.remove","id":"one"}),
        )
        .unwrap();
        assert_eq!(list(&conn, "1", None).as_array().unwrap().len(), 1);
        assert_eq!(event_count(&conn), count);
        apply(
            &mut conn,
            "alpha",
            &json!({"method":"link.remove","id":"one"}),
        )
        .unwrap();
        assert_eq!(event_count(&conn), count + 1);
        apply(
            &mut conn,
            "alpha",
            &json!({"method":"link.remove","id":"one"}),
        )
        .unwrap();
        assert_eq!(event_count(&conn), count + 1);
    }

    #[test]
    fn snapshots_restore_outgoing_edges_and_keep_incoming_edges_after_target_delete() {
        let mut conn = database();
        apply(&mut conn, "alpha", &add_request("out", "2", "answer")).unwrap();
        let mut incoming = add_request("in", "1", "answer");
        incoming["from"] = json!("2");
        apply(&mut conn, "alpha", &incoming).unwrap();
        let saved = snapshot(&conn, "alpha", 1).unwrap();
        let tx = conn.transaction().unwrap();
        remove_from(&tx, "alpha", 1).unwrap();
        tx.execute("DELETE FROM plugin_entities WHERE id=1", [])
            .unwrap();
        tx.commit().unwrap();
        assert_eq!(list(&conn, "2", None)[0]["id"], "in");
        let tx = conn.transaction().unwrap();
        tx.execute("INSERT INTO plugin_entities(id,plugin_id,kind,key,title,content_id,create_time,update_time) VALUES(1,'alpha','question','问题1','问题1',0,10,10)",[]).unwrap();
        restore(&tx, "alpha", 1, &saved).unwrap();
        tx.commit().unwrap();
        assert_eq!(snapshot(&conn, "alpha", 1).unwrap(), saved);
        assert_eq!(list(&conn, "2", None)[0]["id"], "in");
    }

    #[test]
    fn restore_refuses_conflicts_and_tampered_ownership_without_partial_inserts() {
        let mut conn = database();
        apply(&mut conn, "alpha", &add_request("a", "1", "answer")).unwrap();
        apply(&mut conn, "alpha", &add_request("b", "2", "answer")).unwrap();
        let saved = snapshot(&conn, "alpha", 1).unwrap();
        let tx = conn.transaction().unwrap();
        remove_from(&tx, "alpha", 1).unwrap();
        tx.commit().unwrap();
        let mut occupied = add_request("b", "2", "another");
        occupied["from"] = json!("2");
        apply(&mut conn, "alpha", &occupied).unwrap();
        let tx = conn.transaction().unwrap();
        assert!(restore(&tx, "alpha", 1, &saved)
            .unwrap_err()
            .contains("占用"));
        assert_eq!(rows(&tx, "alpha", 1).unwrap().len(), 0);
        tx.commit().unwrap();
        let mut corrupt = saved.clone();
        corrupt[0]["plugin_id"] = json!("beta");
        let tx = conn.transaction().unwrap();
        assert!(restore(&tx, "alpha", 1, &corrupt)
            .unwrap_err()
            .contains("身份冲突"));
        assert!(rows(&tx, "alpha", 1).unwrap().is_empty());
    }

    #[test]
    fn transactions_rollback_all_link_writes_and_events_on_later_failure() {
        let mut conn = database();
        {
            let tx = conn.transaction().unwrap();
            write(
                &tx,
                "alpha",
                &add_request("first", "2", ""),
                ZONE,
                &HolidayDays::new(),
            )
            .unwrap();
            assert!(write(
                &tx,
                "alpha",
                &add_request("denied", "3", ""),
                ZONE,
                &HolidayDays::new()
            )
            .is_err());
        }
        assert!(list(&conn, "1", None).as_array().unwrap().is_empty());
        assert_eq!(event_count(&conn), 0);
        for mut request in [
            add_request("bad-id!", "2", ""),
            add_request("valid", "2", &"a".repeat(129)),
            add_request("valid", "2", ""),
        ] {
            if request["id"] == "valid" && request["role"] == "" {
                request["data"] = json!({"value":"a".repeat(4096)});
            }
            assert!(apply(&mut conn, "alpha", &request).is_err());
        }
    }
}
