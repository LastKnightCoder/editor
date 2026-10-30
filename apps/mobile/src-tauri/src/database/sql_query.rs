//! AI 工具 sql_query 的只读 SQL 执行，行为与桌面端 `sql-query.ts` 的 `executeReadOnlySql` 对齐。
//!
//! 错误以字符串返回，格式为 `"<CODE>: <message>|<hint>"`，CODE 取值：
//! SQL_READ_ONLY_VIOLATION / SQL_SYNTAX_ERROR / SQL_SCHEMA_ERROR / SQL_TIMEOUT / SQL_EXECUTION_ERROR；
//! 前端按第一个 `": "` 切出 CODE，再按第一个 `|` 切出 message 与 hint。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD, Engine};
use regex::Regex;
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{Connection, ErrorCode, Statement};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use tauri::{AppHandle, WebviewWindow};

use super::schema;

const MAX_ROWS: i64 = 2000;
const DEFAULT_ROWS: i64 = 200;
const MAX_TIMEOUT_MS: i64 = 10_000;
const MIN_TIMEOUT_MS: i64 = 100;
const DEFAULT_TIMEOUT_MS: i64 = 3_000;
const MAX_CELL_LENGTH: usize = 20_000;
const MAX_RESULT_BYTES: usize = 1_000_000;
const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;
// 进度回调的 VM 指令间隔：越小超时越准，开销越大
const PROGRESS_OPS: i32 = 1000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlQueryInput {
    pub sql: String,
    #[serde(default)]
    pub params: Option<Value>,
    #[serde(default)]
    pub max_rows: Option<f64>,
    #[serde(default)]
    pub timeout_ms: Option<f64>,
}

#[derive(Debug, PartialEq)]
pub struct SqlQueryError {
    pub code: &'static str,
    pub message: String,
    pub hint: String,
}

impl SqlQueryError {
    fn new(code: &'static str, message: &str, hint: &str) -> Self {
        Self {
            code,
            message: message.into(),
            hint: hint.into(),
        }
    }

    fn read_only(message: &str, hint: &str) -> Self {
        Self::new("SQL_READ_ONLY_VIOLATION", message, hint)
    }

    fn timeout() -> Self {
        Self::new(
            "SQL_TIMEOUT",
            "SQL 查询超时。",
            "请增加过滤条件、缩小范围或降低 JOIN 复杂度。",
        )
    }

    fn execution() -> Self {
        Self::new(
            "SQL_EXECUTION_ERROR",
            "SQL 查询执行失败。",
            "请缩小查询范围或修正 SQL 后重试。",
        )
    }

    pub fn to_error_string(&self) -> String {
        format!("{}: {}|{}", self.code, self.message, self.hint)
    }
}

/// 对齐桌面 toError：按 SQLite 报错文本归类
fn classify(error: &rusqlite::Error) -> SqlQueryError {
    let raw = error.to_string();
    let lower = raw.to_lowercase();
    if lower.contains("syntax") {
        return SqlQueryError::new(
            "SQL_SYNTAX_ERROR",
            "SQL 语法错误，请检查关键字、括号和逗号。",
            &raw,
        );
    }
    if lower.contains("no such table")
        || lower.contains("no such column")
        || lower.contains("ambiguous")
    {
        return SqlQueryError::new(
            "SQL_SCHEMA_ERROR",
            "查询引用了不存在或不明确的表/字段。",
            "请读取 database-schema Skill 后修正表名和字段名。",
        );
    }
    SqlQueryError::execution()
}

fn is_interrupted(error: &rusqlite::Error) -> bool {
    matches!(error, rusqlite::Error::SqliteFailure(e, _) if e.code == ErrorCode::OperationInterrupted)
        || error.to_string().to_lowercase().contains("interrupted")
}

fn regex(cell: &'static OnceLock<Regex>, pattern: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(pattern).expect("正则常量必须合法"))
}

