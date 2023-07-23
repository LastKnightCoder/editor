use std::time::{SystemTime, UNIX_EPOCH};
use rusqlite::{Connection, params, Result, Row};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct Operation {
    pub id: i64,
    pub operation_time: i64,
    pub operation_content_type: String,
    pub operation_action: String,
    pub operation_id: i64,
}

pub fn get_operation_from_query_result(row: &Row) -> Operation {
    Operation {
        id: row.get(0).unwrap(),
        operation_time: row.get(1).unwrap(),
        operation_id: row.get(2).unwrap(),
        operation_content_type: row.get(3).unwrap(),
        operation_action: row.get(4).unwrap(),
    }
}

pub fn init_operation_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS operation (
            id INTEGER PRIMARY KEY,
            operation_time INTEGER NOT NULL,
            operation_id INTEGER,
            operation_content_type TEXT,
            operation_action TEXT
        )",
        [],
    )?;
    Ok(())
}

pub fn upgrade_operation_table(_conn: &Connection, old_version: i64, new_version: i64) -> Result<()> {
    println!("upgrade_operation_table: {} -> {}", old_version, new_version);
    if old_version == new_version {
        return Ok(());
    }
    // 多版本渐进式升级
    match old_version {
        _ => {}
    }
    Ok(())
}

pub fn insert_operation(conn: &Connection, operation_id: i64, operation_content_type: String, operation_action: String) -> Result<()> {
    let operation_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    conn.execute(
        "INSERT INTO operation (operation_id, operation_time, operation_content_type, operation_action) VALUES (?1, ?2, ?3, ?4)",
        params![operation_id, operation_time, operation_content_type, operation_action],
    )?;
    Ok(())
}

pub fn get_operation_list(conn: &Connection) -> Result<Vec<Operation>> {
    let mut stmt = conn.prepare("SELECT id, operation_time, operation_id, operation_content_type, operation_action FROM operation ORDER BY operation_time DESC")?;
    let mut rows = stmt.query(params![])?;
    let mut res = Vec::new();
    while let Some(row) = rows.next()? {
        res.push(get_operation_from_query_result(&row));
    }
    Ok(res)
}

pub fn get_operation_list_by_type_and_id(conn: &Connection, operation_id: i64, operation_content_type: String) -> Result<Vec<Operation>> {
    let mut stmt = conn.prepare("SELECT id, operation_time, operation_id, operation_content_type, operation_action FROM operation WHERE operation_content_type = ?1 AND operation_id = ?2 ORDER BY operation_time DESC")?;
    let mut rows = stmt.query(params![operation_content_type, operation_id])?;
    let mut res = Vec::new();
    while let Some(row) = rows.next()? {
        res.push(get_operation_from_query_result(&row));
    }
    Ok(res)
}
