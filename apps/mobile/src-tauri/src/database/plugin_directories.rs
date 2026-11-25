use super::{
    plugin_create_receipts as receipts, plugin_schedule_data as data,
    plugin_task_snapshots as snapshots,
};
use rusqlite::{Connection, TransactionBehavior};
use serde_json::{json, Value};

fn fields(entity: &str, input: &Value, create: bool) -> Result<Value, String> {
    let input = input.as_object().ok_or("目录字段必须是对象")?;
    let mut result = json!({});
    for (key, value) in input {
        match key.as_str() {
            "title" => {
                let text = value
                    .as_str()
                    .filter(|s| {
                        !s.trim().is_empty()
                            && !s
                                .chars()
                                .any(|c| c.is_control() || c == '\u{2028}' || c == '\u{2029}')
                    })
                    .ok_or("目录名称无效")?;
                result[key] = json!(text);
            }
            "color" => {
                let colors: Value = serde_json::from_str(include_str!(
                    "../../../../../packages/shared/src/task-assistant/directory-colors.json"
                ))
                .map_err(|e| e.to_string())?;
                let clear = entity == "todo-list" && value.is_null();
                let known = value.as_str().is_some_and(|s| colors.get(s).is_some());
                if !(clear || known) {
                    return Err("目录颜色不属于宿主色板".into());
                }
                result[key] = value.clone();
            }
            "visible" if entity == "calendar" => {
                result[key] = json!(value.as_bool().ok_or("可见性无效")?);
            }
            _ => return Err("目录包含不支持的修改字段".into()),
        }
    }
    if create && result["title"].as_str().is_none() {
        return Err("目录名称不能为空".into());
    }
    if result.as_object().is_none_or(|v| v.is_empty()) {
        return Err("目录修改至少包含一个字段".into());
    }
    Ok(result)
}

