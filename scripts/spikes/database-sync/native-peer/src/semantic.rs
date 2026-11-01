use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{
    params, params_from_iter,
    types::{Value as SqlValue, ValueRef},
    Connection, OptionalExtension, TransactionBehavior,
};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    error::Error,
    io::{Cursor, Read, Write},
};

type Result<T> = std::result::Result<T, Box<dyn Error>>;
const MAX_BYTES: usize = 16 * 1024 * 1024;
fn sha(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn text(value: &Value) -> Result<String> {
    Ok(serde_json::to_string(value)?)
}
fn string(value: &Value) -> Result<&str> {
    value.as_str().ok_or_else(|| "INVALID_STRING".into())
}
fn integer(value: &Value) -> Result<i64> {
    value.as_i64().ok_or_else(|| "INVALID_INTEGER".into())
}
fn quote(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}
fn array(value: &Value) -> Result<&Vec<Value>> {
    value.as_array().ok_or_else(|| "INVALID_ARRAY".into())
}
fn compressed(bytes: &[u8]) -> Result<Vec<u8>> {
    let mut writer = brotli::CompressorWriter::new(Vec::new(), 4096, 4, 22);
    writer.write_all(bytes)?;
    writer.flush()?;
    Ok(writer.into_inner())
}
fn decompressed(bytes: &[u8], limit: usize) -> Result<Vec<u8>> {
    let decoder = brotli::Decompressor::new(Cursor::new(bytes), 4096);
    let mut output = Vec::new();
    decoder.take(limit as u64 + 1).read_to_end(&mut output)?;
    if output.len() > limit {
        return Err("DECOMPRESSED_LIMIT".into());
    }
    Ok(output)
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02X}")).collect()
}
fn unhex(value: &str) -> Result<Vec<u8>> {
    if !value.len().is_multiple_of(2) || !value.is_ascii() {
        return Err("INVALID_HEX".into());
    }
    (0..value.len())
        .step_by(2)
        .map(|index| Ok(u8::from_str_radix(&value[index..index + 2], 16)?))
        .collect()
}
fn value_bytes(value: &Value) -> Result<Vec<u8>> {
    if let Some(value) = value.as_str() {
        return Ok(value.as_bytes().to_vec());
    }
    unhex(string(&value["$blob"])?)
}
fn from_bytes(bytes: Vec<u8>, descriptor: &Value) -> Result<Value> {
    if bytes.len() as i64 != integer(&descriptor["size"])?
        || sha(&bytes) != string(&descriptor["hash"])?
    {
        return Err("FIELD_HASH".into());
    }
    match string(&descriptor["kind"])? {
        "blob" => Ok(json!({"$blob":hex(&bytes)})),
        "text" => Ok(Value::String(String::from_utf8(bytes)?)),
        _ => Err("FIELD_KIND".into()),
    }
}
fn decode_field(encoded: &Value, previous: Option<&Value>) -> Result<Value> {
    if let Some(value) = encoded.get("value") {
        return Ok(value.clone());
    }
    let size = integer(&encoded["size"])?;
    if size < 0 || size as usize > MAX_BYTES {
        return Err("FIELD_LIMIT".into());
    }
    let inserted = decompressed(&STANDARD.decode(string(&encoded["data"])?)?, MAX_BYTES)?;
    if encoded["codec"] == "snapshot" {
        return from_bytes(inserted, encoded);
    }
    if encoded["codec"] != "splice" {
        return Err("FIELD_CODEC".into());
    }
    let before = value_bytes(previous.ok_or("MISSING_FIELD_BASE")?)?;
    let offset = usize::try_from(integer(&encoded["offset"])?)?;
    let remove = usize::try_from(integer(&encoded["remove"])?)?;
    if sha(&before) != string(&encoded["baseHash"])?
        || offset > before.len()
        || remove > before.len() - offset
        || before.len() - remove + inserted.len() > MAX_BYTES
    {
        return Err("FIELD_BASE".into());
    }
    let mut bytes = before[..offset].to_vec();
    bytes.extend(inserted);
    bytes.extend(&before[offset + remove..]);
    from_bytes(bytes, encoded)
}
fn encode_field(value: &Value, previous: Option<&Value>) -> Result<Value> {
    let large =
        value.as_str().is_some_and(|value| value.len() >= 4096) || value.get("$blob").is_some();
    if !large {
        return Ok(json!({"value":value}));
    }
    let bytes = value_bytes(value)?;
    if bytes.len() > MAX_BYTES {
        return Err("FIELD_LIMIT".into());
    }
    let kind = if value.is_string() { "text" } else { "blob" };
    let snapshot = json!({"kind":kind,"hash":sha(&bytes),"size":bytes.len(),"codec":"snapshot","data":STANDARD.encode(compressed(&bytes)?)});
    let Some(previous) = previous.filter(|value| !value.is_null()) else {
        return Ok(snapshot);
    };
    let before = value_bytes(previous)?;
    let prefix = bytes
        .iter()
        .zip(&before)
        .take_while(|(left, right)| left == right)
        .count();
    let suffix = bytes[prefix..]
        .iter()
        .rev()
        .zip(before[prefix..].iter().rev())
        .take_while(|(left, right)| left == right)
        .count();
    let patch = json!({"kind":kind,"hash":sha(&bytes),"size":bytes.len(),"codec":"splice","baseHash":sha(&before),"offset":prefix,"remove":before.len()-prefix-suffix,"data":STANDARD.encode(compressed(&bytes[prefix..bytes.len()-suffix])?)});
    Ok(if text(&patch)?.len() < text(&snapshot)?.len() {
        patch
    } else {
        snapshot
    })
}
fn pack_value(db: &Connection, value: &Value) -> Result<Value> {
    let large =
        value.as_str().is_some_and(|value| value.len() >= 4096) || value.get("$blob").is_some();
    if !large {
        return Ok(value.clone());
    }
    let bytes = value_bytes(value)?;
    if bytes.len() > MAX_BYTES {
        return Err("FIELD_LIMIT".into());
    }
    let mut ids = Vec::new();
    let mut start = 0;
    let mut rolling = 0u32;
    for (index, byte) in bytes.iter().enumerate() {
        let mut gear = (*byte as u32 + 1).wrapping_mul(0x9e3779b1);
        gear ^= gear << 13;
        gear ^= gear >> 17;
        gear ^= gear << 5;
        rolling = rolling.wrapping_shl(1).wrapping_add(gear);
        let size = index + 1 - start;
        if size >= 16384 || (size >= 2048 && rolling & 8191 == 0) {
            save_chunk(db, &bytes[start..index + 1], &mut ids)?;
            start = index + 1;
            rolling = 0;
        }
    }
    if start < bytes.len() {
        save_chunk(db, &bytes[start..], &mut ids)?;
    }
    Ok(
        json!({"$chunks":ids,"size":bytes.len(),"hash":sha(&bytes),"kind":if value.is_string(){"text"}else{"blob"}}),
    )
}
fn save_chunk(db: &Connection, bytes: &[u8], ids: &mut Vec<String>) -> Result<()> {
    let id = sha(bytes);
    db.execute(
        "INSERT OR IGNORE INTO _spike_chunks VALUES(?,?,?)",
        params![id, bytes.len() as i64, compressed(bytes)?],
    )?;
    ids.push(id);
    Ok(())
}
fn unpack_value(db: &Connection, value: &Value) -> Result<Value> {
    let Some(ids) = value.get("$chunks") else {
        return Ok(value.clone());
    };
    let size = usize::try_from(integer(&value["size"])?)?;
    if size > MAX_BYTES || array(ids)?.len() > MAX_BYTES / 2048 + 1 {
        return Err("CHUNK_LIMIT".into());
    }
    let mut output = Vec::new();
    for id in array(ids)? {
        let (raw_size, data): (i64, Vec<u8>) = db.query_row(
            "SELECT raw_size,data FROM _spike_chunks WHERE hash=?",
            [string(id)?],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        let bytes = decompressed(&data, 16384)?;
        if bytes.len() as i64 != raw_size
            || sha(&bytes) != string(id)?
            || output.len() + bytes.len() > size
        {
            return Err("CHUNK_HASH".into());
        }
        output.extend(bytes);
    }
    from_bytes(output, value)
}
fn map_row(db: &Connection, row: &Value, pack: bool) -> Result<Value> {
    if row.is_null() {
        return Ok(Value::Null);
    }
    let mut result = Map::new();
    for (key, value) in row.as_object().ok_or("INVALID_ROW")? {
        result.insert(
            key.clone(),
            if pack {
                pack_value(db, value)?
            } else {
                unpack_value(db, value)?
            },
        );
    }
    Ok(Value::Object(result))
}
fn columns(db: &Connection, table: &str) -> Result<Vec<String>> {
    let mut statement = db.prepare(&format!("PRAGMA table_info({})", quote(table)))?;
    let names = statement
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(names)
}
fn sql_value(value: &Value) -> Result<SqlValue> {
    Ok(match value {
        Value::Null => SqlValue::Null,
        Value::String(value) => SqlValue::Text(value.clone()),
        Value::Bool(value) => SqlValue::Integer(i64::from(*value)),
        Value::Number(value) => {
            if let Some(value) = value.as_i64() {
                SqlValue::Integer(value)
            } else {
                SqlValue::Real(value.as_f64().ok_or("INVALID_NUMBER")?)
            }
        }
        _ => SqlValue::Blob(unhex(string(&value["$blob"])?)?),
    })
}
fn insert_row(db: &Connection, table: &str, row: &Value) -> Result<()> {
    let names = columns(db, table)?;
    if row.as_object().ok_or("INVALID_ROW")?.len() != names.len() {
        return Err("ROW_COLUMNS".into());
    }
    let values = names
        .iter()
        .map(|name| sql_value(row.get(name).ok_or("MISSING_COLUMN")?))
        .collect::<Result<Vec<_>>>()?;
    db.execute(
        &format!(
            "INSERT INTO {}({}) VALUES({})",
            quote(table),
            names
                .iter()
                .map(|name| quote(name))
                .collect::<Vec<_>>()
                .join(","),
            vec!["?"; names.len()].join(",")
        ),
        params_from_iter(values),
    )?;
    Ok(())
}
fn read_rows(db: &Connection, table: &str) -> Result<Vec<Value>> {
    let names = columns(db, table)?;
    let mut statement = db.prepare(&format!("SELECT * FROM {}", quote(table)))?;
    let mut rows = statement.query([])?;
    let mut result = Vec::new();
    while let Some(row) = rows.next()? {
        let mut item = Map::new();
        for (index, name) in names.iter().enumerate() {
            let value = match row.get_ref(index)? {
                ValueRef::Null => Value::Null,
                ValueRef::Integer(value) => json!(value),
                ValueRef::Real(value) => json!(value),
                ValueRef::Text(value) => json!(std::str::from_utf8(value)?),
                ValueRef::Blob(value) => json!({"$blob":hex(value)}),
            };
            item.insert(name.clone(), value);
        }
        result.push(Value::Object(item));
    }
    Ok(result)
}
fn json_query(db: &Connection, sql: &str) -> Result<Value> {
    let raw: String = db.query_row(sql, [], |row| row.get(0))?;
    Ok(serde_json::from_str(&raw)?)
}
fn frontier(db: &Connection) -> Result<Value> {
    let mut statement = db.prepare("SELECT device,sequence FROM _spike_frontier")?;
    let mut result = Map::new();
    for row in statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })? {
        let (device, sequence) = row?;
        result.insert(device, json!(sequence));
    }
    Ok(Value::Object(result))
}
fn covers(left: &Value, right: &Value) -> Result<bool> {
    Ok(right
        .as_object()
        .ok_or("INVALID_FRONTIER")?
        .iter()
        .all(|(device, sequence)| {
            left[device].as_i64().unwrap_or(0) >= sequence.as_i64().unwrap_or(i64::MAX)
        }))
}
fn load_version(
    db: &Connection,
    table: &str,
    key: &Value,
    identity: &Value,
) -> Result<Option<Value>> {
    if identity.is_null() {
        return Ok(None);
    }
    if identity == "baseline" {
        let baseline = json_query(db, "SELECT payload FROM _spike_baseline")?;
        let key_columns = if table == "plugin_kv" {
            vec!["plugin_id", "key"]
        } else {
            vec!["id"]
        };
        let row = array(&baseline["rows"][table])?
            .iter()
            .find(|row| {
                json!(key_columns
                    .iter()
                    .map(|column| row[*column].clone())
                    .collect::<Vec<_>>())
                    == *key
            })
            .ok_or("MISSING_BASELINE_ROW")?;
        return Ok(Some(
            json!({"row":row,"generation":0,"device":"baseline","sequence":0}),
        ));
    }
    let (device, sequence) = string(identity)?.split_once(':').ok_or("VERSION_ID")?;
    let (after,generation):(Option<String>,i64)=db.query_row("SELECT v.after_row,g.generation FROM _spike_versions v JOIN _spike_generations g USING(table_name,row_key,device,sequence) WHERE table_name=? AND row_key=? AND device=? AND sequence=?",params![table,text(key)?,device,sequence.parse::<i64>()?],|row|Ok((row.get(0)?,row.get(1)?)))?;
    let row = after
        .map(|row| serde_json::from_str::<Value>(&row))
        .transpose()?
        .unwrap_or(Value::Null);
    Ok(Some(
        json!({"row":map_row(db,&row,false)?,"generation":generation,"device":device,"sequence":sequence.parse::<i64>()?}),
    ))
}
fn head(db: &Connection, table: &str, key: &Value) -> Result<Option<Value>> {
    let identity:Option<(String,i64)>=db.query_row("SELECT v.device,v.sequence FROM _spike_versions v JOIN _spike_generations g USING(table_name,row_key,device,sequence) WHERE v.table_name=? AND v.row_key=? ORDER BY g.generation DESC,(v.after_row IS NULL) DESC,v.clock DESC,v.device DESC,v.sequence DESC LIMIT 1",params![table,text(key)?],|row|Ok((row.get(0)?,row.get(1)?))).optional()?;
    match identity {
        Some((device, sequence)) => {
            load_version(db, table, key, &json!(format!("{device}:{sequence}")))
        }
        None => {
            let baseline = json_query(db, "SELECT payload FROM _spike_baseline")?;
            let fields = if table == "plugin_kv" {
                vec!["plugin_id", "key"]
            } else {
                vec!["id"]
            };
            if array(&baseline["rows"][table])?.iter().any(|row| {
                json!(fields
                    .iter()
                    .map(|field| row[*field].clone())
                    .collect::<Vec<_>>())
                    == *key
            }) {
                load_version(db, table, key, &json!("baseline"))
            } else {
                Ok(None)
            }
        }
    }
}
fn receipt(db: &Connection, device: &str, sequence: i64) -> Result<Option<String>> {
    Ok(db
        .query_row(
            "SELECT fingerprint FROM _spike_receipts WHERE device=? AND sequence=?",
            params![device, sequence],
            |row| row.get(0),
        )
        .optional()?)
}
fn state(db: &Connection) -> Result<Value> {
    Ok(db.query_row("SELECT device,library,schema_hash,baseline_hash,sequence,clock FROM _spike_state",[],|row|Ok(json!({"device":row.get::<_,String>(0)?,"group":row.get::<_,String>(1)?,"schema":row.get::<_,String>(2)?,"baseline":row.get::<_,String>(3)?,"sequence":row.get::<_,i64>(4)?,"clock":row.get::<_,i64>(5)?})))?)
}
fn decoded_changes(db: &Connection, batch: &Value) -> Result<Vec<Value>> {
    let mut changes = Vec::new();
    for change in array(&batch["changes"])? {
        let table = string(&change["table"])?;
        if table != "plugin_kv" && table != "plugin_records" {
            return Err("UNSUPPORTED_RULE".into());
        }
        let base = load_version(db, table, &change["key"], &change["base"])?;
        let before = base
            .as_ref()
            .map(|base| base["row"].clone())
            .unwrap_or(Value::Null);
        let after = if change["patch"].is_null() {
            Value::Null
        } else {
            let mut after = before.as_object().cloned().unwrap_or_default();
            for (field, value) in change["patch"].as_object().ok_or("INVALID_PATCH")? {
                after.insert(field.clone(), decode_field(value, before.get(field))?);
            }
            Value::Object(after)
        };
        if !change["restoreOf"].is_null() {
            let deletion = load_version(db, table, &change["key"], &change["restoreOf"])?
                .ok_or("MISSING_DELETION")?;
            if !deletion["row"].is_null()
                || integer(&change["generation"])? != integer(&deletion["generation"])? + 1
                || batch["observed"][string(&deletion["device"])?]
                    .as_i64()
                    .unwrap_or(0)
                    < integer(&deletion["sequence"])?
                || after.is_null()
            {
                return Err("INVALID_RESTORE".into());
            }
        } else if integer(&change["generation"])?
            != base
                .as_ref()
                .map(|value| value["generation"].as_i64().unwrap_or(-1))
                .unwrap_or(0)
            || (base.is_some() && before.is_null() && !after.is_null())
        {
            return Err("INVALID_GENERATION".into());
        }
        if let Some(base) = base.as_ref() {
            if base["device"] != "baseline"
                && batch["observed"][string(&base["device"])?]
                    .as_i64()
                    .unwrap_or(0)
                    < integer(&base["sequence"])?
            {
                return Err("UNOBSERVED_BASE".into());
            }
        }
        if !after.is_null() {
            let names = columns(db, table)?;
            if after.as_object().ok_or("INVALID_ROW")?.len() != names.len()
                || names.iter().any(|name| after.get(name).is_none())
            {
                return Err("ROW_COLUMNS".into());
            }
        }
        let actual_key = if table == "plugin_kv" {
            json!([after["plugin_id"], after["key"]])
        } else {
            json!([after["id"]])
        };
        if !after.is_null() && actual_key != change["key"] {
            return Err("ROW_IDENTITY".into());
        }
        changes.push(json!({"table":table,"key":change["key"],"generation":change["generation"],"restoreOf":change["restoreOf"],"before":before,"after":after}));
    }
    Ok(changes)
}
fn apply_batch(db: &Connection, batch: &Value, local: bool) -> Result<()> {
    let current = state(db)?;
    let protocol: i64 =
        db.query_row("SELECT version FROM _spike_protocol", [], |row| row.get(0))?;
    if integer(&batch["protocol"])? != protocol
        || ![2, 3].contains(&protocol)
        || batch["group"] != current["group"]
        || batch["schema"] != current["schema"]
        || batch["baseline"] != current["baseline"]
    {
        return Err("PROTOCOL_IDENTITY".into());
    }
    let device = string(&batch["device"])?;
    let sequence = integer(&batch["sequence"])?;
    let payload = text(batch)?;
    let fingerprint = sha(payload.as_bytes());
    if protocol == 3 {
        let rules: String = db.query_row("SELECT rules_hash FROM _spike_history", [], |row| {
            row.get(0)
        })?;
        if batch["rules"] != rules {
            return Err("RULES_MISMATCH".into());
        }
        if let Some(known) = receipt(db, device, sequence)? {
            if known == fingerprint {
                return Ok(());
            }
            return Err("OPERATION_ID_REUSED".into());
        }
        if db
            .query_row(
                "SELECT 1 FROM _spike_retired WHERE device=?",
                [device],
                |_| Ok(()),
            )
            .optional()?
            .is_some()
            || !covers(
                &batch["observed"],
                &json_query(db, "SELECT floor FROM _spike_history")?,
            )?
        {
            return Err("NEEDS_CHECKPOINT".into());
        }
    }
    let seen = frontier(db)?;
    if sequence != seen[device].as_i64().unwrap_or(0) + 1
        || batch["observed"][device].as_i64().unwrap_or(0) != sequence - 1
        || !covers(&seen, &batch["observed"])?
    {
        return Err("MISSING_DEPENDENCIES".into());
    }
    let changes = decoded_changes(db, batch)?;
    if changes.is_empty() {
        return Err("EMPTY_BATCH".into());
    }
    db.execute(
        "INSERT INTO _spike_batches VALUES(?,?,?,?,?)",
        params![
            device,
            sequence,
            integer(&batch["clock"])?,
            fingerprint,
            payload
        ],
    )?;
    for change in &changes {
        let table = string(&change["table"])?;
        let key = text(&change["key"])?;
        let packed = map_row(db, &change["after"], true)?;
        db.execute(
            "INSERT INTO _spike_versions VALUES(?,?,?,?,?,?,NULL,?)",
            params![
                table,
                key,
                device,
                sequence,
                integer(&batch["clock"])?,
                text(&batch["observed"])?,
                if packed.is_null() {
                    None
                } else {
                    Some(text(&packed)?)
                }
            ],
        )?;
        db.execute(
            "INSERT INTO _spike_generations VALUES(?,?,?,?,?,?)",
            params![
                table,
                key,
                device,
                sequence,
                integer(&change["generation"])?,
                change["restoreOf"].as_str()
            ],
        )?;
        let winner = head(db, table, &change["key"])?.ok_or("MISSING_HEAD")?;
        let where_clause = if table == "plugin_kv" {
            "plugin_id=? AND key=?"
        } else {
            "id=?"
        };
        let keys = array(&change["key"])?
            .iter()
            .map(sql_value)
            .collect::<Result<Vec<_>>>()?;
        db.execute(
            &format!("DELETE FROM {} WHERE {where_clause}", quote(table)),
            params_from_iter(keys),
        )?;
        if !winner["row"].is_null() {
            insert_row(db, table, &winner["row"])?;
        }
    }
    if protocol == 3 {
        db.execute(
            "INSERT INTO _spike_receipts VALUES(?,?,?,'applied',?,?)",
            params![device, sequence, fingerprint, device, sequence],
        )?;
        if local {
            let entry = json!({"batch":batch,"fingerprint":fingerprint,"changes":changes});
            let mut packed_changes = Vec::new();
            for change in &changes {
                let mut packed = change.clone();
                packed["before"] = map_row(db, &change["before"], true)?;
                packed["after"] = map_row(db, &change["after"], true)?;
                packed_changes.push(packed);
            }
            let packed = json!({"batch":batch,"fingerprint":fingerprint,"changes":packed_changes});
            db.execute(
                "INSERT INTO _spike_outbox VALUES(?,?,?,?)",
                params![
                    device,
                    sequence,
                    text(&packed)?,
                    sha(text(&entry)?.as_bytes())
                ],
            )?;
        }
    }
    db.execute("INSERT INTO _spike_frontier VALUES(?,?) ON CONFLICT(device) DO UPDATE SET sequence=excluded.sequence",params![device,sequence])?;
    db.execute(
        "UPDATE _spike_state SET clock=max(clock,?)",
        [integer(&batch["clock"])?],
    )?;
    Ok(())
}
fn emit(db: &mut Connection, input: &Value) -> Result<Value> {
    let transaction = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let current = state(&transaction)?;
    let key = json!(["spike", string(&input["key"])?]);
    let previous = head(&transaction, "plugin_kv", &key)?;
    let before = previous
        .as_ref()
        .map(|value| value["row"].clone())
        .unwrap_or(Value::Null);
    if previous.is_some() && before.is_null() {
        return Err("EXPLICIT_RESTORE_REQUIRED".into());
    }
    let after = if input["op"] == "delete" {
        Value::Null
    } else {
        json!({"plugin_id":"spike","key":input["key"],"value":string(&input["value"])?,"update_time":1})
    };
    let mut patch = Map::new();
    if let Some(fields) = after.as_object() {
        for (field, value) in fields {
            if before.get(field) != Some(value) {
                patch.insert(field.clone(), encode_field(value, before.get(field))?);
            }
        }
    }
    let base = previous
        .as_ref()
        .map(|value| {
            if value["device"] == "baseline" {
                return json!("baseline");
            }
            json!(format!(
                "{}:{}",
                value["device"].as_str().unwrap_or_default(),
                value["sequence"].as_i64().unwrap_or(0)
            ))
        })
        .unwrap_or(Value::Null);
    let protocol: i64 =
        transaction.query_row("SELECT version FROM _spike_protocol", [], |row| row.get(0))?;
    let mut batch = json!({"protocol":protocol,"group":current["group"],"schema":current["schema"],"baseline":current["baseline"],"device":current["device"],"sequence":integer(&current["sequence"])?+1,"clock":integer(&current["clock"])?+1,"observed":frontier(&transaction)?,"changes":[{"table":"plugin_kv","key":key,"base":base,"generation":previous.as_ref().map(|value|value["generation"].clone()).unwrap_or(json!(0)),"restoreOf":null,"patch":if after.is_null(){Value::Null}else{Value::Object(patch)}}]});
    if protocol == 3 {
        batch["rules"] = json!(transaction.query_row(
            "SELECT rules_hash FROM _spike_history",
            [],
            |row| row.get::<_, String>(0)
        )?);
    }
    transaction.execute("UPDATE _spike_state SET applying=1", [])?;
    apply_batch(&transaction, &batch, true)?;
    transaction.execute(
        "UPDATE _spike_state SET sequence=?,applying=0",
        [integer(&batch["sequence"])?],
    )?;
    transaction.commit()?;
    Ok(batch)
}

