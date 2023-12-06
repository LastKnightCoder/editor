// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod state;
mod commands;

use tauri::{Manager, State};
use database::init_database;
use state::AppState;
use commands::{
    insert_one_card,
    find_one_card,
    find_all_cards,
    delete_one_card,
    update_one_card,
    get_tags_by_id,
    get_card_history_list,
    get_article_history_list,
    get_operation_list,
    get_operation_records_by_year,
    insert_daily_note,
    update_daily_note,
    delete_daily_note,
    find_daily_note_by_id,
    find_daily_note_by_date,
    find_all_daily_notes,
    create_article,
    update_article,
    update_article_banner_bg,
    update_article_is_top,
    delete_article,
    find_article,
    find_all_articles,
    write_setting,
    read_setting,
    get_all_fonts,
    create_document,
    delete_document,
    update_document,
    get_document_list,
    get_document,
    create_document_item,
    delete_document_item,
    update_document_item,
    get_document_item,
    get_ali_oss_buckets,
    get_database_path,
    reconnect_database,
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
          insert_one_card,
          find_one_card,
          find_all_cards,
          delete_one_card,
          update_one_card,
          get_tags_by_id,
          get_card_history_list,
          get_article_history_list,
          get_operation_list,
          get_operation_records_by_year,
          insert_daily_note,
          update_daily_note,
          delete_daily_note,
          find_daily_note_by_id,
          find_daily_note_by_date,
          find_all_daily_notes,
          create_article,
          update_article,
          update_article_banner_bg,
          update_article_is_top,
          delete_article,
          find_article,
          find_all_articles,
          write_setting,
          read_setting,
          get_all_fonts,
          create_document,
          delete_document,
          update_document,
          get_document_list,
          get_document,
          create_document_item,
          delete_document_item,
          update_document_item,
          get_document_item,
          get_ali_oss_buckets,
          get_database_path,
          reconnect_database,
      ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
