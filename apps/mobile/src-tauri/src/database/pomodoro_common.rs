use rusqlite::{params, Connection, OptionalExtension};
use std::sync::Mutex;
use tauri::AppHandle;

use super::pomodoro_types::{ActivePomodoro, PomodoroPauseSpan, PomodoroPreset, PomodoroSession};

pub(crate) const MIN_FOCUS_MS: i64 = 5 * 60 * 1000;
pub(crate) static ACTIVE_POMODORO: Mutex<Option<ActivePomodoro>> = Mutex::new(None);

pub(crate) fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub(crate) fn format_db_error(code: &str, context: &str, error: impl std::fmt::Display) -> String {
    format!("{code}: {context}: {error}")
}

// ── 行解析 ──

pub(crate) fn parse_preset_row(row: &rusqlite::Row) -> Result<PomodoroPreset, rusqlite::Error> {
    Ok(PomodoroPreset {
        id: row.get(0)?,
        name: row.get(1)?,
        mode: row.get(2)?,
        duration_min: row.get(3)?,
        sort_order: row.get(4)?,
        archived: row.get::<_, i64>(5)? != 0,
        create_time: row.get(6)?,
        update_time: row.get(7)?,
    })
}

pub(crate) const PRESET_COLUMNS: &str =
    "id, name, mode, duration_min, sort_order, archived, create_time, update_time";

pub(crate) fn parse_session_row(row: &rusqlite::Row) -> Result<PomodoroSession, rusqlite::Error> {
    let pauses_raw: Option<String> = row.get(8)?;
    let pauses = pauses_raw
        .and_then(|text| serde_json::from_str::<Vec<PomodoroPauseSpan>>(&text).ok())
        .unwrap_or_default();
    Ok(PomodoroSession {
        id: row.get(0)?,
        preset_id: row.get(1)?,
        start_time: row.get(2)?,
        end_time: row.get(3)?,
        expected_ms: row.get(4)?,
        focus_ms: row.get(5)?,
        pause_total_ms: row.get(6)?,
        pause_count: row.get(7)?,
        pauses,
        status: row.get(9)?,
        create_time: row.get(10)?,
        update_time: row.get(11)?,
    })
}

pub(crate) const SESSION_COLUMNS: &str =
    "id, preset_id, start_time, end_time, expected_ms, focus_ms, \
     pause_total_ms, pause_count, pauses, status, create_time, update_time";

pub(crate) fn query_preset_by_id(
    conn: &Connection,
    id: i64,
) -> Result<Option<PomodoroPreset>, String> {
    conn.query_row(
        &format!("SELECT {PRESET_COLUMNS} FROM pomodoro_presets WHERE id = ?1"),
        params![id],
        parse_preset_row,
    )
    .optional()
    .map_err(|e| format_db_error("POMODORO_QUERY_FAILED", "get preset by id", e))
}

pub(crate) fn current_db_name(app: &AppHandle) -> String {
    crate::setting::load_or_init_setting(app)
        .map(|setting| crate::setting::get_active_database_name(&setting))
        .unwrap_or_default()
}

/// 锁内操作活动会话槽位：检查与修改在同一临界区完成，消除 check-then-act 竞态。
/// 库已切换的失效会话就地丢弃（对齐桌面端切库清空会话）。
pub(crate) fn with_active<R>(
    app: &AppHandle,
    f: impl FnOnce(&mut Option<ActivePomodoro>, &str) -> Result<R, String>,
) -> Result<R, String> {
    let db_name = current_db_name(app);
    let mut guard = ACTIVE_POMODORO
        .lock()
        .map_err(|_| "POMODORO_LOCK_FAILED: 活动会话锁 poisoned".to_string())?;
    if guard
        .as_ref()
        .map_or(false, |active| active.db_name != db_name)
    {
        *guard = None;
    }
    f(&mut guard, &db_name)
}
