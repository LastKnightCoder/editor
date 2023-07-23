use std::time::{SystemTime, UNIX_EPOCH};
use rusqlite::{Connection, params, Result, Row};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct Article {
    pub id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub title: String,
    pub tags: Vec<String>,
    pub content: String,
}

pub fn init_article_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            author TEXT,
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

pub fn upgrade_article_table(conn: &Connection, old_version: i64, new_version: i64) -> Result<()> {
    println!("upgrade_article_table: {} -> {}", old_version, new_version);
    if old_version == new_version {
        return Ok(());
    }
    // 多版本渐进式升级
    match old_version {
        0 => {
            // 如果 articles 表没有 links 字段，添加 links 字段
            let mut stmt = conn.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'articles'")?;
            let mut rows = stmt.query([])?;
            if let Some(row) = rows.next()? {
                let sql: String = row.get(0)?;
                println!("sql: {}", sql);
                if !sql.contains("links") {
                    conn.execute(
                        "ALTER TABLE articles ADD COLUMN links TEXT",
                        [],
                    )?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}