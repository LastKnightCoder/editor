use crate::state;
use crate::database::document;

#[tauri::command]
pub fn create_document(title: String, desc: String, authors: Vec<String>, children: Vec<i64>, tags: Vec<String>, links: Vec<i64>, content: String, banner_bg: String, icon: String, app_state: tauri::State<state::AppState>) -> Result<i64, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = document::create_document(&conn, &title, &desc, authors, children, tags, links, &content, &banner_bg, &icon).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn delete_document(id: i64, app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            document::delete_document(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn update_document(id: i64, title: String, desc: String, authors: Vec<String>, children: Vec<i64>, tags: Vec<String>, links: Vec<i64>, content: String, banner_bg: String, icon: String, is_top: bool, app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            document::update_document(&conn, id, &title, &desc, authors, children, tags, links, &content, &banner_bg, &icon, is_top).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_document_list(app_state: tauri::State<state::AppState>) -> Result<Vec<document::Document>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            document::get_document_list(&conn).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_document(id: i64, app_state: tauri::State<state::AppState>) -> Result<document::Document, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            document::get_document(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn create_document_item(title: String, authors: Vec<String>, tags: Vec<String>, is_directory: bool, children: Vec<i64>, is_article: bool, article_id: i64, is_card: bool, card_id: i64, content: String, banner_bg: String, icon: String, app_state: tauri::State<state::AppState>) -> Result<i64, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = document::create_document_item(&conn, &title, authors, tags, is_directory, children, is_article, article_id, is_card, card_id, &content, &banner_bg, &icon).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn delete_document_item(id: i64, app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            document::delete_document_item(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn update_document_item(id: i64, title: String, authors: Vec<String>, tags: Vec<String>, is_directory: bool, children: Vec<i64>, is_article: bool, article_id: i64, is_card: bool, card_id: i64, content: String, banner_bg: String, icon: String, app_state: tauri::State<state::AppState>) -> Result<document::DocumentItem, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            document::update_document_item(&conn, id, &title, authors, tags, is_directory, children, is_article, article_id, is_card, card_id, &content, &banner_bg, &icon).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_document_item(id: i64, app_state: tauri::State<state::AppState>) -> Result<document::DocumentItem, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            document::get_document_item(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_document_items_by_ids(ids: Vec<i64>, app_state: tauri::State<state::AppState>) -> Result<Vec<document::DocumentItem>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            document::get_document_items_by_ids(&conn, ids).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn is_document_item_child_of(id: i64, parent_id: i64, app_state: tauri::State<state::AppState>) -> Result<bool, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            document::is_document_item_child_of(&conn, id, parent_id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}