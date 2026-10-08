use rusqlite::{params, Transaction};
use tauri::AppHandle;

use super::flashcard_common::{
    empty_paragraph_text, format_db_error, now_millis, parse_card_row, query_card_by_id,
    query_references_by_card_ids, release_references, ReferenceScope, CARD_COLUMNS,
};
use super::flashcard_types::{
    CreateFlashcardPayload, DeleteFlashcardPayload, Flashcard, FlashcardReference,
    FlashcardReferenceInput, GetFlashcardPayload, ListFlashcardsPayload, UpdateFlashcardPayload,
};
use crate::database::schema;

// 索引一致性：卡片增删改后触发后台 reconcile（异步，不阻塞命令返回）

// ── 卡片命令 ──

/// 卡片列表：按卡组取全量，筛选/搜索由前端在内存中完成（列表本就需要即时过滤）
#[tauri::command]
pub fn flashcard_list_cards(
    app: AppHandle,
    payload: ListFlashcardsPayload,
) -> Result<Vec<Flashcard>, String> {
    let conn = schema::open_active_database(&app)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {CARD_COLUMNS} FROM flashcards WHERE deck_id = ?1 ORDER BY update_time DESC"
        ))
        .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "prepare list cards", e))?;
    let mut cards: Vec<Flashcard> = stmt
        .query_map(rusqlite::params![payload.deck_id], |row| {
            parse_card_row(row, vec![])
        })
        .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "query cards", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "parse card row", e))?;
    let mut reference_map =
        query_references_by_card_ids(&conn, &cards.iter().map(|card| card.id).collect::<Vec<_>>())?;
    for card in &mut cards {
        card.references = reference_map.remove(&card.id).unwrap_or_default();
    }
    Ok(cards)
}

#[tauri::command]
pub fn flashcard_get_card(
    app: AppHandle,
    payload: GetFlashcardPayload,
) -> Result<Option<Flashcard>, String> {
    let conn = schema::open_active_database(&app)?;
    query_card_by_id(&conn, payload.id)
}

fn serialize_value(value: &serde_json::Value) -> Result<String, String> {
    serde_json::to_string(value)
        .map_err(|e| format!("FLASHCARD_SAVE_FAILED: Failed to serialize json: {e}"))
}

/// 重写卡片参考资料（create 时挂接）。移动端只创建 content 型引用——
/// 直接指向已有 contents 行并递增其 ref_count；桌面端写入的 custom 型引用
/// 在读取/展示路径（LEFT JOIN contents）仍兼容。目前仅新建卡片时调用，
/// 若将来用于更新，需先挂新引用再 release_references 释放旧引用，避免同一 content 被提前回收。
fn replace_references(
    tx: &Transaction,
    card_id: i64,
    references: &[FlashcardReferenceInput],
) -> Result<Vec<FlashcardReference>, String> {
    let now = now_millis();
    let mut inserted = vec![];
    for reference in references {
        let title = reference.title.trim();
        if title.is_empty() {
            return Err("FLASHCARD_SAVE_FAILED: 参考资料标题不能为空".to_string());
        }
        if reference.ref_type != "content" {
            return Err(format!(
                "FLASHCARD_SAVE_FAILED: 未知参考资料类型 {}",
                reference.ref_type
            ));
        }
        tx.execute(
            "UPDATE contents SET ref_count = ref_count + 1 WHERE id = ?1",
            params![reference.content_id],
        )
        .map_err(|e| format_db_error("FLASHCARD_SAVE_FAILED", "increment ref count", e))?;
        tx.execute(
            "INSERT INTO flashcard_references (card_id, content_id, ref_type, title, create_time, update_time) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![card_id, reference.content_id, reference.ref_type, title, now],
        )
        .map_err(|e| format_db_error("FLASHCARD_SAVE_FAILED", "insert reference", e))?;
        inserted.push(FlashcardReference {
            id: tx.last_insert_rowid(),
            card_id,
            content_id: reference.content_id,
            ref_type: reference.ref_type.clone(),
            title: title.to_string(),
            create_time: now,
            update_time: now,
            content: None,
        });
    }
    Ok(inserted)
}