/// 文本防护：拒绝注释/多语句/非只读起始关键字/写入关键字/非白名单 PRAGMA，返回去掉末尾分号的原文
pub fn scan_sql(sql: &str) -> Result<String, SqlQueryError> {
    let chars: Vec<char> = sql.chars().collect();
    let mut quote: Option<char> = None;
    let mut has_terminator = false;
    // normalized 剔除引号内容并小写化，只用于防护检查；执行仍用原文
    let mut normalized = String::with_capacity(sql.len());
    let mut index = 0;
    while index < chars.len() {
        let ch = chars[index];
        let next = chars.get(index + 1).copied();
        if let Some(q) = quote {
            if q == '[' && ch == ']' {
                quote = None;
            } else if q != '[' && ch == q {
                if next == Some(q) {
                    index += 1;
                } else {
                    quote = None;
                }
            }
            index += 1;
            continue;
        }
        if matches!(ch, '\'' | '"' | '`' | '[') {
            quote = Some(ch);
            index += 1;
            continue;
        }
        if (ch == '-' && next == Some('-')) || (ch == '/' && next == Some('*')) {
            return Err(SqlQueryError::read_only(
                "SQL 不允许包含注释。",
                "请删除注释后重新提交单条查询。",
            ));
        }
        if ch == ';' {
            has_terminator = true;
        }
        normalized.extend(ch.to_lowercase());
        index += 1;
    }

    let trimmed = normalized.trim();
    let first_keyword: String = trimmed
        .chars()
        .take_while(|c| c.is_ascii_lowercase() || *c == '_')
        .collect();
    if !["select", "with", "explain", "pragma"].contains(&first_keyword.as_str()) {
        return Err(SqlQueryError::read_only(
            "只允许执行 SELECT、WITH、EXPLAIN 和受限 PRAGMA 查询。",
            "请将查询改为只读查询。",
        ));
    }
    static WRITE_KEYWORDS: OnceLock<Regex> = OnceLock::new();
    // (?-u:\b) 取 ASCII 词边界，与 JS 正则 \b 语义一致
    let write_keywords = regex(
        &WRITE_KEYWORDS,
        r"(?-u:\b)(insert|update|delete|alter|drop|create|vacuum|attach|detach|begin|commit|rollback|reindex|analyze)(?-u:\b)",
    );
    if write_keywords.is_match(trimmed) {
        return Err(SqlQueryError::read_only(
            "查询中包含不允许的写入或数据库管理语句。",
            "请只保留 SELECT 查询和必要的只读 CTE。",
        ));
    }
    static PRAGMA_ALLOWED: OnceLock<Regex> = OnceLock::new();
    let pragma_allowed = regex(
        &PRAGMA_ALLOWED,
        r"^pragma\s+(table_info|foreign_key_list|index_list)\s*\(",
    );
    if first_keyword == "pragma" && !pragma_allowed.is_match(trimmed) {
        return Err(SqlQueryError::read_only(
            "只允许使用 table_info、foreign_key_list 和 index_list PRAGMA。",
            "请使用受支持的结构探查 PRAGMA。",
        ));
    }
    if has_terminator && trimmed.find(';') != Some(trimmed.len() - 1) {
        return Err(SqlQueryError::read_only(
            "只允许执行单条 SQL 查询。",
            "请删除多余的语句。",
        ));
    }
    let original = sql.trim();
    Ok(original
        .strip_suffix(';')
        .map(str::trim_end)
        .unwrap_or(original)
        .to_string())
}

fn clamp_option(value: Option<f64>, default: i64, min: i64, max: i64) -> i64 {
    let requested = value
        .filter(|v| v.is_finite())
        .map(|v| v.floor() as i64)
        .unwrap_or(default);
    requested.clamp(min, max)
}

fn to_sql_value(value: &Value) -> Result<SqlValue, SqlQueryError> {
    match value {
        Value::Null => Ok(SqlValue::Null),
        Value::Bool(b) => Ok(SqlValue::Integer(i64::from(*b))),
        Value::Number(n) => Ok(match n.as_i64() {
            Some(i) => SqlValue::Integer(i),
            None => SqlValue::Real(n.as_f64().ok_or_else(SqlQueryError::execution)?),
        }),
        Value::String(s) => Ok(SqlValue::Text(s.clone())),
        _ => Err(SqlQueryError::execution()),
    }
}

