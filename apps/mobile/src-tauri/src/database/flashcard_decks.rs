use rusqlite::params;
use tauri::AppHandle;

use super::flashcard_common::{
    format_db_error, now_millis, parse_deck_row, query_deck_by_id, query_deck_stats_map,
    release_references, ReferenceScope, DECK_COLUMNS,
};
use super::flashcard_types::{
    CreateFlashcardDeckPayload, DeleteFlashcardDeckPayload, FlashcardDeck,
    UpdateFlashcardDeckPayload,
};
use crate::database::schema;

// ── 卡组命令 ──

#[tauri::command]
pub fn flashcard_list_decks(app: AppHandle) -> Result<Vec<FlashcardDeck>, String> {
    let conn = schema::open_active_database(&app)?;
    list_decks(&conn)
}

pub(super) fn list_decks(conn: &rusqlite::Connection) -> Result<Vec<FlashcardDeck>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {DECK_COLUMNS} FROM flashcard_decks ORDER BY sort_order ASC, update_time DESC"
        ))
        .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "prepare list decks", e))?;
    let mut decks: Vec<FlashcardDeck> = stmt
        .query_map([], parse_deck_row)
        .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "query decks", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "parse deck row", e))?;
    let stats_map = query_deck_stats_map(&conn)?;
    for deck in &mut decks {
        deck.stats = stats_map.get(&deck.id).cloned();
    }
    Ok(decks)
}

#[tauri::command]
pub fn flashcard_create_deck(
    app: AppHandle,
    payload: CreateFlashcardDeckPayload,
) -> Result<FlashcardDeck, String> {
    let conn = schema::open_active_database(&app)?;
    create_deck(&conn, payload)
}

pub(super) fn create_deck(
    conn: &rusqlite::Connection,
    payload: CreateFlashcardDeckPayload,
) -> Result<FlashcardDeck, String> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err("FLASHCARD_INVALID_NAME: 卡组名称不能为空".to_string());
    }
    let now = now_millis();
    conn.execute(
        "INSERT INTO flashcard_decks (name, description, cover_color, emoji, sort_order, meta, create_time, update_time) \
         VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?6)",
        params![
            name,
            payload.description.unwrap_or_default(),
            payload.cover_color.unwrap_or_else(|| "#2563eb".into()),
            payload.emoji.unwrap_or_else(|| "🧠".into()),
            payload.sort_order.unwrap_or(0),
            now
        ],
    )
    .map_err(|e| format_db_error("FLASHCARD_CREATE_FAILED", "insert deck", e))?;
    let id = conn.last_insert_rowid();
    query_deck_by_id(&conn, id)?.ok_or_else(|| "FLASHCARD_CREATE_FAILED: 建后读取失败".to_string())
}

#[tauri::command]
pub fn flashcard_update_deck(
    app: AppHandle,
    payload: UpdateFlashcardDeckPayload,
) -> Result<FlashcardDeck, String> {
    let conn = schema::open_active_database(&app)?;
    let existing = query_deck_by_id(&conn, payload.id)?
        .ok_or_else(|| "FLASHCARD_NOT_FOUND: 卡组不存在".to_string())?;
    let name = match payload.name.as_deref() {
        Some(n) => {
            let trimmed = n.trim();
            if trimmed.is_empty() {
                return Err("FLASHCARD_INVALID_NAME: 卡组名称不能为空".to_string());
            }
            trimmed.to_string()
        }
        None => existing.name,
    };
    let description = payload.description.unwrap_or(existing.description);
    let cover_color = payload.cover_color.unwrap_or(existing.cover_color);
    let emoji = payload.emoji.unwrap_or(existing.emoji);
    let sort_order = payload.sort_order.unwrap_or(existing.sort_order);
    conn.execute(
        "UPDATE flashcard_decks \
         SET name = ?1, description = ?2, cover_color = ?3, emoji = ?4, sort_order = ?5, update_time = ?6 \
         WHERE id = ?7",
        params![name, description, cover_color, emoji, sort_order, now_millis(), payload.id],
    )
    .map_err(|e| format_db_error("FLASHCARD_UPDATE_FAILED", "update deck", e))?;
    query_deck_by_id(&conn, payload.id)?
        .ok_or_else(|| "FLASHCARD_NOT_FOUND: 更新后读取失败".to_string())
}

#[tauri::command]
pub fn flashcard_delete_deck(
    app: AppHandle,
    payload: DeleteFlashcardDeckPayload,
) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("FLASHCARD_DELETE_FAILED", "begin transaction", e))?;
    // 级联清理：卡片 → 引用/复习历史 → 卡组（对齐桌面 deleteDeck）
    release_references(&tx, ReferenceScope::Deck(payload.id))?;
    tx.execute(
        "DELETE FROM flashcard_reviews WHERE card_id IN (SELECT id FROM flashcards WHERE deck_id = ?1)",
        params![payload.id],
    )
    .map_err(|e| format_db_error("FLASHCARD_DELETE_FAILED", "delete reviews", e))?;
    tx.execute(
        "DELETE FROM flashcards WHERE deck_id = ?1",
        params![payload.id],
    )
    .map_err(|e| format_db_error("FLASHCARD_DELETE_FAILED", "delete cards", e))?;
    let changed = tx
        .execute(
            "DELETE FROM flashcard_decks WHERE id = ?1",
            params![payload.id],
        )
        .map_err(|e| format_db_error("FLASHCARD_DELETE_FAILED", "delete deck", e))?;
    if changed == 0 {
        return Err("FLASHCARD_NOT_FOUND: 卡组不存在".to_string());
    }
    tx.commit()
        .map_err(|e| format_db_error("FLASHCARD_DELETE_FAILED", "commit transaction", e))?;
    // 级联删除了整组卡，立即触发 reconcile 清扫索引 stale 行
    crate::database::common::trigger_reconcile(&app);
    Ok(payload.id)
}
