use std::collections::{HashMap, HashSet};
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

struct IndexableRow {
    prefixed_id: String,
    update_time: i64,
    title: String,
    content: String,
    type_name: &'static str,
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

fn parse_tags_text(raw: Option<String>) -> String {
    raw.and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default()
        .join(" ")
}

fn max_update_time(entity_time: i64, content_time: Option<i64>) -> i64 {
    entity_time.max(content_time.unwrap_or(0))
}

fn make_indexable_row(
    prefixed_id: String,
    update_time: i64,
    type_name: &'static str,
    title: impl Into<String>,
    content_raw: Option<String>,
    extra: impl Into<String>,
) -> IndexableRow {
    let title = title.into();
    let body = content_raw
        .as_deref()
        .map(extract_plain_text)
        .unwrap_or_default();
    let extra = extra.into();
    let searchable = [body, extra]
        .into_iter()
        .filter(|part| !part.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    IndexableRow {
        prefixed_id,
        update_time,
        title: segment_text(&title),
        content: segment_text(&searchable),
        type_name,
    }
}

fn load_indexable_rows(main_conn: &Connection) -> Result<Vec<IndexableRow>, String> {
    let mut rows = Vec::new();

    let mut stmt = main_conn
        .prepare(
            "SELECT c.id, c.update_time, c.tags, ct.update_time, ct.content
             FROM cards c LEFT JOIN contents ct ON c.content_id = ct.id",
        )
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to prepare cards index query: {e}"))?;
    let card_rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to query cards for index: {e}"))?;
    for row in card_rows {
        let (id, update_time, tags, content_time, content) =
            row.map_err(|e| format!("DB_OPEN_FAILED: Failed to read card index row: {e}"))?;
        rows.push(make_indexable_row(
            format!("card:{id}"),
            max_update_time(update_time, content_time),
            "card",
            "",
            content,
            parse_tags_text(tags),
        ));
    }

    let mut stmt = main_conn
        .prepare(
            "SELECT a.id, a.title, a.author, a.tags, a.update_time, c.update_time, c.content
             FROM articles a LEFT JOIN contents c ON a.content_id = c.id
             WHERE a.is_delete = 0",
        )
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to prepare articles index query: {e}"))?;
    let article_rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, Option<String>>(6)?,
            ))
        })
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to query articles for index: {e}"))?;
    for row in article_rows {
        let (id, title, author, tags, update_time, content_time, content) =
            row.map_err(|e| format!("DB_OPEN_FAILED: Failed to read article index row: {e}"))?;
        let extra = [author.unwrap_or_default(), parse_tags_text(tags)]
            .into_iter()
            .filter(|part| !part.trim().is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        rows.push(make_indexable_row(
            format!("article:{id}"),
            max_update_time(update_time, content_time),
            "article",
            title,
            content,
            extra,
        ));
    }

    let mut stmt = main_conn
        .prepare(
            "SELECT pi.id, pi.title, pi.update_time, c.update_time, c.content, pi.tags
             FROM project_item pi LEFT JOIN contents c ON pi.content_id = c.id
             WHERE COALESCE(pi.ref_type, '') = ''",
        )
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to prepare project index query: {e}"))?;
    let project_rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to query project items for index: {e}"))?;
    for row in project_rows {
        let (id, title, update_time, content_time, content, tags) =
            row.map_err(|e| format!("DB_OPEN_FAILED: Failed to read project index row: {e}"))?;
        rows.push(make_indexable_row(
            format!("project-item:{id}"),
            max_update_time(update_time, content_time),
            "project-item",
            title,
            content,
            parse_tags_text(tags),
        ));
    }

    let mut segment_map: HashMap<i64, (i64, Vec<String>)> = HashMap::new();
    let mut stmt = main_conn
        .prepare(
            "SELECT s.diary_id, s.update_time, c.content
             FROM diary_segments s JOIN contents c ON s.content_id = c.id",
        )
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to prepare diary segment index query: {e}"))?;
    let segment_rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to query diary segments for index: {e}"))?;
    for row in segment_rows {
        let (diary_id, update_time, content) = row
            .map_err(|e| format!("DB_OPEN_FAILED: Failed to read diary segment index row: {e}"))?;
        let entry = segment_map
            .entry(diary_id)
            .or_insert_with(|| (0, Vec::new()));
        entry.0 = entry.0.max(update_time);
        if let Some(content) = content {
            entry.1.push(content);
        }
    }

    let mut stmt = main_conn
        .prepare(
            "SELECT d.id, d.type, d.date, d.tags, d.update_time, c.update_time, c.content
             FROM diary_entries d LEFT JOIN contents c ON d.content_id = c.id",
        )
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to prepare diary index query: {e}"))?;
    let diary_rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, Option<String>>(6)?,
            ))
        })
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to query diary entries for index: {e}"))?;
    for row in diary_rows {
        let (id, diary_type, date, tags, update_time, content_time, content) =
            row.map_err(|e| format!("DB_OPEN_FAILED: Failed to read diary index row: {e}"))?;
        let mut bodies = vec![];
        if let Some(content) = content {
            bodies.push(content);
        }
        let mut latest_segment_time = 0;
        if let Some((segment_time, segments)) = segment_map.get(&id) {
            latest_segment_time = *segment_time;
            bodies.extend(segments.iter().cloned());
        }
        let content = if bodies.is_empty() {
            None
        } else {
            Some(bodies.join("\n"))
        };
        rows.push(make_indexable_row(
            format!("diary-daily:{id}"),
            update_time
                .max(content_time.unwrap_or(0))
                .max(latest_segment_time),
            "diary-daily",
            date,
            content,
            format!("{} {}", diary_type, parse_tags_text(tags)),
        ));
    }

    // 闪卡：题干（Slate JSON）为主文本，详情提纯与 tags 进 extra；
    // 卡组名仅作展示（hydrate 时现查 flashcard_decks），不进索引文本
    let mut stmt = main_conn
        .prepare("SELECT id, update_time, prompt, detail, tags FROM flashcards")
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to prepare flashcards index query: {e}"))?;
    let flashcard_rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to query flashcards index rows: {e}"))?;
    for row in flashcard_rows {
        let (id, update_time, prompt, detail, tags) =
            row.map_err(|e| format!("DB_OPEN_FAILED: Failed to read flashcard index row: {e}"))?;
        let extra = [
            detail
                .as_deref()
                .map(extract_plain_text)
                .unwrap_or_default(),
            parse_tags_text(tags),
        ]
        .into_iter()
        .filter(|part| !part.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n");
        rows.push(make_indexable_row(
            format!("flashcard:{id}"),
            update_time,
            "flashcard",
            "",
            prompt,
            extra,
        ));
    }

    Ok(rows)
}

