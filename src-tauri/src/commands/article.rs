use crate::state;
use crate::database::article;

#[tauri::command]
pub fn create_article(title: String, author: String, tags: Vec<String>, links: Vec<i64>, content: String, app_state: tauri::State<state::AppState>) -> Result<i64, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = article::create_article(&conn, title, author, tags, links, content).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn update_article(id: i64, title: String, author: String, tags: Vec<String>, links: Vec<i64>, content: String, app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            article::update_article(&conn, id, title, author, tags, links, content).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn delete_article(id: i64, app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            article::delete_article(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn find_article(id: i64, app_state: tauri::State<state::AppState>) -> Result<article::Article, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            article::find_article(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn find_all_articles(app_state: tauri::State<state::AppState>) -> Result<Vec<article::Article>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            article::find_all_articles(&conn).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}
