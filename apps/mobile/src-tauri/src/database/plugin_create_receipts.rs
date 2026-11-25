use rusqlite::{params, Connection, OptionalExtension};

pub(super) struct Receipt {
    pub hash: String,
    pub entity: String,
    pub id: i64,
    pub created: i64,
    pub operation: String,
    pub retired: bool,
}
pub(super) fn read(conn: &Connection, plugin: &str, key: &str) -> Result<Option<Receipt>, String> {
    conn.query_row("SELECT input_hash,entity,entity_id,created_at,operation_id,retired FROM plugin_create_receipts WHERE plugin_id=?1 AND request_id=?2",params![plugin,key],|r|Ok(Receipt{hash:r.get(0)?,entity:r.get(1)?,id:r.get(2)?,created:r.get(3)?,operation:r.get(4)?,retired:r.get(5)?})).optional().map_err(|e|e.to_string())
}
pub(super) fn exists(conn: &Connection, saved: &Receipt) -> Result<bool, String> {
    if saved.retired {
        return Ok(false);
    }
    let table = match saved.entity.as_str() {
        "todo" => "todo_item",
        "event" => "calendar_event",
        "todo-list" => "todo_group",
        "calendar" => "calendar",
        _ => return Err("创建回执类型无效".into()),
    };
    conn.query_row(
        &format!("SELECT 1 FROM {table} WHERE id=?1 AND create_time=?2"),
        params![saved.id, saved.created],
        |r| r.get::<_, i64>(0),
    )
    .optional()
    .map(|v| v.is_some())
    .map_err(|e| e.to_string())
}
pub(super) fn save(
    conn: &Connection,
    plugin: &str,
    key: &str,
    saved: &Receipt,
) -> Result<(), String> {
    conn.execute("INSERT INTO plugin_create_receipts(plugin_id,request_id,input_hash,entity,entity_id,created_at,operation_id,retired) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",params![plugin,key,saved.hash,saved.entity,saved.id,saved.created,saved.operation,saved.retired]).map_err(|e|e.to_string())?;
    Ok(())
}
