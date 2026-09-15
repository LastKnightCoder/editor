use rusqlite::{params, OptionalExtension};
use tauri::AppHandle;

use super::pomodoro_common::{format_db_error, now_millis, parse_session_row, SESSION_COLUMNS};
use super::pomodoro_types::{
    DeletePomodoroSessionPayload, DeletePomodoroSessionsPayload, ListPomodoroSessionsPayload,
    PomodoroSession, UpdatePomodoroSessionPayload,
};
use crate::database::schema;

#[tauri::command]
pub fn pomodoro_list_sessions(
    app: AppHandle,
    payload: ListPomodoroSessionsPayload,
) -> Result<Vec<PomodoroSession>, String> {
    let conn = schema::open_active_database(&app)?;
    let limit = payload.limit.unwrap_or(50).clamp(1, 200);
    let offset = payload.offset.unwrap_or(0).max(0);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {SESSION_COLUMNS} FROM pomodoro_sessions \
             WHERE (?1 IS NULL OR preset_id = ?1) \
               AND (?2 IS NULL OR end_time >= ?2) \
               AND (?3 IS NULL OR end_time <= ?3) \
             ORDER BY end_time DESC, id DESC LIMIT ?4 OFFSET ?5"
        ))
        .map_err(|e| format_db_error("POMODORO_QUERY_FAILED", "prepare list sessions", e))?;
    let rows = stmt
        .query_map(
            params![payload.preset_id, payload.start, payload.end, limit, offset],
            parse_session_row,
        )
        .map_err(|e| format_db_error("POMODORO_QUERY_FAILED", "query sessions", e))?;
    let mut sessions = vec![];
    for row in rows {
        sessions.push(
            row.map_err(|e| format_db_error("POMODORO_QUERY_FAILED", "parse session row", e))?,
        );
    }
    Ok(sessions)
}

// 仅调整 focus_ms：会话起止时间不变，日历事件无需重建（桌面 updateSession 重建事件
// 是因为其会同时改写 end_time，移动端无此语义）
#[tauri::command]
pub fn pomodoro_update_session(
    app: AppHandle,
    payload: UpdatePomodoroSessionPayload,
) -> Result<PomodoroSession, String> {
    let conn = schema::open_active_database(&app)?;
    if payload.focus_ms < 0 {
        return Err("POMODORO_INVALID_FOCUS: 专注时长不能为负".to_string());
    }
    conn.execute(
        "UPDATE pomodoro_sessions SET focus_ms = ?1, update_time = ?2 WHERE id = ?3 AND end_time IS NOT NULL",
        params![payload.focus_ms, now_millis(), payload.session_id],
    )
    .map_err(|e| format_db_error("POMODORO_UPDATE_FAILED", "update session", e))?;
    conn.query_row(
        &format!("SELECT {SESSION_COLUMNS} FROM pomodoro_sessions WHERE id = ?1"),
        params![payload.session_id],
        parse_session_row,
    )
    .optional()
    .map_err(|e| format_db_error("POMODORO_QUERY_FAILED", "get session by id", e))?
    .ok_or_else(|| "POMODORO_NOT_FOUND: 会话不存在或仍在进行中".to_string())
}

#[tauri::command]
pub fn pomodoro_delete_session(
    app: AppHandle,
    payload: DeletePomodoroSessionPayload,
) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("POMODORO_DELETE_FAILED", "begin transaction", e))?;
    // 删会话同步清日历事件与映射（对齐桌面 deleteSession）
    crate::database::calendar::delete_calendar_events_for_session(&tx, payload.session_id)?;
    tx.execute(
        "DELETE FROM pomodoro_sessions WHERE id = ?1",
        params![payload.session_id],
    )
    .map_err(|e| format_db_error("POMODORO_DELETE_FAILED", "delete session", e))?;
    tx.commit()
        .map_err(|e| format_db_error("POMODORO_DELETE_FAILED", "commit delete session", e))?;
    Ok(payload.session_id)
}

#[tauri::command]
pub fn pomodoro_delete_sessions(
    app: AppHandle,
    payload: DeletePomodoroSessionsPayload,
) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    // 事务保证要么全删要么全留；total 只计实际删除的行数
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("POMODORO_DELETE_FAILED", "begin transaction", e))?;
    let mut total = 0i64;
    for id in &payload.session_ids {
        crate::database::calendar::delete_calendar_events_for_session(&tx, *id)?;
        total += tx
            .execute("DELETE FROM pomodoro_sessions WHERE id = ?1", params![id])
            .map_err(|e| format_db_error("POMODORO_DELETE_FAILED", "delete sessions", e))?
            as i64;
    }
    tx.commit()
        .map_err(|e| format_db_error("POMODORO_DELETE_FAILED", "commit delete sessions", e))?;
    Ok(total)
}
