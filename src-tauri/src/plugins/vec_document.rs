use crate::state;
use crate::database::vec_document::{self, VecDocument};

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[tauri::command]
pub fn create_vec_document(
    ref_type: &str,
    ref_id: i64,
    ref_update_time: i64,
    contents: &str,
    contents_embedding: Vec<f32>,
    app_state: tauri::State<state::AppState>
) -> Result<VecDocument, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = vec_document::create_vec_document(&conn, ref_type, ref_id, ref_update_time, contents, contents_embedding).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_vec_documents_by_id(
    id: i64,
    app_state: tauri::State<state::AppState>
) -> Result<VecDocument, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = vec_document::get_vec_document_by_id(&conn, id).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_vec_documents_by_ref(
    ref_type: &str,
    ref_id: i64,
    app_state: tauri::State<state::AppState>
) -> Result<Vec<VecDocument>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = vec_document::get_vec_documents_by_ref(&conn, ref_type, ref_id).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn delete_vec_document(
    id: i64,
    app_state: tauri::State<state::AppState>
) -> Result<(), String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            vec_document::delete_vec_document(&conn, id).map_err(|e| e.to_string())?;
            Ok(())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn delete_vec_documents_by_ref(
    ref_type: &str,
    ref_id: i64,
    app_state: tauri::State<state::AppState>
) -> Result<(), String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            vec_document::delete_vec_documents_by_ref(&conn, ref_type, ref_id).map_err(|e| e.to_string())?;
            Ok(())
        }
       None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_vec_documents_by_ref_type(
    ref_type: &str,
    app_state: tauri::State<state::AppState>
) -> Result<Vec<VecDocument>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = vec_document::get_vec_documents_by_ref_type(&conn, ref_type).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_all_vec_documents(
    app_state: tauri::State<state::AppState>
) -> Result<Vec<VecDocument>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = vec_document::get_all_vec_documents(&conn).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn update_vec_document(
    id: i64,
    ref_type: &str,
    ref_id: i64,
    ref_update_time: i64,
    contents: &str,
    contents_embedding: Vec<f32>,
    app_state: tauri::State<state::AppState>
) -> Result<VecDocument, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = vec_document::update_vec_document(&conn, id, ref_type, ref_id, ref_update_time, contents, contents_embedding).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn search_vec_documents(
    query_embedding: Vec<f32>,
    top_k: usize,
    app_state: tauri::State<state::AppState>
) -> Result<Vec<(VecDocument, f32)>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = vec_document::search_vec_documents(&conn, query_embedding, top_k).map_err(|e| e.to_string());
            return res;
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("vec_document")
        .invoke_handler(tauri::generate_handler![
            create_vec_document,
            get_vec_documents_by_id,
            get_vec_documents_by_ref,
            get_vec_documents_by_ref_type,
            delete_vec_document,
            delete_vec_documents_by_ref,
            get_all_vec_documents,
            update_vec_document,
            search_vec_documents,
        ])
        .build()
}
