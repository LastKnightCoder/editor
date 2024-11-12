use tauri::{
  plugin::{Builder, TauriPlugin},
  Runtime,
};

use crate::state;
use crate::database::chat_message;
use crate::database::chat_message::{ChatMessage, Message};

#[tauri::command]
pub fn create_chat_message(messages: Vec<Message>, title: String, app_state: tauri::State<state::AppState>) -> Result<ChatMessage, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            chat_message::create_chat_message(&conn, messages, title).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    } 
}

#[tauri::command]
pub fn update_chat_message(id: i64, messages: Vec<Message>, title: String, app_state: tauri::State<state::AppState>) -> Result<ChatMessage, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            chat_message::update_chat_message(&conn, id, messages, title).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn delete_chat_message(id: i64, app_state: tauri::State<state::AppState>) -> Result<usize, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            chat_message::delete_chat_message(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_chat_message_by_id(id: i64, app_state: tauri::State<state::AppState>) -> Result<ChatMessage, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            chat_message::get_chat_message_by_id(&conn, id).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

#[tauri::command]
pub fn get_chat_messages(app_state: tauri::State<state::AppState>) -> Result<Vec<ChatMessage>, String> {
    let conn = app_state.db.lock().unwrap();
    match &*conn {
        Some(conn) => {
            chat_message::get_chat_messages(&conn).map_err(|e| e.to_string())
        }
        None => Err("Database connection not initialized".to_string()),
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("chat_message")
        .invoke_handler(tauri::generate_handler![
            create_chat_message,
            update_chat_message,
            delete_chat_message,
            get_chat_message_by_id,
            get_chat_messages
        ])
        .build()
}
