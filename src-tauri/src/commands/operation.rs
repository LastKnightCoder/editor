use crate::state;
use crate::database::operation::{self, Operation};

#[tauri::command]
pub fn get_operation_list(app_state: tauri::State<state::AppState>) -> Result<Vec<Operation>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            operation::get_operation_list(conn).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}