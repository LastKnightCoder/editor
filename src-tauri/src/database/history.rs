use std::time::{SystemTime, UNIX_EPOCH};
use rusqlite::{Connection, params, Result, Row};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct History {
    pub id: i64,
    pub create_time: i64,
    pub content: String,
    pub content_type: String,
    pub content_id: i64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Query {
    pub page_size: i64,
    pub page_number: i64,
    pub content_type: String,
    pub content_id: i64,
}

pub fn get_history_from_query_result(row: &Row) -> History {
    History {
        id: row.get(0).unwrap(),
        create_time: row.get(1).unwrap(),
        content: row.get(2).unwrap(),
        content_type: row.get(3).unwrap(),
        content_id: row.get(4).unwrap(),
    }
}

// 分页查询
pub fn get_history_list(conn: &Connection, query: Query) -> Result<Vec<History>> {
    let mut stmt = conn.prepare("SELECT id, create_time, content, content_type, content_id FROM history WHERE content_type = ?1 AND content_id = ?2 ORDER BY create_time DESC LIMIT ?3 OFFSET ?4")?;
    let mut rows = stmt.query(params![query.content_type, query.content_id, query.page_size, query.page_size * (query.page_number - 1)])?;
    let mut res = Vec::new();
    while let Some(row) = rows.next()? {
        res.push(get_history_from_query_result(&row));
    }
    Ok(res)
}

pub fn insert_history(conn: &Connection, content_type: String, content_id: i64, content: String) -> Result<()> {
    let create_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    conn.execute(
        "INSERT INTO history (create_time, content, content_type, content_id) VALUES (?1, ?2, ?3, ?4)",
        params![create_time, content, content_type, content_id],
    )?;
    Ok(())
}

pub fn delete_history_by_id(conn: &Connection, id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM history WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

pub fn delete_history_by_content_id(conn: &Connection, content_type: String, content_id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM history WHERE content_type = ?1 AND content_id = ?2",
        params![content_type, content_id],
    )?;
    Ok(())
}
