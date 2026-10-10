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
mod assistant_tasks;
mod calendar;
mod calendar_holidays;
mod calendar_time;
mod collaboration;
mod common;
mod diary;
mod flashcard;
mod home_stats;
mod index_db;
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
pub use assistant_tasks::*;
pub use calendar::*;
pub use collaboration::*;
pub use diary::*;
pub use flashcard::*;
pub use home_stats::*;
pub use index_db::reset_index_database;
pub use pomodoro::*;
pub use project::*;
/** 移动端同步包的数据模型版本（与桌面同步信封版本、主库 schema 版本分属不同口径） */
pub(crate) const DATA_MODEL_VERSION: i64 = 1;
pub use schema::ensure_database_file;
pub(crate) use schema::invalidate_cached_connection;
pub use schema::validate_download;
pub use todo::*;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateQuickCardPayload {
    pub content: Value,
    pub count: i64,
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
    assistant_tasks::reconcile_document_links(tx, content_id, Some(&normalized_content))?;

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
) -> Result<CardsOverviewResponse, String> {
    let conn = schema::open_active_database(&app)?;
    query::query_cards_overview(&conn, page, page_size, query.as_deref())
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
pub fn create_quick_card(
    app: AppHandle,
    payload: CreateQuickCardPayload,
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
        INSERT INTO contents (id, create_time, update_time, content, count, ref_count)
        VALUES (?5, ?1, ?2, ?3, ?4, 1)
        ",
        params![
            now,
            now,
            serialized_content,
            normalized_count,
            assistant_tasks::next_id(&tx, "contents")?
        ],
    )
    .map_err(|e| format!("CARD_CREATE_FAILED: Failed to insert content: {e}"))?;
    let content_id = tx.last_insert_rowid();

    tx.execute(
        "
        INSERT INTO cards (create_time, update_time, tags, links, content_id, is_top)
        VALUES (?1, ?2, ?3, ?4, ?5, 0)
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

/// update_card_links 的核心差量：期望连接（目标卡 → 各自正文）与当前「有卡片投影」的邻居做差，
/// 只增删涉及的边（无向边规范化单行）。抽出命令壳以便单测直接对内存库执行。
fn apply_card_links(
    conn: &mut rusqlite::Connection,
    self_id: i64,
    new_links: &[i64],
    now: i64,
) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to begin transaction: {e}"))?;

    let self_content: Option<i64> = tx
        .query_row(
            "SELECT content_id FROM cards WHERE id = ?1 LIMIT 1",
            params![self_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to read card: {e}"))?;
    let self_content =
        self_content.ok_or_else(|| "CARD_NOT_FOUND: card does not exist".to_string())?;

    // 期望连接的对方正文（目标卡必须存在；共用同一份正文的目标跳过——那就是自己）
    let mut desired: Vec<i64> = Vec::with_capacity(new_links.len());
    for target in new_links {
        let content: Option<i64> = tx
            .query_row(
                "SELECT content_id FROM cards WHERE id = ?1 LIMIT 1",
                params![target],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to validate linked card: {e}"))?;
        match content {
            None => {
                return Err("CARD_LINK_INVALID: one or more linked cards do not exist".to_string())
            }
            Some(content) => {
                if content != self_content && !desired.contains(&content) {
                    desired.push(content);
                }
            }
        }
    }

    // 只对「有卡片投影」的邻居做差量：没有卡片投影的连接（文章 / 项目文档）
    // 移动端看不到，整表保存也不能因此误删
    let current = query::card_backed_neighbor_contents(&tx, self_content);
    let added: Vec<i64> = desired
        .iter()
        .filter(|content| !current.contains(content))
        .cloned()
        .collect();
    let removed: Vec<i64> = current
        .iter()
        .filter(|content| !desired.contains(content))
        .cloned()
        .collect();

    for other in added.iter().chain(removed.iter()) {
        let (low, high) = if self_content < *other {
            (self_content, *other)
        } else {
            (*other, self_content)
        };
        if added.contains(other) {
            tx.execute(
                "
                INSERT OR IGNORE INTO content_links (content_id, target_content_id, create_time)
                VALUES (?1, ?2, ?3)
                ",
                params![low, high, now],
            )
            .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to add content link: {e}"))?;
        } else {
            tx.execute(
                "DELETE FROM content_links WHERE content_id = ?1 AND target_content_id = ?2",
                params![low, high],
            )
            .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to remove content link: {e}"))?;
        }
    }
    if !added.is_empty() || !removed.is_empty() {
        tx.execute(
            "
            INSERT INTO operation (operation_time, operation_id, operation_content_type, operation_action)
            VALUES (?1, ?2, 'card', 'update')
            ",
            params![now, self_id],
        )
        .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to write card operation: {e}"))?;
    }

    tx.commit()
        .map_err(|e| format!("CARD_UPDATE_FAILED: Failed to commit transaction: {e}"))
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

    apply_card_links(&mut conn, self_id, &new_links, now)?;

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
            assistant_tasks::reconcile_document_links(&tx, content_id, None)?;
            // 释放两侧显式连接（与桌面 ContentTable.releaseContent 对齐），防悬空边
            tx.execute(
                "DELETE FROM content_links WHERE content_id = ?1 OR target_content_id = ?1",
                params![content_id],
            )
            .map_err(|e| format!("CARD_DELETE_FAILED: Failed to release content links: {e}"))?;
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

#[cfg(test)]
mod content_link_tests {
    use super::*;

    fn setup() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        migrator::ensure_main_schema(&conn).unwrap();
        conn
    }

    fn insert_content(conn: &rusqlite::Connection, text: &str) -> i64 {
        conn.query_row(
            "INSERT INTO contents (create_time, update_time, content, count, ref_count)
             VALUES (1, 1, json_quote(?1), ?2, 1) RETURNING id",
            params![text, text.len() as i64],
            |row| row.get(0),
        )
        .unwrap()
    }

    fn insert_card(conn: &rusqlite::Connection, content_id: i64) -> i64 {
        conn.query_row(
            "INSERT INTO cards (create_time, update_time, tags, links, content_id)
             VALUES (1, 1, '[]', '[]', ?1) RETURNING id",
            params![content_id],
            |row| row.get(0),
        )
        .unwrap()
    }

    fn edge_count(conn: &rusqlite::Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM content_links", [], |r| r.get(0))
            .unwrap()
    }

    fn has_edge(conn: &rusqlite::Connection, a: i64, b: i64) -> bool {
        let (low, high) = (a.min(b), a.max(b));
        conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM content_links WHERE content_id = ?1 AND target_content_id = ?2)",
            params![low, high],
            |r| r.get(0),
        )
        .unwrap()
    }

    #[test]
    fn update_card_links_differential_preserves_non_card_neighbors() {
        let mut conn = setup();
        let a = insert_content(&conn, "卡片A");
        let b = insert_content(&conn, "卡片B");
        let c = insert_content(&conn, "文章正文");
        let card_a = insert_card(&conn, a);
        let card_b = insert_card(&conn, b);
        // A—文章（无卡片投影）与 A—B 两条边
        conn.execute(
            "INSERT INTO content_links (content_id, target_content_id, create_time) VALUES (?1, ?2, 1)",
            params![a.min(c), a.max(c)],
        )
        .unwrap();

        // 移动端整表保存只选了 B：文章侧的边不能被误删
        apply_card_links(&mut conn, card_a, &[card_b], 2).unwrap();
        assert!(has_edge(&conn, a, b));
        assert!(
            has_edge(&conn, a, c),
            "无卡片投影的邻居（文章）不能被整表保存误删"
        );
        // 卡片详情只展示卡片投影邻居：此刻只有 B 可见（文章侧不可见）
        assert_eq!(query::linked_card_ids(&conn, a), vec![card_b]);

        // 清空选择：只删卡片侧的 B 边，文章边仍在
        apply_card_links(&mut conn, card_a, &[], 3).unwrap();
        assert!(!has_edge(&conn, a, b));
        assert!(has_edge(&conn, a, c));
        assert!(query::linked_card_ids(&conn, a).is_empty());
    }

    #[test]
    fn update_card_links_rejects_missing_target_without_writes() {
        let mut conn = setup();
        let a = insert_content(&conn, "卡片A");
        let card_a = insert_card(&conn, a);
        let err = apply_card_links(&mut conn, card_a, &[999], 2).unwrap_err();
        assert!(err.contains("CARD_LINK_INVALID"), "unexpected: {err}");
        assert_eq!(edge_count(&conn), 0);
    }

    #[test]
    fn update_card_links_skips_same_content_target() {
        let mut conn = setup();
        let shared = insert_content(&conn, "共用正文");
        let card_a = insert_card(&conn, shared);
        let card_b = insert_card(&conn, shared);
        apply_card_links(&mut conn, card_a, &[card_b], 2).unwrap();
        assert_eq!(edge_count(&conn), 0, "共用正文的身份之间不互连");
    }

    /// 引用归零删除正文时释放两侧边（common 路径；delete_card / diary / todo 是同一语句）。
    /// delete_card / 删日记段是 tauri 命令无法直测，语句与 common.rs 完全一致。
    #[test]
    fn deleting_content_releases_content_links() {
        let conn = setup();
        let a = insert_content(&conn, "卡片A");
        let b = insert_content(&conn, "卡片B");
        conn.execute(
            "INSERT INTO content_links (content_id, target_content_id, create_time) VALUES (?1, ?2, 1)",
            params![a.min(b), a.max(b)],
        )
        .unwrap();
        // a 是较大一侧（target 侧），验证 target 侧删除同样生效
        let victim = a.max(b);

        conn.execute("BEGIN", []).unwrap();
        common::decrement_or_delete_content(&conn, victim).unwrap();
        conn.execute("COMMIT", []).unwrap();

        assert_eq!(edge_count(&conn), 0, "正文删除应释放两侧的边");
    }
}
