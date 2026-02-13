use rusqlite::{params, OptionalExtension};
use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::models::{
    ActiveDatabaseResponse, CardDetailResponse, CardsOverviewResponse, ContentDetailResponse,
    DatabaseItem, DatabaseListResponse,
};
use crate::setting::{
    ensure_database_entry, get_active_database_name, get_database_items, load_or_init_setting,
    normalize_database_name, save_setting_value, set_active_database_name,
};

mod index_db;
mod query;
mod reconcile;
mod schema;
mod search;

pub use schema::ensure_database_file;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTemporaryCardPayload {
    pub content: Value,
    pub count: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCardCategoryPayload {
    pub id: i64,
    pub category: String,
}

fn normalize_card_category(category: &str) -> Option<String> {
    let normalized = category.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "temporary" | "permanent" | "theme" | "literature" => Some(normalized),
        _ => None,
    }
}

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
    reconcile::trigger_reconcile(&app, &db_name);

    let item = get_database_items(&setting)
        .into_iter()
        .find(|db| db.name == db_name)
        .unwrap_or(DatabaseItem {
            name: db_name,
            version: 1,
        });
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
    reconcile::trigger_reconcile(&app, &db_name);

    Ok(ActiveDatabaseResponse {
        active_database: db_name,
        created,
    })
}

pub fn trigger_reconcile_for_database(app: &AppHandle, db_name: &str) {
    reconcile::trigger_reconcile(app, db_name);
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
    query::query_cards_overview(
        &conn,
        page,
        page_size,
        query.as_deref(),
        category.as_deref(),
    )
}

#[tauri::command]
pub fn get_card_detail(app: AppHandle, id: i64) -> Result<CardDetailResponse, String> {
    let conn = schema::open_active_database(&app)?;
    query::query_card_detail(&conn, id)
}

#[tauri::command]
pub fn get_content_detail(
    app: AppHandle,
    content_id: i64,
) -> Result<ContentDetailResponse, String> {
    let conn = schema::open_active_database(&app)?;
    query::query_content_detail(&conn, content_id)
}

#[tauri::command]
pub fn create_temporary_card(
    app: AppHandle,
    payload: CreateTemporaryCardPayload,
) -> Result<CardDetailResponse, String> {
    let mut conn = schema::open_active_database(&app)?;
    let normalized_content = if payload.content.is_array() {
        payload.content
    } else {
        Value::Array(vec![])
    };
    let serialized_content = serde_json::to_string(&normalized_content)
        .map_err(|e| format!("CARD_CONTENT_INVALID: Failed to serialize content: {e}"))?;
    let normalized_count = payload.count.max(0);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);

    let tx = conn
        .transaction()
        .map_err(|e| format!("CARD_CREATE_FAILED: Failed to begin transaction: {e}"))?;

    tx.execute(
        "
        INSERT INTO contents (create_time, update_time, content, count, ref_count)
        VALUES (?1, ?2, ?3, ?4, 1)
        ",
        params![now, now, serialized_content, normalized_count],
    )
    .map_err(|e| format!("CARD_CREATE_FAILED: Failed to insert content: {e}"))?;
    let content_id = tx.last_insert_rowid();

    tx.execute(
        "
        INSERT INTO cards (create_time, update_time, tags, links, content_id, category, is_top)
        VALUES (?1, ?2, ?3, ?4, ?5, 'temporary', 0)
        ",
        params![now, now, "[]", "[]", content_id],
    )
    .map_err(|e| format!("CARD_CREATE_FAILED: Failed to insert card: {e}"))?;
    let card_id = tx.last_insert_rowid();

    tx.execute(
        "
        INSERT INTO operation (operation_time, operation_id, operation_content_type, operation_action)
        VALUES (?1, ?2, 'content', 'insert')
        ",
        params![now, content_id],
    )
    .map_err(|e| format!("CARD_CREATE_FAILED: Failed to write content operation: {e}"))?;

    tx.execute(
        "
        INSERT INTO operation (operation_time, operation_id, operation_content_type, operation_action)
        VALUES (?1, ?2, 'card', 'insert')
        ",
        params![now, card_id],
    )
    .map_err(|e| format!("CARD_CREATE_FAILED: Failed to write card operation: {e}"))?;

    tx.commit()
        .map_err(|e| format!("CARD_CREATE_FAILED: Failed to commit transaction: {e}"))?;

    let setting = load_or_init_setting(&app)?;
    let db_name = get_active_database_name(&setting);
    reconcile::trigger_reconcile(&app, &db_name);

    query::query_card_detail(&conn, card_id)
}

