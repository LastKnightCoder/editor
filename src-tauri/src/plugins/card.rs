use tauri::{
  plugin::{Builder, TauriPlugin},
  Runtime,
};

use std::collections::HashMap;
use crate::state;
use crate::database::card;

#[tauri::command]
pub fn insert_one_card(tags: Vec<String>, links: Vec<i64>, content: String, category: String, app_state: tauri::State<state::AppState>) -> Result<i64, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = card::insert_one(&conn, tags, links, &content, &category).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn find_one_card(id: i64, app_state: tauri::State<state::AppState>) -> Result<card::Card, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            card::find_one(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn find_all_cards(app_state: tauri::State<state::AppState>) -> Result<Vec<card::Card>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            card::find_all(&conn).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn delete_one_card(id: i64, app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            card::delete_one(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn update_one_card(id: i64, tags: Vec<String>, links: Vec<i64>, content: String, category: String, app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            card::update_one(&conn, id, tags, links, &content, &category).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_tags_by_id(id: i64, app_state: tauri::State<state::AppState>) -> Result<Vec<String>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            card::get_tags_by_card_id(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_cards_group_by_tag(app_state: tauri::State<state::AppState>) -> Result<HashMap<String, Vec<card::Card>>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            card::get_cards_group_by_tag(&conn).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("card")
    .invoke_handler(tauri::generate_handler![
        insert_one_card,
        find_one_card,
        find_all_cards,
        delete_one_card,
        update_one_card,
        get_tags_by_id,
        get_cards_group_by_tag,
    ])
    .build()
}
