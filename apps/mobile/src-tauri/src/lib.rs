mod database;
mod models;
mod setting;
mod sync;

use rusqlite::ffi::sqlite3_auto_extension;
use sqlite_vec::sqlite3_vec_init;
use std::sync::Once;

static SQLITE_VEC_INIT: Once = Once::new();

fn init_sqlite_extensions() {
    SQLITE_VEC_INIT.call_once(|| unsafe {
        sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_vec_init as *const ())));
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_sqlite_extensions();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            setting::bootstrap_app,
            setting::read_setting_json,
            setting::write_setting_json,
            database::list_databases,
            database::create_database,
            database::set_active_database,
            database::get_cards_overview,
            database::get_card_detail,
            sync::sync_check_versions,
            sync::sync_upload_database,
            sync::sync_download_database
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
