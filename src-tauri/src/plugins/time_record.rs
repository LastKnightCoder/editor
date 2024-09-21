use tauri::{
  plugin::{Builder, TauriPlugin},
  Runtime,
};

use crate::state;
use crate::database::time_record::{self, TimeRecord, TimeRecordGroup};

#[tauri::command]
pub fn create_time_record(
    date: String,
    cost: i64,
    content: String,
    event_type: String,
    time_type: String,
    app_state: tauri::State<state::AppState>
) -> Result<TimeRecord, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = time_record::create_time_record(&conn, &date, cost, &content, &event_type, &time_type).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn update_time_record(
    id: i64,
    date: String,
    cost: i64,
    content: String,
    event_type: String,
    time_type: String,
    app_state: tauri::State<state::AppState>
) -> Result<TimeRecord, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            time_record::update_time_record(&conn, id, &date, cost, &content, &event_type, &time_type).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn delete_time_record(
    id: i64,
    app_state: tauri::State<state::AppState>
) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            time_record::delete_time_record(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_time_record_by_id(
    id: i64,
    app_state: tauri::State<state::AppState>
) -> Result<TimeRecord, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            time_record::get_time_record_by_id(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_all_time_records(
    app_state: tauri::State<state::AppState>
) -> Result<Vec<TimeRecordGroup>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            time_record::get_all_time_records(&conn).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_time_records_by_date(
    date: String,
    app_state: tauri::State<state::AppState>
) -> Result<Vec<TimeRecord>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            time_record::get_time_records_by_date(&conn, &date).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_time_records_by_time_range(
    start_date: String,
    end_date: String,
    app_state: tauri::State<state::AppState>
) -> Result<Vec<TimeRecordGroup>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            time_record::get_time_records_by_time_range(&conn, &start_date, &end_date).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_all_event_types(
    app_state: tauri::State<state::AppState>
) -> Result<Vec<String>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            time_record::get_all_event_types(&conn).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_all_time_types(
    app_state: tauri::State<state::AppState>
) -> Result<Vec<String>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            time_record::get_all_time_types(&conn).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("time_record")
    .invoke_handler(tauri::generate_handler![
        create_time_record,
        update_time_record,
        delete_time_record,
        get_time_record_by_id,
        get_time_records_by_date,
        get_all_time_records,
        get_time_records_by_time_range,
        get_all_event_types,
        get_all_time_types,
    ])
    .build()
}
