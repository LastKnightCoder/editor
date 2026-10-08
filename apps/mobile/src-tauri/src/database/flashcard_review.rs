use rusqlite::params;
use tauri::AppHandle;

use super::flashcard_common::{
    format_db_error, now_millis, parse_card_row, query_card_by_id, query_references_by_card_ids,
    CARD_COLUMNS,
};
use super::flashcard_schedule::calculate_schedule;
use super::flashcard_types::{
    Flashcard, FlashcardReviewDayStats, FlashcardReviewQueuePayload, FlashcardReviewStatsPayload,
    SubmitFlashcardReviewPayload,
};
use crate::database::schema;

// ── 复习链路 ──

/// 到期队列：due_time 升序 → memory_stability 升序（对齐桌面 getReviewQueue 的默认排序，
/// NULL（新卡）在 SQLite ASC 下排在最前，与桌面一致）
#[tauri::command]
pub fn flashcard_get_review_queue(
    app: AppHandle,
    payload: FlashcardReviewQueuePayload,
) -> Result<Vec<Flashcard>, String> {
    let conn = schema::open_active_database(&app)?;
    // 暂停的卡不进复习队列（对齐桌面 getReviewQueue 默认排除 suspended）
    let mut conditions: Vec<String> = vec!["due_time <= ?".into(), "status != 'suspended'".into()];
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now_millis())];
    if let Some(deck_id) = payload.deck_id {
        conditions.push("deck_id = ?".into());
        values.push(Box::new(deck_id));
    }
    values.push(
        Box::new(payload.limit.unwrap_or(20).clamp(1, 100)) as Box<dyn rusqlite::types::ToSql>
    );
    let sql = format!(
        "SELECT {CARD_COLUMNS} FROM flashcards WHERE {} \
         ORDER BY due_time ASC, memory_stability ASC LIMIT ?",
        conditions.join(" AND ")
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "prepare review queue", e))?;
    let refs = rusqlite::params_from_iter(values.iter().map(|v| v.as_ref()));
    let mut cards: Vec<Flashcard> = stmt
        .query_map(refs, |row| parse_card_row(row, vec![]))
        .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "query review queue", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "parse queue row", e))?;
    let mut reference_map =
        query_references_by_card_ids(&conn, &cards.iter().map(|card| card.id).collect::<Vec<_>>())?;
    for card in &mut cards {
        card.references = reference_map.remove(&card.id).unwrap_or_default();
    }
    Ok(cards)
}

/// 提交一次复习：同一事务内完成「算间隔 → 写卡片 → 写历史」，返回更新后的卡片。
#[tauri::command]
pub fn flashcard_submit_review(
    app: AppHandle,
    payload: SubmitFlashcardReviewPayload,
) -> Result<Flashcard, String> {
    let mut conn = schema::open_active_database(&app)?;
    let now = now_millis();
    // IMMEDIATE：进入事务即取写锁，避免桌面端同库并发写导致 BUSY/丢失更新
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| format_db_error("FLASHCARD_REVIEW_FAILED", "begin transaction", e))?;
    // 卡片读取放在事务内：桌面端可能同时打开同一库，事务外的读改写会丢失并发的调度更新
    let card = query_card_by_id(&tx, payload.card_id)?
        .ok_or_else(|| "FLASHCARD_NOT_FOUND: 卡片不存在".to_string())?;
    let schedule = calculate_schedule(
        card.memory_stability,
        card.memory_difficulty,
        card.last_review_time,
        &payload.rating,
        now,
    )
    .ok_or_else(|| format!("FLASHCARD_INVALID_RATING: 未知评分 {}", payload.rating))?;
    tx.execute(
        "UPDATE flashcards SET \
         due_time = ?1, last_review_time = ?2, review_count = review_count + 1, \
         memory_stability = ?3, memory_difficulty = ?4, status = ?5, update_time = ?2 \
         WHERE id = ?6",
        params![
            schedule.due_ms,
            now,
            schedule.stability,
            schedule.difficulty,
            schedule.status,
            payload.card_id
        ],
    )
    .map_err(|e| format_db_error("FLASHCARD_REVIEW_FAILED", "update card schedule", e))?;
    tx.execute(
        "INSERT INTO flashcard_reviews (card_id, deck_id, rating, review_time, interval, stability, difficulty, notes) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            payload.card_id,
            payload.deck_id,
            payload.rating,
            now,
            schedule.interval_ms,
            schedule.stability,
            schedule.difficulty,
            payload.notes
        ],
    )
    .map_err(|e| format_db_error("FLASHCARD_REVIEW_FAILED", "insert review history", e))?;
    tx.commit()
        .map_err(|e| format_db_error("FLASHCARD_REVIEW_FAILED", "commit transaction", e))?;
    query_card_by_id(&conn, payload.card_id)?
        .ok_or_else(|| "FLASHCARD_NOT_FOUND: 复习后读取失败".to_string())
}

