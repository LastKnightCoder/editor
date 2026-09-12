use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use jieba_rs::Jieba;
use rusqlite::{params, Connection};
use serde_json::Value;
use tauri::AppHandle;

use super::index_db;
use super::schema;

static JIEBA: OnceLock<Jieba> = OnceLock::new();
#[derive(Default)]
struct ReconcileState {
    running: HashSet<String>,
    dirty: HashSet<String>,
}

static RECONCILE_STATE: OnceLock<Mutex<ReconcileState>> = OnceLock::new();

struct ReconcileStats {
    scanned: usize,
    indexed: usize,
    removed_empty: usize,
    removed_stale: usize,
    skipped_up_to_date: usize,
}

impl ReconcileStats {
    fn removed_total(&self) -> usize {
        self.removed_empty + self.removed_stale
    }
}

fn reconcile_state() -> &'static Mutex<ReconcileState> {
    RECONCILE_STATE.get_or_init(|| Mutex::new(ReconcileState::default()))
}

fn try_mark_running(db_name: &str) -> bool {
    let mut state = reconcile_state().lock().unwrap();
    if state.running.contains(db_name) {
        state.dirty.insert(db_name.to_string());
        return false;
    }
    state.running.insert(db_name.to_string());
    state.dirty.remove(db_name);
    true
}

fn mark_finished(db_name: &str) -> bool {
    let mut state = reconcile_state().lock().unwrap();
    let rerun = state.dirty.remove(db_name);
    state.running.remove(db_name);
    rerun
}

fn find_all_text(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            if let Some(text) = map.get("text").and_then(|v| v.as_str()) {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    out.push(trimmed.to_string());
                }
            }
            for child in map.values() {
                find_all_text(child, out);
            }
        }
        Value::Array(list) => {
            for child in list {
                find_all_text(child, out);
            }
        }
        _ => {}
    }
}

fn extract_plain_text(content_raw: &str) -> String {
    let parsed = serde_json::from_str::<Value>(content_raw);
    let Ok(value) = parsed else {
        return content_raw.trim().to_string();
    };
    let mut fragments = vec![];
    find_all_text(&value, &mut fragments);
    fragments.join("\n").trim().to_string()
}

fn segment_text(text: &str) -> String {
    let jieba = JIEBA.get_or_init(Jieba::new);
    jieba
        .cut_for_search(text, true)
        .iter()
        .map(|token| token.trim())
        .filter(|token| !token.is_empty())
        .map(|token| token.to_string())
        .collect::<Vec<String>>()
        .join(" ")
}

fn reconcile_card_indexes(
    main_conn: &Connection,
    index_conn: &Connection,
) -> Result<ReconcileStats, String> {
    let mut stats = ReconcileStats {
        scanned: 0,
        indexed: 0,
        removed_empty: 0,
        removed_stale: 0,
        skipped_up_to_date: 0,
    };

    let mut cards_stmt = main_conn
        .prepare(
            "
            SELECT c.id, c.update_time, ct.content
            FROM cards c
            LEFT JOIN contents ct ON c.content_id = ct.id
            ",
        )
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to prepare card query: {e}"))?;

    let mut rows = cards_stmt
        .query([])
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to query cards: {e}"))?;

    let mut select_index_stmt = index_conn
        .prepare("SELECT MAX(update_time) FROM content_fts WHERE prefixed_id = ?1")
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to prepare index query: {e}"))?;
    let mut delete_stmt = index_conn
        .prepare("DELETE FROM content_fts WHERE prefixed_id = ?1")
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to prepare index delete: {e}"))?;
    let mut insert_stmt = index_conn
        .prepare(
            "
            INSERT INTO content_fts (prefixed_id, update_time, content, type, title, chunk_index)
            VALUES (?1, ?2, ?3, 'card', NULL, 0)
            ",
        )
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to prepare index insert: {e}"))?;

    while let Some(row) = rows
        .next()
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to read card row: {e}"))?
    {
        stats.scanned += 1;
        let card_id: i64 = row
            .get(0)
            .map_err(|e| format!("DB_OPEN_FAILED: Failed to parse card id: {e}"))?;
        let update_time: i64 = row
            .get(1)
            .map_err(|e| format!("DB_OPEN_FAILED: Failed to parse card update_time: {e}"))?;
        let content_raw: Option<String> = row
            .get(2)
            .map_err(|e| format!("DB_OPEN_FAILED: Failed to parse card content: {e}"))?;

        let prefixed_id = format!("card:{card_id}");
        let plain_text = content_raw
            .as_deref()
            .map(extract_plain_text)
            .unwrap_or_default();
        let segmented = segment_text(&plain_text);

        if segmented.trim().is_empty() {
            if delete_stmt
                .execute(params![prefixed_id])
                .map(|affected| affected > 0)
                .unwrap_or(false)
            {
                stats.removed_empty += 1;
            }
            continue;
        }

        let indexed_update_time = select_index_stmt
            .query_row(params![prefixed_id], |r| r.get::<_, Option<f64>>(0))
            .ok()
            .flatten()
            .unwrap_or(0.0) as i64;

        if indexed_update_time >= update_time {
            stats.skipped_up_to_date += 1;
            continue;
        }

        let _ = delete_stmt.execute(params![prefixed_id.clone()]);
        insert_stmt
            .execute(params![prefixed_id, update_time as f64, segmented])
            .map_err(|e| format!("DB_OPEN_FAILED: Failed to insert card index: {e}"))?;
        stats.indexed += 1;
    }

    let mut stale_stmt = index_conn
        .prepare("SELECT prefixed_id FROM content_fts WHERE type = 'card' GROUP BY prefixed_id")
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to prepare stale query: {e}"))?;
    let stale_rows = stale_stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to query stale indexes: {e}"))?;

    let mut exists_stmt = main_conn
        .prepare("SELECT 1 FROM cards WHERE id = ?1 LIMIT 1")
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to prepare card exists query: {e}"))?;

    for prefixed_id in stale_rows.filter_map(Result::ok) {
        let card_id = prefixed_id
            .split(':')
            .nth(1)
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);
        if card_id <= 0 {
            if delete_stmt
                .execute(params![prefixed_id])
                .map(|affected| affected > 0)
                .unwrap_or(false)
            {
                stats.removed_stale += 1;
            }
            continue;
        }
        let exists = exists_stmt
            .query_row(params![card_id], |_r| Ok(()))
            .map(|_| true)
            .unwrap_or(false);
        if !exists {
            if delete_stmt
                .execute(params![prefixed_id])
                .map(|affected| affected > 0)
                .unwrap_or(false)
            {
                stats.removed_stale += 1;
            }
        }
    }

    Ok(stats)
}

