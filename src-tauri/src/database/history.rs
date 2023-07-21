use rusqlite::{Connection, params, Result, Row};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct History {
    pub id: i64,
    pub update_time: i64,
    pub content: String,
    pub version: i64,
    pub card_id: i64,
    pub article_id: i64,
}

pub fn get_history_from_query_result(row: &Row) -> History {
    History {
        id: row.get(0).unwrap(),
        update_time: row.get(1).unwrap(),
        content: row.get(2).unwrap(),
        version: row.get(3).unwrap(),
        card_id: row.get(4).unwrap(),
        article_id: row.get(5).unwrap(),
    }
}

pub fn get_all_history_by_card_id(conn: &rusqlite::Connection, card_id: i64) -> Result<Vec<History>, rusqlite::Error> {
    let mut stmt = conn.prepare("SELECT id, update_time, content, version, card_id, article_id FROM history WHERE card_id = ?1")?;
    let mut rows = stmt.query(params![card_id])?;
    let mut res = Vec::new();
    while let Some(row) = rows.next()? {
        res.push(get_history_from_query_result(&row));
    }
    Ok(res)
}
