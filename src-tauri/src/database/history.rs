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

pub fn init_history_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY,
            create_time INTEGER NOT NULL,
            content TEXT,
            content_type TEXT,
            content_id INTEGER
        )",
        [],
    )?;
    Ok(())
}

pub fn upgrade_history_table(_conn: &Connection, old_version: i64, new_version: i64) -> Result<()> {
    if old_version == new_version {
        return Ok(());
    }
    Ok(())
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

