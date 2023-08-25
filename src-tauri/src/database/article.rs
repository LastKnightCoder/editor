use std::time::{SystemTime, UNIX_EPOCH};
use rusqlite::{Connection, params, Result, Row};
use serde::{Serialize, Deserialize};
use crate::database::operation::insert_operation;

#[derive(Serialize, Deserialize, Debug)]
pub struct Article {
    pub id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub title: String,
    pub author: String,
    pub tags: Vec<String>,
    pub links: Vec<i64>,
    pub content: String,
}

fn get_article_from_query_result(row: &Row) -> Article {
    let tags: String = row.get(5).unwrap();
    let tags: Vec<String> = serde_json::from_str(&tags).unwrap();
    let links: String = row.get(6).unwrap();
    let links: Vec<i64> = serde_json::from_str(&links).unwrap();
    Article {
        id: row.get(0).unwrap(),
        create_time: row.get(1).unwrap(),
        update_time: row.get(2).unwrap(),
        title: row.get(3).unwrap(),
        author: row.get(4).unwrap(),
        tags,
        links,
        content: row.get(7).unwrap(),
    }
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
    if old_version < 1 {
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
    Ok(())
}

pub fn create_article(conn: &Connection, title: String, author: String, tags: Vec<String>, links: Vec<i64>, content: String) -> Result<i64> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    let mut stmt = conn.prepare("INSERT INTO articles (title, author, create_time, update_time, tags, links, content) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")?;
    let tags_str = serde_json::to_string(&tags).unwrap();
    let links_str = serde_json::to_string(&links).unwrap();
    let res = stmt.insert(params![title, author, now, now, tags_str, links_str, content])?;

    insert_operation(conn, res, "article".to_string(), "insert".to_string())?;

    Ok(res)
}

pub fn update_article(conn: &Connection, id: i64, title: String, author: String, tags: Vec<String>, links: Vec<i64>, content: String) -> Result<usize> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    let mut stmt = conn.prepare("UPDATE articles SET title = ?1, author = ?2, update_time = ?3, tags = ?4, links = ?5, content = ?6 WHERE id = ?7")?;
    let tags_str = serde_json::to_string(&tags).unwrap();
    let links_str = serde_json::to_string(&links).unwrap();
    let res = stmt.execute(params![title, author, now, tags_str, links_str, content, id])?;

    insert_operation(conn, id, "article".to_string(), "update".to_string())?;

    Ok(res)
}

pub fn find_article(conn: &Connection, id: i64) -> Result<Article> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, title, author, tags, links, content FROM articles WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    let row = rows.next()?.unwrap();
    Ok(get_article_from_query_result(&row))
}

pub fn find_all_articles(conn: &Connection) -> Result<Vec<Article>> {
    // 根据更新时间倒序
    let sql = "SELECT id, create_time, update_time, title, author, tags, links, content FROM articles ORDER BY update_time DESC";
    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([])?;
    let mut res = Vec::new();
    while let Some(row) = rows.next()? {
        res.push(get_article_from_query_result(&row));
    }
    Ok(res)
}

pub fn delete_article(conn: &Connection, id: i64) -> Result<usize> {
    let mut stmt = conn.prepare("DELETE FROM articles WHERE id = ?1")?;
    let res = stmt.execute(params![id])?;
    Ok(res)
}