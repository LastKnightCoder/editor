mod database;
mod models;
mod network_policy;
mod provider_config;
mod resource_upload;
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

#[tauri::command]
fn request_exit(app: tauri::AppHandle) {
    app.exit(0);
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
            setting::verify_github_token,
            setting::list_github_repos,
            setting::list_github_branches,
            setting::verify_s3_credentials,
            setting::verify_webdav_credentials,
            setting::verify_alioss_credentials,
            database::list_databases,
            database::create_database,
            database::set_active_database,
            database::get_cards_overview,
            database::get_card_detail,
            database::get_content_detail,
            database::create_temporary_card,
            database::update_card_content,
            database::update_card_category,
            database::delete_card,
            resource_upload::upload_resource,
            sync::sync_check_versions,
            sync::sync_upload_database,
            sync::sync_download_database,
            sync::resource_sync_refresh,
            sync::resource_sync_start,
            sync::resource_sync_retry_failed,
            sync::resource_sync_cancel,
            sync::resource_sync_get_progress,
            sync::resource_sync_get_status,
            request_exit
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