fn run_reconcile(app: &AppHandle, db_name: &str) -> Result<(), String> {
    let started_at = Instant::now();
    eprintln!(
        "[mobile-reconcile] run start: db={}, stage=open-main",
        db_name
    );
    let main_conn = schema::open_database_by_name(app, db_name)?;
    eprintln!(
        "[mobile-reconcile] run progress: db={}, stage=ensure-index",
        db_name
    );
    index_db::ensure_index_database(app, db_name, &main_conn)?;
    let index_conn = index_db::open_index_database(app, db_name)?;

    index_db::set_rebuild_state(&index_conn, "building")?;
    eprintln!(
        "[mobile-reconcile] run progress: db={}, stage=building",
        db_name
    );
    let reconcile_result = reconcile_card_indexes(&main_conn, &index_conn);
    match reconcile_result {
        Ok(stats) => {
            index_db::set_rebuild_state(&index_conn, "ready")?;
            eprintln!(
                "[mobile-reconcile] run done: db={}, rebuild_state=ready, scanned={}, indexed={}, removed={}, removed_empty={}, removed_stale={}, skipped_up_to_date={}, elapsed_ms={}",
                db_name,
                stats.scanned,
                stats.indexed,
                stats.removed_total(),
                stats.removed_empty,
                stats.removed_stale,
                stats.skipped_up_to_date,
                started_at.elapsed().as_millis()
            );
            Ok(())
        }
        Err(err) => {
            let _ = index_db::set_rebuild_state(&index_conn, "failed");
            eprintln!(
                "[mobile-reconcile] run failed: db={}, rebuild_state=failed, error={}, elapsed_ms={}",
                db_name,
                err,
                started_at.elapsed().as_millis()
            );
            Err(err)
        }
    }
}

pub fn trigger_reconcile(app: &AppHandle, db_name: &str) {
    let db_name_owned = db_name.to_string();
    if !try_mark_running(&db_name_owned) {
        eprintln!(
            "[mobile-reconcile] trigger skipped: db={}, reason=already-running",
            db_name
        );
        return;
    }
    eprintln!("[mobile-reconcile] trigger accepted: db={}", db_name);

    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = run_reconcile(&app_clone, &db_name_owned);
        if let Err(err) = result {
            eprintln!("[mobile-reconcile] rebuild failed: {err}");
        } else {
            eprintln!("[mobile-reconcile] rebuild completed: db={}", db_name_owned);
        }
        let rerun = mark_finished(&db_name_owned);
        eprintln!(
            "[mobile-reconcile] trigger finished: db={}, running=false, rerun={}",
            db_name_owned, rerun
        );
        if rerun {
            trigger_reconcile(&app_clone, &db_name_owned);
        }
    });
}
