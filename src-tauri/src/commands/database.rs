use tauri::{Manager, State};
use crate::state::{self, AppState};
use crate::database::init_database;

#[tauri::command]
pub fn reconnect_database(app_handle: tauri::AppHandle, app_state: tauri::State<state::AppState>) -> Result<(), String> {
    let conn = match init_database() {
        Ok(conn) => conn,
        Err(e) => return Err(e.to_string()),
    };
    let handle = app_handle.app_handle();
    let app_state: State<AppState> = handle.state();
    *app_state.db.lock().unwrap() = Some(conn);
    Ok(())
}