#[tauri::command]
pub fn update_card_category(
    app: AppHandle,
    payload: UpdateCardCategoryPayload,
) -> Result<CardDetailResponse, String> {
    let normalized_category = normalize_card_category(&payload.category)
        .ok_or_else(|| "CARD_CATEGORY_INVALID: invalid card category".to_string())?;
    let mut conn = schema::open_active_database(&app)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);

    let tx = conn
        .transaction()
        .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to begin transaction: {e}"))?;

    let changed = tx
        .execute(
            "
            UPDATE cards
            SET category = ?1, update_time = ?2
            WHERE id = ?3
            ",
            params![normalized_category, now, payload.id],
        )
        .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to update card category: {e}"))?;
    if changed == 0 {
        return Err("CARD_NOT_FOUND: card does not exist".to_string());
    }

    tx.execute(
        "
        INSERT INTO operation (operation_time, operation_id, operation_content_type, operation_action)
        VALUES (?1, ?2, 'card', 'update')
        ",
        params![now, payload.id],
    )
    .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to write card operation: {e}"))?;

    tx.commit()
        .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to commit transaction: {e}"))?;

    let setting = load_or_init_setting(&app)?;
    let db_name = get_active_database_name(&setting);
    reconcile::trigger_reconcile(&app, &db_name);

    query::query_card_detail(&conn, payload.id)
}

#[tauri::command]
pub fn delete_card(app: AppHandle, id: i64) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);

    let tx = conn
        .transaction()
        .map_err(|e| format!("CARD_DELETE_FAILED: Failed to begin transaction: {e}"))?;

    let content_id = tx
        .query_row(
            "
            SELECT COALESCE(content_id, 0)
            FROM cards
            WHERE id = ?1
            LIMIT 1
            ",
            params![id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| format!("CARD_DELETE_FAILED: Failed to query card content id: {e}"))?
        .ok_or_else(|| "CARD_NOT_FOUND: card does not exist".to_string())?;

    let changed = tx
        .execute(
            "
            DELETE FROM cards
            WHERE id = ?1
            ",
            params![id],
        )
        .map_err(|e| format!("CARD_DELETE_FAILED: Failed to delete card: {e}"))?;
    if changed == 0 {
        return Err("CARD_NOT_FOUND: card does not exist".to_string());
    }

    tx.execute(
        "
        INSERT INTO operation (operation_time, operation_id, operation_content_type, operation_action)
        VALUES (?1, ?2, 'card', 'delete')
        ",
        params![now, id],
    )
    .map_err(|e| format!("CARD_DELETE_FAILED: Failed to write card operation: {e}"))?;

    if content_id > 0 {
        tx.execute(
            "
            UPDATE contents
            SET ref_count = ref_count - 1
            WHERE id = ?1
            ",
            params![content_id],
        )
        .map_err(|e| format!("CARD_DELETE_FAILED: Failed to decrease content ref_count: {e}"))?;

        let ref_count = tx
            .query_row(
                "
                SELECT ref_count
                FROM contents
                WHERE id = ?1
                LIMIT 1
                ",
                params![content_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|e| format!("CARD_DELETE_FAILED: Failed to read content ref_count: {e}"))?;

        if matches!(ref_count, Some(count) if count <= 0) {
            tx.execute("DELETE FROM contents WHERE id = ?1", params![content_id])
                .map_err(|e| format!("CARD_DELETE_FAILED: Failed to delete content: {e}"))?;
            tx.execute(
                "
                INSERT INTO operation (operation_time, operation_id, operation_content_type, operation_action)
                VALUES (?1, ?2, 'content', 'delete')
                ",
                params![now, content_id],
            )
            .map_err(|e| format!("CARD_DELETE_FAILED: Failed to write content operation: {e}"))?;
        }
    }

    tx.commit()
        .map_err(|e| format!("CARD_DELETE_FAILED: Failed to commit transaction: {e}"))?;

    let setting = load_or_init_setting(&app)?;
    let db_name = get_active_database_name(&setting);
    reconcile::trigger_reconcile(&app, &db_name);

    Ok(changed as i64)
}
