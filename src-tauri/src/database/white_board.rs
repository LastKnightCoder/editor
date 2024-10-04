use rusqlite::{Connection, params, Result, Row};
use serde::{Serialize, Deserialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WhiteBoard {
    pub id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub tags: Vec<String>,
    pub data: String,
    pub title: String,
    pub description: String,
    pub snapshot: String,
}

fn get_white_board_from_query_result(row: &Row) -> WhiteBoard {
    let tags: String = row.get(3).unwrap();
    let tags: Vec<String> = serde_json::from_str(&tags).unwrap();
    WhiteBoard {
        id: row.get(0).unwrap(),
        create_time: row.get(1).unwrap(),
        update_time: row.get(2).unwrap(),
        tags,
        data: row.get(4).unwrap(),
        title: row.get(5).unwrap(),
        description: row.get(6).unwrap(),
        snapshot: row.get(7).unwrap(),
    }
}

pub fn init_white_board_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS white_boards (
            id INTEGER PRIMARY KEY NOT NULL,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            tags TEXT,
            data TEXT,
            title TEXT,
            description TEXT,
            snapshot TEXT
        )",
        [],
    )?;
    Ok(())
}

pub fn create_white_board(conn: &Connection, tags: Vec<String>, data: &str, title: &str, description: &str, snapshot: &str) -> Result<WhiteBoard> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let mut stmt = conn.prepare("INSERT INTO white_boards (create_time, update_time, tags, data, title, description, snapshot) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")?;
    let tags_str = serde_json::to_string(&tags).unwrap();
    let res = stmt.insert(params![now as i64, now as i64, tags_str, data, title, description, snapshot])?;
    let white_board = get_white_board_by_id(conn, res)?;
    Ok(white_board)
}

pub fn get_white_board_by_id(conn: &Connection, id: i64) -> Result<WhiteBoard> {
    let mut stmt = conn.prepare("SELECT * FROM white_boards WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        let white_board = get_white_board_from_query_result(&row);
        Ok(white_board)
    } else {
        Err(rusqlite::Error::QueryReturnedNoRows)
    }
}

pub fn update_white_board(conn: &Connection, id: i64, tags: Vec<String>, data: &str, title: &str, description: &str, snapshot: &str) -> Result<WhiteBoard> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let mut stmt = conn.prepare("UPDATE white_boards SET update_time = ?1, tags = ?2, data = ?3, title = ?4, description = ?5, snapshot = ?6 WHERE id = ?7")?;
    let tags_str = serde_json::to_string(&tags).unwrap();
    stmt.execute(params![now as i64, tags_str, data, title, description, snapshot, id])?;
    let white_board = get_white_board_by_id(conn, id)?;
    Ok(white_board)
}

pub fn delete_white_board(conn: &Connection, id: i64) -> Result<()> {
    let mut stmt = conn.prepare("DELETE FROM white_boards WHERE id = ?1")?;
    stmt.execute(params![id])?;
    Ok(())
}

pub fn get_white_boards_by_tags(conn: &Connection, tags: Vec<String>) -> Result<Vec<WhiteBoard>> {
    let mut stmt = conn.prepare("SELECT * FROM white_boards WHERE tags LIKE ?1")?;
    let tags_str = serde_json::to_string(&tags).unwrap();
    let tags_str = format!("%{}%", tags_str);
    let mut rows = stmt.query(params![tags_str])?;
    let mut white_boards = Vec::new();
    while let Some(row) = rows.next()? {
        let white_board = get_white_board_from_query_result(&row);
        white_boards.push(white_board);
    }
    Ok(white_boards)
}

pub fn get_all_white_boards(conn: &Connection) -> Result<Vec<WhiteBoard>> {
    let mut stmt = conn.prepare("SELECT * FROM white_boards")?;
    let mut rows = stmt.query([])?;
    let mut white_boards = Vec::new();
    while let Some(row) = rows.next()? {
        let white_board = get_white_board_from_query_result(&row);
        white_boards.push(white_board);
    }
    Ok(white_boards)
}