/// 位置参数按序绑定；命名参数对齐 better-sqlite3：SQL 写 :name/@name/$name，对象键可带或不带前缀
fn bind_params(statement: &mut Statement, params: Option<&Value>) -> Result<(), SqlQueryError> {
    let count = statement.parameter_count();
    match params {
        None | Some(Value::Null) => {
            if count > 0 {
                return Err(SqlQueryError::execution());
            }
        }
        Some(Value::Array(values)) => {
            if values.len() != count {
                return Err(SqlQueryError::execution());
            }
            for (offset, value) in values.iter().enumerate() {
                statement
                    .raw_bind_parameter(offset + 1, to_sql_value(value)?)
                    .map_err(|e| classify(&e))?;
            }
        }
        Some(Value::Object(record)) => {
            for index in 1..=count {
                let name = statement
                    .parameter_name(index)
                    .ok_or_else(SqlQueryError::execution)?
                    .to_string();
                let bare = name.trim_start_matches([':', '@', '$']);
                let value = record
                    .get(bare)
                    .or_else(|| record.get(&name))
                    .ok_or_else(SqlQueryError::execution)?;
                statement
                    .raw_bind_parameter(index, to_sql_value(value)?)
                    .map_err(|e| classify(&e))?;
            }
        }
        Some(_) => return Err(SqlQueryError::execution()),
    }
    Ok(())
}

fn truncate_text(text: &str) -> String {
    match text.char_indices().nth(MAX_CELL_LENGTH) {
        Some((cut, _)) => format!("{}…", &text[..cut]),
        None => text.to_string(),
    }
}

fn to_json_value(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) if i.abs() > MAX_SAFE_INTEGER => Value::String(i.to_string()),
        ValueRef::Integer(i) => json!(i),
        ValueRef::Real(f) => json!(f),
        ValueRef::Text(bytes) => Value::String(truncate_text(&String::from_utf8_lossy(bytes))),
        ValueRef::Blob(bytes) => Value::String(STANDARD.encode(bytes)),
    }
}

/// 执行期间把连接置为 query_only 并挂超时回调；Drop 时恢复原状态，共享连接不会被污染
struct ReadOnlyScope<'a> {
    conn: &'a Connection,
    previous_query_only: bool,
}

impl<'a> ReadOnlyScope<'a> {
    fn enter(
        conn: &'a Connection,
        deadline: Instant,
        timed_out: Arc<AtomicBool>,
    ) -> Result<Self, SqlQueryError> {
        let previous_query_only = conn
            .query_row("PRAGMA query_only", [], |row| row.get::<_, i64>(0))
            .map_err(|e| classify(&e))?
            != 0;
        conn.pragma_update(None, "query_only", true)
            .map_err(|e| classify(&e))?;
        conn.progress_handler(
            PROGRESS_OPS,
            Some(move || {
                if Instant::now() >= deadline {
                    timed_out.store(true, Ordering::SeqCst);
                    return true;
                }
                false
            }),
        );
        Ok(Self {
            conn,
            previous_query_only,
        })
    }
}

impl Drop for ReadOnlyScope<'_> {
    fn drop(&mut self) {
        self.conn.progress_handler(0, None::<fn() -> bool>);
        let _ = self
            .conn
            .pragma_update(None, "query_only", self.previous_query_only);
    }
}