pub(super) fn write(conn: &mut Connection, plugin: &str, write: &Value) -> Result<Value, String> {
    let entity = write["entity"]
        .as_str()
        .filter(|s| matches!(*s, "todo-list" | "calendar"))
        .ok_or("目录类型无效")?;
    let create = match write["action"].as_str() {
        Some("create") => true,
        Some("update") => false,
        _ => return Err("目录动作无效".into()),
    };
    let input = fields(
        entity,
        if create {
            &write["input"]
        } else {
            &write["patch"]
        },
        create,
    )?;
    let key = write
        .get("requestId")
        .map(|v| {
            v.as_str()
                .filter(|s| !s.trim().is_empty() && s.encode_utf16().count() <= 128)
                .ok_or("创建请求 ID 无效")
        })
        .transpose()?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let mut changed = false;
    let result = if create {
        let hash = write["requestHash"]
            .as_str()
            .map(str::to_owned)
            .unwrap_or_else(|| snapshots::digest(&json!([entity, input])));
        if let Some(saved) = key
            .map(|key| receipts::read(&tx, plugin, key))
            .transpose()?
            .flatten()
        {
            if saved.entity != entity || saved.hash != hash {
                return Err("同一创建请求 ID 不能更换参数或类型".into());
            }
            if !receipts::exists(&tx, &saved)? {
                return Err("原创建结果已删除或撤销，请使用新的创建请求 ID".into());
            }
            data::directory(&tx, entity, saved.id)?
        } else {
            changed = true;
            let (id, created) = if entity == "todo-list" {
                let group = super::todo::create_group_in(
                    &tx,
                    super::todo::CreateTodoGroupPayload {
                        title: input["title"].as_str().ok_or("名称无效")?.into(),
                        color: input["color"].as_str().map(str::to_owned),
                        is_system: Some(false),
                        system_type: None,
                    },
                )?;
                (group.id, group.create_time)
            } else {
                let id = super::calendar::create_calendar_directory(&tx, &input)?;
                (
                    id,
                    super::calendar::get_calendar_directory(&tx, id)?
                        .ok_or("日历不存在")?
                        .created_at,
                )
            };
            if let Some(key) = key {
                receipts::save(
                    &tx,
                    plugin,
                    key,
                    &receipts::Receipt {
                        hash,
                        entity: entity.into(),
                        id,
                        created,
                        operation: uuid::Uuid::new_v4().to_string(),
                        retired: false,
                    },
                )?;
            }
            data::directory(&tx, entity, id)?
        }
    } else {
        let id = write["id"]
            .as_str()
            .and_then(|s| {
                s.parse::<i64>()
                    .ok()
                    .filter(|id| *id > 0 && id.to_string() == s)
            })
            .ok_or("目录身份无效")?;
        let current = data::directory(&tx, entity, id)?;
        if current.is_null() {
            return Err("目录不存在".into());
        }
        if current["revision"] != write["expectedRevision"]
            || !write["expectedRevision"].is_string()
        {
            return Err("PLUGIN_CONFLICT:目录已变化，请重新读取".into());
        }
        if current["editable"] != true {
            return Err("系统目录不可编辑".into());
        }
        if input
            .as_object()
            .ok_or("字段无效")?
            .iter()
            .all(|(key, v)| current.get(key) == Some(v))
        {
            current
        } else {
            changed = true;
            if entity == "todo-list" {
                super::todo::patch_group_directory(&tx, id, &input)?;
            } else {
                super::calendar::patch_calendar_directory(&tx, id, &input)?;
            }
            data::directory(&tx, entity, id)?
        }
    };
    if changed && entity == "todo-list" {
        super::common::write_operation(&tx, "todo", "update", 0, super::common::now_millis())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&conn).unwrap();
        conn
    }
    fn create(conn: &mut Connection, entity: &str, title: &str, key: &str) -> Value {
        write(
            conn,
            "p",
            &json!({"entity":entity,"action":"create","input":{"title":title},"requestId":key}),
        )
        .unwrap()
    }
    fn patch(
        conn: &mut Connection,
        entity: &str,
        current: &Value,
        patch: Value,
    ) -> Result<Value, String> {
        write(
            conn,
            "p",
            &json!({"entity":entity,"action":"update","id":current["id"],"patch":patch,"expectedRevision":current["revision"]}),
        )
    }
    #[test]
    fn shared_field_acceptance_and_rejection_boundaries() {
        let cases: Vec<Value> = serde_json::from_str(include_str!(
            "../../../../../packages/shared/src/utils/__fixtures__/plugin-directory-fields.json"
        ))
        .unwrap();
        for case in cases {
            let result = fields(
                case["entity"].as_str().unwrap(),
                &case["input"],
                case["create"].as_bool().unwrap(),
            );
            if case["reject"] == true {
                assert!(result.is_err(), "{case}");
            } else {
                assert_eq!(result.unwrap(), case["expected"]);
            }
        }
    }
    #[test]
    fn replay_conflicts_and_retired_requests_preserve_directory_identity() {
        let mut conn = db();
        let list = create(&mut conn, "todo-list", "工作", "stable");
        let saved = patch(&mut conn, "todo-list", &list, json!({"title":"新名"})).unwrap();
        assert_eq!(create(&mut conn, "todo-list", "工作", "stable"), saved);
        assert!(write(&mut conn,"p",&json!({"entity":"calendar","action":"create","input":{"title":"工作"},"requestId":"stable"})).is_err());
        assert!(
            patch(&mut conn, "todo-list", &list, json!({"title":"新名"}))
                .unwrap_err()
                .contains("PLUGIN_CONFLICT")
        );
        let before: i64 = conn
            .query_row("SELECT COUNT(*) FROM operation", [], |r| r.get(0))
            .unwrap();
        let log: i64 = conn
            .query_row("SELECT COUNT(*) FROM data_change_log", [], |r| r.get(0))
            .unwrap();
        assert_eq!(
            patch(&mut conn, "todo-list", &saved, json!({"title":"新名"})).unwrap(),
            saved
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM operation", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            before
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM data_change_log", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            log
        );
        conn.execute(
            "DELETE FROM todo_group WHERE id=?1",
            [list["id"].as_str().unwrap()],
        )
        .unwrap();
        assert!(write(&mut conn,"p",&json!({"entity":"todo-list","action":"create","input":{"title":"工作"},"requestId":"stable"})).unwrap_err().contains("已删除"));
        let other=write(&mut conn,"other",&json!({"entity":"todo-list","action":"create","input":{"title":"工作"},"requestId":"stable"})).unwrap();
        assert_ne!(other["id"], list["id"]);
    }
    #[test]
    fn calendar_patch_preserves_hidden_metadata_and_system_ancestry() {
        let mut conn = db();
        let cal = create(&mut conn, "calendar", "日历", "calendar");
        let id = cal["id"].as_str().unwrap();
        conn.execute_batch("INSERT INTO contents(id,create_time,update_time,content) VALUES(100,1,1,'[]'); INSERT INTO calendar_group(id,name,is_system,create_time,update_time) VALUES(100,'用户',0,1,1)").unwrap();
        conn.execute("UPDATE calendar SET description_content_id=100,archived=1,pinned=1,group_id=100,order_index=99 WHERE id=?1",[id]).unwrap();
        let current = data::directory(&conn, "calendar", id.parse().unwrap()).unwrap();
        assert_eq!(current["editable"], true);
        assert_eq!(current["writable"], false);
        let saved = patch(
            &mut conn,
            "calendar",
            &current,
            json!({"title":"新日历","color":"red","visible":false}),
        )
        .unwrap();
        assert_eq!(saved["visible"], false);
        assert_eq!(saved["writable"], false);
        let metadata:(i64,i64,i64,i64,i64)=conn.query_row("SELECT description_content_id,archived,pinned,group_id,order_index FROM calendar WHERE id=?1",[id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).unwrap();
        assert_eq!(metadata, (100, 1, 1, 100, 99));
        assert_eq!(conn.query_row("SELECT COUNT(*) FROM operation WHERE operation_content_type='calendar' AND operation_id=0",[],|r|r.get::<_,i64>(0)).unwrap(),0);
        conn.execute_batch("INSERT INTO calendar_group(id,name,is_system,create_time,update_time) VALUES(1,'系统',1,1,1);INSERT INTO calendar_group(id,name,parent_group_id,create_time,update_time) VALUES(2,'子',1,1,1),(3,'孙',2,1,1)").unwrap();
        conn.execute("UPDATE calendar SET group_id=3 WHERE id=?1", [id])
            .unwrap();
        let system = data::directory(&conn, "calendar", id.parse().unwrap()).unwrap();
        assert_eq!(system["editable"], false);
        assert!(patch(&mut conn, "calendar", &system, json!({"title":"系统改名"})).is_err());
    }
    #[test]
    fn list_rename_preserves_old_tokens_and_explicit_binding_after_name_reuse() {
        let mut conn = db();
        let list = create(&mut conn, "todo-list", "工作", "list");
        let id: i64 = list["id"].as_str().unwrap().parse().unwrap();
        let created: i64 = conn
            .query_row(
                "SELECT create_time FROM todo_group WHERE id=?1",
                [id],
                |r| r.get(0),
            )
            .unwrap();
        let node = json!({"taskGroup":{"id":id,"createdAt":created,"token":"#工作"},"children":[{"children":[{"text":"原文 #工作"}]}]});
        let renamed = patch(
            &mut conn,
            "todo-list",
            &list,
            json!({"title":"工作新名","color":"red"}),
        )
        .unwrap();
        assert_eq!(
            super::super::document_task_header::group_id(&conn, &json!({}), Some("#工作")).unwrap(),
            Some(id)
        );
        create(&mut conn, "todo-list", "工作", "reused-name");
        assert_eq!(
            super::super::document_task_header::group_id(&conn, &node, Some("#工作")).unwrap(),
            Some(id)
        );
        let cleared = patch(&mut conn, "todo-list", &renamed, json!({"color":null})).unwrap();
        assert!(cleared["color"].is_null());
        conn.execute("UPDATE todo_group SET is_system=1 WHERE id=?1", [id])
            .unwrap();
        let system = data::directory(&conn, "todo-list", id).unwrap();
        assert_eq!(system["writable"], true);
        assert_eq!(system["editable"], false);
        assert!(patch(&mut conn, "todo-list", &system, json!({"title":"系统改名"})).is_err());
    }
    #[test]
    fn failed_receipt_rolls_back_directory_and_change_log() {
        let mut conn = db();
        conn.execute_batch("CREATE TRIGGER injected_receipt BEFORE INSERT ON plugin_create_receipts BEGIN SELECT RAISE(ABORT,'injected'); END").unwrap();
        let before: i64 = conn
            .query_row("SELECT COUNT(*) FROM data_change_log", [], |r| r.get(0))
            .unwrap();
        assert!(write(&mut conn,"p",&json!({"entity":"calendar","action":"create","input":{"title":"失败"},"requestId":"stable"})).is_err());
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM calendar", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM plugin_create_receipts", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM data_change_log", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            before
        );
    }
}
