pub(crate) mod assets;
pub(crate) mod database;
mod recovery;
pub(crate) mod transport;

use rusqlite::OptionalExtension;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn device_sync_store(
    app: AppHandle,
    name: String,
    action: String,
    payload: Value,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || store(app, name, action, payload))
        .await
        .map_err(|error| format!("DEVICE_SYNC_WORKER: {error}"))?
}
fn store(app: AppHandle, name: String, action: String, payload: Value) -> Result<Value, String> {
    if action == "adopt" {
        let peer = transport::peer(&app)?;
        if peer.database != name {
            return Err("DEVICE_SYNC_LIBRARY: 配对目标不同".into());
        }
        let file_existed = crate::setting::resolve_database_path(&app, &name)?.exists();
        let mut conn = crate::database::open_database_by_name(&app, &name)?;
        if let Some(mut existing) = database::state(&conn)? {
            if existing["schema"] != payload["state"]["schema"] {
                return Err("DEVICE_SYNC_SCHEMA: 两端数据库结构不同，请先更新软件".into());
            }
            if existing["library"].as_str() != Some(peer.library.as_str())
                || existing["epoch"] != payload["state"]["epoch"]
            {
                return Err(
                    "DEVICE_SYNC_EPOCH: 配对基线已变化，本机完整资料库仍保留，请先检查保留的副本"
                        .into(),
                );
            }
            existing["node"] = json!(peer.node);
            conn.execute(
                "UPDATE _tau_device_state SET payload=?1 WHERE id=1",
                [existing.to_string()],
            )
            .map_err(|error| error.to_string())?;
            drop(conn);
            crate::database::set_active_database(app.clone(), name.clone())?;
            let _ = app.emit("device-sync-changed", &name);
            return Ok(json!({"ok":true,"existing":true}));
        }
        if file_existed {
            return Err(
                "DEVICE_SYNC_LIBRARY: 本机目标文件未登记同步，原文件已保留，请重新生成配对副本"
                    .into(),
            );
        }
        let state = &payload["state"];
        if state["library"].as_str() != Some(peer.library.as_str())
            || state["node"].as_str() != Some(peer.node.as_str())
        {
            return Err("DEVICE_SYNC_IDENTITY: 配对身份不同".into());
        }
        let schema = conn
            .query_row(
                "SELECT value FROM schema_meta WHERE key='main_schema_hash'",
                [],
                |row| row.get::<_, String>(0),
            )
            .map_err(|error| error.to_string())?;
        if state["schema"].as_str() != Some(schema.as_str()) {
            return Err("DEVICE_SYNC_SCHEMA: 请更新两端软件后重新配对".into());
        }
        conn.execute(
            "INSERT INTO _tau_device_state(id,payload) VALUES (1,?1)",
            [state.to_string()],
        )
        .map_err(|error| error.to_string())?;
        if let Err(error) = database::commit(
            &mut conn,
            &payload,
            crate::database::install_device_sync_projection,
        ) {
            let _ = conn.execute("DELETE FROM _tau_device_state", []);
            return Err(error);
        }
        database::initialize(&conn)?;
        drop(conn);
        crate::database::set_active_database(app.clone(), name.clone())?;
        let _ = app.emit("device-sync-changed", &name);
        return Ok(json!({"ok":true}));
    }
    let _maintenance = if action == "commit"
        && (payload
            .get("snapshot")
            .is_some_and(|value| !value.is_null())
            || payload["changes"]
                .as_array()
                .is_some_and(|values| !values.is_empty()))
    {
        Some(crate::ai::lifecycle::maintenance(&name)?)
    } else {
        None
    };
    if action == "commit"
        && payload
            .get("snapshot")
            .is_some_and(|value| !value.is_null())
    {
        let result = crate::plugin_transport::replace_database(&name, || {
            let result = store_active(&app, &name, &action, &payload)?;
            if payload["replaceLocal"].as_bool() == Some(true) {
                let _cache = crate::collaboration::CACHE_WRITE_LOCK
                    .lock()
                    .map_err(|_| "缓存保存锁不可用")?;
                crate::collaboration::release_library_sessions(
                    &crate::collaboration::session_store(&app)?,
                    &name,
                    payload["state"]["library"].as_str(),
                )?;
            }
            Ok(result)
        });
        let _ = app.emit("plugin-workspace-reset", &name);
        if result.is_ok() {
            crate::ai::lifecycle::invalidate_database(&name);
        }
        result
    } else {
        store_active(&app, &name, &action, &payload)
    }
}
fn store_active(
    app: &AppHandle,
    name: &str,
    action: &str,
    payload: &Value,
) -> Result<Value, String> {
    let mut conn = crate::database::open_active_database(&app)?;
    if conn.database_name() != name {
        return Err("DEVICE_SYNC_LIBRARY: 资料库已切换".into());
    }
    if action == "generation" {
        return database::generation(&conn).map(Value::String);
    }
    if action == "replacement-base" {
        database::initialize(&conn)?;
        let peer = transport::peer(app)?;
        if peer.database != name
            || payload["remote"]["library"].as_str() != Some(peer.library.as_str())
        {
            return Err("DEVICE_SYNC_IDENTITY: 覆盖来源不同".into());
        }
        if database::state(&conn)?.is_none() {
            recovery::restore(
                &conn,
                &payload["remote"],
                &peer.node,
                &peer.library,
                payload["sourceSequence"].as_i64(),
            )?;
        }
        let state = database::state(&conn)?.ok_or("资料库尚未登记")?;
        if state["library"] != payload["remote"]["library"]
            || state["schema"] != payload["remote"]["schema"]
        {
            return Err("DEVICE_SYNC_SCHEMA: 覆盖来源或结构不同".into());
        }
        let floor = payload["sourceSequence"]
            .as_i64()
            .filter(|n| *n >= 0)
            .unwrap_or(0);
        let changed = conn
            .execute(
                "UPDATE sqlite_sequence SET seq=max(seq,?1) WHERE name='_tau_device_log'",
                [floor],
            )
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            conn.execute(
                "INSERT INTO sqlite_sequence(name,seq) VALUES('_tau_device_log',?1)",
                [floor],
            )
            .map_err(|e| e.to_string())?;
        }
        return database::replacement_base(&conn);
    }
    if let Err(error) = recovery::check(&conn) {
        if !recovery::damaged(&error) {
            return Err(error);
        }
        recovery::recover(&conn, None)?;
    }
    database::compact_projection(&conn)?;
    match action {
        "restore-state" => {
            if let Some(existing) = database::state(&conn)? {
                return Ok(existing);
            }
            let peer = transport::peer(app)?;
            if peer.database != name {
                return Err("DEVICE_SYNC_LIBRARY: 恢复目标不符".into());
            }
            recovery::restore(
                &conn,
                &payload["state"],
                &peer.node,
                &peer.library,
                payload["sourceSequence"].as_i64(),
            )
        }
        "recover" => {
            recovery::recover(&conn, payload["contentId"].as_i64())?;
            Ok(json!({"ok":true}))
        }
        "documents" => {
            let ids = payload["ids"]
                .as_array()
                .filter(|ids| ids.len() <= 1000)
                .ok_or("DEVICE_SYNC_CONTENT: 正文列表无效")?;
            let mut entries = Vec::new();
            for id in ids {
                let id = id.as_i64().ok_or("DEVICE_SYNC_CONTENT: 正文编号无效")?;
                if let Some(mut entry) = database::document(&conn, id)? {
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
        "intents" => {
            let rows=conn.prepare("SELECT content_id,base_entry,target_content,target_contracts,token FROM _tau_device_json_intents ORDER BY content_id").map_err(|error|error.to_string())?.query_map([],|row|Ok(json!({"contentId":row.get::<_,i64>(0)?,"base":serde_json::from_str::<Value>(&row.get::<_,String>(1)?).unwrap_or(Value::Null),"content":serde_json::from_str::<Value>(&row.get::<_,String>(2)?).unwrap_or(Value::Null),"contracts":serde_json::from_str::<Value>(&row.get::<_,String>(3)?).unwrap_or(Value::Null),"token":row.get::<_,String>(4)?}))).map_err(|error|error.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|error|error.to_string())?;
            Ok(json!(rows))
        }
        "assets" => {
            let values = conn
                .prepare("SELECT paths FROM _tau_device_documents UNION ALL SELECT json_extract(payload,'$.paths') AS paths FROM _tau_device_note_copies UNION ALL SELECT json_extract(document.value,'$.paths') AS paths FROM _tau_device_branches,json_each(payload,'$.documents') AS document")
                .map_err(|error| error.to_string())?
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|error| error.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())?;
            let mut names = std::collections::BTreeSet::new();
            for raw in values {
                let paths: Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
                if let Some(paths) = paths.as_object() {
                    for value in paths.values() {
                        if let Some(name) = value.as_str().and_then(|value| {
                            value.strip_prefix("~/.editor/resources/device-sync/")
                        }) {
                            names.insert(name.to_string());
                        }
                    }
                }
            }
            Ok(json!(names))
        }
        "status" => Ok(
            json!({"state":database::state(&conn)?,"paired":transport::peer(&app).ok().filter(|peer|peer.database==name).map(|peer|json!({"database":peer.database,"library":peer.library})),"noteCopies":conn.query_row("SELECT count(*) FROM _tau_device_note_copies",[],|row|row.get::<_,i64>(0)).map_err(|error|error.to_string())?,"branches":conn.query_row("SELECT count(*) FROM _tau_device_branches",[],|row|row.get::<_,i64>(0)).map_err(|error|error.to_string())?}),
        ),
        "read" => database::read(&conn, payload["snapshot"].as_bool().unwrap_or(false)),
        "commit" => {
            database::commit(
                &mut conn,
                &payload,
                crate::database::install_device_sync_projection,
            )?;
            drop(conn);
            let _ = app.emit("device-sync-changed", &name);
            Ok(json!({"ok":true}))
        }
        "document" => {
            if database::state(&conn)?.is_none() {
                return Ok(Value::Null);
            }
            database::document(
                &conn,
                payload["contentId"]
                    .as_i64()
                    .ok_or("DEVICE_SYNC_CONTENT: 编号无效")?,
            )
            .map(|entry| entry.unwrap_or(Value::Null))
        }
        "missing" => {
            if database::state(&conn)?.is_none() {
                return Ok(json!([]));
            }
            let rows=conn.prepare("SELECT c.id,c.content,d.document_id,d.contracts,d.revision FROM contents c JOIN content_documents d ON d.content_id=c.id LEFT JOIN _tau_device_documents s ON s.content_id=c.id WHERE s.content_id IS NULL ORDER BY c.id LIMIT 100").map_err(|error|error.to_string())?.query_map([],|row|Ok(json!({"contentId":row.get::<_,i64>(0)?,"content":serde_json::from_str::<Value>(&row.get::<_,String>(1)?).unwrap_or(Value::Null),"documentId":row.get::<_,String>(2)?,"contracts":serde_json::from_str::<Value>(&row.get::<_,String>(3)?).unwrap_or(Value::Null),"revision":row.get::<_,String>(4)?}))).map_err(|error|error.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|error|error.to_string())?;
            Ok(json!(rows))
        }
        "save-document" => save_document(&mut conn, &payload),
        _ => Err("DEVICE_SYNC_REQUEST: 未知存储操作".into()),
    }
}

pub(crate) fn save_document(
    conn: &mut rusqlite::Connection,
    payload: &Value,
) -> Result<Value, String> {
    if payload["expectedGeneration"].as_str().unwrap_or("") != database::generation(conn)? {
        return Err("DEVICE_SYNC_REPLACED: 本机资料库已重新下载".into());
    }
    if database::state(&conn)?.is_none() {
        return Err("DEVICE_SYNC_DISABLED: 资料库未配对".into());
    }
    let entry = &payload["document"];
    let id = entry["contentId"]
        .as_i64()
        .ok_or("DEVICE_SYNC_CONTENT: 编号无效")?;
    let mut state = entry.clone();
    state
        .as_object_mut()
        .ok_or("DEVICE_SYNC_CONTENT: 状态无效")?
        .remove("projection");
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let original = database::document(&tx, id)?;
    if let Some(expected) = payload["expectedDocumentId"].as_str() {
        let current = tx
            .query_row(
                "SELECT document_id FROM content_documents WHERE content_id=?1",
                [id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        if current.as_deref() != Some(expected) {
            return Err("CONTENT_REVISION_CONFLICT: 正文身份已变化".into());
        }
    }
    if let Some(expected) = payload["expectedSourceId"].as_str() {
        let current = tx
            .query_row(
                "SELECT source_id FROM library_identity WHERE id=1",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        if current.as_deref() != Some(expected) {
            return Err("CONTENT_SOURCE_CONFLICT: 资料库来源已变化".into());
        }
    }
    let intent = tx
        .query_row(
            "SELECT token FROM _tau_device_json_intents WHERE content_id=?1",
            [id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if intent.as_deref() != payload.get("intentToken").and_then(Value::as_str) {
        return Err("DEVICE_SYNC_RETRY: 正文业务修改尚待转换或已变化".into());
    }
    if original.as_ref() == Some(&state) {
        tx.commit().map_err(|error| error.to_string())?;
        return Ok(json!({"ok":true}));
    }
    if original.as_ref().map(|entry| &entry["state"])
        != payload
            .get("expectedState")
            .filter(|value| !value.is_null())
    {
        return Err("DEVICE_SYNC_RETRY: 正文在保存期间变化".into());
    }
    if let Some(expected) = payload["expectedRevision"].as_str() {
        let revision = tx
            .query_row(
                "SELECT revision FROM content_documents WHERE content_id=?1",
                [id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        if revision.as_deref() != Some(expected) {
            return Err("DEVICE_SYNC_RETRY: 正文修订已变化".into());
        }
    }
    database::write_document(&tx, &state)?;
    tx.execute("UPDATE _tau_device_state SET applying=2 WHERE id=1", [])
        .map_err(|error| error.to_string())?;
    crate::database::project_device_sync_document(&tx, entry, original.is_some())?;
    if let Some(token) = intent {
        tx.execute(
            "DELETE FROM _tau_device_json_intents WHERE content_id=?1 AND token=?2",
            rusqlite::params![id, token],
        )
        .map_err(|error| error.to_string())?;
    }
    tx.execute("UPDATE _tau_device_state SET applying=0 WHERE id=1", [])
        .map_err(|error| error.to_string())?;
    database::compact_projection(&tx)?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(json!({"ok":true}))
}

#[cfg(feature = "device-sync-spike")]
pub mod spike;
