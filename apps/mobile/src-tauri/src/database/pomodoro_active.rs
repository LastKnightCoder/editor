use rusqlite::params;
use tauri::AppHandle;

use super::pomodoro_common::{
    format_db_error, now_millis, query_preset_by_id, with_active, MIN_FOCUS_MS,
};
use super::pomodoro_types::{
    ActivePomodoro, PomodoroPauseSpan, PomodoroSession, StartPomodoroSessionPayload,
    StopPomodoroSessionPayload,
};
use crate::database::schema;

// ── 会话命令 ──

#[tauri::command]
pub fn pomodoro_get_active_session(app: AppHandle) -> Result<Option<PomodoroSession>, String> {
    with_active(&app, |slot, _| Ok(slot.as_ref().map(|a| a.session.clone())))
}

#[tauri::command]
pub fn pomodoro_start_session(
    app: AppHandle,
    payload: StartPomodoroSessionPayload,
) -> Result<PomodoroSession, String> {
    let conn = schema::open_active_database(&app)?;
    let preset = query_preset_by_id(&conn, payload.preset_id)?
        .ok_or_else(|| "POMODORO_PRESET_NOT_FOUND: 预设不存在".to_string())?;
    if preset.archived {
        return Err("POMODORO_PRESET_ARCHIVED: 预设已归档".to_string());
    }
    let now = now_millis();
    let session = PomodoroSession {
        id: now,
        preset_id: preset.id,
        start_time: now,
        end_time: None,
        expected_ms: payload.expected_ms.filter(|v| *v > 0),
        focus_ms: 0,
        pause_total_ms: 0,
        pause_count: 0,
        pauses: vec![],
        status: "running".to_string(),
        create_time: now,
        update_time: now,
    };
    // "无活动会话"检查与放入在同一临界区：并发 start 只有一个能成功
    with_active(&app, |slot, db_name| {
        if slot.is_some() {
            return Err("POMODORO_ACTIVE_EXISTS: 已有进行中的专注".to_string());
        }
        *slot = Some(ActivePomodoro {
            db_name: db_name.to_string(),
            session: session.clone(),
        });
        Ok(session)
    })
}

#[tauri::command]
pub fn pomodoro_pause_session(app: AppHandle) -> Result<Option<PomodoroSession>, String> {
    with_active(&app, |slot, _| {
        let Some(active) = slot.as_mut() else {
            return Err("POMODORO_NO_ACTIVE: 没有进行中的专注".to_string());
        };
        if active.session.status != "running" {
            return Err("POMODORO_NOT_RUNNING: 专注不在运行状态".to_string());
        }
        let now = now_millis();
        active.session.pauses.push(PomodoroPauseSpan {
            start: now,
            end: None,
        });
        active.session.pause_count += 1;
        active.session.status = "paused".to_string();
        active.session.update_time = now;
        Ok(Some(active.session.clone()))
    })
}

#[tauri::command]
pub fn pomodoro_resume_session(app: AppHandle) -> Result<Option<PomodoroSession>, String> {
    with_active(&app, |slot, _| {
        let Some(active) = slot.as_mut() else {
            return Err("POMODORO_NO_ACTIVE: 没有进行中的专注".to_string());
        };
        if active.session.status != "paused" {
            return Err("POMODORO_NOT_PAUSED: 专注不在暂停状态".to_string());
        }
        let now = now_millis();
        if let Some(last) = active.session.pauses.last_mut() {
            if last.end.is_none() {
                last.end = Some(now);
            }
        }
        active.session.pause_total_ms = active
            .session
            .pauses
            .iter()
            .map(|p| p.end.unwrap_or(now) - p.start)
            .sum::<i64>()
            .max(0);
        active.session.status = "running".to_string();
        active.session.update_time = now;
        Ok(Some(active.session.clone()))
    })
}

#[tauri::command]
pub fn pomodoro_stop_session(
    app: AppHandle,
    payload: StopPomodoroSessionPayload,
) -> Result<Option<PomodoroSession>, String> {
    // 锁内取出会话，锁外落库；落库失败且槽位未被新会话占用时放回，避免误丢
    let taken = with_active(&app, |slot, _| Ok(slot.take().map(|active| active.session)))?;
    let Some(mut session) = taken else {
        return Err("POMODORO_NO_ACTIVE: 没有进行中的专注".to_string());
    };
    let now = now_millis();
    if session.status == "paused" {
        if let Some(last) = session.pauses.last_mut() {
            if last.end.is_none() {
                last.end = Some(now);
            }
        }
    }
    let pause_total_ms = session
        .pauses
        .iter()
        .map(|p| p.end.unwrap_or(now) - p.start)
        .sum::<i64>()
        .max(0);
    let focus_ms = (now - session.start_time - pause_total_ms).max(0);
    // 对齐桌面端：不足 5 分钟不落库，直接丢弃
    if focus_ms < MIN_FOCUS_MS {
        return Ok(None);
    }
    session.end_time = Some(now);
    session.focus_ms = focus_ms;
    session.pause_total_ms = pause_total_ms;
    session.status = if payload.as_complete {
        "completed"
    } else {
        "stopped"
    }
    .to_string();
    session.update_time = now;

    if let Err(error) = insert_finished_session(&app, &mut session) {
        let _ = with_active(&app, |slot, db_name| {
            if slot.is_none() {
                *slot = Some(ActivePomodoro {
                    db_name: db_name.to_string(),
                    session: session.clone(),
                });
            }
            Ok(())
        });
        return Err(error);
    }
    Ok(Some(session))
}

fn insert_finished_session(app: &AppHandle, session: &mut PomodoroSession) -> Result<(), String> {
    let mut conn = schema::open_active_database(app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("POMODORO_STOP_FAILED", "begin transaction", e))?;
    tx.execute(
        "INSERT INTO pomodoro_sessions \
         (preset_id, start_time, end_time, expected_ms, focus_ms, pause_total_ms, pause_count, pauses, status, create_time, update_time) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            session.preset_id,
            session.start_time,
            session.end_time,
            session.expected_ms,
            session.focus_ms,
            session.pause_total_ms,
            session.pause_count,
            serde_json::to_string(&session.pauses)
                .map_err(|e| format_db_error("POMODORO_STOP_FAILED", "serialize pauses", e))?,
            session.status,
            session.create_time,
            session.update_time,
        ],
    )
    .map_err(|e| format_db_error("POMODORO_STOP_FAILED", "insert session", e))?;
    session.id = tx.last_insert_rowid();
    tx.commit()
        .map_err(|e| format_db_error("POMODORO_STOP_FAILED", "commit session", e))?;
    Ok(())
}
