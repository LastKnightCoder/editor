use std::time::{SystemTime, UNIX_EPOCH};
use rusqlite::{Connection, params, Result, Row};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Message {
    role: String,
    content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatMessage {
    pub id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub messages: Vec<Message>,
    pub title: String,
}

fn get_chat_messages_from_query_result(row: &Row) -> ChatMessage {
    let messages: String = row.get(3).unwrap();
    let messages: Vec<Message> = serde_json::from_str(&messages).unwrap();
    ChatMessage {
        id: row.get(0).unwrap(),
        create_time: row.get(1).unwrap(),
        update_time: row.get(2).unwrap(),
        messages,
        title: row.get(4).unwrap(),
    }
}

pub fn init_chat_messages_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS chat_message (
            id INTEGER PRIMARY KEY,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            messages TEXT,
            title TEXT
        )",
        [],
    )?;
    Ok(())
}

pub fn upgrade_chat_messages_table(conn: &Connection, _old_version: i64, _new_version: i64) -> Result<()> {
    let mut stmt = conn.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'chat_message'")?;
    let mut rows = stmt.query([])?;
    if let Some(row) = rows.next()? {
        let sql: String = row.get(0)?;
        if !sql.contains("title") {
            conn.execute(
                "ALTER TABLE chat_message ADD COLUMN title TEXT",
                [],
            )?;
        }
    }
    Ok(())
}

pub fn create_chat_message(conn: &Connection, messages: Vec<Message>, title: String) -> Result<ChatMessage> {
    let mut stmt = conn.prepare("INSERT INTO chat_message (create_time, update_time, messages, title) VALUES (?1, ?2, ?3, ?4)")?;
    let create_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
    let messages_json = serde_json::to_string(&messages).unwrap();
    let insert_id = stmt.insert(params![create_time, create_time, messages_json, title])?;

    // 查询刚刚插入的数据
    let created_chat_message = get_chat_message_by_id(conn, insert_id).unwrap();

    Ok(created_chat_message)
}

pub fn update_chat_message(conn: &Connection, id: i64, messages: Vec<Message>, title: String) -> Result<ChatMessage> {
    let mut stmt = conn.prepare("UPDATE chat_message SET update_time = ?1, messages = ?2, title = ?3 WHERE id = ?4")?;
    let update_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
    let messages_json = serde_json::to_string(&messages).unwrap();
    stmt.execute(params![update_time, messages_json, title, id])?;
    let update_chat_message = get_chat_message_by_id(conn, id).unwrap();
    Ok(update_chat_message)
}

pub fn delete_chat_message(conn: &Connection, id: i64) -> Result<usize> {
    let mut stmt = conn.prepare("DELETE FROM chat_message WHERE id = ?1")?;
    let result = stmt.execute(params![id])?;
    Ok(result)
}

pub fn get_chat_message_by_id(conn: &Connection, id: i64) -> Result<ChatMessage> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, messages, title FROM chat_message WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    let row = rows.next()?.unwrap();
    Ok(get_chat_messages_from_query_result(&row))
}

pub fn get_chat_messages(conn: &Connection) -> Result<Vec<ChatMessage>> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, messages, title FROM chat_message")?;
    let mut rows = stmt.query([])?;
    let mut chat_messages: Vec<ChatMessage> = Vec::new();
    while let Some(row) = rows.next()? {
        chat_messages.push(get_chat_messages_from_query_result(&row));
    }
    Ok(chat_messages)
}
