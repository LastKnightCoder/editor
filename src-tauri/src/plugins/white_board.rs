use tauri::{
  plugin::{Builder, TauriPlugin},
  Runtime,
};

use crate::state;
use crate::database::white_board;

#[tauri::command]
pub fn create_white_board(tags: Vec<String>, data: String, title: String, description: String, snapshot: String, app_state: tauri::State<state::AppState>) -> Result<white_board::WhiteBoard, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            white_board::create_white_board(conn, tags, &data, &title, &description, &snapshot).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_white_board_by_id(id: i64, app_state: tauri::State<state::AppState>) -> Result<white_board::WhiteBoard, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            white_board::get_white_board_by_id(conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_all_white_boards(app_state: tauri::State<state::AppState>) -> Result<Vec<white_board::WhiteBoard>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            white_board::get_all_white_boards(conn).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn update_white_board(id: i64, tags: Vec<String>, data: String, title: String, description: String, snapshot: String, app_state: tauri::State<state::AppState>) -> Result<white_board::WhiteBoard, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            white_board::update_white_board(conn, id, tags, &data, &title, &description, &snapshot).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn delete_white_board(id: i64, app_state: tauri::State<state::AppState>) -> Result<(), String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            white_board::delete_white_board(conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("white_board")
  .invoke_handler(tauri::generate_handler![
    create_white_board,
    get_white_board_by_id,
    get_all_white_boards,
    update_white_board,
    delete_white_board,
  ])
  .build()
}