fn checkpoint(db: &Connection, envelope: &Value) -> Result<Value> {
    let body = string(&envelope["body"])?;
    if body.len() > 64 * 1024 * 1024 || sha(body.as_bytes()) != string(&envelope["id"])? {
        return Err("CHECKPOINT_HASH".into());
    }
    let cp: Value = serde_json::from_str(body)?;
    let current = state(db)?;
    let (authority, rules, floor, epoch, identity): (String, String, String, i64, Option<String>) =
        db.query_row(
            "SELECT authority,rules_hash,floor,epoch,checkpoint_id FROM _spike_history",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )?;
    if cp["format"] != "tau-sync-checkpoint"
        || cp["protocol"] != 3
        || cp["group"] != current["group"]
        || cp["schema"] != current["schema"]
        || cp["baselineHash"] != current["baseline"]
        || cp["rules"] != rules
        || cp["authority"] != authority
        || integer(&cp["epoch"])? < epoch
        || !covers(&cp["frontier"], &serde_json::from_str(&floor)?)?
    {
        return Err("CHECKPOINT_IDENTITY_OR_ROLLBACK".into());
    }
    if integer(&cp["epoch"])? == epoch
        && identity.is_some()
        && identity.as_deref() != envelope["id"].as_str()
    {
        return Err("CHECKPOINT_FORK".into());
    }
    if sha(text(&cp["contracts"])?.as_bytes()) != rules
        || cp["baseline"] != json_query(db, "SELECT payload FROM _spike_baseline")?
    {
        return Err("CHECKPOINT_CONTRACT".into());
    }
    if array(&cp["contracts"])?.len() != 98 {
        return Err("CHECKPOINT_TABLES".into());
    }
    for row in read_rows(db, "_spike_retired")? {
        if !array(&cp["retired"])?
            .iter()
            .any(|retired| retired["device"] == row["device"])
        {
            return Err("CHECKPOINT_FENCE_ROLLBACK".into());
        }
    }
    for chunk in array(&cp["chunks"])? {
        let bytes = decompressed(&STANDARD.decode(string(&chunk["data"])?)?, 16384)?;
        if bytes.len() as i64 != integer(&chunk["raw_size"])?
            || sha(&bytes) != string(&chunk["hash"])?
        {
            return Err("CHECKPOINT_CHUNK_HASH".into());
        }
    }
    for contract in array(&cp["contracts"])? {
        let name = string(&contract["table"])?;
        if contract["scope"] == "replicated"
            && contract["adapter"].is_null()
            && cp["rows"][name] != cp["baseline"]["rows"][name]
        {
            return Err("UNSUPPORTED_RULE".into());
        }
    }
    for receipt in read_rows(db, "_spike_receipts")? {
        let covered = array(&cp["receipts"])?.iter().find(|row| {
            row["device"] == receipt["device"] && row["sequence"] == receipt["sequence"]
        });
        if covered.is_none_or(|row| row["fingerprint"] != receipt["fingerprint"]) {
            return Err("LOCAL_HISTORY_NOT_PROTECTED".into());
        }
    }
    for outbox in read_rows(db, "_spike_outbox")? {
        let receipt = array(&cp["receipts"])?
            .iter()
            .find(|row| row["device"] == outbox["device"] && row["sequence"] == outbox["sequence"])
            .ok_or("LOCAL_OUTBOX_NOT_PROTECTED")?;
        let packed: Value = serde_json::from_str(string(&outbox["payload"])?)?;
        let mut entry = packed.clone();
        for change in entry["changes"].as_array_mut().ok_or("INVALID_OUTBOX")? {
            change["before"] = map_row(db, &change["before"], false)?;
            change["after"] = map_row(db, &change["after"], false)?;
        }
        if sha(text(&entry)?.as_bytes()) != string(&outbox["seal"])? {
            return Err("OUTBOX_CORRUPT".into());
        }
        if receipt["fingerprint"] != packed["fingerprint"] {
            return Err("LOCAL_OUTBOX_NOT_PROTECTED".into());
        }
        if receipt["status"] == "preserved"
            && !array(&cp["branches"])?.iter().any(|row| {
                row["device"] == outbox["device"]
                    && row["sequence"] == outbox["sequence"]
                    && serde_json::from_str::<Value>(row["payload"].as_str().unwrap_or(""))
                        .is_ok_and(|entry| entry["seal"] == outbox["seal"])
            })
        {
            return Err("LOCAL_OUTBOX_NOT_PROTECTED".into());
        }
    }
    Ok(cp)
}
fn replace_metadata(db: &Connection, table: &str, rows: &Value) -> Result<()> {
    db.execute(&format!("DELETE FROM {}", quote(table)), [])?;
    for row in array(rows)? {
        insert_row(db, table, row)?;
    }
    Ok(())
}
fn install(db: &mut Connection, envelope: &Value, crash: Option<usize>) -> Result<Value> {
    let transaction = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let cp = checkpoint(&transaction, envelope)?;
    transaction
        .execute_batch("PRAGMA defer_foreign_keys=ON; UPDATE _spike_state SET applying=1;")?;
    let mut locals = BTreeMap::new();
    for contract in array(&cp["contracts"])? {
        let name = string(&contract["table"])?;
        if contract["scope"] == "local" {
            locals.insert(name.to_string(), read_rows(&transaction, name)?);
        }
        transaction.execute(&format!("DELETE FROM {}", quote(name)), [])?;
    }
    let mut installed = 0;
    for contract in array(&cp["contracts"])? {
        let name = string(&contract["table"])?;
        let rows = locals.get(name).unwrap_or(array(&cp["rows"][name])?);
        for row in rows {
            insert_row(&transaction, name, row)?;
            installed += 1;
            if crash == Some(installed) {
                std::process::exit(17);
            }
        }
    }
    for table in [
        "_spike_versions",
        "_spike_generations",
        "_spike_deletion_bases",
        "_spike_batches",
        "_spike_frontier",
        "_spike_chunks",
        "_spike_receipts",
        "_spike_recovery_branches",
        "_spike_outbox",
        "_spike_retired",
        "_spike_quarantine",
        "_spike_orphans",
        "_spike_pending",
    ] {
        transaction.execute(&format!("DELETE FROM {table}"), [])?;
    }
    for chunk in array(&cp["chunks"])? {
        transaction.execute(
            "INSERT INTO _spike_chunks VALUES(?,?,?)",
            params![
                string(&chunk["hash"])?,
                integer(&chunk["raw_size"])?,
                STANDARD.decode(string(&chunk["data"])?)?
            ],
        )?;
    }
    for (table, field) in [
        ("_spike_versions", "versions"),
        ("_spike_generations", "generations"),
        ("_spike_deletion_bases", "deletions"),
        ("_spike_receipts", "receipts"),
        ("_spike_recovery_branches", "branches"),
        ("_spike_retired", "retired"),
        ("_spike_quarantine", "quarantine"),
        ("_spike_orphans", "orphans"),
    ] {
        replace_metadata(&transaction, table, &cp[field])?;
    }
    for (device, sequence) in cp["frontier"].as_object().ok_or("INVALID_FRONTIER")? {
        transaction.execute(
            "INSERT INTO _spike_frontier VALUES(?,?)",
            params![device, integer(sequence)?],
        )?;
    }
    for version in array(&cp["versions"])? {
        if let Some(after) = version["after_row"].as_str() {
            map_row(&transaction, &serde_json::from_str::<Value>(after)?, false)?;
        }
    }
    for deletion in array(&cp["deletions"])? {
        map_row(
            &transaction,
            &serde_json::from_str::<Value>(string(&deletion["row_value"])?)?,
            false,
        )?;
    }
    for branch in array(&cp["branches"])? {
        let mut entry: Value = serde_json::from_str(string(&branch["payload"])?)?;
        let seal = entry
            .as_object_mut()
            .ok_or("INVALID_RECOVERY_BRANCH")?
            .remove("seal")
            .ok_or("INVALID_RECOVERY_BRANCH")?;
        for change in entry["changes"]
            .as_array_mut()
            .ok_or("INVALID_RECOVERY_BRANCH")?
        {
            change["before"] = map_row(&transaction, &change["before"], false)?;
            change["after"] = map_row(&transaction, &change["after"], false)?;
        }
        if sha(text(&entry)?.as_bytes()) != string(&seal)? {
            return Err("RECOVERY_BRANCH_CORRUPT".into());
        }
    }
    let current = state(&transaction)?;
    let logical: String = transaction.query_row(
        "SELECT logical_device FROM _spike_local_identity",
        [],
        |row| row.get(0),
    )?;
    let actor = if array(&cp["retired"])?
        .iter()
        .any(|row| row["device"] == current["device"])
    {
        if logical == string(&cp["authority"])? {
            return Err("AUTHORITY_REJOIN_REQUIRES_HANDOFF".into());
        }
        format!("{}-r-{}", logical, string(&envelope["id"])?)
    } else {
        string(&current["device"])?.to_string()
    };
    transaction.execute(
        "UPDATE _spike_state SET device=?,sequence=?,clock=?,applying=0,active_tx=NULL",
        params![
            actor,
            cp["frontier"][&actor].as_i64().unwrap_or(0),
            integer(&cp["clock"])?
        ],
    )?;
    transaction.execute(
        "UPDATE _spike_history SET epoch=?,checkpoint_id=?,floor=?",
        params![
            integer(&cp["epoch"])?,
            string(&envelope["id"])?,
            text(&cp["frontier"])?
        ],
    )?;
    transaction.execute(
        "INSERT OR REPLACE INTO _spike_checkpoints VALUES(?,?)",
        params![string(&envelope["id"])?, string(&envelope["body"])?],
    )?;
    transaction.commit()?;
    Ok(json!({"installed":true,"actor":actor,"epoch":cp["epoch"]}))
}

pub fn run(path: &str, command: &str, input_path: &str, extra: Option<String>) -> Result<()> {
    let input: Value = serde_json::from_str(&std::fs::read_to_string(input_path)?)?;
    let mut db = Connection::open(path)?;
    db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;")?;
    let output = match command {
        "emit" => emit(&mut db, &input)?,
        "receive" => {
            let transaction = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
            transaction.execute("UPDATE _spike_state SET applying=1", [])?;
            apply_batch(&transaction, &input, false)?;
            transaction.execute("UPDATE _spike_state SET applying=0", [])?;
            transaction.commit()?;
            json!({"received":true})
        }
        "verify" => {
            let cp = checkpoint(&db, &input)?;
            json!({"verified":true,"epoch":cp["epoch"]})
        }
        "install" => install(
            &mut db,
            &input,
            extra.map(|value| value.parse()).transpose()?,
        )?,
        "decode-field" => decode_field(&input["encoded"], input.get("previous"))?,
        _ => return Err("UNKNOWN_COMMAND".into()),
    };
    println!("{}", text(&output)?);
    Ok(())
}
