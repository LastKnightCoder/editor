use crate::state;
use crate::database::history::{self, Query, History};

#[tauri::command]
pub fn get_card_history_list(card_id: i64, page_size: i64, page_number: i64,  app_state: tauri::State<state::AppState>) -> Result<Vec<History>, String> {
    let conn = app_state.db.lock().unwrap();
    let query = Query {
        content_id: card_id,
        content_type: "card".to_string(),
        page_size,
        page_number,
    };
    println!("query: {:?}", query);
    match &*conn {
        Some(conn) => {
            history::get_history_list(conn, query).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_article_history_list(article_id: i64, page_size: i64, page_number: i64,  app_state: tauri::State<state::AppState>) -> Result<Vec<History>, String> {
    let conn = app_state.db.lock().unwrap();
    let query = Query {
        content_id: article_id,
        content_type: "article".to_string(),
        page_size,
        page_number,
    };
    match &*conn {
        Some(conn) => {
            history::get_history_list(conn, query).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}