pub fn execute_read_only(conn: &Connection, input: &SqlQueryInput) -> Result<Value, SqlQueryError> {
    let started_at = Instant::now();
    let sql = scan_sql(&input.sql)?;
    let max_rows = clamp_option(input.max_rows, DEFAULT_ROWS, 1, MAX_ROWS) as usize;
    let timeout_ms = clamp_option(
        input.timeout_ms,
        DEFAULT_TIMEOUT_MS,
        MIN_TIMEOUT_MS,
        MAX_TIMEOUT_MS,
    );
    let timed_out = Arc::new(AtomicBool::new(false));
    let deadline = Instant::now() + Duration::from_millis(timeout_ms as u64);
    let _scope = ReadOnlyScope::enter(conn, deadline, timed_out.clone())?;

    let map_run_error = |error: rusqlite::Error| {
        if timed_out.load(Ordering::SeqCst) || is_interrupted(&error) {
            SqlQueryError::timeout()
        } else {
            classify(&error)
        }
    };
    let mut statement = conn.prepare(&sql).map_err(map_run_error)?;
    if statement.column_count() == 0 {
        return Err(SqlQueryError::read_only(
            "该 SQL 不会返回查询结果，已拒绝执行。",
            "请使用 SELECT 或受限结构探查 PRAGMA。",
        ));
    }
    if !statement.readonly() {
        return Err(SqlQueryError::read_only(
            "查询中包含不允许的写入或数据库管理语句。",
            "请只保留 SELECT 查询和必要的只读 CTE。",
        ));
    }
    let columns: Vec<Value> = statement
        .columns()
        .iter()
        .map(|column| match column.decl_type() {
            Some(declared) => json!({ "name": column.name(), "declaredType": declared }),
            None => json!({ "name": column.name() }),
        })
        .collect();
    let names: Vec<String> = statement
        .column_names()
        .into_iter()
        .map(String::from)
        .collect();
    bind_params(&mut statement, input.params.as_ref())?;

    let mut rows: Vec<Value> = Vec::new();
    let mut truncated = false;
    let mut result_bytes = 0usize;
    let mut cursor = statement.raw_query();
    while let Some(row) = cursor.next().map_err(map_run_error)? {
        if rows.len() >= max_rows {
            truncated = true;
            break;
        }
        let mut converted = Map::new();
        for (index, name) in names.iter().enumerate() {
            let value = row.get_ref(index).map_err(map_run_error)?;
            converted.insert(name.clone(), to_json_value(value));
        }
        let converted = Value::Object(converted);
        // 与桌面 JSON.stringify(...).length 一致，按 UTF-16 码元计
        result_bytes += converted.to_string().encode_utf16().count() + 1;
        if result_bytes > MAX_RESULT_BYTES {
            truncated = true;
            break;
        }
        rows.push(converted);
    }
    let count = rows.len();
    Ok(json!({
        "columns": columns,
        "rows": rows,
        "rowCount": count,
        "returnedRowCount": count,
        "truncated": truncated,
        "durationMs": started_at.elapsed().as_millis() as u64,
    }))
}

