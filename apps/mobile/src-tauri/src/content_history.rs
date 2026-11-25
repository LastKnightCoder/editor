use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::AppHandle;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentHistoryWrite {
    operation_id: String,
    checkpoint: Option<String>,
    kind: Option<String>,
    target: Option<i64>,
    /// 并入的最新记录操作 ID；`merged_state` 为该记录合并后的完整增量
    merge_into: Option<String>,
    merged_state: Option<String>,
}

fn archive_id(metadata: &Value) -> Option<String> {
    if metadata["mode"] != "local" {
        return None;
    }
    let source = &metadata["source"];
    Some(
        json!([
            source["librarySourceId"].as_str()?,
            source["contentDocumentId"].as_str()?
        ])
        .to_string(),
    )
}

pub fn prepare(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS local_content_history (
           document_id TEXT NOT NULL,
           sequence INTEGER NOT NULL,
           operation_id TEXT NOT NULL,
           baseline_id TEXT NOT NULL,
           checkpoint INTEGER NOT NULL,
           metadata TEXT NOT NULL,
           state BLOB NOT NULL,
           PRIMARY KEY(document_id, sequence),
           UNIQUE(document_id, operation_id)
        );",
    )
}

pub fn record(
    connection: &Connection,
    metadata: &Value,
    bytes: &[u8],
    snapshot: bool,
    write: Option<&ContentHistoryWrite>,
) -> Result<(), String> {
    let Some(id) = archive_id(metadata) else {
        return Ok(());
    };
    if bytes.is_empty() {
        return Ok(());
    }
    let baseline = metadata["baselineId"].as_str().ok_or("正文历史缺少基线")?;
    let head: Option<(i64, String, i64)> = connection
        .query_row(
            "SELECT sequence,baseline_id,checkpoint FROM local_content_history
             WHERE document_id=?1 ORDER BY sequence DESC LIMIT 1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let sequence = head.as_ref().map(|row| row.0 + 1).unwrap_or(0);
    let prior = head.as_ref().filter(|row| row.1 == baseline);
    if snapshot {
        if prior.is_some() {
            return Ok(());
        }
    } else if prior.is_none() {
        return Err("本机历史缺少当前正文基线，请重新打开正文".into());
    }
    if let (Some(head), Some(input)) = (prior, write) {
        if merge(connection, &id, head.0, head.2, input)? {
            return Ok(());
        }
    }
    let operation_id = if snapshot {
        format!("baseline:{sequence}")
    } else {
        write
            .map(|input| input.operation_id.clone())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string())
    };
    if operation_id.len() > 128 || operation_id.is_empty() {
        return Err("本机历史操作身份无效".into());
    }
    let kind = if snapshot {
        "baseline"
    } else {
        match write.and_then(|input| input.kind.as_deref()) {
            Some("undo") => "undo",
            Some("restore") => "restore",
            None | Some("edit") => "edit",
            _ => return Err("本机历史操作类型无效".into()),
        }
    };
    let encoded = write.and_then(|input| input.checkpoint.as_deref());
    let checkpoint = prior
        .filter(|_| encoded.is_none())
        .map(|row| row.2)
        .unwrap_or(sequence);
    let state = if let Some(encoded) = encoded {
        if encoded.len() > 12 * 1024 * 1024 {
            return Err("本机历史检查点超过限制".into());
        }
        STANDARD
            .decode(encoded)
            .map_err(|error| error.to_string())?
    } else {
        bytes.to_vec()
    };
    let millis = now_millis()?;
    let value = json!({
        "sequence": sequence,
        "operationId": operation_id,
        "actorId": if snapshot { "" } else { "local" },
        "actorName": if snapshot { "" } else { "本机" },
        "kind": kind,
        "time": millis,
        "target": write.and_then(|input| input.target),
    });
    connection
        .execute(
            "INSERT INTO local_content_history VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![
                id,
                sequence,
                operation_id,
                baseline,
                checkpoint,
                value.to_string(),
                state
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// 把本次编辑并入最新记录；最新记录不是客户端预期的那条时返回 false，按新记录写入。
fn merge(
    connection: &Connection,
    id: &str,
    sequence: i64,
    checkpoint: i64,
    input: &ContentHistoryWrite,
) -> Result<bool, String> {
    let (Some(target), Some(encoded)) = (&input.merge_into, &input.merged_state) else {
        return Ok(false);
    };
    if checkpoint == sequence || input.kind.as_deref().is_some_and(|kind| kind != "edit") {
        return Ok(false);
    }
    if input.operation_id.is_empty()
        || input.operation_id.len() > 128
        || encoded.len() > 12 * 1024 * 1024
    {
        return Err("本机历史合并参数无效".into());
    }
    let (operation_id, raw): (String, String) = connection
        .query_row(
            "SELECT operation_id,metadata FROM local_content_history WHERE document_id=?1 AND sequence=?2",
            params![id, sequence],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| error.to_string())?;
    let mut entry: Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    if &operation_id != target || entry["kind"] != "edit" || entry["sealed"] == true {
        return Ok(false);
    }
    let state = STANDARD
        .decode(encoded)
        .map_err(|error| error.to_string())?;
    if state.is_empty() {
        return Err("本机历史合并内容为空".into());
    }
    let start = entry
        .get("startTime")
        .cloned()
        .unwrap_or_else(|| entry["time"].clone());
    entry["startTime"] = start;
    entry["time"] = json!(now_millis()?);
    entry["operationId"] = json!(input.operation_id);
    connection
        .execute(
            "UPDATE local_content_history SET operation_id=?1,metadata=?2,state=?3
             WHERE document_id=?4 AND sequence=?5",
            params![input.operation_id, entry.to_string(), state, id, sequence],
        )
        .map_err(|error| error.to_string())?;
    Ok(true)
}

fn now_millis() -> Result<u128, String> {
    Ok(std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis())
}

pub(crate) fn seal(connection: &Connection, id: &str, sequence: i64) -> Result<(), String> {
    connection
        .execute(
            "UPDATE local_content_history SET metadata=json_set(metadata,'$.sealed',json('true'))
             WHERE document_id=?1 AND sequence=?2 AND json_extract(metadata,'$.kind')='edit'",
            params![id, sequence],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn collab_local_history(
    app: AppHandle,
    document_id: String,
    before: Option<i64>,
    sequence: Option<i64>,
) -> Result<Value, String> {
    let connection = crate::collaboration::session_store(&app)?;
    let metadata: String = connection
        .query_row(
            "SELECT metadata FROM sessions WHERE id=?1",
            [document_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let value = serde_json::from_str(&metadata).map_err(|error| error.to_string())?;
    let id = archive_id(&value).ok_or("正文历史来源失效")?;
    let Some(sequence) = sequence else {
        let rows = connection
            .prepare(
                "SELECT metadata FROM local_content_history WHERE document_id=?1 AND sequence<?2
                 ORDER BY sequence DESC LIMIT 50",
            )
            .and_then(|mut query| {
                query
                    .query_map(params![id, before.unwrap_or(i64::MAX)], |row| {
                        row.get::<_, String>(0)
                    })?
                    .collect::<rusqlite::Result<Vec<_>>>()
            })
            .map_err(|error| error.to_string())?;
        let rows: Vec<Value> = rows
            .iter()
            .map(|raw| serde_json::from_str(raw))
            .collect::<serde_json::Result<_>>()
            .map_err(|error| error.to_string())?;
        return Ok(json!(rows));
    };
    seal(&connection, &id, sequence)?;
    let (raw, checkpoint): (String, i64) = connection.query_row(
        "SELECT metadata,checkpoint FROM local_content_history WHERE document_id=?1 AND sequence=?2",
        params![id, sequence],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|error| error.to_string())?;
    let entry: Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    let undone: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM local_content_history
         WHERE document_id=?1 AND sequence>?2 AND json_extract(metadata,'$.kind')='undo'
         AND json_extract(metadata,'$.target')=?2)",
            params![id, sequence],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let updates = connection.prepare(
        "SELECT state FROM local_content_history WHERE document_id=?1 AND sequence BETWEEN ?2 AND ?3 ORDER BY sequence",
    ).and_then(|mut query| {
        query.query_map(params![id, checkpoint, sequence], |row| {
            Ok(STANDARD.encode(row.get::<_, Vec<u8>>(0)?))
        })?.collect::<rusqlite::Result<Vec<_>>>()
    }).map_err(|error| error.to_string())?;
    if updates.len() as i64 != sequence - checkpoint + 1 {
        return Err("本机历史版本缺少先行增量".into());
    }
    Ok(json!({ "entry": entry, "updates": updates, "undone": undone }))
}
