use rusqlite::{params, Connection};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::error::Error;
mod semantic;

fn main() -> Result<(), Box<dyn Error>> {
    let path = std::env::args().nth(1).ok_or("缺少 spike 数据库路径")?;
    if let Some(command) = std::env::args().nth(2) {
        let input = std::env::args().nth(3).ok_or("缺少协议输入文件")?;
        return semantic::run(&path, &command, &input, std::env::args().nth(4));
    }
    let mut connection = Connection::open(path)?;
    let protocol: i64 =
        connection.query_row("SELECT version FROM _spike_protocol", [], |row| row.get(0))?;
    if protocol != 1 {
        return Err("原生探针仅支持协议 1，拒绝写入其他格式副本".into());
    }
    connection.execute_batch("PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;")?;
    let transaction = connection.transaction()?;
    let (device, slot, library, schema, baseline, sequence, clock, id_sequence) = transaction.query_row(
        "SELECT device,slot,library,schema_hash,baseline_hash,sequence,clock,id_sequence FROM _spike_state",
        [],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)? + 1,
                row.get::<_, i64>(6)? + 1,
                row.get::<_, i64>(7)?,
            ))
        },
    )?;
    let observed = {
        let mut statement = transaction.prepare("SELECT device,sequence FROM _spike_frontier")?;
        let rows = statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut frontier = Map::new();
        for row in rows {
            let (device, sequence) = row?;
            frontier.insert(device, json!(sequence));
        }
        Value::Object(frontier)
    };
    transaction.execute(
        "UPDATE _spike_state SET active_tx=?",
        [format!("{device}:{sequence}")],
    )?;
    let group_id = slot * 1_000_000_000 + id_sequence + 1;
    transaction.execute(
        "INSERT INTO todo_group(id,title,create_time,update_time) VALUES(?,'原生分组',1,1)",
        [group_id],
    )?;
    transaction.execute("INSERT INTO todo_item(id,group_id,title,create_time,update_time) VALUES(?,?,'原生离线写入',1,1)", params![group_id + 1, group_id])?;
    transaction.execute(
        "INSERT INTO plugin_records VALUES('native-record','spike','native','{}',1,1,NULL)",
        [],
    )?;
    transaction.execute("INSERT INTO whiteboard_documents(document_id,source_id,baseline_id,epoch,revision,revision_hash,creation_hash,state,contracts,snapshot,create_time,update_time) VALUES('native-board','library','baseline',1,1,'revision','creation',X'00FF802A','{}','{}',1,1)", [])?;
    let changes = {
        let mut statement = transaction.prepare(
            "SELECT table_name,row_key,before_row,after_row FROM _spike_pending ORDER BY ordinal",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })?;
        let mut changes = Vec::new();
        for row in rows {
            let (table, key, before, after) = row?;
            changes.push(json!({"table":table,"key":serde_json::from_str::<Value>(&key)?,"before":before.map(|value| serde_json::from_str::<Value>(&value)).transpose()?,"after":after.map(|value| serde_json::from_str::<Value>(&value)).transpose()?}));
        }
        changes
    };
    let batch = json!({"group":library,"schema":schema,"baseline":baseline,"device":device,"sequence":sequence,"clock":clock,"observed":observed,"changes":changes});
    let payload = serde_json::to_string(&batch)?;
    let fingerprint = format!("{:x}", Sha256::digest(payload.as_bytes()));
    transaction.execute(
        "INSERT INTO _spike_batches VALUES(?,?,?,?,?)",
        params![device, sequence, clock, fingerprint, payload],
    )?;
    for change in batch["changes"].as_array().ok_or("变更列表无效")? {
        let before = if change["before"].is_null() {
            None
        } else {
            Some(serde_json::to_string(&change["before"])?)
        };
        let after = if change["after"].is_null() {
            None
        } else {
            Some(serde_json::to_string(&change["after"])?)
        };
        transaction.execute(
            "INSERT INTO _spike_versions VALUES(?,?,?,?,?,?,?,?)",
            params![
                change["table"].as_str(),
                serde_json::to_string(&change["key"])?,
                device,
                sequence,
                clock,
                serde_json::to_string(&observed)?,
                before,
                after
            ],
        )?;
    }
    transaction.execute("INSERT INTO _spike_frontier VALUES(?,?) ON CONFLICT(device) DO UPDATE SET sequence=excluded.sequence", params![device,sequence])?;
    transaction.execute(
        "UPDATE _spike_state SET sequence=?,clock=?,id_sequence=id_sequence+2,active_tx=NULL",
        params![sequence, clock],
    )?;
    transaction.execute("DELETE FROM _spike_pending", [])?;
    transaction.commit()?;
    let version: String = connection.query_row("SELECT sqlite_version()", [], |row| row.get(0))?;
    let session_enabled: bool = connection.query_row(
        "SELECT sqlite_compileoption_used('ENABLE_SESSION')",
        [],
        |row| row.get(0),
    )?;
    println!(
        "{}",
        json!({"sqlite":version,"sessionEnabled":session_enabled,"changes":4})
    );
    Ok(())
}
