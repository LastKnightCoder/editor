use tauri::AppHandle;

use crate::models::{
    ActiveDatabaseResponse, CardDetailResponse, CardsOverviewResponse, DatabaseItem,
    DatabaseListResponse,
};
use crate::setting::{
    ensure_database_entry, get_active_database_name, get_database_items, load_or_init_setting,
    normalize_database_name, save_setting_value, set_active_database_name,
};

mod query;
mod schema;
mod search;

pub use schema::ensure_database_file;

#[tauri::command]
pub fn list_databases(app: AppHandle) -> Result<DatabaseListResponse, String> {
    let setting = load_or_init_setting(&app)?;
    Ok(DatabaseListResponse {
        active_database: get_active_database_name(&setting),
        databases: get_database_items(&setting),
    })
}

#[tauri::command]
pub fn create_database(app: AppHandle, name: String) -> Result<DatabaseItem, String> {
    let db_name = normalize_database_name(&name).map_err(|_| "DB_NAME_INVALID".to_string())?;
    let mut setting = load_or_init_setting(&app)?;
    let _ = ensure_database_entry(&mut setting, &db_name);
    set_active_database_name(&mut setting, &db_name);
    save_setting_value(&app, &setting)?;
    ensure_database_file(&app, &db_name)?;

    let item = get_database_items(&setting)
        .into_iter()
        .find(|db| db.name == db_name)
        .unwrap_or(DatabaseItem { name: db_name, version: 1 });
    Ok(item)
}

#[tauri::command]
pub fn set_active_database(app: AppHandle, name: String) -> Result<ActiveDatabaseResponse, String> {
    let db_name = normalize_database_name(&name).map_err(|_| "DB_NAME_INVALID".to_string())?;
    let mut setting = load_or_init_setting(&app)?;
    let created = ensure_database_entry(&mut setting, &db_name);
    set_active_database_name(&mut setting, &db_name);
    save_setting_value(&app, &setting)?;
    ensure_database_file(&app, &db_name)?;

    Ok(ActiveDatabaseResponse {
        active_database: db_name,
        created,
    })
}

#[tauri::command]
pub fn get_cards_overview(
    app: AppHandle,
    page: u32,
    page_size: u32,
    query: Option<String>,
    category: Option<String>,
) -> Result<CardsOverviewResponse, String> {
    let conn = schema::open_active_database(&app)?;
    query::query_cards_overview(&conn, page, page_size, query.as_deref(), category.as_deref())
}

#[tauri::command]
pub fn get_card_detail(app: AppHandle, id: i64) -> Result<CardDetailResponse, String> {
    let conn = schema::open_active_database(&app)?;
    query::query_card_detail(&conn, id)
}