fn update_reference_summary(tx: &Transaction, card_id: i64) -> Result<(), String> {
    let titles: Vec<String> = {
        let mut stmt = tx
            .prepare(
                "SELECT title FROM flashcard_references WHERE card_id = ?1 ORDER BY update_time DESC",
            )
            .map_err(|e| format_db_error("FLASHCARD_SAVE_FAILED", "prepare reference summary", e))?;
        let rows = stmt
            .query_map(params![card_id], |row| row.get::<_, String>(0))
            .map_err(|e| format_db_error("FLASHCARD_SAVE_FAILED", "query reference titles", e))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format_db_error("FLASHCARD_SAVE_FAILED", "parse reference title", e))?
    };
    let summary = titles
        .iter()
        .take(3)
        .cloned()
        .collect::<Vec<_>>()
        .join(" · ");
    tx.execute(
        "UPDATE flashcards SET reference_summary = ?1 WHERE id = ?2",
        params![
            if summary.is_empty() {
                None
            } else {
                Some(summary)
            },
            card_id
        ],
    )
    .map_err(|e| format_db_error("FLASHCARD_SAVE_FAILED", "update reference summary", e))?;
    Ok(())
}

fn validate_card_type(card_type: &str) -> Result<(), String> {
    match card_type {
        "single-choice" | "multiple-choice" | "cloze" | "qa" | "boolean" => Ok(()),
        other => Err(format!("FLASHCARD_INVALID_TYPE: 未知题型 {other}")),
    }
}

#[tauri::command]
pub fn flashcard_create_card(
    app: AppHandle,
    payload: CreateFlashcardPayload,
) -> Result<Flashcard, String> {
    validate_card_type(&payload.card_type)?;
    if !payload.prompt.is_array() {
        return Err("FLASHCARD_SAVE_FAILED: 题干必须是富文本数组".to_string());
    }
    let mut conn = schema::open_active_database(&app)?;
    let now = now_millis();
    let detail = payload.detail.clone().unwrap_or_else(empty_paragraph_text);
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("FLASHCARD_SAVE_FAILED", "begin transaction", e))?;
    // deck 存在性前置校验：FK 约束报错对用户不友好，这里给出明确的错误码
    let deck_exists: bool = tx
        .query_row(
            "SELECT COUNT(1) FROM flashcard_decks WHERE id = ?1",
            params![payload.deck_id],
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count > 0)
        .map_err(|e| format_db_error("FLASHCARD_SAVE_FAILED", "check deck exists", e))?;
    if !deck_exists {
        return Err("FLASHCARD_NOT_FOUND: 归属卡组不存在".to_string());
    }
    tx.execute(
        "INSERT INTO flashcards (\
         deck_id, type, prompt, detail, data, tags, difficulty, \
         due_time, last_review_time, review_count, memory_stability, memory_difficulty, status, \
         reference_summary, create_time, update_time) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, 0, NULL, NULL, 'new', NULL, ?8, ?8)",
        params![
            payload.deck_id,
            payload.card_type,
            serialize_value(&payload.prompt)?,
            serialize_value(&detail)?,
            serialize_value(
                &payload
                    .data
                    .clone()
                    .unwrap_or_else(|| serde_json::json!({}))
            )?,
            serde_json::to_string(&payload.tags.clone().unwrap_or_default())
                .map_err(|e| format!("FLASHCARD_SAVE_FAILED: Failed to serialize tags: {e}"))?,
            payload
                .difficulty
                .clone()
                .unwrap_or_else(|| "standard".into()),
            now
        ],
    )
    .map_err(|e| format_db_error("FLASHCARD_SAVE_FAILED", "insert card", e))?;
    let card_id = tx.last_insert_rowid();
    if let Some(references) = &payload.references {
        replace_references(&tx, card_id, references)?;
        update_reference_summary(&tx, card_id)?;
    }
    tx.commit()
        .map_err(|e| format_db_error("FLASHCARD_SAVE_FAILED", "commit transaction", e))?;
    // reconcile 须在 commit 后触发：它另起连接异步读库，抢在提交前会读不到新卡且无补救
    crate::database::common::trigger_reconcile(&app);
    query_card_by_id(&conn, card_id)?
        .ok_or_else(|| "FLASHCARD_SAVE_FAILED: 建后读取失败".to_string())
}

