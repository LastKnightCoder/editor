use rusqlite::{Connection, Result};
use tauri::{ AppHandle, Wry };
use simple_home_dir::home_dir;

pub mod card;

pub fn init_database() -> Result<Connection, rusqlite::Error> {
    let home_dir = home_dir().unwrap();
    let editor_dir = home_dir.join(".editor");
    std::fs::create_dir_all(&editor_dir).unwrap();
    let db_path = editor_dir.join("test.db");
    let conn = Connection::open(&db_path)?;
    init_tables(&conn)?;
    Ok(conn)
}

fn init_tables(conn: &Connection) -> Result<()> {
    init_card_table(conn)?;
    init_article_table(conn)?;
    Ok(())
}

fn init_card_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            tags TEXT,
            links TEXT,
            content TEXT
        )",
        [],
    )?;
    Ok(())
}

fn init_article_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            author TEXT,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            tags TEXT,
            content TEXT
        )",
        [],
    )?;
    Ok(())
}
