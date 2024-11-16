use std::time::{SystemTime, UNIX_EPOCH};
use rusqlite::{Connection, params, Result, Row};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VecDocument {
    pub id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub ref_type: String,
    pub ref_id: i64,
    pub ref_update_time: i64,
    pub contents: String,
    pub contents_embedding: Vec<f32>,
}

fn get_vec_document_from_query_result(row: &Row) -> VecDocument {
    let contents: String = row.get(6).unwrap();
    let contents_embedding: String = row.get(7).unwrap();
//     let contents_embedding: String = String::from_utf8(contents_embedding).unwrap();
    let contents_embedding: Vec<f32> = serde_json::from_str(&contents_embedding).unwrap();
    VecDocument {
        id: row.get(0).unwrap(),
        create_time: row.get(1).unwrap(),
        update_time: row.get(2).unwrap(),
        ref_type: row.get(3).unwrap(),
        ref_id: row.get(4).unwrap(),
        ref_update_time: row.get(5).unwrap(),
        contents,
        contents_embedding,
    }
}

pub fn init_vec_document_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS vec_documents (
            id INTEGER PRIMARY KEY,
            create_time INTEGER,
            update_time INTEGER,
            ref_type TEXT,
            ref_id INTEGER,
            ref_update_time INTEGER,
            contents TEXT,
            contents_embedding blob check(vec_length(contents_embedding) == 3072)
        ) strict",
        [],
    )?;
    Ok(())
}

pub fn create_vec_document(conn: &Connection, ref_type: &str, ref_id: i64, ref_update_time: i64, contents: &str, contents_embedding: Vec<f32>) -> Result<VecDocument> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let contents_embedding_str = serde_json::to_string(&contents_embedding).unwrap();
    let mut stmt = conn.prepare("INSERT INTO vec_documents (create_time, update_time, ref_type, ref_id, ref_update_time, contents, contents_embedding) VALUES (?1, ?2, ?3, ?4, ?5, ?6, vec_f32(?7))")?;
    let res = stmt.insert(params![now as i64, now as i64, ref_type, ref_id, ref_update_time, contents, contents_embedding_str])?;
    let vec_document = get_vec_document_by_id(conn, res)?;
    Ok(vec_document)
}

pub fn get_vec_document_by_id(conn: &Connection, id: i64) -> Result<VecDocument> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, ref_type, ref_id, ref_update_time, contents, vec_to_json(contents_embedding) FROM vec_documents WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        let vec_document = get_vec_document_from_query_result(&row);
        Ok(vec_document)
    } else {
        Err(rusqlite::Error::QueryReturnedNoRows)
    }
}

pub fn get_vec_documents_by_ref(conn: &Connection, ref_type: &str, ref_id: i64) -> Result<Vec<VecDocument>> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, ref_type, ref_id, ref_update_time, contents, vec_to_json(contents_embedding) FROM vec_documents WHERE ref_type = ?1 AND ref_id = ?2")?;
    let mut rows = stmt.query(params![ref_type, ref_id])?;
    let mut vec_documents = Vec::new();
    while let Some(row) = rows.next()? {
        let vec_document = get_vec_document_from_query_result(&row);
        vec_documents.push(vec_document);
    }
    Ok(vec_documents)
}

pub fn get_vec_documents_by_ref_type(conn: &Connection, ref_type: &str) -> Result<Vec<VecDocument>> {
    let mut stmt = conn.prepare("SELECT id, create_time, update_time, ref_type, ref_id, ref_update_time, contents, vec_to_json(contents_embedding) FROM vec_documents WHERE ref_type = ?1")?;
    let mut rows = stmt.query(params![ref_type])?;
    let mut vec_documents = Vec::new();
    while let Some(row) = rows.next()? {
        let vec_document = get_vec_document_from_query_result(&row);
        vec_documents.push(vec_document);
    }
    Ok(vec_documents)
}

pub fn delete_vec_document(conn: &Connection, id: i64) -> Result<()> {
    let mut stmt = conn.prepare("DELETE FROM vec_documents WHERE id = ?1")?;
    stmt.execute(params![id])?;
    Ok(())
}

pub fn delete_vec_documents_by_ref(conn: &Connection, ref_type: &str, ref_id: i64) -> Result<()> {
    let mut stmt = conn.prepare("DELETE FROM vec_documents WHERE ref_type = ?1 AND ref_id = ?2")?;
    stmt.execute(params![ref_type, ref_id])?;
    Ok(())
}

pub fn get_all_vec_documents(conn: &Connection) -> Result<Vec<VecDocument>> {
    let mut stmt = conn.prepare("SELECT * FROM vec_documents")?;
    let mut rows = stmt.query([])?;
    let mut vec_documents = Vec::new();
    while let Some(row) = rows.next()? {
        let vec_document = get_vec_document_from_query_result(&row);
        vec_documents.push(vec_document);
    }
    Ok(vec_documents)
}

pub fn update_vec_document(conn: &Connection, id: i64, ref_type: &str, ref_id: i64, ref_update_time: i64, contents: &str, contents_embedding: Vec<f32>) -> Result<VecDocument> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let contents_embedding_str = serde_json::to_string(&contents_embedding).unwrap();
    let mut stmt = conn.prepare("UPDATE vec_documents SET update_time = ?1, ref_type = ?2, ref_id = ?3, ref_update_time = ?4, contents = ?5, contents_embedding = vec_f32(?6) WHERE id =?7")?;
    stmt.execute(params![now as i64, ref_type, ref_id, ref_update_time, contents, contents_embedding_str, id])?;
    let vec_document = get_vec_document_by_id(conn, id)?;
    Ok(vec_document)
}

pub fn search_vec_documents(conn: &Connection, query_embedding: Vec<f32>, top_k: usize) -> Result<Vec<(VecDocument, f32)>> {
    let query_embedding_str = serde_json::to_string(&query_embedding).unwrap();
    let mut stmt = conn.prepare("SELECT id, vec_distance_cosine(?1, contents_embedding) AS distance FROM vec_documents WHERE distance < 0.6 ORDER BY distance LIMIT ?2")?;
    let mut rows = stmt.query(params![query_embedding_str, top_k])?;
    let mut results = Vec::new();
    while let Some(row) = rows.next()? {
        let id: i64 = row.get(0)?;
        let distance: f32 = row.get(1)?;
        let vec_document = get_vec_document_by_id(conn, id)?;
        results.push((vec_document, distance));
    }
    Ok(results)
}
