use rusqlite::{
    params, params_from_iter,
    types::{Value as SqlValue, ValueRef},
    Connection, OptionalExtension,
};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};

const SQL: &str = include_str!("../../../../../packages/db-schema/schema/device-sync.sql");
fn quote(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}
fn literal(name: &str) -> String {
    format!("'{}'", name.replace('\'', "''"))
}
fn cell(prefix: &str, column: &str) -> String {
    let name = format!("{prefix}.{}", quote(column));
    format!("CASE WHEN typeof({name})='blob' THEN json_object('$blob',hex({name})) WHEN typeof({name})='integer' THEN json_object('$integer',CAST({name} AS TEXT)) ELSE {name} END")
}

#[derive(Clone)]
struct Table {
    name: String,
    columns: Vec<String>,
    key: Vec<String>,
    parents: Vec<String>,
}
fn err(error: impl std::fmt::Display) -> String {
    format!("DEVICE_SYNC_DATABASE: {error}")
}
fn row_error(error: rusqlite::Error) -> String {
    match &error {
        rusqlite::Error::SqliteFailure(code, _) if matches!(code.extended_code, 2067 | 1555) => {
            format!("DEVICE_SYNC_UNIQUE: {error}")
        }
        _ => err(error),
    }
}
fn strings(conn: &Connection, sql: &str, column: usize) -> Result<Vec<String>, String> {
    conn.prepare(sql)
        .map_err(err)?
        .query_map([], |row| row.get(column))
        .map_err(err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(err)
}
fn tables(conn: &Connection) -> Result<Vec<Table>, String> {
    let names = strings(conn, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_tau_device_%' ORDER BY name", 0)?;
    let mut result = Vec::new();
    for name in names {
        let columns = conn
            .prepare(&format!("PRAGMA table_info({})", quote(&name)))
            .map_err(err)?
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(5)?,
                ))
            })
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        let mut primary = columns
            .iter()
            .filter(|column| column.2 > 0)
            .collect::<Vec<_>>();
        primary.sort_by_key(|column| column.2);
        let mut key = primary
            .iter()
            .map(|column| column.0.clone())
            .collect::<Vec<_>>();
        if key.is_empty() {
            let indexes = conn
                .prepare(&format!("PRAGMA index_list({})", quote(&name)))
                .map_err(err)?
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, i64>(4)?,
                    ))
                })
                .map_err(err)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(err)?;
            for (index, unique, partial) in indexes {
                if unique == 0 || partial != 0 {
                    continue;
                }
                let candidate = strings(conn, &format!("PRAGMA index_info({})", quote(&index)), 2)?;
                if !candidate.is_empty()
                    && candidate.iter().all(|name| {
                        columns
                            .iter()
                            .any(|column| &column.0 == name && column.1 != 0)
                    })
                {
                    key = candidate;
                    break;
                }
            }
        }
        if key.is_empty() {
            return Err(format!("DEVICE_SYNC_SCHEMA_KEY: 表 {name} 缺少稳定键"));
        }
        result.push(Table {
            parents: strings(
                conn,
                &format!("PRAGMA foreign_key_list({})", quote(&name)),
                2,
            )?,
            name,
            key,
            columns: columns.into_iter().map(|column| column.0).collect(),
        });
    }
    let mut ordered = Vec::new();
    while !result.is_empty() {
        let index = result
            .iter()
            .position(|table| {
                table.parents.iter().all(|parent| {
                    parent == &table.name
                        || ordered.iter().any(|done: &Table| &done.name == parent)
                        || !result.iter().any(|other| &other.name == parent)
                })
            })
            .ok_or("DEVICE_SYNC_SCHEMA_CYCLE: 循环外键")?;
        ordered.push(result.remove(index));
    }
    Ok(ordered)
}
pub fn initialize(conn: &Connection) -> Result<(), String> {
    let old = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE name='_tau_device_json_content'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(err)?;
    if old.is_some_and(|sql| !sql.contains("json_valid")) {
        super::recovery::remove_triggers(conn)?;
    }
    if let Err(error) = install(conn).and_then(|_| super::recovery::check(conn)) {
        if error.starts_with("DEVICE_SYNC_LOCAL:") || !super::recovery::damaged(&error) {
            return Err(error);
        }
        super::recovery::recover(conn, None)?;
    }
    Ok(())
}
pub(super) fn install(conn: &Connection) -> Result<(), String> {
    super::local_generation::ensure(conn)?;
    conn.execute_batch(SQL).map_err(err)?;
    if conn
        .query_row("SELECT 1 FROM _tau_device_state WHERE id=1", [], |_| Ok(()))
        .optional()
        .map_err(err)?
        .is_none()
    {
        return Ok(());
    }
    if conn.query_row("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='_tau_device_capture__tau_device_documents_INSERT'",[], |_|Ok(())).optional().map_err(err)?.is_some() {return Ok(());}
    let mut specs = tables(conn)?;
    specs.push(Table {
        name: "_tau_device_documents".into(),
        columns: vec![],
        key: vec!["content_id".into()],
        parents: vec![],
    });
    for table in specs {
        let marker = table.name == "_tau_device_documents";
        let row = |prefix: &str, action: &str| {
            let fields=table.columns.iter().flat_map(|column| {
                let value=cell(prefix,column);
                let managed=action=="UPDATE"&&((table.name=="contents"&&["content","count","update_time"].contains(&column.as_str()))||(table.name=="content_documents"&&["contracts","revision"].contains(&column.as_str())));
                let value=if managed {format!("CASE WHEN EXISTS(SELECT 1 FROM _tau_device_documents WHERE content_id={prefix}.{}) THEN NULL ELSE {value} END",quote(if table.name=="contents"{"id"}else{"content_id"}))}else{value};
                [literal(column),value]
            }).collect::<Vec<_>>().join(",");
            format!("json_object({fields})")
        };
        for action in ["INSERT", "UPDATE", "DELETE"] {
            let prefix = if action == "DELETE" { "OLD" } else { "NEW" };
            let before = if marker || action == "INSERT" {
                "NULL".into()
            } else {
                row("OLD", action)
            };
            let after = if marker {
                "'{}'".into()
            } else if action == "DELETE" {
                "NULL".into()
            } else {
                row("NEW", action)
            };
            let changed = if action == "UPDATE" && !marker {
                format!("AND {} IS NOT {}", row("OLD", action), row("NEW", action))
            } else {
                String::new()
            };
            conn.execute_batch(&format!("CREATE TRIGGER IF NOT EXISTS {} AFTER {action} ON {} WHEN (SELECT CASE WHEN json_valid(payload) THEN (applying=0 OR (applying IN (2,3) AND coalesce(json_extract(payload,'$.requiresSnapshot'),0)=0)) AND json_extract(payload,'$.enabled')=1 ELSE 0 END FROM _tau_device_state WHERE id=1) AND coalesce((SELECT seq FROM sqlite_sequence WHERE name='_tau_device_log'),0)<9007199254740990 {changed} BEGIN INSERT INTO _tau_device_log(table_name,row_key,before_json,after_json,phase) VALUES ({},json_array({}),{before},{after},(SELECT applying>=2 FROM _tau_device_state WHERE id=1)); END;",quote(&format!("_tau_device_capture_{}_{action}",table.name)),quote(&table.name),literal(if marker {"_document"}else{&table.name}),table.key.iter().map(|column|if marker{format!("{prefix}.{}",quote(column))}else{cell(prefix,column)}).collect::<Vec<_>>().join(","))).map_err(err)?;
        }
    }
    Ok(())
}
fn json_row(row: &rusqlite::Row) -> rusqlite::Result<Value> {
    let mut value = Map::new();
    for index in 0..row.as_ref().column_count() {
        let item = match row.get_ref(index)? {
            ValueRef::Null => Value::Null,
            ValueRef::Integer(value) => json!({"$integer":value.to_string()}),
            ValueRef::Real(value) if value.is_finite() => json!(value),
            ValueRef::Real(_) => {
                return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                    std::io::Error::new(std::io::ErrorKind::InvalidData, "非有限 SQLite 数字"),
                )))
            }
            ValueRef::Text(value) => json!(String::from_utf8_lossy(value)),
            ValueRef::Blob(value) => {
                json!({"$blob":value.iter().map(|byte|format!("{byte:02X}")).collect::<String>()})
            }
        };
        value.insert(row.as_ref().column_name(index)?.into(), item);
    }
    Ok(Value::Object(value))
}
fn sql_value(value: &Value) -> Result<SqlValue, String> {
    match value {
        Value::Null => Ok(SqlValue::Null),
        Value::String(value) => Ok(SqlValue::Text(value.clone())),
        Value::Number(value) => value
            .as_f64()
            .map(SqlValue::Real)
            .ok_or_else(|| err("数字无效")),
        Value::Object(value)
            if value.len() == 1 && value.get("$integer").and_then(Value::as_str).is_some() =>
        {
            Ok(SqlValue::Integer(
                value["$integer"].as_str().unwrap().parse().map_err(err)?,
            ))
        }
        Value::Object(value)
            if value.len() == 1 && value.get("$blob").and_then(Value::as_str).is_some() =>
        {
            let hex = value["$blob"].as_str().unwrap();
            if hex.len() % 2 != 0 || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                return Err(err("二进制无效"));
            }
            let bytes = (0..hex.len())
                .step_by(2)
                .map(|index| u8::from_str_radix(&hex[index..index + 2], 16))
                .collect::<Result<Vec<_>, _>>()
                .map_err(err)?;
            Ok(SqlValue::Blob(bytes))
        }
        _ => Err(err("字段类型无效")),
    }
}
fn sequence(conn: &Connection) -> Result<i64, String> {
    Ok(conn
        .query_row(
            "SELECT seq FROM sqlite_sequence WHERE name='_tau_device_log'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(err)?
        .unwrap_or(0))
}
pub fn state(conn: &Connection) -> Result<Option<Value>, String> {
    let result = conn
        .query_row(
            "SELECT payload FROM _tau_device_state WHERE id=1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(err)?
        .map(|raw| serde_json::from_str(&raw).map_err(err))
        .transpose();
    if result
        .as_ref()
        .is_ok_and(|state| state.as_ref().is_none_or(super::recovery::valid_state))
    {
        return result;
    }
    if let Err(error) = &result {
        if !super::recovery::damaged(error) {
            return result;
        }
    }
    super::recovery::recover(conn, None)?;
    conn.query_row(
        "SELECT payload FROM _tau_device_state WHERE id=1",
        [],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(err)?
    .map(|raw| serde_json::from_str(&raw).map_err(err))
    .transpose()
}
pub fn generation(conn: &Connection) -> Result<String, String> {
    super::local_generation::ensure(conn)
}
pub fn replacement_base(conn: &Connection) -> Result<Value, String> {
    Ok(
        json!({"state":state(conn)?.ok_or("资料库尚未配对")?,"sequence":sequence(conn)?,"generation":generation(conn)?}),
    )
}
fn checksum(values: &[String]) -> String {
    let mut hash = Sha256::new();
    for value in values {
        hash.update(value.len().to_string());
        hash.update(b":");
        hash.update(value.as_bytes());
    }
    format!("{:x}", hash.finalize())
}
pub(super) fn document_record(row: &rusqlite::Row) -> rusqlite::Result<(Value, bool)> {
    let id = row.get::<_, i64>(0)?;
    let epoch = row.get::<_, i64>(3)?;
    let updated = row.get::<_, i64>(6)?;
    let fields = vec![
        id.to_string(),
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
        epoch.to_string(),
        row.get::<_, String>(4)?,
        row.get::<_, String>(5)?,
        updated.to_string(),
        row.get::<_, String>(7)?,
    ];
    let valid = row.get::<_, String>(8)? == checksum(&fields);
    Ok((
        json!({"contentId":id,"documentId":fields[1],"baselineId":fields[2],"epoch":epoch,"state":fields[4],"paths":serde_json::from_str::<Value>(&fields[5]).unwrap_or(json!({})),"updatedAt":updated,"metricRules":serde_json::from_str::<Value>(&fields[7]).unwrap_or(json!([]))}),
        valid,
    ))
}
pub fn document(conn: &Connection, id: i64) -> Result<Option<Value>, String> {
    match conn
        .query_row(
            "SELECT * FROM _tau_device_documents WHERE content_id=?1",
            [id],
            document_record,
        )
        .optional()
        .map_err(err)
    {
        Ok(Some((entry, true))) => Ok(Some(entry)),
        Ok(None) => Ok(None),
        Err(error) if !super::recovery::damaged(&error) => Err(error),
        _ => {
            super::recovery::recover(conn, Some(id))?;
            Ok(None)
        }
    }
}
pub fn write_document(conn: &Connection, entry: &Value) -> Result<(), String> {
    let id = entry["contentId"]
        .as_i64()
        .ok_or_else(|| err("正文编号无效"))?;
    if let Some(old) = document(conn, id)? {
        if old == *entry {
            return Ok(());
        }
        if old["documentId"] != entry["documentId"]
            || old["baselineId"] != entry["baselineId"]
            || old["epoch"] != entry["epoch"]
        {
            return Err("DEVICE_SYNC_BASELINE_CHANGED: 正文基线不同".into());
        }
    }
    let paths = entry["paths"].to_string();
    let metrics = entry
        .get("metricRules")
        .cloned()
        .unwrap_or(json!([]))
        .to_string();
    let fields = vec![
        id.to_string(),
        entry["documentId"].as_str().ok_or("正文身份缺失")?.into(),
        entry["baselineId"].as_str().ok_or("正文基线缺失")?.into(),
        entry["epoch"].as_i64().ok_or("正文代次缺失")?.to_string(),
        entry["state"].as_str().ok_or("正文检查点缺失")?.into(),
        paths.clone(),
        entry["updatedAt"]
            .as_i64()
            .ok_or("正文时间缺失")?
            .to_string(),
        metrics.clone(),
    ];
    conn.execute("INSERT INTO _tau_device_documents VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(content_id) DO UPDATE SET state=excluded.state,paths=excluded.paths,updated_at=excluded.updated_at,metric_rules=excluded.metric_rules,checksum=excluded.checksum",params![id,entry["documentId"].as_str(),entry["baselineId"].as_str(),entry["epoch"].as_i64(),entry["state"].as_str(),paths,entry["updatedAt"].as_i64(),metrics,checksum(&fields)]).map_err(err)?;
    Ok(())
}
pub fn read(conn: &Connection, snapshot: bool) -> Result<Value, String> {
    if let Err(error) = super::recovery::check(conn) {
        if !super::recovery::damaged(&error) {
            return Err(error);
        }
        super::recovery::recover(conn, None)?;
    }
    compact_projection(conn)?;
    let tx = conn.unchecked_transaction().map_err(err)?;
    let state = state(&tx)?.ok_or("DEVICE_SYNC_DISABLED: 当前资料库未配对")?;
    let schema = tx
        .query_row(
            "SELECT value FROM schema_meta WHERE key='main_schema_hash'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(err)?;
    if schema
        .as_ref()
        .is_some_and(|schema| state["schema"].as_str() != Some(schema.as_str()))
    {
        return Err("DEVICE_SYNC_SCHEMA: 主库结构已升级，需在两端更新并建立新的同步基线".into());
    }
    if tx
        .prepare("SELECT 1 FROM _tau_device_json_intents LIMIT 1")
        .map_err(err)?
        .exists([])
        .map_err(err)?
    {
        return Err("DEVICE_SYNC_RETRY: 正文业务修改尚待转换".into());
    }
    if tx.prepare("SELECT 1 FROM contents c JOIN content_documents d ON d.content_id=c.id LEFT JOIN _tau_device_documents s ON s.content_id=c.id WHERE s.content_id IS NULL LIMIT 1").map_err(err)?.exists([]).map_err(err)?{return Err("DEVICE_SYNC_RETRY: 新正文的共享基线尚未保存".into());}
    let bytes = tx
        .query_row(
            "SELECT projection_bytes FROM _tau_device_state WHERE id=1",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(err)?;
    let force_snapshot =
        state["requiresSnapshot"].as_bool().unwrap_or(false) || bytes > 8 * 1024 * 1024;
    let mut changes = Vec::new();
    let mut all_changes = Vec::new();
    let logs=tx.prepare("SELECT table_name,row_key,before_json,after_json,phase FROM _tau_device_log WHERE seq>?1 AND table_name NOT IN ('_document','_json') AND (?2=0 OR phase=0) ORDER BY seq").map_err(err)?.query_map(params![state["ackSeq"].as_i64().unwrap_or(0),if force_snapshot{1}else{0}],|row|Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,Option<String>>(2)?,row.get::<_,Option<String>>(3)?,row.get::<_,i64>(4)?))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
    for (table, key, before, after, phase) in logs {
        let value = json!({"table":table,"key":serde_json::from_str::<Value>(&key).map_err(err)?,"before":before.map(|raw|serde_json::from_str::<Value>(&raw)).transpose().map_err(err)?,"after":after.map(|raw|serde_json::from_str::<Value>(&raw)).transpose().map_err(err)?});
        if phase == 0 {
            changes.push(value.clone());
        }
        all_changes.push(value);
    }
    let ids = if force_snapshot {
        strings(
            &tx,
            "SELECT CAST(content_id AS TEXT) FROM _tau_device_documents ORDER BY content_id",
            0,
        )?
        .iter()
        .map(|id| id.parse::<i64>().map_err(err))
        .collect::<Result<Vec<_>, _>>()?
    } else {
        tx.prepare("SELECT DISTINCT json_extract(row_key,'$[0]') FROM _tau_device_log WHERE seq>?1 AND table_name='_document'").map_err(err)?.query_map([state["ackSeq"].as_i64().unwrap_or(0)],|row|row.get::<_,i64>(0)).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?
    };
    let documents = ids
        .into_iter()
        .map(|id| document(&tx, id))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let history = strings(
        &tx,
        "SELECT payload FROM _tau_device_history ORDER BY ordinal",
        0,
    )?
    .into_iter()
    .map(|raw| serde_json::from_str::<Value>(&raw).map_err(err))
    .collect::<Result<Vec<_>, _>>()?;
    let receipts = tx
        .prepare("SELECT node,sequence,fingerprint,outcome FROM _tau_device_receipts")
        .map_err(err)?
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                json!({"sequence":row.get::<_,i64>(1)?,"fingerprint":row.get::<_,String>(2)?,"outcome":serde_json::from_str::<Value>(&row.get::<_,String>(3)?).unwrap_or(json!({}))}),
            ))
        })
        .map_err(err)?
        .collect::<Result<Map<_, _>, _>>()
        .map_err(err)?;
    let mut result = json!({"generation":generation(&tx)?,"state":state,"sequence":sequence(&tx)?,"changes":changes,"allChanges":all_changes,"forceSnapshot":force_snapshot,"documents":documents,"history":history,"receipts":receipts});
    if snapshot {
        let mut rows = Map::new();
        for table in tables(&tx)? {
            let records = tx
                .prepare(&format!(
                    "SELECT * FROM {} ORDER BY {}",
                    quote(&table.name),
                    table
                        .key
                        .iter()
                        .map(|key| quote(key))
                        .collect::<Vec<_>>()
                        .join(",")
                ))
                .map_err(err)?
                .query_map([], json_row)
                .map_err(err)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(err)?;
            rows.insert(table.name, json!(records));
        }
        let ids = tx
            .prepare("SELECT content_id FROM _tau_device_documents ORDER BY content_id")
            .map_err(err)?
            .query_map([], |row| row.get::<_, i64>(0))
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        let documents = ids
            .into_iter()
            .map(|id| document(&tx, id))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
        result["snapshot"] = json!({"rows":rows,"documents":documents});
    }
    let restored = self::state(&tx)?
        .as_ref()
        .is_some_and(|current| current["head"] != state["head"]);
    tx.commit().map_err(err)?;
    if restored {
        return Err("DEVICE_SYNC_RETRY: 辅助状态已恢复，重新读取".into());
    }
    Ok(result)
}
fn write_row(conn: &Connection, table: &Table, row: &Value) -> Result<(), String> {
    let row = row.as_object().ok_or_else(|| err("行无效"))?;
    if row.len() != table.columns.len() || table.columns.iter().any(|name| !row.contains_key(name))
    {
        return Err(err("行字段与本机不同"));
    }
    let columns = table
        .columns
        .iter()
        .map(|column| quote(column))
        .collect::<Vec<_>>()
        .join(",");
    let updates = table
        .columns
        .iter()
        .filter(|column| !table.key.contains(column))
        .map(|column| format!("{}=excluded.{}", quote(column), quote(column)))
        .collect::<Vec<_>>()
        .join(",");
    let values = table
        .columns
        .iter()
        .map(|column| sql_value(&row[column]))
        .collect::<Result<Vec<_>, _>>()?;
    conn.execute(
        &format!(
            "INSERT INTO {}({columns}) VALUES({}) ON CONFLICT({}) DO {}",
            quote(&table.name),
            vec!["?"; values.len()].join(","),
            table
                .key
                .iter()
                .map(|column| quote(column))
                .collect::<Vec<_>>()
                .join(","),
            if updates.is_empty() {
                "NOTHING".into()
            } else {
                format!("UPDATE SET {updates}")
            }
        ),
        params_from_iter(values),
    )
    .map_err(row_error)?;
    Ok(())
}
fn apply(conn: &Connection, tables: &[Table], change: &Value) -> Result<(), String> {
    let table = tables
        .iter()
        .find(|table| Some(table.name.as_str()) == change["table"].as_str())
        .ok_or_else(|| err("表无效"))?;
    let key = change["key"].as_array().ok_or_else(|| err("主键无效"))?;
    if key.iter().any(Value::is_null) {
        return Err("DEVICE_SYNC_ROW_KEY: 暂不支持含空值的记录主键，原始数据已保留".into());
    }
    if key.len() != table.key.len() {
        return Err(err("主键无效"));
    }
    let values = key.iter().map(sql_value).collect::<Result<Vec<_>, _>>()?;
    let where_sql = table
        .key
        .iter()
        .map(|column| format!("{} IS ?", quote(column)))
        .collect::<Vec<_>>()
        .join(" AND ");
    let actual = conn
        .query_row(
            &format!("SELECT * FROM {} WHERE {where_sql}", quote(&table.name)),
            params_from_iter(values.iter()),
            json_row,
        )
        .optional()
        .map_err(err)?
        .unwrap_or(Value::Null);
    let managed = ["contents", "content_documents"].contains(&table.name.as_str())
        && key
            .first()
            .and_then(|value| {
                value["$integer"]
                    .as_str()
                    .and_then(|value| value.parse::<i64>().ok())
                    .or_else(|| value.as_i64())
            })
            .map(|id| document(conn, id))
            .transpose()?
            .flatten()
            .is_some();
    let fields = if table.name == "contents" {
        vec!["content", "count", "update_time"]
    } else {
        vec!["contracts", "revision"]
    };
    let normalize = |row: &Value| {
        let mut result = row.clone();
        if managed {
            if let Some(object) = result.as_object_mut() {
                for field in &fields {
                    object.insert((*field).into(), Value::Null);
                }
            }
        }
        if let Some(object) = result.as_object_mut() {
            for value in object.values_mut() {
                if value.is_number() {
                    *value = json!(value.as_f64());
                }
            }
        }
        result
    };
    if normalize(&actual) != normalize(&change["before"]) {
        if actual.is_null() && change["after"].is_null() {
            return Ok(());
        }
        return Err("DEVICE_SYNC_PREIMAGE: 本机行已变化".into());
    }
    if !change["after"].is_null() {
        let mut row = change["after"].clone();
        if managed && !actual.is_null() {
            for field in &fields {
                row[*field] = actual[*field].clone();
            }
        }
        write_row(conn, table, &row)?;
    } else {
        conn.execute(
            &format!("DELETE FROM {} WHERE {where_sql}", quote(&table.name)),
            params_from_iter(values),
        )
        .map_err(err)?;
    }
    Ok(())
}
pub fn commit(
    conn: &mut Connection,
    plan: &Value,
    project: impl Fn(&rusqlite::Transaction, &Value) -> Result<(), String>,
) -> Result<(), String> {
    let previous = conn
        .pragma_query_value(None, "busy_timeout", |row| row.get::<_, u64>(0))
        .map_err(err)?;
    conn.busy_timeout(std::time::Duration::from_millis(25))
        .map_err(err)?;
    let result = commit_inner(conn, plan, project);
    let restore = conn
        .busy_timeout(std::time::Duration::from_millis(previous))
        .map_err(err);
    result.and(restore)
}
fn commit_inner(
    conn: &mut Connection,
    plan: &Value,
    project: impl Fn(&rusqlite::Transaction, &Value) -> Result<(), String>,
) -> Result<(), String> {
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(err)?;
    let state = state(&tx)?.ok_or("DEVICE_SYNC_DISABLED: 当前资料库未配对")?;
    if json!(sequence(&tx)?) != plan["expectedSequence"] || state["head"] != plan["expectedHead"] {
        return Err("DEVICE_SYNC_RETRY: 本机已变化".into());
    }
    if let Some(expected) = plan.get("expectedGeneration") {
        if expected != &json!(generation(&tx)?) {
            return Err("DEVICE_SYNC_REPLACED: 本机资料库已重新下载".into());
        }
    }
    tx.execute_batch(
        "PRAGMA defer_foreign_keys=ON; UPDATE _tau_device_state SET applying=1 WHERE id=1;",
    )
    .map_err(err)?;
    if plan["replaceLocal"].as_bool() == Some(true) {
        if !plan["snapshot"].is_object() || !plan["generation"].is_string() {
            return Err("DEVICE_SYNC_REPLACE: 缺少覆盖快照".into());
        }
        for name in strings(&tx,"SELECT name FROM sqlite_master WHERE type='table' AND name GLOB '_tau_device_*' AND name NOT IN ('_tau_device_state','_tau_device_local')",0)? {
            tx.execute_batch(&format!("{} {}",if name.starts_with("_tau_device_quarantine_"){"DROP TABLE"}else{"DELETE FROM"},quote(&name))).map_err(err)?;
        }
        tx.execute(
            "UPDATE _tau_device_local SET generation=?1 WHERE id=1",
            [plan["generation"].as_str()],
        )
        .map_err(err)?;
        tx.execute(
            "UPDATE _tau_device_state SET pending_count=0 WHERE id=1",
            [],
        )
        .map_err(err)?;
    }
    let triggers=tx.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name NOT LIKE '_tau_device_%'").map_err(err)?.query_map([],|row|Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
    for (name, _) in &triggers {
        tx.execute_batch(&format!("DROP TRIGGER {}", quote(name)))
            .map_err(err)?;
    }
    if let Some(branch) = plan.get("branch") {
        tx.execute(
            "INSERT OR IGNORE INTO _tau_device_branches VALUES (?1,?2,?3)",
            params![
                branch["id"].as_str(),
                branch["reason"].as_str(),
                branch["snapshot"].to_string()
            ],
        )
        .map_err(err)?;
    }
    let specs = tables(&tx)?;
    if let Some(snapshot) = plan.get("snapshot").filter(|value| !value.is_null()) {
        let rows = snapshot["rows"]
            .as_object()
            .ok_or_else(|| err("快照无效"))?;
        if rows.len() != specs.len() || specs.iter().any(|table| !rows.contains_key(&table.name)) {
            return Err(err("快照表不完整"));
        }
        for table in specs.iter().rev() {
            tx.execute_batch(&format!("DELETE FROM {}", quote(&table.name)))
                .map_err(err)?;
        }
        for table in &specs {
            for row in rows[&table.name]
                .as_array()
                .ok_or_else(|| err("快照行无效"))?
            {
                write_row(&tx, table, row)?;
            }
        }
        tx.execute("DELETE FROM _tau_device_documents", [])
            .map_err(err)?;
        for entry in snapshot["documents"]
            .as_array()
            .ok_or_else(|| err("快照正文无效"))?
        {
            write_document(&tx, entry)?;
        }
    } else {
        if let Some(documents) = plan["documents"].as_array() {
            for entry in documents {
                let id = entry["contentId"].as_i64().ok_or("正文编号无效")?;
                if document(&tx, id)?.is_none() {
                    let mut state = entry.clone();
                    state
                        .as_object_mut()
                        .ok_or("正文状态无效")?
                        .remove("projection");
                    write_document(&tx, &state)?;
                }
            }
        }
        for key in ["rollback", "changes"] {
            if let Some(changes) = plan[key].as_array() {
                for change in changes {
                    apply(&tx, &specs, change)?;
                }
            }
        }
    }
    if let Some(documents) = plan["documents"].as_array() {
        for document in documents {
            let mut state = document.clone();
            state.as_object_mut().unwrap().remove("projection");
            write_document(&tx, &state)?;
            project(&tx, document)?;
        }
    }
    if let Some(copies) = plan["noteCopies"].as_array() {
        for copy in copies {
            tx.execute(
                "INSERT INTO _tau_device_note_copies VALUES (?1,?2,?3)",
                params![
                    uuid::Uuid::new_v4().to_string(),
                    copy["reason"].as_str(),
                    copy["document"].to_string()
                ],
            )
            .map_err(err)?;
        }
    }
    if tx
        .prepare("PRAGMA foreign_key_check")
        .map_err(err)?
        .exists([])
        .map_err(err)?
    {
        return Err(err("安装后外键检查失败"));
    }
    if let Some(history) = plan.get("history") {
        tx.execute(
            "INSERT INTO _tau_device_history(id,payload) VALUES (?1,?2)",
            params![history["id"].as_str(), history.to_string()],
        )
        .map_err(err)?;
    }
    if let Some(receipt) = plan.get("receipt") {
        tx.execute("INSERT INTO _tau_device_receipts VALUES (?1,?2,?3,?4) ON CONFLICT(node) DO UPDATE SET sequence=excluded.sequence,fingerprint=excluded.fingerprint,outcome=excluded.outcome WHERE excluded.sequence>=sequence",params![receipt["node"].as_str(),receipt["sequence"].as_i64(),receipt["fingerprint"].as_str(),receipt.get("outcome").cloned().unwrap_or(json!({})).to_string()]).map_err(err)?;
    }
    tx.execute(
        "UPDATE _tau_device_state SET payload=?1,applying=0,projection_bytes=0,metadata_bytes=0 WHERE id=1",
        [plan["state"].to_string()],
    )
    .map_err(err)?;
    if let Some(ids) = plan["pendingDocuments"].as_array() {
        for id in ids {
            tx.execute("INSERT INTO _tau_device_log(table_name,row_key,after_json) VALUES ('_document',?1,'{}')",[json!([id]).to_string()]).map_err(err)?;
        }
    }
    let removed = tx
        .execute(
            "DELETE FROM _tau_device_log WHERE seq<=?1",
            [plan["state"]["ackSeq"].as_i64().unwrap_or(0)],
        )
        .map_err(err)?;
    tx.execute(
        "UPDATE _tau_device_state SET pending_count=pending_count-?1 WHERE id=1",
        [removed as i64],
    )
    .map_err(err)?;
    tx.execute_batch("DELETE FROM _tau_device_history WHERE ordinal NOT IN (SELECT ordinal FROM _tau_device_history ORDER BY ordinal DESC LIMIT 128) OR ordinal IN (SELECT ordinal FROM (SELECT ordinal,sum(length(payload)) OVER (ORDER BY ordinal DESC) AS bytes FROM _tau_device_history) WHERE bytes>16777216)").map_err(err)?;
    for (_, sql) in triggers {
        tx.execute_batch(&sql).map_err(err)?;
    }
    tx.commit().map_err(err)
}

