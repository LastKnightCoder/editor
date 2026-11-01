use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Value};

fn quote(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}
pub(super) fn damaged(error: &str) -> bool {
    let lower = error.to_lowercase();
    ![
        "database is locked",
        "database table is locked",
        "disk is full",
        "readonly database",
        "disk i/o error",
        "out of memory",
    ]
    .iter()
    .any(|text| lower.contains(text))
}
pub(super) fn valid_state(value: &Value) -> bool {
    [
        "library",
        "schema",
        "node",
        "authority",
        "epoch",
        "head",
        "ackHead",
    ]
    .iter()
    .all(|key| value[key].is_string())
        && ["ackSeq", "revision"].iter().all(|key| {
            value[key]
                .as_u64()
                .is_some_and(|n| n <= 9_007_199_254_740_991)
        })
        && value["enabled"].is_boolean()
}
pub(super) fn restore(
    conn: &Connection,
    header: &Value,
    node: &str,
    library: &str,
    source_sequence: Option<i64>,
) -> Result<Value, String> {
    if conn
        .prepare("SELECT 1 FROM collaboration_bindings LIMIT 1")
        .map_err(|e| e.to_string())?
        .exists([])
        .map_err(|e| e.to_string())?
    {
        return Err("DEVICE_SYNC_SHARED_CONTENT: 请先结束云端共享正文".into());
    }
    if !valid_state(header) || header["library"].as_str() != Some(library) {
        return Err("DEVICE_SYNC_IDENTITY: 恢复来源不符".into());
    }
    let local = conn
        .query_row(
            "SELECT source_id FROM library_identity WHERE id=1",
            [],
            |row| row.get::<_, String>(0),
        )
        .map_err(|e| e.to_string())?;
    let schema = conn
        .query_row(
            "SELECT value FROM schema_meta WHERE key='main_schema_hash'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if local != library
        || schema.is_some_and(|schema| header["schema"].as_str() != Some(schema.as_str()))
    {
        return Err("DEVICE_SYNC_SCHEMA: 本机资料库与恢复来源不符".into());
    }
    let mut state = header.clone();
    state["node"] = json!(node);
    state["head"] = json!(uuid::Uuid::new_v4().to_string());
    state["ackHead"] = json!("");
    state["ackSeq"] = json!(0);
    state["requiresSnapshot"] = json!(true);
    state["recovering"] = json!(true);
    conn.execute(
        "INSERT INTO _tau_device_state(id,payload) VALUES(1,?1)",
        [state.to_string()],
    )
    .map_err(|e| e.to_string())?;
    super::database::install(conn)?;
    let floor = source_sequence
        .filter(|n| (0..9_007_199_254_740_991).contains(n))
        .unwrap_or(0);
    if conn
        .execute(
            "UPDATE sqlite_sequence SET seq=max(seq,?1) WHERE name='_tau_device_log'",
            [floor],
        )
        .map_err(|e| e.to_string())?
        == 0
    {
        conn.execute(
            "INSERT INTO sqlite_sequence(name,seq) VALUES('_tau_device_log',?1)",
            [floor],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "UPDATE _tau_device_anchor SET sequence=max(sequence,?1) WHERE id=1",
        [floor],
    )
    .map_err(|e| e.to_string())?;
    Ok(state)
}
pub(super) fn check(conn: &Connection) -> Result<(), String> {
    super::local_generation::ensure(conn)?;
    let mut statement = conn
        .prepare(include_str!(
            "../../../../../packages/db-schema/schema/device-sync-health.sql"
        ))
        .map_err(|e| e.to_string())?;
    if statement.exists([]).map_err(|e| e.to_string())? {
        return Err("DEVICE_SYNC_DAMAGED: 辅助记录不可读".into());
    }
    let raw: Option<String> = conn
        .query_row(
            "SELECT payload FROM _tau_device_state WHERE id=1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if raw.is_some_and(|raw| !serde_json::from_str::<Value>(&raw).is_ok_and(|v| valid_state(&v))) {
        return Err("DEVICE_SYNC_DAMAGED: 同步身份不可读".into());
    }
    Ok(())
}
pub(super) fn remove_triggers(conn: &Connection) -> Result<(), String> {
    let names = conn
        .prepare(
            "SELECT name FROM sqlite_master WHERE type='trigger' AND name GLOB '_tau_device_*'",
        )
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for name in names {
        conn.execute_batch(&format!("DROP TRIGGER {}", quote(&name)))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
/// 隔离表只保留原始材料，不再参与捕获、回放与业务约束。
pub(super) fn recover(conn: &Connection, excluded_id: Option<i64>) -> Result<(), String> {
    let savepoint = format!("tau_recover_{}", uuid::Uuid::new_v4().simple());
    conn.execute_batch(&format!("SAVEPOINT {savepoint}"))
        .map_err(|e| e.to_string())?;
    let result = (|| -> Result<(), String> {
        let mut sequence = 0i64;
        for sql in [
            "SELECT max(seq) FROM sqlite_sequence WHERE name='_tau_device_log'",
            "SELECT sequence FROM _tau_device_anchor WHERE id=1",
        ] {
            if let Ok(value) = conn.query_row(sql, [], |row| row.get::<_, i64>(0)) {
                if (0..9_007_199_254_740_991).contains(&value) {
                    sequence = sequence.max(value);
                }
            }
        }
        let mut previous = None;
        for table in ["_tau_device_anchor", "_tau_device_state"] {
            if let Ok(raw) = conn.query_row(
                &format!("SELECT payload FROM {table} WHERE id=1"),
                [],
                |row| row.get::<_, String>(0),
            ) {
                if let Ok(value) = serde_json::from_str::<Value>(&raw) {
                    if valid_state(&value) {
                        previous = Some(value);
                        break;
                    }
                }
            }
        }
        remove_triggers(conn)?;
        let names = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB '_tau_device_*' AND name<>'_tau_device_local' AND name NOT GLOB '_tau_device_quarantine_*'").map_err(|e|e.to_string())?
            .query_map([],|row|row.get::<_,String>(0)).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        let prefix = format!("_tau_device_quarantine_{}_", uuid::Uuid::new_v4().simple());
        let mut archived = std::collections::HashMap::new();
        for name in names {
            let target = format!("{prefix}{}", name.trim_start_matches("_tau_device_"));
            conn.execute_batch(&format!(
                "ALTER TABLE {} RENAME TO {}",
                quote(&name),
                quote(&target)
            ))
            .map_err(|e| e.to_string())?;
            archived.insert(name, target);
        }
        super::database::install(conn)?;
        if let Some(source) = archived.get("_tau_device_documents") {
            let intent_filter = archived
                .get("_tau_device_json_intents")
                .filter(|table| {
                    conn.prepare(&format!("SELECT content_id FROM {} LIMIT 0", quote(table)))
                        .is_ok()
                })
                .map(|table| {
                    format!(
                        " AND content_id NOT IN (SELECT content_id FROM {})",
                        quote(table)
                    )
                })
                .unwrap_or_default();
            let _ = conn.execute(&format!("INSERT INTO _tau_device_documents SELECT content_id,document_id,baseline_id,epoch,state,paths,updated_at,metric_rules,checksum FROM {} WHERE CASE WHEN json_valid(paths) THEN json_type(paths)='object' ELSE 0 END AND CASE WHEN json_valid(metric_rules) THEN json_type(metric_rules)='array' ELSE 0 END AND content_id<>?1{intent_filter}",quote(source)), [excluded_id.unwrap_or(-1)]);
        }
        let invalid = conn
            .prepare("SELECT * FROM _tau_device_documents")
            .map_err(|e| e.to_string())?
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    super::database::document_record(row).is_ok_and(|entry| entry.1),
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        for (id, valid) in invalid {
            if !valid {
                conn.execute(
                    "DELETE FROM _tau_device_documents WHERE content_id=?1",
                    [id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        for table in ["_tau_device_branches", "_tau_device_note_copies"] {
            if let Some(source) = archived.get(table) {
                let _ = conn.execute_batch(&format!("INSERT INTO {table} SELECT id,reason,payload FROM {} WHERE json_valid(payload)",quote(source)));
            }
        }
        if let Some(mut state) = previous {
            sequence = sequence.max(state["ackSeq"].as_i64().unwrap_or(0));
            let authority = state["node"] == state["authority"];
            let head = uuid::Uuid::new_v4().to_string();
            state["head"] = json!(head);
            state["ackHead"] = json!(if authority { head } else { String::new() });
            state["ackSeq"] = json!(0);
            state["revision"] = json!(state["revision"].as_u64().unwrap() + u64::from(authority));
            state["requiresSnapshot"] = json!(true);
            state["recovering"] = json!(true);
            conn.execute(
                "INSERT INTO _tau_device_state(id,payload) VALUES(1,?1)",
                [state.to_string()],
            )
            .map_err(|e| e.to_string())?;
            super::database::install(conn)?;
        }
        conn.execute(
            "DELETE FROM sqlite_sequence WHERE name='_tau_device_log'",
            [],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO sqlite_sequence(name,seq) VALUES('_tau_device_log',?1)",
            [sequence],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE _tau_device_anchor SET sequence=?1 WHERE id=1",
            [sequence],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })();
    if result.is_err() {
        let _ = conn.execute_batch(&format!("ROLLBACK TO {savepoint}"));
    }
    let release = conn
        .execute_batch(&format!("RELEASE {savepoint}"))
        .map_err(|e| e.to_string());
    result.and(release)
}
