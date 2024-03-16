use crate::state;
use crate::database::article;
use crate::database::article::Article;

#[tauri::command]
pub fn create_article(
    title: String, 
    author: String, 
    tags: Vec<String>, 
    links: Vec<i64>, 
    content: String, 
    banner_bg: String, 
    is_top: bool,
    app_state: tauri::State<state::AppState>
) -> Result<Article, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            match article::create_article(&conn, title, author, tags, links, content, banner_bg, is_top).map_err(|e| e.to_string()) {
                Ok(article) => Ok(article),
                Err(e) => {
                    println!("create_article error: {}", e);
                    Err(e)
                },
            }
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn update_article(
    id: i64, 
    title: String, 
    author: String, 
    tags: Vec<String>, 
    links: Vec<i64>, 
    content: String,
    banner_bg: String,
    is_top: bool,
    app_state: tauri::State<state::AppState>
) -> Result<Article, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            article::update_article(&conn, id, title, author, tags, links, content, banner_bg, is_top).map_err(|e| e.to_string())
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

#[tauri::command]
pub fn update_article_banner_bg(id: i64, banner_bg: String, app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            article::update_banner_bg(&conn, id, banner_bg).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn update_article_is_top(id: i64, is_top: bool, app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            article::update_is_top(&conn, id, is_top).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}