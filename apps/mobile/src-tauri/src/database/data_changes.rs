use super::plugin_data::sql_error;
use rusqlite::{params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension};
use serde_json::{json, Value};

fn position(request: &Value, key: &str) -> Result<i64, String> {
    request[key]
        .as_i64()
        .filter(|v| *v >= 0 && *v <= 9_007_199_254_740_991)
        .ok_or_else(|| format!("变更分页 {key} 无效"))
}
fn source(domain: &str) -> Result<&'static str, String> {
    match domain {
        "todo" => Ok(
            "SELECT 'todo' AS domain,id AS key,'todo:'||id||':'||create_time AS id FROM todo_item",
        ),
        "todo-list" => {
            Ok("SELECT 'todo-list' AS domain,id AS key,CAST(id AS TEXT) AS id FROM todo_group")
        }
        "event" => {
            Ok("SELECT 'event' AS domain,id AS key,id||':'||create_time AS id FROM calendar_event")
        }
        "calendar" => {
            Ok("SELECT 'calendar' AS domain,id AS key,CAST(id AS TEXT) AS id FROM calendar")
        }
        _ => Err("业务变更范围无效".into()),
    }
}
pub(super) fn read(conn: &mut Connection, request: &Value, scope: &str) -> Result<Value, String> {
    let phase = request["phase"].as_str().ok_or("读取阶段无效")?;
    if !["snapshot", "changes"].contains(&phase) {
        return Err("读取阶段无效".into());
    }
    let mut domains = request["domains"]
        .as_array()
        .filter(|d| !d.is_empty() && d.len() <= 4)
        .ok_or("业务变更范围无效")?
        .iter()
        .map(|domain| domain.as_str().ok_or("业务变更范围无效"))
        .collect::<Result<Vec<_>, _>>()?;
    domains.sort_unstable();
    domains.dedup();
    for domain in &domains {
        source(domain)?;
    }
    let after_key = position(request, "afterKey")?;
    let after_seq = position(request, "afterSeq")?;
    let limit = position(request, "limit")?;
    if !(1..=100).contains(&limit) {
        return Err("每页须为 1–100 条".into());
    }
    let todo_source = request["todoSource"].as_str().unwrap_or("todo");
    if !["todo", "document", "all"].contains(&todo_source) {
        return Err("待办来源无效".into());
    }
    let tx = conn.transaction().map_err(sql_error)?;
    let scope = if todo_source != "todo" && domains.contains(&"todo") {
        json!([scope, super::document_task_identities::require_ready(&tx)?]).to_string()
    } else {
        scope.to_owned()
    };
    let state: Option<(i64, i64, i64)> = tx
        .query_row(
            "SELECT protocol_version,pruned_through,retention FROM data_change_state WHERE id='main'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(sql_error)?;
    let (protocol, old_floor, retention) = state.ok_or("业务变更状态缺失")?;
    let head: i64 = tx
        .query_row(
            "SELECT MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name='data_change_log'),0),COALESCE((SELECT MAX(seq) FROM data_change_log),0))",
            [],
            |row| row.get(0),
        )
        .map_err(sql_error)?;
    let oldest: Option<i64> = tx
        .query_row("SELECT MIN(seq) FROM data_change_log", [], |row| row.get(0))
        .map_err(sql_error)?;
    let floor = old_floor
        .max(head - retention)
        .max(oldest.map_or(head, |seq| seq - 1));
    if floor > old_floor {
        tx.execute("DELETE FROM data_change_log WHERE seq<=?1", [floor])
            .map_err(sql_error)?;
        tx.execute(
            "UPDATE data_change_state SET pruned_through=?1 WHERE id='main'",
            [floor],
        )
        .map_err(sql_error)?;
    }
    let through = if request.get("through").is_some() {
        position(request, "through")?
    } else {
        head
    };
    let mut items = vec![];
    if phase == "snapshot" {
        let after_domain = request["afterDomain"].as_str().ok_or("目录分页位置无效")?;
        for domain in &domains {
            if *domain < after_domain || items.len() > limit as usize {
                continue;
            }
            if *domain == "todo" && todo_source != "todo" {
                let after = if *domain == after_domain {
                    after_key
                } else {
                    0
                };
                let size = limit + 1 - items.len() as i64;
                let mut candidates = vec![];
                let mut stmt=tx.prepare("SELECT content_id,content_created_at,task_id,id FROM document_task_visible_identities WHERE id>?1 ORDER BY id LIMIT ?2").map_err(sql_error)?;
                for row in stmt
                    .query_map(
                        params![
                            if todo_source == "all" {
                                (after - 1) / 2
                            } else {
                                after
                            },
                            size
                        ],
                        |r| {
                            Ok((
                                r.get::<_, i64>(0)?,
                                r.get::<_, i64>(1)?,
                                r.get::<_, String>(2)?,
                                r.get::<_, i64>(3)?,
                            ))
                        },
                    )
                    .map_err(sql_error)?
                {
                    let (content, created, task, key) = row.map_err(sql_error)?;
                    candidates.push(json!({"domain":"todo","id":super::plugin_tasks::document_key(content,created,&task),"key":if todo_source=="all"{key*2+1}else{key},"operation":"upsert"}));
                }
                if todo_source == "all" {
                    let mut stmt = tx
                        .prepare(
                            "SELECT id,create_time FROM todo_item WHERE id>?1 ORDER BY id LIMIT ?2",
                        )
                        .map_err(sql_error)?;
                    for row in stmt
                        .query_map(params![after / 2, size], |r| {
                            Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))
                        })
                        .map_err(sql_error)?
                    {
                        let (id, created) = row.map_err(sql_error)?;
                        candidates.push(json!({"domain":"todo","id":format!("todo:{id}:{created}"),"key":id*2,"operation":"upsert"}));
                    }
                }
                candidates.retain(|v| v["key"].as_i64().is_some_and(|key| key > after));
                candidates.sort_by_key(|v| v["key"].as_i64().unwrap_or(0));
                items.extend(candidates.into_iter().take(size as usize));
                continue;
            }
            let mut statement = tx
                .prepare(&format!(
                    "SELECT domain,id,key FROM ({}) WHERE key>?1 ORDER BY key LIMIT ?2",
                    source(domain)?
                ))
                .map_err(sql_error)?;
            let rows=statement.query_map(params![if *domain==after_domain {after_key} else {0},limit+1-items.len() as i64],|row|Ok(json!({"domain":row.get::<_,String>(0)?,"id":row.get::<_,String>(1)?,"key":row.get::<_,i64>(2)?,"operation":"upsert"}))).map_err(sql_error)?.collect::<Result<Vec<_>,_>>().map_err(sql_error)?;
            items.extend(rows);
        }
    } else {
        let mut values = vec![SqlValue::Integer(after_seq), SqlValue::Integer(through)];
        values.extend(
            domains
                .iter()
                .map(|domain| SqlValue::Text((*domain).to_owned())),
        );
        for _ in 0..3 {
            values.push(SqlValue::Text(todo_source.to_owned()));
        }
        values.push(SqlValue::Integer(limit + 1));
        let mut statement=tx.prepare(&format!("SELECT domain,entity_id,operation,seq FROM data_change_log WHERE seq>? AND seq<=? AND domain IN ({}) AND (domain<>'todo' OR ?='all' OR (?='document' AND entity_id LIKE 'document:%') OR (?='todo' AND entity_id LIKE 'todo:%')) ORDER BY seq LIMIT ?",vec!["?";domains.len()].join(","))).map_err(sql_error)?;
        items.extend(statement.query_map(params_from_iter(values),|row|Ok(json!({"domain":row.get::<_,String>(0)?,"id":row.get::<_,String>(1)?,"operation":row.get::<_,String>(2)?,"seq":row.get::<_,i64>(3)?}))).map_err(sql_error)?.collect::<Result<Vec<_>,_>>().map_err(sql_error)?);
    }
    let more = items.len() > limit as usize;
    items.truncate(limit as usize);
    tx.commit().map_err(sql_error)?;
    Ok(
        json!({"scope":scope,"todoSource":todo_source,"protocol":protocol,"head":head,"floor":floor,"through":through,"items":items,"hasMore":more}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn database() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&db).unwrap();
        db.execute(
            "INSERT INTO todo_group(id,title,create_time,update_time) VALUES(1,'工作',1,1)",
            [],
        )
        .unwrap();
        db
    }
    fn query(phase: &str, after: i64) -> Value {
        json!({"phase":phase,"domains":["todo"],"afterDomain":"","afterKey":0,"afterSeq":after,"limit":100})
    }
    #[test]
    fn transactions_preserve_deletion_identity_and_rollback_leaves_no_changes() {
        let mut db = database();
        let initial = read(&mut db, &query("snapshot", 0), "scope").unwrap();
        let through = initial["head"].as_i64().unwrap();
        let tx = db.transaction().unwrap();
        tx.execute(
            "INSERT INTO todo_item(group_id,title,create_time,update_time) VALUES(1,'回滚',10,10)",
            [],
        )
        .unwrap();
        tx.rollback().unwrap();
        assert!(
            read(&mut db, &query("changes", through), "scope").unwrap()["items"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        db.execute(
            "INSERT INTO todo_item(group_id,title,create_time,update_time) VALUES(1,'待办',10,10)",
            [],
        )
        .unwrap();
        let id = db.last_insert_rowid();
        db.execute("DELETE FROM todo_item WHERE id=?1", [id])
            .unwrap();
        let page = read(&mut db, &query("changes", through), "scope").unwrap();
        assert!(page["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["id"] == format!("todo:{id}:10") && row["operation"] == "delete"));
    }
    #[test]
    fn pruning_persists_a_floor_without_changing_the_high_watermark() {
        let mut db = database();
        db.execute(
            "UPDATE data_change_state SET retention=2 WHERE id='main'",
            [],
        )
        .unwrap();
        for title in ["一", "二", "三", "四"] {
            db.execute(
                "INSERT INTO todo_item(group_id,title,create_time,update_time) VALUES(1,?1,10,10)",
                [title],
            )
            .unwrap();
        }
        let page = read(&mut db, &query("changes", 0), "scope").unwrap();
        assert!(page["floor"].as_i64().unwrap() > 0);
        let again = read(
            &mut db,
            &query("changes", page["head"].as_i64().unwrap()),
            "scope",
        )
        .unwrap();
        assert_eq!(again["head"], page["head"]);
        assert_eq!(again["floor"], page["floor"]);
        assert!(again["items"].as_array().unwrap().is_empty());
        super::super::migrator::ensure_main_schema(&db).unwrap();
        let reopened = read(
            &mut db,
            &query("changes", page["head"].as_i64().unwrap()),
            "scope",
        )
        .unwrap();
        assert_eq!(reopened["head"], page["head"]);
        assert_eq!(reopened["floor"], page["floor"]);
    }
    #[test]
    fn document_identity_feed_survives_storage_switches_and_refuses_corruption() {
        let mut db = database();
        let body = json!([{"type":"check-list","children":[{"type":"check-list-item","taskId":"one","children":[{"type":"paragraph","children":[{"text":"原任务"}]}]}]}]);
        db.execute("INSERT INTO contents(id,create_time,update_time,content,ref_count) VALUES(50,10,10,?1,1)",[body.to_string()]).unwrap();
        db.execute(
            "INSERT INTO cards(content_id,create_time,update_time) VALUES(50,10,10)",
            [],
        )
        .unwrap();
        let mut request = query("snapshot", 0);
        request["todoSource"] = json!("document");
        let first = read(&mut db, &request, "scope").unwrap();
        assert_eq!(first["items"][0]["id"], "document:50:10:one");
        let head = first["head"].as_i64().unwrap();
        db.execute("INSERT INTO doc_task_settings(content_id,task_id,kind,create_time) VALUES(50,'','excluded',1)",[]).unwrap();
        request = query("changes", head);
        request["todoSource"] = json!("document");
        let hidden = read(&mut db, &request, "scope").unwrap();
        assert_eq!(hidden["items"][0]["operation"], "delete");
        db.execute("DELETE FROM doc_task_settings", []).unwrap();
        let tx = db.transaction().unwrap();
        tx.execute("INSERT INTO content_document_blocks(content_id,block_id,position,content,count) VALUES(50,'block',0,?1,0)",[body[0].to_string()]).unwrap();
        tx.execute("UPDATE contents SET content=NULL WHERE id=50", [])
            .unwrap();
        tx.commit().unwrap();
        request = query("snapshot", 0);
        request["todoSource"] = json!("document");
        assert_eq!(
            read(&mut db, &request, "scope").unwrap()["items"][0]["id"],
            "document:50:10:one"
        );
        let mut invalid = body[0].clone();
        let duplicate = invalid["children"][0].clone();
        invalid["children"].as_array_mut().unwrap().push(duplicate);
        db.execute(
            "UPDATE content_document_blocks SET content=?1 WHERE content_id=50",
            [invalid.to_string()],
        )
        .unwrap();
        assert!(read(&mut db, &request, "scope").is_err());
        db.execute(
            "UPDATE contents SET content=?1 WHERE id=50",
            [body.to_string()],
        )
        .unwrap();
        assert_eq!(
            read(&mut db, &request, "scope").unwrap()["items"][0]["id"],
            "document:50:10:one"
        );
    }
}
