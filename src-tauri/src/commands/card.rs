use crate::state;
use crate::database::card;

#[tauri::command]
pub fn insert_one_card(tags: String, links: String, content: String, app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = card::insert_one(&conn, &tags, &links, &content).map_err(|e| e.to_string())?;
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
pub fn update_one_card(id: i64, tags: String, links: String, content: String, app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            card::update_one(&conn, id, &tags, &links, &content).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}
