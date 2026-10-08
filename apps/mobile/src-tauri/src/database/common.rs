use rusqlite::{params, Connection};
use serde_json::Value;
use tauri::AppHandle;

/// 触发当前激活库的索引重建（异步，不阻塞命令返回）
pub(crate) fn trigger_reconcile(app: &AppHandle) {
    if let Ok(setting) = crate::setting::load_or_init_setting(app) {
        let db_name = crate::setting::get_active_database_name(&setting);
        super::reconcile::trigger_reconcile(app, &db_name);
    }
}

pub(crate) fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub(crate) fn db_err(code: &str, context: &str, error: impl std::fmt::Display) -> String {
    format!("{code}: {context}: {error}")
}

/// 解析 JSON 数组列（children / parents / projects / tags 等），坏数据回退空数组
pub(crate) fn parse_id_array(raw: Option<String>) -> Vec<i64> {
    let Some(text) = raw else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return Vec::new();
    };
    let Some(items) = value.as_array() else {
        return Vec::new();
    };
    items.iter().filter_map(|v| v.as_i64()).collect()
}

pub(crate) fn serialize_id_array(ids: &[i64]) -> String {
    serde_json::to_string(ids).unwrap_or_else(|_| "[]".to_string())
}

/// 解析字符串数组列（tags / links）
pub(crate) fn parse_string_array(raw: Option<String>) -> Vec<String> {
    let Some(text) = raw else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return Vec::new();
    };
    let Some(items) = value.as_array() else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect()
}

pub(crate) fn parse_json_content(raw: Option<String>) -> Option<Value> {
    raw.and_then(|text| serde_json::from_str::<Value>(&text).ok())
}

/// 把富文本 JSON（或纯文本）压成一段纯文本，用于列表摘要
pub(crate) fn json_content_plain_text(raw: Option<String>) -> String {
    let Some(text) = raw else {
        return String::new();
    };
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
        return trimmed.to_string();
    };
    let mut out = String::new();
    collect_plain_text(&value, &mut out);
    out.trim().to_string()
}

fn collect_plain_text(value: &Value, out: &mut String) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_plain_text(item, out);
            }
        }
        Value::Object(map) => {
            if let Some(text) = map.get("text").and_then(|v| v.as_str()) {
                if !text.is_empty() {
                    if !out.is_empty() {
                        out.push(' ');
                    }
                    out.push_str(text);
                }
            }
            if let Some(children) = map.get("children") {
                collect_plain_text(children, out);
            }
        }
        _ => {}
    }
}

/// 写一条 operation 记录（与 cards/todo 的写法保持一致，供索引 reconcile 消费）
pub(crate) fn write_operation(
    tx: &Connection,
    content_type: &str,
    action: &str,
    row_id: i64,
    now: i64,
) -> Result<(), String> {
    tx.execute(
        "
        INSERT INTO operation (operation_time, operation_id, operation_content_type, operation_action)
        VALUES (?1, ?2, ?3, ?4)
        ",
        params![now, row_id, content_type, action],
    )
    .map_err(|e| db_err("OPERATION_WRITE_FAILED", "insert operation", e))?;
    Ok(())
}

/// 新建一条富文本内容（ref_count = 1），返回 content_id
pub(crate) fn insert_content_record(
    tx: &Connection,
    content: &Value,
    count: i64,
    now: i64,
) -> Result<i64, String> {
    let serialized = serde_json::to_string(content)
        .map_err(|e| db_err("CONTENT_INVALID", "serialize content", e))?;
    tx.execute(
        "
        INSERT INTO contents (create_time, update_time, content, count, ref_count)
        VALUES (?1, ?1, ?2, ?3, 1)
        ",
        params![now, serialized, count.max(0)],
    )
    .map_err(|e| db_err("CONTENT_CREATE_FAILED", "insert content", e))?;
    let content_id = tx.last_insert_rowid();
    write_operation(tx, "content", "insert", content_id, now)?;
    Ok(content_id)
}

/// 引用计数减一，归零级联删除
pub(crate) fn decrement_or_delete_content(tx: &Connection, content_id: i64) -> Result<(), String> {
    use rusqlite::OptionalExtension;
    if content_id <= 0 {
        return Ok(());
    }
    let now = now_millis();
    tx.execute(
        "UPDATE contents SET ref_count = ref_count - 1, update_time = ?2 WHERE id = ?1",
        params![content_id, now],
    )
    .map_err(|e| db_err("CONTENT_DELETE_FAILED", "decrease ref_count", e))?;
    let ref_count = tx
        .query_row(
            "SELECT ref_count FROM contents WHERE id = ?1 LIMIT 1",
            params![content_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| db_err("CONTENT_DELETE_FAILED", "query ref_count", e))?;
    if matches!(ref_count, Some(v) if v <= 0) {
        // 协作内容禁止级联删除（与桌面端数据库层守卫一致）
        super::collaboration::assert_content_local(tx, content_id)?;
        // 正文删除时释放两侧的显式连接（与桌面 ContentTable.releaseContent 对齐），
        // 避免 rowid 复用后悬空边变成幽灵连接
        tx.execute(
            "DELETE FROM content_links WHERE content_id = ?1 OR target_content_id = ?1",
            params![content_id],
        )
        .map_err(|e| db_err("CONTENT_DELETE_FAILED", "release content links", e))?;
        tx.execute("DELETE FROM contents WHERE id = ?1", params![content_id])
            .map_err(|e| db_err("CONTENT_DELETE_FAILED", "delete content", e))?;
        write_operation(tx, "content", "delete", content_id, now)?;
    }
    Ok(())
}
