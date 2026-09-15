use rusqlite::{params, OptionalExtension};
use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::models::{
    ActiveDatabaseResponse, CardDetailResponse, CardListItem, CardsOverviewResponse,
    ContentDetailResponse, DatabaseItem, DatabaseListResponse, DatabaseSchemaStatusResponse,
};
use crate::setting::{
    ensure_database_entry, get_active_database_name, get_database_items, load_or_init_setting,
    normalize_database_name, save_setting_value, set_active_database_name,
};

mod article;
mod calendar;
mod calendar_time;
mod calendar_holidays;
mod collaboration;
mod common;
mod diary;
mod document;
mod flashcard;
mod home_stats;
mod index_db;
mod knowledge_migration;
mod main_upgrade;
mod migrator;
mod pomodoro;
mod project;
mod query;
mod reconcile;
mod schema;
mod search;
mod todo;
mod todo_calendar_sync;

pub use article::*;
pub use calendar::*;
pub use collaboration::*;
pub use diary::*;
pub use document::*;
pub use flashcard::*;
pub use home_stats::*;
pub use pomodoro::*;
pub use project::*;
pub use index_db::reset_index_database;
pub(crate) use knowledge_migration::DATA_MODEL_VERSION;
pub use schema::ensure_database_file;
pub(crate) use schema::invalidate_cached_connection;
pub use schema::validate_download;
pub use todo::*;

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCardTagsPayload {
    pub id: i64,
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCardLinksPayload {
    pub id: i64,
    pub links: Vec<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardsByIdsPayload {
    pub ids: Vec<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateContentPayload {
    pub content_id: i64,
    pub content: Value,
    pub count: i64,
}

/// 内容快照落库的共享实现（update_content 与协作投影共用）：
/// 更新 contents 行并联动卡片更新时间、操作记录与日记时间戳。返回受影响行数。
fn write_content_snapshot(
    tx: &rusqlite::Transaction,
    content_id: i64,
    content: &Value,
    count: i64,
    now: i64,
    code: &str,
) -> Result<i64, String> {
    let normalized_content = if content.is_array() {
        content.clone()
    } else {
        Value::Array(vec![])
    };
    let serialized_content = serde_json::to_string(&normalized_content)
        .map_err(|e| format!("{code}: Failed to serialize content: {e}"))?;

    let content_changed = tx
        .execute(
            "
            UPDATE contents
            SET content = ?1, count = ?2, update_time = ?3
            WHERE id = ?4
            ",
            params![serialized_content, count, now, content_id],
        )
        .map_err(|e| format!("{code}: Failed to update content: {e}"))?;
    if content_changed == 0 {
        return Err("CONTENT_NOT_FOUND: content does not exist".to_string());
    }

    let mut linked_card_ids: Vec<i64> = vec![];
    {
        let mut stmt = tx
            .prepare(
                "
                SELECT id
                FROM cards
                WHERE content_id = ?1
                ",
            )
            .map_err(|e| format!("{code}: Failed to prepare linked cards query: {e}"))?;
        let mut rows = stmt
            .query(params![content_id])
            .map_err(|e| format!("{code}: Failed to query linked cards: {e}"))?;
        while let Some(row) = rows
            .next()
            .map_err(|e| format!("{code}: Failed to read linked cards: {e}"))?
        {
            let card_id = row
                .get::<_, i64>(0)
                .map_err(|e| format!("{code}: Failed to parse linked card id: {e}"))?;
            linked_card_ids.push(card_id);
        }
    }

    tx.execute(
        "
        UPDATE cards
        SET update_time = ?1
        WHERE content_id = ?2
        ",
        params![now, content_id],
    )
    .map_err(|e| format!("{code}: Failed to update linked cards: {e}"))?;

    tx.execute(
        "
        INSERT INTO operation (operation_time, operation_id, operation_content_type, operation_action)
        VALUES (?1, ?2, 'content', 'update')
        ",
        params![now, content_id],
    )
    .map_err(|e| format!("{code}: Failed to write content operation: {e}"))?;

    for card_id in linked_card_ids {
        tx.execute(
            "
            INSERT INTO operation (operation_time, operation_id, operation_content_type, operation_action)
            VALUES (?1, ?2, 'card', 'update')
            ",
            params![now, card_id],
        )
        .map_err(|e| format!("{code}: Failed to write card operation: {e}"))?;
    }

    diary::touch_content_diaries(tx, content_id, now)?;
    Ok(content_changed as i64)
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
pub fn get_active_database_size(app: AppHandle) -> Result<u64, String> {
    schema::active_database_size_bytes(&app)
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

pub fn resolve_embedding_fingerprint_for_setting(setting: &Value) -> String {
    index_db::resolve_embedding_fingerprint_from_setting(setting)
}

pub fn force_checkpoint_database(app: &AppHandle, db_name: &str) -> Result<(), String> {
    // checkpoint 要求 WAL 无并发连接，缓存连接会让 busy 检查失败
    schema::invalidate_cached_connection();
    schema::force_checkpoint(app, db_name)
}

fn count_non_internal_tables(conn: &rusqlite::Connection) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        [],
        |row| row.get::<_, i64>(0),
    )
    .map_err(|e| format!("DB_OPEN_FAILED: Failed to count tables: {e}"))
}

#[tauri::command]
pub fn get_database_schema_status(
    app: AppHandle,
    name: Option<String>,
) -> Result<DatabaseSchemaStatusResponse, String> {
    let db_name = if let Some(raw_name) = name {
        normalize_database_name(&raw_name).map_err(|_| "DB_NAME_INVALID".to_string())?
    } else {
        let setting = load_or_init_setting(&app)?;
        get_active_database_name(&setting)
    };

    ensure_database_file(&app, &db_name)?;
    let main_conn = schema::open_database_by_name(&app, &db_name)?;
    let index_conn = index_db::open_index_database(&app, &db_name)?;

    let main_schema_version = migrator::get_meta(&main_conn, "main_schema_version")?
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    let index_schema_version = migrator::get_meta(&index_conn, "index_schema_version")?
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    let main_schema_hash = migrator::get_meta(&main_conn, "main_schema_hash")?.unwrap_or_default();
    let index_schema_hash =
        migrator::get_meta(&index_conn, "index_schema_hash")?.unwrap_or_default();

    Ok(DatabaseSchemaStatusResponse {
        database_name: db_name,
        main_schema_version,
        index_schema_version,
        main_schema_hash,
        index_schema_hash,
        main_table_count: count_non_internal_tables(&main_conn)?,
        index_table_count: count_non_internal_tables(&index_conn)?,
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
    query::query_cards_overview(
        &conn,
        page,
        page_size,
        query.as_deref(),
        category.as_deref(),
    )
}

#[tauri::command]
pub fn search_all_content(
    app: AppHandle,
    query: String,
    page: Option<u32>,
    page_size: Option<u32>,
    types: Option<Vec<String>>,
) -> Result<crate::models::UnifiedSearchResponse, String> {
    let conn = schema::open_active_database(&app)?;
    let page = page.unwrap_or(1);
    let page_size = page_size.unwrap_or(20);
    let (search_mode, total, items) =
        search::query_unified_search(&conn, &query, types.as_deref(), page, page_size)?;
    Ok(crate::models::UnifiedSearchResponse {
        total,
        page: page.max(1),
        page_size: page_size.clamp(1, 100),
        query: query.trim().to_string(),
        search_mode,
        items,
    })
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
pub fn update_content(
    app: AppHandle,
    payload: UpdateContentPayload,
) -> Result<ContentDetailResponse, String> {
    let mut conn = schema::open_active_database(&app)?;
    // 绑定协作的内容只允许经协作投影管线写入，避免与云端投影互相覆盖
    collaboration::assert_content_local(&conn, payload.content_id)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);

    let tx = conn
        .transaction()
        .map_err(|e| format!("CONTENT_UPDATE_FAILED: Failed to begin transaction: {e}"))?;
    write_content_snapshot(
        &tx,
        payload.content_id,
        &payload.content,
        payload.count,
        now,
        "CONTENT_UPDATE_FAILED",
    )?;
    tx.commit()
        .map_err(|e| format!("CONTENT_UPDATE_FAILED: Failed to commit transaction: {e}"))?;

    let setting = load_or_init_setting(&app)?;
    let db_name = get_active_database_name(&setting);
    reconcile::trigger_reconcile(&app, &db_name);

    query::query_content_detail(&conn, payload.content_id)
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

fn normalize_card_tags(tags: Vec<String>) -> Result<String, String> {
    let mut seen = std::collections::HashSet::new();
    let normalized: Vec<String> = tags
        .into_iter()
        .map(|tag| tag.trim().to_string())
        .filter(|tag| !tag.is_empty() && seen.insert(tag.clone()))
        .collect();
    serde_json::to_string(&normalized)
        .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to serialize tags: {e}"))
}

#[tauri::command]
pub fn update_card_tags(
    app: AppHandle,
    payload: UpdateCardTagsPayload,
) -> Result<CardDetailResponse, String> {
    let serialized_tags = normalize_card_tags(payload.tags)?;
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
            SET tags = ?1, update_time = ?2
            WHERE id = ?3
            ",
            params![serialized_tags, now, payload.id],
        )
        .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to update card tags: {e}"))?;
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
pub fn update_card_links(
    app: AppHandle,
    payload: UpdateCardLinksPayload,
) -> Result<CardDetailResponse, String> {
    let self_id = payload.id;
    // 过滤自关联与重复项（保序）
    let mut seen = std::collections::HashSet::new();
    let new_links: Vec<i64> = payload
        .links
        .into_iter()
        .filter(|id| *id != self_id && seen.insert(*id))
        .collect();

    let mut conn = schema::open_active_database(&app)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);

    let tx = conn
        .transaction()
        .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to begin transaction: {e}"))?;

    if !new_links.is_empty() {
        let placeholders = vec!["?"; new_links.len()].join(", ");
        let sql = format!("SELECT COUNT(*) FROM cards WHERE id IN ({placeholders})");
        let found: i64 = tx
            .query_row(&sql, rusqlite::params_from_iter(new_links.iter()), |row| {
                row.get(0)
            })
            .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to validate linked cards: {e}"))?;
        if found != new_links.len() as i64 {
            return Err("CARD_LINK_INVALID: one or more linked cards do not exist".to_string());
        }
    }

    let old_links_raw: Option<String> = tx
        .query_row(
            "SELECT links FROM cards WHERE id = ?1 LIMIT 1",
            params![self_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to read card links: {e}"))?
        .ok_or_else(|| "CARD_NOT_FOUND: card does not exist".to_string())?;
    let old_links = query::parse_links_column(old_links_raw);

    let serialized_new_links = serde_json::to_string(&new_links)
        .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to serialize links: {e}"))?;
    tx.execute(
        "
        UPDATE cards
        SET links = ?1, update_time = ?2
        WHERE id = ?3
        ",
        params![serialized_new_links, now, self_id],
    )
    .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to update card links: {e}"))?;
    tx.execute(
        "
        INSERT INTO operation (operation_time, operation_id, operation_content_type, operation_action)
        VALUES (?1, ?2, 'card', 'update')
        ",
        params![now, self_id],
    )
    .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to write card operation: {e}"))?;

    // 双向同步：新增的关联，对方卡片补上自己；移除的关联，对方卡片删掉自己
    let added: Vec<i64> = new_links
        .iter()
        .filter(|id| !old_links.contains(id))
        .cloned()
        .collect();
    let removed: Vec<i64> = old_links
        .iter()
        .filter(|id| !new_links.contains(id))
        .cloned()
        .collect();

    for other_id in added.iter().chain(removed.iter()) {
        let other_raw: Option<String> = tx
            .query_row(
                "SELECT links FROM cards WHERE id = ?1 LIMIT 1",
                params![other_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to read linked card: {e}"))?;
        let Some(other_raw) = other_raw else {
            continue;
        };
        let mut other_links = query::parse_links_column(Some(other_raw));
        if added.contains(other_id) {
            if !other_links.contains(&self_id) {
                other_links.push(self_id);
            }
        } else {
            other_links.retain(|id| *id != self_id);
        }
        let serialized_other = serde_json::to_string(&other_links)
            .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to serialize links: {e}"))?;
        tx.execute(
            "
            UPDATE cards
            SET links = ?1, update_time = ?2
            WHERE id = ?3
            ",
            params![serialized_other, now, other_id],
        )
        .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to sync linked card: {e}"))?;
        tx.execute(
            "
            INSERT INTO operation (operation_time, operation_id, operation_content_type, operation_action)
            VALUES (?1, ?2, 'card', 'update')
            ",
            params![now, other_id],
        )
        .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to write card operation: {e}"))?;
    }

    tx.commit()
        .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to commit transaction: {e}"))?;

    let setting = load_or_init_setting(&app)?;
    let db_name = get_active_database_name(&setting);
    reconcile::trigger_reconcile(&app, &db_name);

    query::query_card_detail(&conn, self_id)
}

#[tauri::command]
pub fn get_cards_by_ids(
    app: AppHandle,
    payload: CardsByIdsPayload,
) -> Result<Vec<CardListItem>, String> {
    let conn = schema::open_active_database(&app)?;
    query::query_cards_by_ids(&conn, &payload.ids)
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

    // 协作中的内容不允许删除（与桌面端守卫一致）：先结束共享再删除
    if content_id > 0 {
        collaboration::assert_content_local(&tx, content_id)?;
    }

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
