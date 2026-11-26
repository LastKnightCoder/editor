use rusqlite::{params, Connection};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

const POLICY: &str =
    include_str!("../../../../../packages/db-schema/query-database-migration.json");
type Columns = Vec<(String, String)>;
const FIELD_KEYS: &[&str] = &[
    "fieldId",
    "columnId",
    "dateColumnId",
    "groupColumnId",
    "doneColumnId",
    "coverImageColumnId",
];

fn mapped<'a>(columns: &'a Columns, id: &str) -> Option<&'a str> {
    columns
        .iter()
        .find(|(old, _)| old == id)
        .map(|(_, new)| new.as_str())
}
fn quoted(value: &str) -> String {
    Value::String(value.into()).to_string()
}

fn definition(
    kind: &str,
    scope: &Value,
    fields: &Value,
    columns: &Value,
) -> Result<(Value, Columns), String> {
    let policy: Value = serde_json::from_str(POLICY).map_err(|e| e.to_string())?;
    let spec = policy.get(kind).ok_or("旧关联表的数据源无效")?;
    let fields = fields.as_array().ok_or("旧关联表字段无效")?;
    let stored = columns.as_array().ok_or("旧关联表列无效")?;
    let mut mapping = Vec::new();
    let mut selections = Vec::new();
    for (index, field) in spec["fields"]
        .as_array()
        .ok_or("查询迁移字段政策无效")?
        .iter()
        .enumerate()
    {
        let old = field[0].as_str().ok_or("查询迁移字段无效")?;
        let key = field[1].as_str().ok_or("查询迁移字段无效")?;
        if index != 0 && !fields.iter().any(|value| value == old) {
            continue;
        }
        let id = format!("src:{old}");
        let title = stored
            .iter()
            .find(|column| column["id"] == id)
            .and_then(|column| column["title"].as_str())
            .filter(|title| !title.is_empty())
            .or_else(|| field[2].as_str())
            .ok_or("查询迁移标题无效")?;
        mapping.push((id, format!("q:{key}")));
        selections.push(format!("{key} AS {}", quoted(title)));
    }
    selections.push("source AS \"来源\"".into());
    let mut arguments = Map::new();
    let condition = match kind {
        "card" | "article" => scope["tags"]
            .as_array()
            .map(|tags| {
                tags.iter()
                    .filter_map(Value::as_str)
                    .filter(|tag| !tag.is_empty())
                    .map(|tag| format!("hasTag({})", quoted(tag)))
                    .collect::<Vec<_>>()
                    .join(" OR ")
            })
            .unwrap_or_default(),
        "document" => {
            let id = scope["projectId"]
                .as_i64()
                .filter(|id| *id > 0 && *id <= 9_007_199_254_740_991)
                .ok_or("旧关联表的项目编号无效")?;
            arguments.insert("projectId".into(), json!(id));
            arguments.insert(
                "deep".into(),
                json!(scope["deep"].as_bool().unwrap_or(false)),
            );
            "kind = \"document\"".into()
        }
        _ if scope["range"] == "all" => String::new(),
        _ if scope["range"] == "year" => "year(date) = year(today())".into(),
        _ => "year(date) = year(today()) AND month(date) = month(today())".into(),
    };
    let suffix = if condition.is_empty() {
        String::new()
    } else {
        format!("\nWHERE {condition}")
    };
    let source = spec["source"].as_str().ok_or("查询迁移来源无效")?;
    let mut result = json!({"version":1,"language":"dsl","code":format!("TABLE {}\nFROM {source}{suffix}",selections.join(", "))});
    if !arguments.is_empty() {
        result["params"] = Value::Object(arguments);
    }
    Ok((result, mapping))
}