fn reconcile_content_indexes(
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
            VALUES (?1, ?2, ?3, ?4, ?5, 0)
            ",
        )
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to prepare index insert: {e}"))?;

    let indexable_rows = load_indexable_rows(main_conn)?;
    let mut expected_ids = HashSet::new();
    for indexable in indexable_rows {
        stats.scanned += 1;
        let IndexableRow {
            prefixed_id,
            update_time,
            title,
            content,
            type_name,
        } = indexable;
        expected_ids.insert(prefixed_id.clone());

        if content.trim().is_empty() && title.trim().is_empty() {
            if delete_stmt
                .execute(params![prefixed_id.clone()])
                .map(|affected| affected > 0)
                .unwrap_or(false)
            {
                stats.removed_empty += 1;
            }
            continue;
        }

        let indexed_update_time = select_index_stmt
            .query_row(params![prefixed_id.clone()], |r| r.get::<_, Option<f64>>(0))
            .ok()
            .flatten()
            .unwrap_or(0.0) as i64;

        if indexed_update_time >= update_time {
            stats.skipped_up_to_date += 1;
            continue;
        }

        let _ = delete_stmt.execute(params![prefixed_id.clone()]);
        insert_stmt
            .execute(params![
                prefixed_id,
                update_time as f64,
                content,
                type_name,
                title
            ])
            .map_err(|e| format!("DB_OPEN_FAILED: Failed to insert content index: {e}"))?;
        stats.indexed += 1;
    }

    let mut stale_stmt = index_conn
        .prepare("SELECT prefixed_id FROM content_fts GROUP BY prefixed_id")
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to prepare stale query: {e}"))?;
    let stale_rows = stale_stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("DB_OPEN_FAILED: Failed to query stale indexes: {e}"))?;

    for prefixed_id in stale_rows.filter_map(Result::ok) {
        if !expected_ids.contains(&prefixed_id) {
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
    let reconcile_result = reconcile_content_indexes(&main_conn, &index_conn);
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
            // FTS 就绪后通知前端对账 entity_refs（解析器在 JS 侧，与桌面同一份代码）
            use tauri::Emitter;
            let _ = app.emit("entity-refs:rebuild", ());
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
