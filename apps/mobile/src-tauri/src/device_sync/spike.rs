use rusqlite::Connection;
use serde_json::{json, Value};

pub async fn run(path: &str, action: &str, payload: Value) -> Result<Value, String> {
    if action.starts_with("asset-") {
        let root = std::path::Path::new(path);
        let directory = root.join("resources/device-sync");
        std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        return super::assets::operate(
            &directory,
            root,
            action.strip_prefix("asset-").unwrap(),
            payload,
        );
    }
    if action == "request" {
        let addresses = payload["addresses"]
            .as_array()
            .ok_or("地址缺失")?
            .iter()
            .map(|value| value.as_str().unwrap().to_string())
            .collect::<Vec<_>>();
        return super::transport::request(
            &addresses,
            payload["port"].as_u64().unwrap() as u16,
            payload["certificate"].as_str().unwrap(),
            payload["token"].as_str(),
            &payload["body"],
        )
        .await;
    }
    let mut conn = Connection::open(path).map_err(|error| error.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL")
        .map_err(|error| error.to_string())?;
    if action == "init" {
        conn.execute_batch(include_str!(
            "../../../../../packages/db-schema/schema/main.sql"
        ))
        .map_err(|error| error.to_string())?;
        super::database::initialize(&conn)?;
        conn.execute(
            "INSERT INTO _tau_device_state(id,payload) VALUES(1,?1)",
            [payload.to_string()],
        )
        .map_err(|error| error.to_string())?;
        super::database::initialize(&conn)?;
        return Ok(json!({"ok":true}));
    }
    match action {
        "cache-reset" => {
            crate::collaboration::release_library_sessions(
                &conn,
                payload["database"].as_str().ok_or("库名缺失")?,
                payload["workspace"].as_str(),
            )?;
            Ok(json!({"ok":true}))
        }
        "generation" => super::database::generation(&conn).map(Value::String),
        "replacement-base" => super::database::replacement_base(&conn),
        "restore-state" => super::recovery::restore(
            &conn,
            &payload["state"],
            payload["node"].as_str().ok_or("设备编号缺失")?,
            payload["library"].as_str().ok_or("资料库编号缺失")?,
            payload["sourceSequence"].as_i64(),
        ),
        "recover" => {
            super::recovery::recover(&conn, payload["contentId"].as_i64())?;
            Ok(json!({"ok":true}))
        }
        "open" => {
            super::database::initialize(&conn)?;
            Ok(json!({"ok":true}))
        }
        "documents" => {
            let mut entries = Vec::new();
            for id in payload["ids"].as_array().ok_or("正文列表缺失")? {
                let id = id.as_i64().unwrap();
                if let Some(mut entry) = super::database::document(&conn, id)? {
                    if !conn
                        .prepare("SELECT 1 FROM contents WHERE id=?1 AND coalesce(ref_count,0)>0")
                        .map_err(|error| error.to_string())?
                        .exists([id])
                        .map_err(|error| error.to_string())?
                    {
                        entry["deleted"] = json!(true);
                    }
                    entries.push(entry);
                }
            }
            Ok(json!(entries))
        }
        "read" => super::database::read(&conn, payload["snapshot"].as_bool().unwrap_or(false)),
        "commit" => {
            super::database::commit(
                &mut conn,
                &payload,
                crate::database::install_device_sync_projection,
            )?;
            Ok(json!({"ok":true}))
        }
        "commit-crash" => {
            super::database::commit(&mut conn, &payload, |tx, document| {
                crate::database::install_device_sync_projection(tx, document)?;
                if payload["crashPoint"] == "before" {
                    std::process::exit(86);
                }
                Ok(())
            })?;
            std::process::exit(87);
        }
        "save" => super::save_document(&mut conn, &payload),
        "sql" => {
            conn.execute_batch(payload["sql"].as_str().ok_or("SQL 缺失")?)
                .map_err(|error| error.to_string())?;
            Ok(json!({"ok":true}))
        }
        "query" => {
            let mut statement = conn
                .prepare(payload["sql"].as_str().ok_or("SQL 缺失")?)
                .map_err(|error| error.to_string())?;
            let rows = statement
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|error| error.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())?;
            Ok(json!(rows))
        }
        _ => Err("未知验证命令".into()),
    }
}