fn visit(value: &Value, columns: &Columns, depth: usize) -> Result<Option<Value>, String> {
    if depth > 64 {
        return Err("旧关联表的视图层级过深".into());
    }
    if let Some(values) = value.as_array() {
        let mut result = Vec::new();
        for item in values {
            if let Some(next) = visit(item, columns, depth + 1)? {
                result.push(next);
            }
        }
        return Ok(Some(Value::Array(result)));
    }
    let Some(object) = value.as_object() else {
        return Ok(Some(value.clone()));
    };
    if FIELD_KEYS.iter().any(|key| {
        object
            .get(*key)
            .and_then(Value::as_str)
            .is_some_and(|id| mapped(columns, id).is_none())
    }) {
        return Ok(None);
    }
    let mut result = Map::new();
    for (key, child) in object {
        if key == "value" {
            result.insert(key.clone(), child.clone());
        } else if FIELD_KEYS.contains(&key.as_str()) && child.is_string() {
            if let Some(id) = child.as_str().and_then(|id| mapped(columns, id)) {
                result.insert(key.clone(), json!(id));
            }
        } else if ["hiddenColumnIds", "visibleFieldIds"].contains(&key.as_str()) && child.is_array()
        {
            let ids = child
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .filter_map(|id| mapped(columns, id))
                .collect::<Vec<_>>();
            result.insert(key.clone(), json!(ids));
        } else if ["footer", "columnWidths"].contains(&key.as_str()) && child.is_object() {
            let mut entries = Map::new();
            if let Some(object) = child.as_object() {
                for (id, item) in object {
                    if let (Some(id), Some(next)) =
                        (mapped(columns, id), visit(item, columns, depth + 1)?)
                    {
                        entries.insert(id.into(), next);
                    }
                }
            }
            result.insert(key.clone(), Value::Object(entries));
        } else if let Some(next) = visit(child, columns, depth + 1)? {
            result.insert(key.clone(), next);
        } else if ["expr", "left", "right", "test", "then", "else", "operand"]
            .contains(&key.as_str())
        {
            return Ok(None);
        }
    }
    if result.get("type").is_some_and(|value| value == "group")
        && result
            .get("children")
            .and_then(Value::as_array)
            .is_some_and(Vec::is_empty)
    {
        return Ok(None);
    }
    Ok(Some(Value::Object(result)))
}

fn view(config: &Value, mapping: &Columns, columns: &Value) -> Result<Value, String> {
    let mut result = visit(config, mapping, 0)?
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({}));
    let mut order = Vec::<String>::new();
    for id in config["columnOrder"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter_map(|id| mapped(mapping, id))
        .chain(mapping.iter().map(|(_, new)| new.as_str()))
        .chain(std::iter::once("q:source"))
    {
        if !order.iter().any(|existing| existing == id) {
            order.push(id.into());
        }
    }
    result["columnOrder"] = json!(order);
    let mut widths = Map::new();
    let mut hidden = result["hiddenColumnIds"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    for column in columns.as_array().into_iter().flatten() {
        if let Some(id) = column["id"].as_str().and_then(|id| mapped(mapping, id)) {
            if column["width"].is_number() {
                widths.insert(id.into(), column["width"].clone());
            }
            if column["hidden"] == true && !hidden.iter().any(|value| value == id) {
                hidden.push(json!(id));
            }
        }
    }
    if let Some(existing) = result["columnWidths"].as_object() {
        widths.extend(existing.clone());
    }
    result["columnWidths"] = Value::Object(widths);
    result["hiddenColumnIds"] = Value::Array(hidden);
    let defaults = [
        ("filters", Value::Null),
        ("groupBy", Value::Null),
        ("sorts", json!([])),
        ("rowOrder", json!([])),
    ];
    for (key, value) in defaults {
        if result.get(key).is_none_or(Value::is_null) {
            result[key] = value;
        }
    }
    Ok(result)
}

pub(super) fn needs_upgrade(conn: &Connection) -> Result<bool, String> {
    conn.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='data_table_sources')",[],|row|row.get(0)).map_err(|e|e.to_string())
}

