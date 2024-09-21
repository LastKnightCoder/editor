use tauri::{
  plugin::{Builder, TauriPlugin},
  Runtime,
};

use crate::state;
use crate::database::daily_note;
use crate::database::daily_note::DailyNote;

#[tauri::command]
pub fn insert_daily_note(
    date: String,
    content: String,
    app_state: tauri::State<state::AppState>
) -> Result<DailyNote, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = daily_note::insert_daily_note(&conn, &date, &content).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn update_daily_note(
    id: i64,
    content: String,
    app_state: tauri::State<state::AppState>
) -> Result<DailyNote, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            daily_note::update_daily_note(&conn, id,  &content).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn delete_daily_note(
    id: i64,
    app_state: tauri::State<state::AppState>
) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            daily_note::delete_daily_note(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn find_daily_note_by_id(
    id: i64,
    app_state: tauri::State<state::AppState>
) -> Result<daily_note::DailyNote, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            daily_note::get_daily_note_by_id(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn find_daily_note_by_date(
    date: String,
    app_state: tauri::State<state::AppState>
) -> Result<daily_note::DailyNote, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            daily_note::get_daily_note_by_date(&conn, &date).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn find_all_daily_notes(
    app_state: tauri::State<state::AppState>
) -> Result<Vec<daily_note::DailyNote>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            daily_note::get_daily_notes(&conn).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("daily_note")
    .invoke_handler(tauri::generate_handler![
        insert_daily_note,
        update_daily_note,
        delete_daily_note,
        find_daily_note_by_id,
        find_daily_note_by_date,
        find_all_daily_notes,
    ])
    .build()
}
