use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Serialize, Deserialize};
use rusqlite::{Connection, params, Result, Row};
use super::operation::insert_operation;

#[derive(Serialize, Deserialize, Debug)]
pub struct Document {
    pub id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub title: String,
    pub desc: String,
    pub authors: Vec<String>,
    pub children: Vec<i64>,
    pub tags: Vec<String>,
    pub links: Vec<i64>,
    pub content: String,
    pub banner_bg: String,
    pub icon: String,
    pub is_top: bool,
    pub is_delete: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DocumentItem {
    pub id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub title: String,
    pub authors: Vec<String>,
    pub tags: Vec<String>,
    pub is_directory: bool,
    pub children: Vec<i64>,
    pub is_article: bool,
    pub article_id: i64,
    pub is_card: bool,
    pub card_id: i64,
    pub content: String,
    pub banner_bg: String,
    pub icon: String,
    pub is_delete: bool,
}

pub fn init_document_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY NOT NULL,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            title TEXT NOT NULL,
            desc TEXT,
            authors TEXT,
            children TEXT,
            tags TEXT,
            links TEXT,
            content TEXT,
            banner_bg TEXT,
            icon TEXT,
            is_top INTEGER DEFAULT 0,
            is_delete INTEGER DEFAULT 0
        )",
        [],
    )?;
    Ok(())
}

pub fn init_document_item_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS document_items (
            id INTEGER PRIMARY KEY NOT NULL,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            title TEXT NOT NULL,
            authors TEXT,
            tags TEXT,
            is_directory INTEGER DEFAULT 0,
            children TEXT,
            is_article INTEGER DEFAULT 0,
            article_id INTEGER DEFAULT 0,
            is_card INTEGER DEFAULT 0,
            card_id INTEGER DEFAULT 0,
            content TEXT,
            banner_bg TEXT,
            icon TEXT,
            is_delete INTEGER DEFAULT 0
        )",
        [],
    )?;
    Ok(())
}

pub fn get_document_from_query_result(row: &Row) -> Document {
    let authors: String = row.get(5).unwrap();
    let authors: Vec<String> = serde_json::from_str(&authors).unwrap();
    let tags: String = row.get(7).unwrap();
    let tags: Vec<String> = serde_json::from_str(&tags).unwrap();
    let links: String = row.get(8).unwrap();
    let links: Vec<i64> = serde_json::from_str(&links).unwrap();
    let children: String = row.get(6).unwrap();
    let children: Vec<i64> = serde_json::from_str(&children).unwrap();
    Document {
        id: row.get(0).unwrap(),
        create_time: row.get(1).unwrap(),
        update_time: row.get(2).unwrap(),
        title: row.get(3).unwrap(),
        desc: row.get(4).unwrap(),
        authors,
        children,
        tags,
        links,
        content: row.get(9).unwrap(),
        banner_bg: row.get(10).unwrap(),
        icon: row.get(11).unwrap(),
        is_top: row.get(12).unwrap(),
        is_delete: row.get(13).unwrap(),
    }
}

pub fn get_document_item_from_query_result(row: &Row) -> DocumentItem {
    let authors: String = row.get(4).unwrap();
    let authors: Vec<String> = serde_json::from_str(&authors).unwrap();
    let tags: String = row.get(5).unwrap();
    let tags: Vec<String> = serde_json::from_str(&tags).unwrap();
    let children: String = row.get(7).unwrap();
    let children: Vec<i64> = serde_json::from_str(&children).unwrap();
    DocumentItem {
        id: row.get(0).unwrap(),
        create_time: row.get(1).unwrap(),
        update_time: row.get(2).unwrap(),
        title: row.get(3).unwrap(),
        authors,
        tags,
        is_directory: row.get(6).unwrap(),
        children,
        is_article: row.get(8).unwrap(),
        article_id: row.get(9).unwrap(),
        is_card: row.get(10).unwrap(),
        card_id: row.get(11).unwrap(),
        content: row.get(12).unwrap(),
        banner_bg: row.get(13).unwrap(),
        icon: row.get(14).unwrap(),
        is_delete: row.get(15).unwrap(),
    }
}

pub fn create_document(conn: &Connection, title: &str, desc: &str, authors: Vec<String>, children: Vec<i64>, tags: Vec<String>, links: Vec<i64>, content: &str, banner_bg: &str, icon: &str) -> Result<i64> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let mut stmt = conn.prepare("INSERT INTO documents (create_time, update_time, title, desc, authors, children, tags, links, content, banner_bg, icon) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)")?;
    let authors_str = serde_json::to_string(&authors).unwrap();
    let tags_str = serde_json::to_string(&tags).unwrap();
    let children_str = serde_json::to_string(&children).unwrap();
    let links_str = serde_json::to_string(&links).unwrap();
    let res = stmt.insert(params![now as i64, now as i64, title, desc, authors_str, children_str, tags_str, links_str, content, banner_bg, icon])?;
    match insert_operation(conn, res as i64, "document".to_string(), "insert".to_string()) {
        Ok(_) => {}
        Err(e) => {
            println!("插入操作记录错误: {}", e);
        }
    };
    Ok(res)
}

pub fn delete_document(conn: &Connection, id: i64) -> Result<usize> {
    let mut stmt = conn.prepare("UPDATE documents SET is_delete = 1 WHERE id = ?1")?;
    let res = stmt.execute(params![id])?;

    Ok(res)
}

pub fn get_document_list(conn: &Connection) -> Result<Vec<Document>> {
    let sql = "SELECT id, create_time, update_time, title, desc, authors, children, tags, links, content, banner_bg, icon, is_top, is_delete FROM documents WHERE is_delete = 0 ORDER BY update_time DESC";
    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([])?;
    let mut res = Vec::new();
    while let Some(row) = rows.next()? {
        res.push(get_document_from_query_result(&row));
    }
    Ok(res)
}

