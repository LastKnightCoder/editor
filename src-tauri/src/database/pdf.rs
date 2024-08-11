use std::time::{SystemTime, UNIX_EPOCH};
use rusqlite::{Connection, params, Result, Row};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Pdf {
    pub id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub tags: Vec<String>,
    pub is_local: bool,
    pub category: String,
    pub file_name: String,
    pub file_path: String,
    pub remote_url: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PdfHighlight {
    pub id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub pdf_id: i64,
    pub color: String,
    pub highlight_type: String,
    pub rects: String,
    pub bounding_client_rect: String,
    pub highlight_text_style: String,
    pub page_num: u32,
    pub content: String,
    pub image: String,
    pub notes: String,
}

fn get_pdf_from_query_result(row: &Row) -> Pdf {
    let tags: String = row.get(3).unwrap();
    let tags: Vec<String> = serde_json::from_str(&tags).unwrap();
    Pdf {
        id: row.get(0).unwrap(),
        create_time: row.get(1).unwrap(),
        update_time: row.get(2).unwrap(),
        tags,
        is_local: row.get(4).unwrap(),
        category: row.get(5).unwrap(),
        file_name: row.get(6).unwrap(),
        file_path: row.get(7).unwrap(),
        remote_url: row.get(8).unwrap(),
    }
}

fn get_pdf_highlight_from_query_result(row: &Row) -> PdfHighlight {
    PdfHighlight {
        id: row.get(0).unwrap(),
        create_time: row.get(1).unwrap(),
        update_time: row.get(2).unwrap(),
        pdf_id: row.get(3).unwrap(),
        color: row.get(4).unwrap(),
        highlight_type: row.get(5).unwrap(),
        rects: row.get(6).unwrap(),
        bounding_client_rect: row.get(7).unwrap(),
        highlight_text_style: row.get(8).unwrap(),
        page_num: row.get(9).unwrap(),
        content: row.get(10).unwrap(),
        image: row.get(11).unwrap(),
        notes: row.get(12).unwrap(),
    }
}

pub fn init_pdf_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS pdfs (
            id INTEGER PRIMARY KEY,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            tags TEXT,
            is_local INTEGER NOT NULL,
            category TEXT DEFAULT 'default',
            file_name TEXT,
            file_path TEXT,
            remote_url TEXT
        )",
        [],
    )?;
    Ok(())
}

pub fn init_pdf_highlight_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS pdf_highlights (
            id INTEGER PRIMARY KEY,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            pdf_id INTEGER NOT NULL,
            color TEXT NOT NULL,
            highlight_type TEXT NOT NULL,
            rects TEXT NOT NULL,
            bounding_client_rect TEXT NOT NULL,
            highlight_text_style TEXT NOT NULL,
            page_num INTEGER NOT NULL,
            content TEXT NOT NULL,
            image TEXT NOT NULL,
            notes TEXT NOT NULL
        )",
        [],
    )?;
    Ok(())
}

pub fn add_pdf(conn: &Connection, tags: &Vec<String>, is_local: bool, category: &str, file_name: &str, file_path: &str, remote_url: &str) -> Result<Pdf> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let mut stmt = conn.prepare("INSERT INTO pdfs (create_time, update_time, tags, is_local, category, file_name, file_path, remote_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")?;
    let res = stmt.insert(params![now as i64, now as i64, serde_json::to_string(&tags).unwrap(), is_local, category, file_name, file_path, remote_url])?;
    let pdf = get_pdf(conn, res).unwrap();
    Ok(pdf)
}

pub fn remove_pdf(conn: &Connection, id: i64) -> Result<usize> {
    let mut stmt = conn.prepare("DELETE FROM pdfs WHERE id = ?1")?;
    let res = stmt.execute(params![id])?;
    Ok(res)
}

