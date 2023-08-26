use std::time::{SystemTime, UNIX_EPOCH};
use rusqlite::{Connection, params, Result, Row};
use serde::{Serialize, Deserialize};
use super::operation::{insert_operation};

#[derive(Serialize, Deserialize, Debug)]
pub struct DailyNote {
    pub id: i64,
    pub date: String,
    pub content: String,
}

fn get_daily_note_from_query_result(row: &Row) -> DailyNote {
    DailyNote {
        id: row.get(0).unwrap(),
        date: row.get(1).unwrap(),
        content: row.get(2).unwrap(),
    }
}

pub fn init_daily_note_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS daily_notes (
            id INTEGER PRIMARY KEY,
            date TEXT NOT NULL,
            content TEXT
        )",
        [],
    )?;
    Ok(())
}

pub fn upgrade_daily_note_table(_conn: &Connection, old_version: i64, new_version: i64) -> Result<()> {
    if old_version == new_version {
        return Ok(());
    }
    Ok(())
}

pub fn insert_daily_note(
    conn: &Connection,
    date: &str,
    content: &str,
) -> Result<i64> {
    let mut stmt = conn.prepare("INSERT INTO daily_notes (date, content) VALUES (?1, ?2)")?;
    let result = stmt.insert(params![date, content])?;

    match insert_operation(conn, result as i64, "daily".to_string(), "insert".to_string()) {
        Ok(_) => {}
        Err(e) => {
            println!("插入操作记录错误: {}", e);
        }
    };

    Ok(result)
}

pub fn update_daily_note(
    conn: &Connection,
    id: i64,
    content: &str,
) -> Result<usize> {
    let mut stmt = conn.prepare("UPDATE daily_notes SET content = ?1 WHERE id = ?2")?;
    let result = stmt.execute(params![content, id])?;

    match insert_operation(conn, result as i64, "daily".to_string(), "update".to_string()) {
        Ok(_) => {}
        Err(e) => {
            println!("插入操作记录错误: {}", e);
        }
    };

    Ok(result)
}

pub fn delete_daily_note(
    conn: &Connection,
    id: i64,
) -> Result<usize> {
    let mut stmt = conn.prepare("DELETE FROM daily_notes WHERE id = ?1")?;
    let result = stmt.execute(params![id])?;
    Ok(result)
}

pub fn get_daily_note_by_date(
    conn: &Connection,
    date: &str,
) -> Result<DailyNote> {
    let mut stmt = conn.prepare("SELECT id, date, content FROM daily_notes WHERE date = ?1")?;
    let mut rows = stmt.query(params![date])?;
    let row = rows.next()?.unwrap();
    Ok(get_daily_note_from_query_result(&row))
}

pub fn get_daily_note_by_id(
    conn: &Connection,
    id: i64,
) -> Result<DailyNote> {
    let mut stmt = conn.prepare("SELECT id, date, content FROM daily_notes WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    let row = rows.next()?.unwrap();
    Ok(get_daily_note_from_query_result(&row))
}

pub fn get_daily_notes(
    conn: &Connection,
) -> Result<Vec<DailyNote>> {
    let mut stmt = conn.prepare("SELECT id, date, content FROM daily_notes")?;
    let mut rows = stmt.query([])?;
    let mut daily_notes: Vec<DailyNote> = Vec::new();
    while let Some(row) = rows.next()? {
        daily_notes.push(get_daily_note_from_query_result(&row));
    }
    Ok(daily_notes)
}
