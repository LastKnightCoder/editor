use std::time::{SystemTime, UNIX_EPOCH};
use rusqlite::{Connection, params, Result, Row};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct Card {
    pub id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub tags: String,
    pub links: String,
    pub content: String,
}

fn get_card_from_query_result(row: &Row) -> Card {
    Card {
        id: row.get(0).unwrap(),
        create_time: row.get(1).unwrap(),
        update_time: row.get(2).unwrap(),
        tags: row.get(3).unwrap(),
        links: row.get(4).unwrap(),
        content: row.get(5).unwrap(),
    }
}

pub fn insert_one(conn: &Connection, tags: &str, links: &str, content: &str,) -> Result<usize> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let mut stmt = conn.prepare("INSERT INTO cards (create_time, update_time, tags, links, content) VALUES (?1, ?2, ?3, ?4, ?5)")?;
    let res = stmt.execute(params![now as i64, now as i64, tags, links, content])?;
    Ok(res)
}

pub fn find_one(conn: &Connection, id: i64) -> Result<Card> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, tags, links, content FROM cards WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    let row = rows.next()?.unwrap();
    Ok(get_card_from_query_result(&row))
}

pub fn find_all(conn: &Connection) -> Result<Vec<Card>> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, tags, links, content FROM cards")?;
    let mut rows = stmt.query([])?;
    let mut res = Vec::new();
    while let Some(row) = rows.next()? {
        res.push(get_card_from_query_result(&row));
    }
    Ok(res)
}

pub fn delete_one(conn: &Connection, id: i64) -> Result<usize> {
    let mut stmt = conn.prepare("DELETE FROM cards WHERE id = ?1")?;
    let res = stmt.execute(params![id])?;
    Ok(res)
}

pub fn update_one(conn: &Connection, id: i64, tags: &str, links: &str, content: &str) -> Result<usize> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let mut stmt = conn.prepare("UPDATE cards SET update_time = ?1, tags = ?2, links = ?3, content = ?4 WHERE id = ?5")?;
    let res = stmt.execute(params![now as i64, tags, links, content, id])?;
    Ok(res)
}