pub fn update_pdf(conn: &Connection, id: i64, tags: &Vec<String>, is_local: bool, category: &str, file_name: &str, file_path: &str, remote_url: &str) -> Result<Pdf> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let mut stmt = conn.prepare("UPDATE pdfs SET update_time = ?1, tags = ?2, is_local = ?3, category = ?4, file_name = ?5, file_path = ?6, remote_url = ?7 WHERE id = ?8")?;
    stmt.execute(params![now as i64, serde_json::to_string(&tags).unwrap(), is_local, category, file_name, file_path, remote_url, id])?;
    let pdf = get_pdf(conn, id).unwrap();
    Ok(pdf)
}

pub fn get_pdf(conn: &Connection, id: i64) -> Result<Pdf> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, tags, is_local, category, file_name, file_path, remote_url FROM pdfs WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    let row = rows.next()?.unwrap();
    Ok(get_pdf_from_query_result(&row))
}

pub fn get_pdf_list(conn: &Connection) -> Result<Vec<Pdf>> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, tags, is_local, category, file_name, file_path, remote_url FROM pdfs")?;
    let mut rows = stmt.query([])?;
    let mut pdfs = Vec::new();
    while let Some(row) = rows.next()? {
        pdfs.push(get_pdf_from_query_result(&row));
    }
    Ok(pdfs)
}

pub fn add_highlight(conn: &Connection, pdf_id: i64, color: &str, highlight_type: &str, rects: &str, bounding_client_rect: &str, highlight_text_style: &str, page_num: u32, content: &str, image: &str, notes: &str) -> Result<PdfHighlight> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let mut stmt = conn.prepare("INSERT INTO pdf_highlights (create_time, update_time, pdf_id, color, highlight_type, rects, bounding_client_rect, highlight_text_style, page_num, content, image, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)")?;
    let res = stmt.insert(params![now as i64, now as i64, pdf_id, color, highlight_type, rects, bounding_client_rect, highlight_text_style, page_num, content, image, notes])?;
    let pdf_highlight = get_highlight_by_id(conn, res).unwrap();
    Ok(pdf_highlight)
}

pub fn remove_highlight(conn: &Connection, id: i64) -> Result<usize> {
    let mut stmt = conn.prepare("DELETE FROM pdf_highlights WHERE id = ?1")?;
    let res = stmt.execute(params![id])?;
    Ok(res)
}

pub fn update_highlight(conn: &Connection, id: i64, pdf_id: i64, color: &str, highlight_type: &str, rects: &str, bounding_client_rect: &str, highlight_text_style: &str, page_num: u32, content: &str, image: &str, notes: &str) -> Result<PdfHighlight> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let mut stmt = conn.prepare("UPDATE pdf_highlights SET update_time = ?1, pdf_id = ?2, color = ?3, highlight_type = ?4, rects = ?5, bounding_client_rect = ?6, highlight_text_style = ?7, page_num = ?8, content = ?9, image = ?10, notes = ?11 WHERE id = ?12")?;
    stmt.execute(params![now as i64, pdf_id, color, highlight_type, rects, bounding_client_rect, highlight_text_style, page_num, content, image, notes, id])?;
    let pdf_highlight = get_highlight_by_id(conn, id).unwrap();
    Ok(pdf_highlight)
}

pub fn get_highlights(conn: &Connection, pdf_id: i64) -> Result<Vec<PdfHighlight>> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, pdf_id, color, highlight_type, rects, bounding_client_rect, highlight_text_style, page_num, content, image, notes FROM pdf_highlights WHERE pdf_id = ?1")?;
    let mut rows = stmt.query(params![pdf_id])?;
    let mut pdf_highlights = Vec::new();
    while let Some(row) = rows.next()? {
        pdf_highlights.push(get_pdf_highlight_from_query_result(&row));
    }
    Ok(pdf_highlights)
}

pub fn get_highlight_by_id(conn: &Connection, id: i64) -> Result<PdfHighlight> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, pdf_id, color, highlight_type, rects, bounding_client_rect, highlight_text_style, page_num, content, image, notes FROM pdf_highlights WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    let row = rows.next()?.unwrap();
    Ok(get_pdf_highlight_from_query_result(&row))
}
