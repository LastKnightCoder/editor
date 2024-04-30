use tauri::{Manager, State};
use crate::state::{AppState};
use crate::database::init_database;

#[tauri::command]
pub fn reconnect_database(app_handle: tauri::AppHandle) -> Result<(), String> {
    let conn = match init_database("data.db") {
        Ok(conn) => conn,
        Err(e) => return Err(e.to_string()),
    };
    let handle = app_handle.app_handle();
    let app_state: State<AppState> = handle.state();
    *app_state.db.lock().unwrap() = Some(conn);
    Ok(())
}

#[tauri::command]
pub fn connect_database_by_name(database_name: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let conn = match init_database(&database_name) {
        Ok(conn) => conn,
        Err(e) => return Err(e.to_string()),
    };
    let handle = app_handle.app_handle();
    let app_state: State<AppState> = handle.state();
    *app_state.db.lock().unwrap() = Some(conn);
    Ok(())
}