pub fn get_document(conn: &Connection, id: i64) -> Result<Document> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, title, desc, authors, children, tags, links, content, banner_bg, icon, is_top, is_delete FROM documents WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    let row = rows.next()?.unwrap();
    Ok(get_document_from_query_result(&row))
}

pub fn update_document(conn: &Connection, id: i64, title: &str, desc: &str, authors: Vec<String>, children: Vec<i64>, tags: Vec<String>, links: Vec<i64>, content: &str, banner_bg: &str, icon: &str, is_top: bool) -> Result<usize> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let mut stmt = conn.prepare("UPDATE documents SET update_time = ?1, title = ?2, desc = ?3, authors = ?4, children = ?5, tags = ?6, links = ?7, content = ?8, banner_bg = ?9, icon = ?10, is_top = ?11 WHERE id = ?12")?;
    let authors_str = serde_json::to_string(&authors).unwrap();
    let tags_str = serde_json::to_string(&tags).unwrap();
    let children_str = serde_json::to_string(&children).unwrap();
    let links_str = serde_json::to_string(&links).unwrap();
    let res = stmt.execute(params![now as i64, title, desc, authors_str, children_str, tags_str, links_str, content, banner_bg, icon, is_top, id])?;
    match insert_operation(conn, id, "document".to_string(), "update".to_string()) {
        Ok(_) => {}
        Err(e) => {
            println!("插入操作记录错误: {}", e);
        }
    };
    Ok(res)
}

pub fn create_document_item(conn: &Connection, title: &str, authors: Vec<String>, tags: Vec<String>, is_directory: bool, children: Vec<i64>, is_article: bool, article_id: i64, is_card: bool, card_id: i64, content: &str, banner_bg: &str, icon: &str) -> Result<i64> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let mut stmt = conn.prepare("INSERT INTO document_items (create_time, update_time, title, authors, tags, is_directory, children, is_article, article_id, is_card, card_id, content, banner_bg, icon) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)")?;
    let authors_str = serde_json::to_string(&authors).unwrap();
    let tags_str = serde_json::to_string(&tags).unwrap();
    let children_str = serde_json::to_string(&children).unwrap();
    let res = stmt.insert(params![now as i64, now as i64, title, authors_str, tags_str, is_directory, children_str, is_article, article_id, is_card, card_id, content, banner_bg, icon])?;

    match insert_operation(conn, res as i64, "document_item".to_string(), "insert".to_string()) {
        Ok(_) => {},
        Err(e) => {
            println!("插入操作记录错误: {}", e);
        }
    };

    Ok(res)
}

pub fn delete_document_item(conn: &Connection, id: i64) -> Result<usize> {
    let mut stmt = conn.prepare("UPDATE document_items SET is_delete = 1 WHERE id = ?1")?;
    let res = stmt.execute(params![id])?;

    Ok(res)
}

pub fn update_document_item(conn: &Connection, id: i64, title: &str, authors: Vec<String>, tags: Vec<String>, is_directory: bool, children: Vec<i64>, is_article: bool, article_id: i64, is_card: bool, card_id: i64, content: &str, banner_bg: &str, icon: &str) -> Result<DocumentItem> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let mut stmt = conn.prepare("UPDATE document_items SET update_time = ?1, title = ?2, authors = ?3, tags = ?4, is_directory = ?5, children = ?6, is_article = ?7, article_id = ?8, is_card = ?9, card_id = ?10, content = ?11, banner_bg = ?12, icon = ?13 WHERE id = ?14")?;
    let authors_str = serde_json::to_string(&authors).unwrap();
    let tags_str = serde_json::to_string(&tags).unwrap();
    let children_str = serde_json::to_string(&children).unwrap();
    stmt.execute(params![now as i64, title, authors_str, tags_str, is_directory, children_str, is_article, article_id, is_card, card_id, content, banner_bg, icon, id])?;

    match insert_operation(conn, id, "document_item".to_string(), "update".to_string()) {
        Ok(_) => {},
        Err(e) => {
            println!("插入操作记录错误: {}", e);
        }
    }

    // 如果该 document_item 的 is_card 为 1，并且 card_id 存在，则更新 card_id 对应的 card 的 content 和 update_time
    if is_card && card_id > 0 {
        let mut stmt = conn.prepare("UPDATE cards SET update_time = ?1, content = ?2 WHERE id = ?3")?;
        stmt.execute(params![now as i64, content, card_id])?;
    }

    // 并且更新除 id 为自己以外的所有 is_card 为 1 且 card_id 和当前 card_id 相同的 document_item 的 content 和 update_time
    let mut stmt = conn.prepare("UPDATE document_items SET update_time = ?1, content = ?2 WHERE is_card = 1 AND card_id = ?3 AND id != ?4")?;
    stmt.execute(params![now as i64, content, card_id, id])?;

    // 并且更新除 id 为自己以外的所有 is_article 为 1 且 article 和当前 article 相同的 document_item 的 content 和 update_time 和 title
    let mut stmt = conn.prepare("UPDATE document_items SET update_time = ?1, content = ?2, title = ?3 WHERE is_article = 1 AND article_id = ?4 AND id != ?5")?;
    stmt.execute(params![now as i64, content, title, article_id, id])?;

    let document_item = get_document_item(conn, id)?;
    Ok(document_item)
}

pub fn get_document_item(conn: &Connection, id: i64) -> Result<DocumentItem> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, title, authors, tags, is_directory, children, is_article, article_id, is_card, card_id, content, banner_bg, icon, is_delete FROM document_items WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    let row = rows.next()?.unwrap();
    Ok(get_document_item_from_query_result(&row))
}