use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rusqlite::{params_from_iter, types::Value as SqlValue, Connection, Row};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub(super) struct QuerySource<'a> {
    pub json: &'a str,
    pub id: &'a str,
    pub builtins: &'a [(&'a str, &'a str)],
}

pub(super) struct SqlFragment {
    pub sql: String,
    pub params: Vec<SqlValue>,
}

pub(super) struct PageQuery<'a> {
    pub columns: &'a str,
    pub from: &'a str,
    pub filters: Vec<SqlFragment>,
    pub order: &'a Value,
    pub cursor: Option<&'a str>,
    pub limit: usize,
    pub scope: &'a Value,
}

pub(super) struct QueryPage<T> {
    pub rows: Vec<T>,
    pub cursor: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum IndexType {
    String,
    Number,
    Boolean,
}

impl IndexType {
    fn read(value: &Value) -> Result<Self, String> {
        match value.as_str() {
            Some("string") => Ok(Self::String),
            Some("number") => Ok(Self::Number),
            Some("boolean") => Ok(Self::Boolean),
            _ => Err("索引字段类型无效".into()),
        }
    }

    fn accepts(self, value: &Value) -> bool {
        match self {
            Self::String => value.is_string(),
            Self::Number => value.as_f64().is_some_and(f64::is_finite),
            Self::Boolean => value.is_boolean(),
        }
    }
}

fn field_name(field: &str) -> bool {
    !field.is_empty()
        && field.len() <= 64
        && field
            .bytes()
            .next()
            .is_some_and(|value| value.is_ascii_alphabetic() || value == b'_')
        && field
            .bytes()
            .all(|value| value.is_ascii_alphanumeric() || value == b'_')
}

pub(super) fn read_indexes(
    value: Option<&Value>,
    reserved: &[&str],
) -> Result<BTreeMap<String, IndexType>, String> {
    let Some(value) = value else {
        return Ok(BTreeMap::new());
    };
    let entries = value.as_object().ok_or("indexes 必须是对象")?;
    if entries.len() > 16 {
        return Err("indexes 最多 16 个字段".into());
    }
    entries
        .iter()
        .map(|(field, value)| {
            if !field_name(field) || reserved.contains(&field.as_str()) {
                return Err(format!("索引字段名无效或已被宿主使用：{field}"));
            }
            Ok((field.clone(), IndexType::read(value)?))
        })
        .collect()
}

pub(super) fn serialize_object(
    value: &Value,
    indexes: &BTreeMap<String, IndexType>,
    max_utf16_units: usize,
) -> Result<String, String> {
    let object = value.as_object().ok_or("数据必须是 JSON 对象")?;
    for (field, kind) in indexes {
        if object
            .get(field)
            .is_some_and(|value| !value.is_null() && !kind.accepts(value))
        {
            return Err(format!("索引字段 {field} 的值与声明类型不符"));
        }
    }
    let encoded = serde_json::to_string(value).map_err(|error| error.to_string())?;
    if encoded.encode_utf16().count() > max_utf16_units {
        return Err("数据超过允许大小".into());
    }
    Ok(encoded)
}

fn index_expression(
    source: &QuerySource<'_>,
    field: &str,
    kind: IndexType,
) -> Result<String, String> {
    if !field_name(field) {
        return Err("索引字段名无效".into());
    }
    let json_types = match kind {
        IndexType::String => "('text')",
        IndexType::Number => "('integer','real')",
        IndexType::Boolean => "('true','false')",
    };
    Ok(format!(
        "(CASE WHEN json_valid({json}) AND json_type({json},'$.{field}') IN {json_types} THEN json_extract({json},'$.{field}') END)",
        json = source.json
    ))
}

fn typed_value(value: &Value, kind: IndexType, nullable: bool) -> Result<SqlValue, String> {
    if nullable && value.is_null() {
        return Ok(SqlValue::Null);
    }
    if !kind.accepts(value) {
        return Err("查询值与索引类型不符".into());
    }
    if value
        .as_str()
        .is_some_and(|text| text.encode_utf16().count() > 1000)
    {
        return Err("查询文本超过 1000 字符".into());
    }
    scalar(value)
}

fn scalar(value: &Value) -> Result<SqlValue, String> {
    match value {
        Value::Null => Ok(SqlValue::Null),
        Value::Bool(value) => Ok(SqlValue::Integer(i64::from(*value))),
        Value::String(value) => Ok(SqlValue::Text(value.clone())),
        Value::Number(value) => {
            if let Some(value) = value.as_i64() {
                Ok(SqlValue::Integer(value))
            } else {
                value
                    .as_f64()
                    .filter(|value| value.is_finite())
                    .map(SqlValue::Real)
                    .ok_or_else(|| "查询数字无效".into())
            }
        }
        _ => Err("查询值必须为标量".into()),
    }
}

fn object_keys(value: &Value, allowed: &[&str]) -> Result<(), String> {
    let object = value.as_object().ok_or("查询条件必须是对象")?;
    if object
        .keys()
        .any(|field| !allowed.contains(&field.as_str()))
    {
        return Err("查询参数包含未知字段".into());
    }
    Ok(())
}

pub(super) fn where_clause(
    source: &QuerySource<'_>,
    conditions: &Value,
) -> Result<SqlFragment, String> {
    let conditions = conditions.as_array().ok_or("筛选条件必须是数组")?;
    if conditions.len() > 16 {
        return Err("筛选条件最多 16 个".into());
    }
    let mut parts = vec![];
    let mut params = vec![];
    for condition in conditions {
        object_keys(condition, &["field", "type", "op", "value"])?;
        let kind = IndexType::read(&condition["type"])?;
        let field = condition["field"].as_str().ok_or("筛选字段无效")?;
        let column = index_expression(source, field, kind)?;
        let value = condition.get("value").ok_or("筛选值缺失")?;
        match condition["op"].as_str() {
            Some(op @ ("eq" | "ne")) => {
                let operator = if op == "eq" { "IS" } else { "IS NOT" };
                parts.push(format!("{column} {operator} ?"));
                params.push(typed_value(value, kind, true)?);
            }
            Some("in") => {
                let values = value.as_array().ok_or("in 需要数组")?;
                if values.is_empty() || values.len() > 100 {
                    return Err("in 需要 1–100 个取值".into());
                }
                let values = values
                    .iter()
                    .map(|value| typed_value(value, kind, true))
                    .collect::<Result<Vec<_>, _>>()?;
                let present: Vec<_> = values
                    .iter()
                    .filter(|value| **value != SqlValue::Null)
                    .collect();
                let mut choices = vec![];
                if !present.is_empty() {
                    choices.push(format!(
                        "{column} IN ({})",
                        vec!["?"; present.len()].join(",")
                    ));
                    params.extend(present.into_iter().cloned());
                }
                if values.contains(&SqlValue::Null) {
                    choices.push(format!("{column} IS NULL"));
                }
                parts.push(format!("({})", choices.join(" OR ")));
            }
            Some(op @ ("gt" | "gte" | "lt" | "lte")) => {
                if kind == IndexType::Boolean {
                    return Err("布尔字段不能比较大小".into());
                }
                let operator = match op {
                    "gt" => ">",
                    "gte" => ">=",
                    "lt" => "<",
                    _ => "<=",
                };
                parts.push(format!("{column} {operator} ?"));
                params.push(typed_value(value, kind, false)?);
            }
            _ => return Err("未知查询运算符".into()),
        }
    }
    Ok(SqlFragment {
        sql: parts.join(" AND "),
        params,
    })
}

struct OrderColumn {
    sql: String,
    ascending: bool,
}

fn order_columns(source: &QuerySource<'_>, order: &Value) -> Result<Vec<OrderColumn>, String> {
    let order = order.as_array().ok_or("排序条件必须是数组")?;
    if order.is_empty() || order.len() > 2 {
        return Err("orderBy 需要 1–2 项".into());
    }
    let mut columns = vec![];
    for item in order {
        let ascending = match item["direction"].as_str() {
            Some("asc") => true,
            Some("desc") => false,
            _ => return Err("排序方向无效".into()),
        };
        let sql = if item.get("builtin").is_some() {
            object_keys(item, &["builtin", "direction"])?;
            let builtin = item["builtin"].as_str().ok_or("排序字段无效")?;
            source
                .builtins
                .iter()
                .find(|(field, _)| *field == builtin)
                .map(|(_, sql)| (*sql).to_owned())
                .ok_or("排序字段未被宿主支持")?
        } else {
            object_keys(item, &["field", "type", "direction"])?;
            index_expression(
                source,
                item["field"].as_str().ok_or("排序字段无效")?,
                IndexType::read(&item["type"])?,
            )?
        };
        columns.push(OrderColumn { sql, ascending });
    }
    columns.push(OrderColumn {
        sql: source.id.to_owned(),
        ascending: columns.last().is_some_and(|column| column.ascending),
    });
    Ok(columns)
}

fn sql_json(value: &SqlValue) -> Result<Value, String> {
    match value {
        SqlValue::Null => Ok(Value::Null),
        SqlValue::Integer(value) => Ok(json!(value)),
        SqlValue::Real(value) if value.is_finite() => Ok(json!(value)),
        SqlValue::Text(value) => Ok(json!(value)),
        _ => Err("查询游标包含无效标量".into()),
    }
}

fn after_clause(columns: &[OrderColumn], values: &[SqlValue]) -> SqlFragment {
    let mut options = vec![];
    let mut params = vec![];
    for (index, column) in columns.iter().enumerate() {
        let value = &values[index];
        let after = match (column.ascending, value) {
            (true, SqlValue::Null) => format!("{} IS NOT NULL", column.sql),
            (false, SqlValue::Null) => continue,
            (true, _) => format!("{} > ?", column.sql),
            (false, _) => format!("({0} < ? OR {0} IS NULL)", column.sql),
        };
        let mut equal = columns[..index]
            .iter()
            .map(|column| format!("{} IS ?", column.sql))
            .collect::<Vec<_>>();
        equal.push(after);
        options.push(format!("({})", equal.join(" AND ")));
        params.extend_from_slice(&values[..index]);
        if *value != SqlValue::Null {
            params.push(value.clone());
        }
    }
    SqlFragment {
        sql: if options.is_empty() {
            "0".into()
        } else {
            format!("({})", options.join(" OR "))
        },
        params,
    }
}

fn cursor_values(cursor: &str, expected: &str, width: usize) -> Result<Vec<SqlValue>, String> {
    let invalid = || "分页游标无效或已不适用于当前查询".to_owned();
    if cursor.is_empty() || cursor.len() > 16 * 1024 {
        return Err(invalid());
    }
    let parsed: Value =
        serde_json::from_slice(&URL_SAFE_NO_PAD.decode(cursor).map_err(|_| invalid())?)
            .map_err(|_| invalid())?;
    if parsed["f"].as_str() != Some(expected) {
        return Err(invalid());
    }
    let values = parsed["v"].as_array().ok_or_else(invalid)?;
    if values.len() != width
        || values
            .iter()
            .any(|value| value.is_boolean() || value.is_array() || value.is_object())
    {
        return Err(invalid());
    }
    values.iter().map(scalar).collect()
}

pub(super) fn run_page<T, F>(
    conn: &Connection,
    source: &QuerySource<'_>,
    query: PageQuery<'_>,
    mut map: F,
) -> Result<QueryPage<T>, String>
where
    F: FnMut(&Row<'_>) -> rusqlite::Result<T>,
{
    if !(1..=200).contains(&query.limit) {
        return Err("limit 必须是 1–200 的整数".into());
    }
    let columns = order_columns(source, query.order)?;
    let fingerprint_filters = query
        .filters
        .iter()
        .map(|filter| {
            let params = filter
                .params
                .iter()
                .map(sql_json)
                .collect::<Result<Vec<_>, _>>()?;
            Ok(json!([filter.sql, params]))
        })
        .collect::<Result<Vec<Value>, String>>()?;
    let fingerprint = URL_SAFE_NO_PAD.encode(Sha256::digest(
        json!([
            query.scope,
            source.json,
            source.id,
            query.from,
            query.order,
            fingerprint_filters
        ])
        .to_string(),
    ));
    let mut filters: Vec<_> = query
        .filters
        .into_iter()
        .filter(|filter| !filter.sql.is_empty())
        .collect();
    if let Some(cursor) = query.cursor {
        filters.push(after_clause(
            &columns,
            &cursor_values(cursor, &fingerprint, columns.len())?,
        ));
    }
    let keys = columns
        .iter()
        .enumerate()
        .map(|(index, column)| format!("{} AS __k{index}", column.sql))
        .collect::<Vec<_>>()
        .join(",");
    let conditions = if filters.is_empty() {
        String::new()
    } else {
        format!(
            " WHERE {}",
            filters
                .iter()
                .map(|filter| format!("({})", filter.sql))
                .collect::<Vec<_>>()
                .join(" AND ")
        )
    };
    let order = columns
        .iter()
        .map(|column| {
            format!(
                "{} {}",
                column.sql,
                if column.ascending { "ASC" } else { "DESC" }
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    let mut params: Vec<SqlValue> = filters
        .into_iter()
        .flat_map(|filter| filter.params)
        .collect();
    params.push(SqlValue::Integer(query.limit as i64 + 1));
    let mut statement = conn
        .prepare(&format!(
            "SELECT {}, {keys} FROM {}{conditions} ORDER BY {order} LIMIT ?",
            query.columns, query.from
        ))
        .map_err(|error| error.to_string())?;
    let mut rows = statement
        .query(params_from_iter(params))
        .map_err(|error| error.to_string())?;
    let mut result = vec![];
    let mut last_values = vec![];
    let mut more = false;
    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        if result.len() == query.limit {
            more = true;
            break;
        }
        result.push(map(row).map_err(|error| error.to_string())?);
        last_values = (0..columns.len())
            .map(|index| {
                row.get::<_, SqlValue>(format!("__k{index}").as_str())
                    .map_err(|error| error.to_string())
            })
            .collect::<Result<Vec<_>, _>>()?;
    }
    let cursor = if more {
        let values = last_values
            .iter()
            .map(sql_json)
            .collect::<Result<Vec<_>, _>>()?;
        let cursor = URL_SAFE_NO_PAD.encode(json!({"f":fingerprint,"v":values}).to_string());
        if cursor.len() > 16 * 1024 {
            return Err("排序字段过长，无法生成分页游标".into());
        }
        Some(cursor)
    } else {
        None
    };
    Ok(QueryPage {
        rows: result,
        cursor,
    })
}

pub(super) fn contains_clause(column: &str, text: &str) -> SqlFragment {
    let text = text
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    SqlFragment {
        sql: format!("{column} LIKE ? ESCAPE '\\'"),
        params: vec![SqlValue::Text(format!("%{text}%"))],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SOURCE: QuerySource<'static> = QuerySource {
        json: "e.meta",
        id: "e.id",
        builtins: &[("title", "e.title")],
    };

    fn database() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE entries(id INTEGER PRIMARY KEY,title TEXT NOT NULL,meta TEXT NOT NULL)",
        )
        .unwrap();
        for (id, title, meta) in [
            (1, "a", json!({"rank":1})),
            (2, "b", json!({"rank":1})),
            (3, "b", json!({"rank":1})),
            (4, "c", json!({"rank":2})),
            (5, "percent%_\\", json!({})),
        ] {
            db.execute(
                "INSERT INTO entries VALUES(?1,?2,?3)",
                rusqlite::params![id, title, meta.to_string()],
            )
            .unwrap();
        }
        db
    }

    fn page(
        db: &Connection,
        order: &Value,
        cursor: Option<&str>,
    ) -> Result<QueryPage<i64>, String> {
        run_page(
            db,
            &SOURCE,
            PageQuery {
                columns: "e.id",
                from: "entries e",
                filters: vec![],
                order,
                cursor,
                limit: 1,
                scope: &json!(["workspace", "plugin", "entity-kind"]),
            },
            |row| row.get(0),
        )
    }

    #[test]
    fn mixed_order_with_integer_identity_and_nulls_matches_sqlite() {
        let db = database();
        let order = json!([
            {"field":"rank","type":"number","direction":"asc"},
            {"builtin":"title","direction":"desc"}
        ]);
        let mut cursor = None;
        let mut ids = vec![];
        loop {
            let result = page(&db, &order, cursor.as_deref()).unwrap();
            ids.extend(result.rows);
            cursor = result.cursor;
            if cursor.is_none() {
                break;
            }
        }
        assert_eq!(ids, vec![5, 3, 2, 1, 4]);
    }

    #[test]
    fn cursor_rejects_wrong_width_boolean_values_and_oversize_payloads() {
        let db = database();
        let order = json!([{"builtin":"title","direction":"asc"}]);
        let cursor = page(&db, &order, None).unwrap().cursor.unwrap();
        let original: Value =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(&cursor).unwrap()).unwrap();
        for values in [
            json!([]),
            json!([true, 1]),
            json!([{}, 1]),
            json!(["title", [], 0]),
        ] {
            let mut altered = original.clone();
            altered["v"] = values;
            let encoded = URL_SAFE_NO_PAD.encode(altered.to_string());
            assert!(page(&db, &order, Some(&encoded)).is_err());
        }
        assert!(page(&db, &order, Some(&"a".repeat(16 * 1024 + 1))).is_err());
    }

    #[test]
    fn query_and_index_budgets_and_type_rules_are_enforced() {
        let mut indexes = serde_json::Map::new();
        for index in 0..17 {
            indexes.insert(format!("field{index}"), json!("string"));
        }
        assert!(read_indexes(Some(&Value::Object(indexes)), &[]).is_err());
        assert!(read_indexes(Some(&json!({"value":"object"})), &[]).is_err());
        assert!(read_indexes(Some(&json!({"createdAt":"number"})), &["createdAt"]).is_err());
        assert!(read_indexes(Some(&json!({"9invalid":"number"})), &[]).is_err());
        let indexes =
            read_indexes(Some(&json!({"enabled":"boolean","rank":"number"})), &[]).unwrap();
        assert!(serialize_object(&json!({"enabled":1}), &indexes, 64 * 1024).is_err());
        assert!(serialize_object(&json!({"rank":true}), &indexes, 64 * 1024).is_err());
        assert!(serialize_object(
            &json!({"enabled":null,"other":{"nested":true}}),
            &indexes,
            64 * 1024
        )
        .is_ok());
        let condition = json!({"field":"rank","type":"number","op":"eq","value":1});
        assert!(where_clause(&SOURCE, &json!(vec![condition; 17])).is_err());
        assert!(where_clause(
            &SOURCE,
            &json!([{"field":"rank","type":"number","op":"in","value":vec![1;101]}])
        )
        .is_err());
        assert!(where_clause(
            &SOURCE,
            &json!([{"field":"rank","type":"string","op":"eq","value":"x".repeat(1001)}])
        )
        .is_err());
        assert!(where_clause(
            &SOURCE,
            &json!([{"field":"rank","type":"number","op":"unknown","value":1}])
        )
        .is_err());
        assert!(order_columns(
            &SOURCE,
            &json!([{"field":"rank","type":"number","direction":"DESC;DELETE"}])
        )
        .is_err());
        assert!(order_columns(
            &SOURCE,
            &json!([{"builtin":"title","field":"rank","direction":"asc"}])
        )
        .is_err());
    }

    #[test]
    fn title_contains_treats_wildcards_as_literal_text() {
        let db = database();
        let result = run_page(
            &db,
            &SOURCE,
            PageQuery {
                columns: "e.id",
                from: "entries e",
                filters: vec![contains_clause("e.title", "%_\\")],
                order: &json!([{"builtin":"title","direction":"asc"}]),
                cursor: None,
                limit: 20,
                scope: &json!("test"),
            },
            |row| row.get::<_, i64>(0),
        )
        .unwrap();
        assert_eq!(result.rows, vec![5]);
    }
}