/// 按天聚合复习历史（day_starts 由前端按本地时区传入，对齐番茄钟 summary_daily 范式）。
/// 只写不读的 flashcard_reviews 从此有了消费者：主页「今日已复习」与统计页趋势/分布。
/// 统计页一次传一年（365 天），因此走单次范围查询 + 内存归桶，而非逐天查询。
#[tauri::command]
pub fn flashcard_review_stats(
    app: AppHandle,
    payload: FlashcardReviewStatsPayload,
) -> Result<Vec<FlashcardReviewDayStats>, String> {
    const DAY_MS: i64 = 24 * 60 * 60 * 1000;
    let conn = schema::open_active_database(&app)?;
    // 归桶索引：dayStarts 升序去重，review_time 落入 [dayStart, 下一 dayStart) 即归该天
    //（用「下一个 dayStart」而非 dayStart+24h 作上界，DST 偏移日也按前端口径归桶）
    let mut day_starts: Vec<i64> = payload.day_starts.clone();
    day_starts.sort_unstable();
    day_starts.dedup();
    let mut result_map: std::collections::HashMap<i64, FlashcardReviewDayStats> = day_starts
        .iter()
        .map(|&day_start| {
            (
                day_start,
                FlashcardReviewDayStats {
                    day_start,
                    count: 0,
                    easy: 0,
                    normal: 0,
                    struggle: 0,
                    hard: 0,
                },
            )
        })
        .collect();
    if let (Some(&first), Some(&last)) = (day_starts.first(), day_starts.last()) {
        let mut stmt = conn
            .prepare(
                "SELECT rating, review_time FROM flashcard_reviews \
                 WHERE review_time >= ?1 AND review_time < ?2",
            )
            .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "prepare review stats", e))?;
        let rows = stmt
            // 上界多留 1 小时：DST 时区存在 25h 日，恰好 last+24h 会截掉最后 1 小时的记录
            .query_map(params![first, last + DAY_MS + 3_600_000], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "query review stats", e))?;
        for row in rows {
            let (rating, review_time) = row
                .map_err(|e| format_db_error("FLASHCARD_QUERY_FAILED", "parse review stats", e))?;
            // 二分找「最大的 dayStart <= review_time」；早于首日的行丢弃
            let idx = match day_starts.partition_point(|&day| day <= review_time) {
                0 => continue,
                n => n - 1,
            };
            let Some(stats) = result_map.get_mut(&day_starts[idx]) else {
                continue;
            };
            match rating.as_str() {
                "easy" => stats.easy += 1,
                "normal" => stats.normal += 1,
                "struggle" => stats.struggle += 1,
                "hard" => stats.hard += 1,
                _ => continue,
            };
            stats.count += 1;
        }
    }
    // 按调用方传入顺序返回（前端按下标取末位=今天）
    Ok(payload
        .day_starts
        .iter()
        .map(|&day| {
            result_map
                .get(&day)
                .cloned()
                .unwrap_or(FlashcardReviewDayStats {
                    day_start: day,
                    count: 0,
                    easy: 0,
                    normal: 0,
                    struggle: 0,
                    hard: 0,
                })
        })
        .collect())
}
