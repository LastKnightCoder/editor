use tauri::{
  plugin::{Builder, TauriPlugin},
  Runtime,
};

use crate::state;
use crate::database::pdf;

#[tauri::command]
pub fn add_pdf(tags: Vec<String>, is_local: bool, category: String, file_name: String, file_path: String, remote_url: String, app_state: tauri::State<state::AppState>) -> Result<pdf::Pdf, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            let res = pdf::add_pdf(&conn, &tags, is_local, &category, &file_name, &file_path, &remote_url).map_err(|e| e.to_string())?;
            Ok(res)
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_pdf_by_id(id: i64, app_state: tauri::State<state::AppState>) -> Result<pdf::Pdf, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            pdf::get_pdf(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_pdf_list(app_state: tauri::State<state::AppState>) -> Result<Vec<pdf::Pdf>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            pdf::get_pdf_list(&conn).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn update_pdf(id: i64, tags: Vec<String>, is_local: bool, category: String, file_name: String, file_path: String, remote_url: String, app_state: tauri::State<state::AppState>) -> Result<pdf::Pdf, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            pdf::update_pdf(&conn, id, &tags, is_local, &category, &file_name, &file_path, &remote_url).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn remove_pdf(id: i64, app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            pdf::remove_pdf(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn add_highlight(pdf_id: i64, color: String, highlight_type: String, rects: String, bounding_client_rect: String, highlight_text_style: String, page_num: u32, content: String, image: String, notes: String, app_state: tauri::State<state::AppState>)-> Result<pdf::PdfHighlight, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            pdf::add_highlight(&conn, pdf_id, &color, &highlight_type, &rects, &bounding_client_rect, &highlight_text_style, page_num, &content, &image, &notes).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_highlight_by_id(id: i64, app_state: tauri::State<state::AppState>) -> Result<pdf::PdfHighlight, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            pdf::get_highlight_by_id(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_highlights(pdf_id: i64, app_state: tauri::State<state::AppState>) -> Result<Vec<pdf::PdfHighlight>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            pdf::get_highlights(&conn, pdf_id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn update_highlight(id: i64, pdf_id: i64, color: String, highlight_type: String, rects: String, bounding_client_rect: String, highlight_text_style: String, page_num: u32, content: String, image: String, notes: String, app_state: tauri::State<state::AppState>) -> Result<pdf::PdfHighlight, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            pdf::update_highlight(&conn, id, pdf_id, &color, &highlight_type, &rects, &bounding_client_rect, &highlight_text_style, page_num, &content, &image, &notes).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn remove_highlight(id: i64, app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            pdf::remove_highlight(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}


pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("pdf")
    .invoke_handler(tauri::generate_handler![
        add_pdf,
        get_pdf_by_id,
        get_pdf_list,
        update_pdf,
        remove_pdf,
        add_highlight,
        update_highlight,
        remove_highlight,
        get_highlights,
        get_highlight_by_id,
    ])
    .build()
}