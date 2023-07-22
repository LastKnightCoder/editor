// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod state;
mod commands;

use tauri::{Manager, State};
use database::{init_database};
use state::AppState;
use commands::{
    file,
    insert_one_card,
    find_one_card,
    find_all_cards,
    delete_one_card,
    update_one_card,
    get_tags_by_id,
    get_card_history_list,
    get_article_history_list,
    get_operation_list,
};

fn main() {
  tauri::Builder::default()
      .manage(state::AppState {
          db: std::sync::Mutex::new(None),
      })
      .setup(|app| {
          let handle = app.handle();
          let conn = init_database().unwrap();
          let app_state: State<AppState> = handle.state();
          *app_state.db.lock().unwrap() = Some(conn);
          Ok(())
      })
      .invoke_handler(tauri::generate_handler![
          file::read_from_file,
          insert_one_card,
          find_one_card,
          find_all_cards,
          delete_one_card,
          update_one_card,
          get_tags_by_id,
          get_card_history_list,
          get_article_history_list,
          get_operation_list,
      ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
