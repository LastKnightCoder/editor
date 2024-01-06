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
    pub banner_bg: String,
    pub is_top: bool,
    pub is_delete: bool,
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
        banner_bg: row.get(8).unwrap(),
        is_top: row.get(9).unwrap(),
        is_delete: row.get(10).unwrap(),
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
            content TEXT,
            banner_bg TEXT,
            is_top INTEGER DEFAULT 0,
            is_delete INTEGER DEFAULT 0
        )",
        [],
    )?;
    Ok(())
}

pub fn upgrade_article_table(conn: &Connection, old_version: i64, new_version: i64) -> Result<()> {
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
    if old_version < 2 {
        // 如果 articles 表没有 banner_bg 和 is_top 字段，添加 banner_bg 和 is_top 字段
        let mut stmt = conn.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'articles'")?;
        let mut rows = stmt.query([])?;
        if let Some(row) = rows.next()? {
            let sql: String = row.get(0)?;
            if !sql.contains("banner_bg") {
                conn.execute(
                    "ALTER TABLE articles ADD COLUMN banner_bg TEXT DEFAULT ''",
                    [],
                )?;
            }
            if !sql.contains("is_top") {
                conn.execute(
                    "ALTER TABLE articles ADD COLUMN is_top INTEGER DEFAULT 0",
                    [],
                )?;
            }
            if !sql.contains("is_delete") {
                conn.execute(
                    "ALTER TABLE articles ADD COLUMN is_delete INTEGER DEFAULT 0",
                    [],
                )?;
            }
        }
    }
    Ok(())
}

pub fn create_article(
    conn: &Connection, 
    title: String, 
    author: String, 
    tags: Vec<String>, 
    links: Vec<i64>, 
    content: String, 
    banner_bg: String, 
    is_top: bool
) -> Result<Article> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    let mut stmt = conn.prepare("INSERT INTO articles (title, author, create_time, update_time, tags, links, content, banner_bg, is_top) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)")?;
    let tags_str = serde_json::to_string(&tags).unwrap();
    let links_str = serde_json::to_string(&links).unwrap();
    let res = stmt.insert(params![title, author, now, now, tags_str, links_str, content, banner_bg, is_top])?;

    insert_operation(conn, res, "article".to_string(), "insert".to_string())?;

    // 根据 id 查询插入的文章，返回
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, title, author, tags, links, content, banner_bg, is_top, is_delete FROM articles WHERE id = ?1")?;
    let mut rows = stmt.query(params![res])?;
    let row = rows.next()?.unwrap();
    Ok(get_article_from_query_result(&row))
}

pub fn update_article(
    conn: &Connection, id: i64,
    title: String,
    author: String,
    tags: Vec<String>,
    links: Vec<i64>,
    content: String,
    banner_bg: String,
    is_top: bool,
) -> Result<Article> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    let mut stmt = conn.prepare("UPDATE articles SET title = ?1, author = ?2, update_time = ?3, tags = ?4, links = ?5, content = ?6, banner_bg = ?7, is_top = ?8 WHERE id = ?9")?;
    let tags_str = serde_json::to_string(&tags).unwrap();
    let links_str = serde_json::to_string(&links).unwrap();
    stmt.execute(params![title, author, now, tags_str, links_str, content, banner_bg, is_top, id])?;

    insert_operation(conn, id, "article".to_string(), "update".to_string())?;

    // 从 document_items 表中找到 is_article 为 1 且 article 为 id 的所有记录，并更新其 content 和 update_time 和 title
    let mut stmt = conn.prepare("UPDATE document_items SET update_time = ?1, content = ?2, title = ?3 WHERE is_article = 1 AND article_id = ?4")?;
    stmt.execute(params![now as i64, content, title, id])?;

    // 查询刚刚更新的文章，然后返回
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, title, author, tags, links, content, banner_bg, is_top, is_delete FROM articles WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    let row = rows.next()?.unwrap();
    Ok(get_article_from_query_result(&row))
}

pub fn find_article(conn: &Connection, id: i64) -> Result<Article> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, title, author, tags, links, content, banner_bg, is_top, is_delete FROM articles WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    let row = rows.next()?.unwrap();
    Ok(get_article_from_query_result(&row))
}

pub fn find_all_articles(conn: &Connection) -> Result<Vec<Article>> {
    // 根据更新时间倒序
    let sql = "SELECT id, create_time, update_time, title, author, tags, links, content, banner_bg, is_top, is_delete FROM articles WHERE is_delete = 0 ORDER BY update_time DESC";
    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([])?;
    let mut res = Vec::new();
    while let Some(row) = rows.next()? {
        res.push(get_article_from_query_result(&row));
    }
    Ok(res)
}

pub fn delete_article(conn: &Connection, id: i64) -> Result<usize> {
    let mut stmt = conn.prepare("UPDATE articles SET is_delete = 1 WHERE id = ?1")?;
    let res = stmt.execute(params![id])?;
    Ok(res)
}

pub fn update_banner_bg(conn: &Connection, id: i64, banner_bg: String) -> Result<usize> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    let mut stmt = conn.prepare("UPDATE articles SET banner_bg = ?1, update_time = ?2 WHERE id = ?3")?;
    let res = stmt.execute(params![banner_bg, now, id])?;
    Ok(res)
}

pub fn update_is_top(conn: &Connection, id: i64, is_top: bool) -> Result<usize> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    let mut stmt = conn.prepare("UPDATE articles SET is_top = ?1, update_time = ?2 WHERE id = ?3")?;
    let res = stmt.execute(params![is_top as i32, now, id])?;
    Ok(res)
}