#[tauri::command]
pub fn flashcard_update_card(
    app: AppHandle,
    payload: UpdateFlashcardPayload,
) -> Result<Flashcard, String> {
    let mut conn = schema::open_active_database(&app)?;
    let existing = query_card_by_id(&conn, payload.id)?
        .ok_or_else(|| "FLASHCARD_NOT_FOUND: 卡片不存在".to_string())?;
    let card_type = payload.card_type.unwrap_or(existing.card_type);
    validate_card_type(&card_type)?;
    // 与 create 一致：非数组 prompt/detail 直接拒绝，不静默沿用旧值吞掉编辑
    let prompt = match payload.prompt {
        Some(value) if value.is_array() => serialize_value(&value)?,
        Some(_) => return Err("FLASHCARD_SAVE_FAILED: 题干必须是富文本数组".to_string()),
        None => serialize_value(&existing.prompt)?,
    };
    let detail = match payload.detail {
        Some(value) if value.is_array() => serialize_value(&value)?,
        Some(_) => return Err("FLASHCARD_SAVE_FAILED: 背面补充必须是富文本数组".to_string()),
        None => serialize_value(&existing.detail)?,
    };
    let data = match payload.data {
        Some(value) => serialize_value(&value)?,
        None => serialize_value(&existing.data)?,
    };
    let tags = serde_json::to_string(&payload.tags.unwrap_or(existing.tags))
        .map_err(|e| format!("FLASHCARD_SAVE_FAILED: Failed to serialize tags: {e}"))?;
    let next_deck_id = payload.deck_id.unwrap_or(existing.deck_id);
    let now = now_millis();
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("FLASHCARD_UPDATE_FAILED", "begin transaction", e))?;
    // 换组时校验目标卡组存在（对齐 create 的孤儿卡防护）
    if next_deck_id != existing.deck_id {
        let deck_exists: bool = tx
            .query_row(
                "SELECT COUNT(1) FROM flashcard_decks WHERE id = ?1",
                params![next_deck_id],
                |row| row.get::<_, i64>(0),
            )
            .map(|count| count > 0)
            .map_err(|e| format_db_error("FLASHCARD_UPDATE_FAILED", "check deck exists", e))?;
        if !deck_exists {
            return Err("FLASHCARD_NOT_FOUND: 目标卡组不存在".to_string());
        }
    }
    let changed = tx
        .execute(
            // 不触碰调度列（status/due_time/memory_*）：编辑内容不应重置复习进度
            "UPDATE flashcards SET \
             deck_id = ?1, type = ?2, prompt = ?3, detail = ?4, data = ?5, tags = ?6, \
             difficulty = ?7, update_time = ?8 \
             WHERE id = ?9",
            params![
                next_deck_id,
                card_type,
                prompt,
                detail,
                data,
                tags,
                payload.difficulty.unwrap_or(existing.difficulty),
                now,
                payload.id
            ],
        )
        .map_err(|e| format_db_error("FLASHCARD_UPDATE_FAILED", "update card", e))?;
    if changed == 0 {
        return Err("FLASHCARD_NOT_FOUND: 卡片不存在".to_string());
    }
    tx.commit()
        .map_err(|e| format_db_error("FLASHCARD_UPDATE_FAILED", "commit transaction", e))?;
    crate::database::common::trigger_reconcile(&app);
    query_card_by_id(&conn, payload.id)?
        .ok_or_else(|| "FLASHCARD_NOT_FOUND: 更新后读取失败".to_string())
}

#[tauri::command]
pub fn flashcard_delete_card(
    app: AppHandle,
    payload: DeleteFlashcardPayload,
) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("FLASHCARD_DELETE_FAILED", "begin transaction", e))?;
    release_references(&tx, ReferenceScope::Card(payload.id))?;
    tx.execute(
        "DELETE FROM flashcard_reviews WHERE card_id = ?1",
        params![payload.id],
    )
    .map_err(|e| format_db_error("FLASHCARD_DELETE_FAILED", "delete reviews", e))?;
    let changed = tx
        .execute("DELETE FROM flashcards WHERE id = ?1", params![payload.id])
        .map_err(|e| format_db_error("FLASHCARD_DELETE_FAILED", "delete card", e))?;
    if changed == 0 {
        return Err("FLASHCARD_NOT_FOUND: 卡片不存在".to_string());
    }
    tx.commit()
        .map_err(|e| format_db_error("FLASHCARD_DELETE_FAILED", "commit transaction", e))?;
    crate::database::common::trigger_reconcile(&app);
    Ok(payload.id)
}
