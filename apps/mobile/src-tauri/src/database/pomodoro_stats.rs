use rusqlite::{params, OptionalExtension};
use tauri::AppHandle;

use super::pomodoro_common::format_db_error;
use super::pomodoro_types::{
    PomodoroDailySummary, PomodoroDailySummaryPayload, PomodoroRangePayload, PomodoroSummary,
};
use crate::database::schema;

// ── 统计（口径对齐桌面端：end_time IS NOT NULL 的已结束会话） ──

#[tauri::command]
pub fn pomodoro_summary_today(
    app: AppHandle,
    payload: PomodoroRangePayload,
) -> Result<PomodoroSummary, String> {
    let conn = schema::open_active_database(&app)?;
    let row = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(focus_ms), 0) FROM pomodoro_sessions \
             WHERE end_time IS NOT NULL AND end_time >= ?1 AND end_time <= ?2",
            params![payload.start, payload.end],
            |row| {
                Ok(PomodoroSummary {
                    count: row.get(0)?,
                    focus_ms: row.get(1)?,
                })
            },
        )
        .optional()
        .map_err(|e| format_db_error("POMODORO_QUERY_FAILED", "summary today", e))?;
    Ok(row.unwrap_or(PomodoroSummary {
        count: 0,
        focus_ms: 0,
    }))
}

#[tauri::command]
pub fn pomodoro_summary_total(app: AppHandle) -> Result<PomodoroSummary, String> {
    let conn = schema::open_active_database(&app)?;
    let row = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(focus_ms), 0) FROM pomodoro_sessions WHERE end_time IS NOT NULL",
            [],
            |row| Ok(PomodoroSummary { count: row.get(0)?, focus_ms: row.get(1)? }),
        )
        .optional()
        .map_err(|e| format_db_error("POMODORO_QUERY_FAILED", "summary total", e))?;
    Ok(row.unwrap_or(PomodoroSummary {
        count: 0,
        focus_ms: 0,
    }))
}

#[tauri::command]
pub fn pomodoro_summary_daily(
    app: AppHandle,
    payload: PomodoroDailySummaryPayload,
) -> Result<Vec<PomodoroDailySummary>, String> {
    let conn = schema::open_active_database(&app)?;
    let mut result = vec![];
    for &day_start in &payload.day_starts {
        let day_end = day_start + 24 * 60 * 60 * 1000 - 1;
        let (count, focus_ms) = conn
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(focus_ms), 0) FROM pomodoro_sessions \
                 WHERE end_time IS NOT NULL AND end_time >= ?1 AND end_time <= ?2",
                params![day_start, day_end],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
            )
            .unwrap_or((0, 0));
        result.push(PomodoroDailySummary {
            day_start,
            count,
            focus_ms,
        });
    }
    Ok(result)
}
