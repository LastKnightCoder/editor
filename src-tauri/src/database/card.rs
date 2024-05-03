use std::time::{SystemTime, UNIX_EPOCH};
use std::collections::HashMap;
use rusqlite::{Connection, params, Result, Row};
use serde::{Serialize, Deserialize};
use super::operation::insert_operation;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Card {
    pub id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub tags: Vec<String>,
    pub links: Vec<i64>,
    pub content: String,
    pub category: String,
}

fn get_card_from_query_result(row: &Row) -> Card {
    let tags: String = row.get(3).unwrap();
    let tags: Vec<String> = serde_json::from_str(&tags).unwrap();
    let links: String = row.get(4).unwrap();
    let links: Vec<i64> = serde_json::from_str(&links).unwrap();
    Card {
        id: row.get(0).unwrap(),
        create_time: row.get(1).unwrap(),
        update_time: row.get(2).unwrap(),
        tags,
        links,
        content: row.get(5).unwrap(),
        category: row.get(6).unwrap(),
    }
}

pub fn init_card_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            tags TEXT,
            links TEXT,
            content TEXT,
            category TEXT DEFAULT 'permanent'
        )",
        [],
    )?;
    Ok(())
}

pub fn upgrade_card_table(conn: &Connection, _old_version: i64, _new_version: i64) -> Result<()> {
    let mut stmt = conn.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cards'")?;
    let mut rows = stmt.query([])?;
    if let Some(row) = rows.next()? {
        let sql: String = row.get(0)?;
        if !sql.contains("category") {
            conn.execute(
                "ALTER TABLE cards ADD COLUMN category TEXT DEFAULT 'permanent'",
                [],
            )?;
        }
    }
    Ok(())
}

pub fn insert_one(conn: &Connection, tags: Vec<String>, links: Vec<i64>, content: &str, category: &str) -> Result<i64> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let mut stmt = conn.prepare("INSERT INTO cards (create_time, update_time, tags, links, content, category) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")?;
    let tags_str = serde_json::to_string(&tags).unwrap();
    let links_str = serde_json::to_string(&links).unwrap();
    let res = stmt.insert(params![now as i64, now as i64, tags_str, links_str, content, category])?;

    match insert_operation(conn, res as i64, "card".to_string(), "insert".to_string()) {
        Ok(_) => {}
        Err(e) => {
            println!("插入操作记录错误: {}", e);
        }
    };

    Ok(res)
}

pub fn find_one(conn: &Connection, id: i64) -> Result<Card> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, tags, links, content, category FROM cards WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    let row = rows.next()?.unwrap();
    Ok(get_card_from_query_result(&row))
}

pub fn find_all(conn: &Connection) -> Result<Vec<Card>> {
    // 根据更新时间倒序
    let sql = "SELECT id, create_time, update_time, tags, links, content, category FROM cards ORDER BY update_time DESC";
    let mut stmt = conn.prepare(sql)?;
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

pub fn update_one(conn: &Connection, id: i64, tags: Vec<String>, links: Vec<i64>, content: &str, category: &str) -> Result<usize> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let mut stmt = conn.prepare("UPDATE cards SET update_time = ?1, tags = ?2, links = ?3, content = ?4, category = ?5 WHERE id = ?6")?;
    let tags = serde_json::to_string(&tags).unwrap();
    let links = serde_json::to_string(&links).unwrap();
    let res = stmt.execute(params![now as i64, tags, links, content, category, id])?;

    insert_operation(conn, id, "card".to_string(), "update".to_string())?;

    // 从 document_items 表中找到 is_card 为 1 且 card_id 为 id 的所有记录，并更新其 content 和 update_time
    let mut stmt = conn.prepare("UPDATE document_items SET update_time = ?1, content = ?2 WHERE is_card = 1 AND card_id = ?3")?;
    match stmt.execute(params![now as i64, content, id]) {
        Ok(_) => {}
        Err(e) => {
            println!("更新 document_items 表错误: {}", e);
        }
    }

    // 从 project_item 找到 ref_type 为 card 且 ref_id 为 id 的所有记录，并更新其 update_time 和 content
    let mut stmt = conn.prepare("UPDATE project_item SET update_time = ?1, content = ?2 WHERE ref_type = 'card' AND ref_id = ?3")?;
    match stmt.execute(params![now as i64, content, id]) {
        Ok(_) => {}
        Err(e) => {
            println!("更新 project_items 表错误: {}", e);
        }
    }

    Ok(res)
}

pub fn get_tags_by_card_id(conn: &Connection, card_id: i64) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT tags FROM cards WHERE id = ?1")?;
    let mut rows = stmt.query(params![card_id])?;
    let row = match rows.next() {
        Ok(r) => match r {
            Some(r) => r,
            None => {
                println!("Error: card not found");
                return Ok(vec![]);
            }
        },
        Err(e) => {
            println!("Error: {}", e);
            return Ok(vec![]);
        }
    };
    let tags: String = row.get(0).unwrap();
    let tags: Vec<String> = serde_json::from_str(&tags).unwrap();
    Ok(tags)
}

// 根据 tag 中的而每个 tag 对卡片进行分组，忽略大小写，返回一个 HashMap，tag 为 key，对应的卡片数组为 value
// 要查询所有的卡片才能获得 tags
pub fn get_cards_group_by_tag(conn: &Connection) -> Result<HashMap<String, Vec<Card>>> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, tags, links, content, category FROM cards")?;
    let mut rows = stmt.query([])?;
    let mut res: HashMap<String, Vec<Card>> = HashMap::new();
    while let Some(row) = rows.next()? {
        let card = get_card_from_query_result(&row);
        for tag in &card.tags {
            let tag = tag.to_lowercase();
            if res.contains_key(&tag) {
                let cards = res.get_mut(&tag).unwrap();
                cards.push(card.clone());
            } else {
                res.insert(tag, vec![card.clone()]);
            }
        }
    }
    Ok(res)
}