fn view_type<'a>(kind: &'a str, config: &Value) -> &'a str {
    let key = match kind {
        "calendar" => "dateColumnId",
        "kanban" => "groupColumnId",
        _ => return kind,
    };
    if config["viewOptions"][kind][key].is_string() {
        kind
    } else {
        "table"
    }
}
pub(super) fn upgrade(conn: &Connection, now: i64) -> Result<(), String> {
    if !needs_upgrade(conn)? {
        return Ok(());
    }
    let records = conn.prepare("SELECT s.table_id,s.kind,s.scope,s.fields,t.columns,t.rows,t.ref_count FROM data_table_sources s JOIN data_tables t ON t.id=s.table_id")
        .map_err(|e|e.to_string())?.query_map([],|row|Ok((row.get::<_,i64>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?,row.get::<_,String>(3)?,row.get::<_,String>(4)?,row.get::<_,String>(5)?,row.get::<_,i64>(6)?)))
        .map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    for (id, kind, scope, fields, columns, rows, refs) in records {
        let parse = |raw: &str| serde_json::from_str::<Value>(raw).map_err(|e| e.to_string());
        let columns = parse(&columns)?;
        let (definition, mapping) = definition(&kind, &parse(&scope)?, &parse(&fields)?, &columns)?;
        let inserted=conn.execute("INSERT OR IGNORE INTO data_table_queries(table_id,definition,revision,update_time) VALUES(?1,?2,1,?3)",params![id,definition.to_string(),now]).map_err(|e|e.to_string())?;
        if inserted > 0 {
            let views = conn
                .prepare("SELECT id,config,type FROM data_table_views WHERE table_id=?1")
                .map_err(|e| e.to_string())?
                .query_map([id], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            for (view_id, config, kind) in views {
                let config = view(&parse(&config)?, &mapping, &columns)?;
                conn.execute(
                    "UPDATE data_table_views SET config=?1,update_time=?2,type=?4 WHERE id=?3",
                    params![config.to_string(), now, view_id, view_type(&kind, &config)],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        if refs > 0 {
            let mut counts = BTreeMap::<i64, i64>::new();
            for row in parse(&rows)?.as_array().ok_or("旧关联表行无效")? {
                if let Some(id) = row["detailContentId"].as_i64().filter(|id| *id > 0) {
                    *counts.entry(id).or_default() += 1;
                }
                for column in columns.as_array().ok_or("旧关联表列无效")? {
                    if column["type"] != "rich-text" {
                        continue;
                    }
                    if let Some(values) = column["id"].as_str().and_then(|key| row[key].as_array())
                    {
                        for value in values {
                            if let Some(id) = value["contentId"].as_i64().filter(|id| *id > 0) {
                                *counts.entry(id).or_default() += 1;
                            }
                        }
                    }
                }
            }
            for (content_id, count) in counts {
                conn.execute(
                    "UPDATE contents SET ref_count=MAX(0,ref_count-?1) WHERE id=?2",
                    params![count, content_id],
                )
                .map_err(|e| e.to_string())?;
                conn.execute("INSERT OR IGNORE INTO content_pending_releases(content_id,released_at) SELECT id,?1 FROM content_snapshots WHERE id=?2 AND ref_count<=0",params![now,content_id]).map_err(|e|e.to_string())?;
            }
        }
        conn.execute(
            "UPDATE data_tables SET columns='[]',rows='[]',update_time=?1 WHERE id=?2",
            params![now, id],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute_batch("DROP TABLE data_table_sources")
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reopening_current_schema_migrates_old_tables_and_releases_only_owned_content() {
        let conn = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&conn).unwrap();
        conn.execute_batch("CREATE TABLE data_table_sources(table_id INTEGER PRIMARY KEY,kind TEXT,scope TEXT,fields TEXT,create_time INTEGER,update_time INTEGER);
          INSERT INTO contents(id,create_time,update_time,content,ref_count) VALUES(90,1,1,'[]',1),(91,1,1,'[]',2);
          INSERT INTO cards(id,create_time,update_time,content_id,tags) VALUES(7,1,1,90,'[]');
          INSERT INTO data_tables(id,create_time,update_time,columns,rows,ref_count) VALUES(3,1,1,'[{\"id\":\"own\",\"type\":\"rich-text\"}]','[{\"id\":\"card:7\",\"detailContentId\":91,\"own\":[{\"contentId\":91}]}]',1);
          INSERT INTO data_table_sources VALUES(3,'card','{}','[\"title\"]',1,1);").unwrap();
        conn.execute_batch(r#"INSERT INTO data_table_views(id,table_id,name,type,config,sort_order,create_time,update_time)
          VALUES(5,3,'旧日历','calendar','{"viewOptions":{"calendar":{"dateColumnId":"own"}}}',0,1,1);
          UPDATE data_tables SET active_view_id=5 WHERE id=3;"#).unwrap();
        super::super::migrator::ensure_main_schema(&conn).unwrap();
        assert!(!needs_upgrade(&conn).unwrap());
        assert_eq!(
            conn.query_row("SELECT type FROM data_table_views WHERE id=5", [], |row| {
                row.get::<_, String>(0)
            })
            .unwrap(),
            "table"
        );
        assert_eq!(
            conn.query_row(
                "SELECT active_view_id FROM data_tables WHERE id=3",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            5
        );
        assert_eq!(
            conn.query_row("SELECT ref_count FROM contents WHERE id=90", [], |row| row
                .get::<_, i64>(
                0
            ))
            .unwrap(),
            1
        );
        assert_eq!(
            conn.query_row("SELECT ref_count FROM contents WHERE id=91", [], |row| row
                .get::<_, i64>(
                0
            ))
            .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row("SELECT rows FROM data_tables WHERE id=3", [], |row| row
                .get::<_, String>(
                0
            ))
            .unwrap(),
            "[]"
        );
        let saved = conn
            .query_row(
                "SELECT definition FROM data_table_queries WHERE table_id=3",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap();
        super::super::migrator::ensure_main_schema(&conn).unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT definition FROM data_table_queries WHERE table_id=3",
                [],
                |row| row.get::<_, String>(0)
            )
            .unwrap(),
            saved
        );
    }
    #[test]
    fn failed_conversion_rolls_back_every_definition_and_keeps_the_legacy_input() {
        let conn = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&conn).unwrap();
        conn.execute_batch("CREATE TABLE data_table_sources(table_id INTEGER PRIMARY KEY,kind TEXT,scope TEXT,fields TEXT,create_time INTEGER,update_time INTEGER);
          INSERT INTO data_tables(id,create_time,update_time,columns,rows,ref_count) VALUES(1,1,1,'[]','[]',1),(2,1,1,'[]','[]',1);
          INSERT INTO data_table_sources VALUES(1,'card','{}','[]',1,1),(2,'document','{}','[]',1,1);").unwrap();
        assert!(super::super::migrator::ensure_main_schema(&conn).is_err());
        assert!(needs_upgrade(&conn).unwrap());
        assert_eq!(
            conn.query_row("SELECT count(*) FROM data_table_queries", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row("SELECT count(*) FROM data_table_sources", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
    }
    #[test]
    fn migration_matches_shared_contract() {
        let fixtures: Value = serde_json::from_str(include_str!(
            "../../../../../packages/db-schema/query-database-migration-fixtures.json"
        ))
        .unwrap();
        for fixture in fixtures.as_array().unwrap() {
            let input = &fixture["input"];
            let (actual, mapping) = definition(
                input["kind"].as_str().unwrap(),
                &input["scope"],
                &input["fields"],
                &input["columns"],
            )
            .unwrap();
            assert_eq!(actual, fixture["definition"]);
            let config = view(&fixture["config"], &mapping, &input["columns"]).unwrap();
            assert_eq!(config, fixture["view"]);
            assert_eq!(
                view_type(fixture["type"].as_str().unwrap(), &config),
                fixture["viewType"].as_str().unwrap()
            );
        }
    }
}