pub fn compact_projection(conn: &Connection) -> Result<(), String> {
    let bytes = conn
        .query_row(
            "SELECT projection_bytes FROM _tau_device_state WHERE id=1",
            [],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(err)?
        .unwrap_or(0);
    let metadata = conn
        .query_row(
            "SELECT metadata_bytes FROM _tau_device_state WHERE id=1",
            [],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(err)?
        .unwrap_or(0)
        > 8 * 1024 * 1024;
    if bytes > 8 * 1024 * 1024 || metadata {
        let mut state = state(conn)?.ok_or("同步状态缺失")?;
        state["requiresSnapshot"] = json!(true);
        if metadata {
            state["recovering"] = json!(true);
        }
        conn.execute(
            "UPDATE _tau_device_state SET payload=?1,projection_bytes=0 WHERE id=1",
            [state.to_string()],
        )
        .map_err(err)?;
        if metadata {
            conn.execute(
                "UPDATE _tau_device_state SET metadata_bytes=0 WHERE id=1",
                [],
            )
            .map_err(err)?;
        }
        let removed = conn
            .execute(
                if metadata {
                    "DELETE FROM _tau_device_log"
                } else {
                    "DELETE FROM _tau_device_log WHERE phase=1"
                },
                [],
            )
            .map_err(err)?;
        conn.execute(
            "UPDATE _tau_device_state SET pending_count=pending_count-?1 WHERE id=1",
            [removed as i64],
        )
        .map_err(err)?;
    }
    let removed=conn.execute("DELETE FROM _tau_device_log WHERE table_name='_document' AND integrity=json_array(seq,table_name,row_key||'',before_json||'',after_json||'',phase) AND seq NOT IN (SELECT max(seq) FROM _tau_device_log WHERE table_name='_document' GROUP BY row_key)",[]).map_err(err)?;
    conn.execute(
        "UPDATE _tau_device_state SET pending_count=pending_count-?1 WHERE id=1",
        [removed as i64],
    )
    .map_err(err)?;
    Ok(())
}
