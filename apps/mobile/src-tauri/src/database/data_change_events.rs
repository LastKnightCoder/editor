use super::common::now_millis;
use rusqlite::{Connection, Transaction, TransactionBehavior};
use serde_json::{json, Value};
use std::collections::BTreeMap;

pub(super) fn read(conn: &Connection, after: Option<i64>) -> Result<Value, String> {
    if !conn.is_autocommit() {
        return Err("对象通知不能读取未提交事务".into());
    }
    if after.is_some_and(|n| !(0..=9_007_199_254_740_991).contains(&n)) {
        return Err("对象事件水位无效".into());
    }
    let tx = Transaction::new_unchecked(conn, TransactionBehavior::Deferred)
        .map_err(|e| e.to_string())?;
    let head:i64=tx.query_row("SELECT MAX(COALESCE((SELECT seq FROM main.sqlite_sequence WHERE name='data_change_log'),0),COALESCE((SELECT MAX(seq) FROM data_change_log),0))",[],|r|r.get(0)).map_err(|e|e.to_string())?;
    let floor:i64=tx.query_row("SELECT MAX(pruned_through,?1-retention,COALESCE((SELECT MIN(seq)-1 FROM data_change_log),?1)) FROM data_change_state WHERE id='main'",[head],|r|r.get(0)).map_err(|e|e.to_string())?;
    let Some(after) = after else {
        return Ok(json!({"cursor":head,"events":[],"hasMore":false,"reset":false}));
    };
    if after < floor || after > head {
        return Ok(json!({"cursor":head,"events":[],"hasMore":false,"reset":true}));
    }
    let mut stmt=tx.prepare("SELECT seq,domain,entity_id,action FROM data_change_log WHERE seq>?1 AND seq<=?2 ORDER BY seq LIMIT 200").map_err(|e|e.to_string())?;
    let rows = stmt
        .query_map([after, head], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut pending = BTreeMap::<(String, String), (String, i64, String)>::new();
    let mut cursor = head;
    let mut any = false;
    for row in rows {
        let (seq, domain, id, action) = row.map_err(|e| e.to_string())?;
        cursor = seq;
        any = true;
        if !matches!(domain.as_str(), "todo" | "event" | "todo-list" | "calendar") {
            continue;
        }
        let Some(action) =
            action.filter(|s| matches!(s.as_str(), "created" | "updated" | "deleted"))
        else {
            return Ok(json!({"cursor":head,"events":[],"hasMore":false,"reset":true}));
        };
        let key = (domain, id);
        let first = pending
            .get(&key)
            .map(|p| p.2.clone())
            .unwrap_or_else(|| action.clone());
        let action = if action == "deleted" {
            action
        } else if first == "created" {
            "created".into()
        } else if first == "deleted" && action == "created" {
            "updated".into()
        } else {
            action
        };
        pending.insert(key, (action, seq, first));
    }
    let at = now_millis();
    let mut events=pending.into_iter().map(|((domain,id),(action,seq,_))|(seq,json!({"type":format!("{domain}.{action}"),"id":id,"at":at,"origin":{"kind":"app"}}))).collect::<Vec<_>>();
    events.sort_by_key(|e| e.0);
    Ok(
        json!({"cursor":cursor,"events":events.into_iter().map(|e|e.1).collect::<Vec<_>>(),"hasMore":any&&cursor<head,"reset":false}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn db() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&db).unwrap();
        db
    }
    #[test]
    fn object_types_and_ids_follow_committed_changes() {
        let conn = db();
        conn.execute_batch("INSERT INTO todo_group(id,title,create_time,update_time) VALUES(1,'目录',5,5);INSERT INTO calendar(id,title,color,create_time,update_time) VALUES(1,'日历','blue',5,5);INSERT INTO todo_item(id,group_id,title,create_time,update_time) VALUES(3,1,'任务',7,7);INSERT INTO calendar_event(id,calendar_id,title,start_date,create_time,update_time) VALUES(4,1,'日程',0,9,9)").unwrap();
        let first = read(&conn, Some(0)).unwrap();
        let events = first["events"].as_array().unwrap();
        for (kind, id) in [
            ("todo-list.created", "1"),
            ("calendar.created", "1"),
            ("todo.created", "todo:3:7"),
            ("event.created", "4:9"),
        ] {
            assert!(events.iter().any(|e| e["type"] == kind && e["id"] == id));
        }
        conn.execute_batch("UPDATE todo_item SET title='新任务' WHERE id=3;UPDATE calendar_event SET title='新日程' WHERE id=4").unwrap();
        let changed = read(&conn, first["cursor"].as_i64()).unwrap();
        let types = changed["events"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["type"].as_str().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(types, vec!["todo.updated", "event.updated"]);
        conn.execute_batch(
            "DELETE FROM todo_item WHERE id=3;DELETE FROM calendar_event WHERE id=4",
        )
        .unwrap();
        let deleted = read(&conn, changed["cursor"].as_i64()).unwrap();
        assert_eq!(deleted["events"][0]["type"], "todo.deleted");
        assert_eq!(deleted["events"][0]["id"], "todo:3:7");
        assert_eq!(deleted["events"][1]["type"], "event.deleted");
        assert_eq!(deleted["events"][1]["id"], "4:9");
    }
    #[test]
    fn rollback_and_coalescing_preserve_committed_identity() {
        let conn = db();
        conn.execute_batch(
            "BEGIN;INSERT INTO todo_group(id,title,create_time,update_time) VALUES(1,'目录',1,1)",
        )
        .unwrap();
        assert!(read(&conn, Some(0)).is_err());
        conn.execute_batch("ROLLBACK").unwrap();
        assert_eq!(read(&conn, Some(0)).unwrap()["events"], json!([]));
        conn.execute_batch("INSERT INTO todo_group(id,title,create_time,update_time) VALUES(1,'目录',1,1);UPDATE todo_group SET title='新名' WHERE id=1;DELETE FROM todo_group WHERE id=1").unwrap();
        let page = read(&conn, Some(0)).unwrap();
        assert_eq!(page["events"].as_array().unwrap().len(), 1);
        assert_eq!(page["events"][0]["type"], "todo-list.deleted");
        assert_eq!(page["events"][0]["id"], "1");
    }
    #[test]
    fn paging_keeps_distinct_ids_and_history_gaps_reset() {
        let conn = db();
        for id in 1..=501 {
            conn.execute("INSERT INTO calendar(id,title,color,create_time,update_time) VALUES(?1,'目录','blue',1,1)",[id]).unwrap();
        }
        let mut page = read(&conn, Some(0)).unwrap();
        let mut ids = std::collections::BTreeSet::new();
        loop {
            for event in page["events"].as_array().unwrap() {
                ids.insert(event["id"].as_str().unwrap().to_owned());
            }
            if page["hasMore"] != true {
                break;
            }
            page = read(&conn, page["cursor"].as_i64()).unwrap();
        }
        assert_eq!(ids, (1..=501).map(|i| i.to_string()).collect());
        conn.execute_batch("UPDATE data_change_log SET action=NULL WHERE seq=501")
            .unwrap();
        assert_eq!(read(&conn, Some(500)).unwrap()["reset"], true);
        conn.execute_batch("UPDATE data_change_state SET retention=1;INSERT INTO calendar(id,title,color,create_time,update_time) VALUES(502,'新','blue',1,1)").unwrap();
        let reset = read(&conn, Some(0)).unwrap();
        assert_eq!(reset["reset"], true);
        assert_eq!(reset["events"], json!([]));
    }
}