#[tauri::command]
pub fn ai_sql_query(
    app: AppHandle,
    window: WebviewWindow,
    database: String,
    input: SqlQueryInput,
) -> Result<Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    let conn = schema::open_active_database(&app)?;
    if conn.database_name() != database {
        return Err("数据库已切换".into());
    }
    execute_read_only(&conn, &input).map_err(|error| error.to_error_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(sql: &str) -> SqlQueryInput {
        SqlQueryInput {
            sql: sql.into(),
            params: None,
            max_rows: None,
            timeout_ms: None,
        }
    }

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE notes(id INTEGER PRIMARY KEY, title TEXT, data BLOB);
             INSERT INTO notes(title, data) VALUES ('a', x'010203'), ('b', NULL), ('c', NULL);",
        )
        .unwrap();
        conn
    }

    fn code_of(sql: &str) -> &'static str {
        scan_sql(sql).unwrap_err().code
    }

    #[test]
    fn rejects_write_statements() {
        for sql in [
            "insert into notes values (1)",
            "update notes set title = 'x'",
            "drop table notes",
            "attach database 'x' as y",
            "with t as (select 1) delete from notes",
        ] {
            assert_eq!(code_of(sql), "SQL_READ_ONLY_VIOLATION", "{sql}");
        }
    }

    #[test]
    fn rejects_comments_and_multiple_statements() {
        assert_eq!(code_of("select 1 -- x"), "SQL_READ_ONLY_VIOLATION");
        assert_eq!(code_of("select /* x */ 1"), "SQL_READ_ONLY_VIOLATION");
        let err = scan_sql("select 1; select 2").unwrap_err();
        assert_eq!(err.message, "只允许执行单条 SQL 查询。");
    }

    #[test]
    fn allows_read_only_forms() {
        assert_eq!(scan_sql(" select 1; ").unwrap(), "select 1");
        assert!(scan_sql("with t as (select 1) select * from t").is_ok());
        assert!(scan_sql("explain query plan select 1").is_ok());
        assert!(scan_sql("PRAGMA table_info(notes)").is_ok());
        assert!(scan_sql("pragma index_list(notes)").is_ok());
        assert_eq!(code_of("pragma journal_mode"), "SQL_READ_ONLY_VIOLATION");
        assert_eq!(
            code_of("pragma user_version = 3"),
            "SQL_READ_ONLY_VIOLATION"
        );
    }

    #[test]
    fn keywords_inside_literals_are_ignored() {
        let sql = "select * from notes where title = 'delete; drop' and \"update\" is null";
        assert_eq!(scan_sql(sql).unwrap(), sql);
    }

    #[test]
    fn truncates_by_max_rows() {
        let conn = memory_db();
        let mut request = input("select id, title from notes order by id");
        request.max_rows = Some(2.0);
        let result = execute_read_only(&conn, &request).unwrap();
        assert_eq!(result["truncated"], true);
        assert_eq!(result["rowCount"], 2);
        assert_eq!(result["rows"][1]["title"], "b");
        assert_eq!(result["columns"][0]["declaredType"], "INTEGER");
    }

    #[test]
    fn binds_positional_and_named_params() {
        let conn = memory_db();
        let mut positional = input("select title from notes where id = ?");
        positional.params = Some(json!([2]));
        let result = execute_read_only(&conn, &positional).unwrap();
        assert_eq!(result["rows"][0]["title"], "b");

        let mut named =
            input("select title from notes where id = :id or title = @title or title = $other");
        named.params = Some(json!({ "id": 1, "title": "c", "$other": null }));
        let result = execute_read_only(&conn, &named).unwrap();
        assert_eq!(result["rowCount"], 2);
    }

    #[test]
    fn converts_blob_and_large_integer() {
        let conn = memory_db();
        let result = execute_read_only(
            &conn,
            &input("select data, 9007199254740993 as big from notes where id = 1"),
        )
        .unwrap();
        assert_eq!(result["rows"][0]["data"], "AQID");
        assert_eq!(result["rows"][0]["big"], "9007199254740993");
    }

    #[test]
    fn maps_schema_and_syntax_errors() {
        let conn = memory_db();
        let err = execute_read_only(&conn, &input("select missing from notes")).unwrap_err();
        assert_eq!(err.code, "SQL_SCHEMA_ERROR");
        let err = execute_read_only(&conn, &input("select from where")).unwrap_err();
        assert_eq!(err.code, "SQL_SYNTAX_ERROR");
        assert!(err
            .to_error_string()
            .starts_with("SQL_SYNTAX_ERROR: SQL 语法错误"));
    }

    #[test]
    fn times_out_slow_query_and_restores_connection() {
        let conn = memory_db();
        let mut request = input(
            "with recursive r(n) as (select 1 union all select n + 1 from r) select count(*) from r",
        );
        request.timeout_ms = Some(100.0);
        let err = execute_read_only(&conn, &request).unwrap_err();
        assert_eq!(err.code, "SQL_TIMEOUT");
        let query_only: i64 = conn
            .query_row("PRAGMA query_only", [], |row| row.get(0))
            .unwrap();
        assert_eq!(query_only, 0);
        conn.execute("insert into notes(title) values ('d')", [])
            .unwrap();
        let count: i64 = conn
            .query_row("select count(*) from notes", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 4);
    }
}
