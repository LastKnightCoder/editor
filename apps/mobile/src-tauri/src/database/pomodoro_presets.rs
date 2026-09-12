use rusqlite::params;
use tauri::AppHandle;

use super::pomodoro_common::{
    format_db_error, now_millis, parse_preset_row, query_preset_by_id, PRESET_COLUMNS,
};
use super::pomodoro_types::{
    ArchivePomodoroPresetPayload, CreatePomodoroPresetPayload, DeletePomodoroPresetPayload,
    PomodoroPreset, ReorderPomodoroPresetsPayload, UpdatePomodoroPresetPayload,
};
use crate::database::schema;
// ── 预设命令 ──

#[tauri::command]
pub fn pomodoro_list_presets(app: AppHandle) -> Result<Vec<PomodoroPreset>, String> {
    let conn = schema::open_active_database(&app)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {PRESET_COLUMNS} FROM pomodoro_presets \
             ORDER BY archived ASC, sort_order ASC, create_time ASC"
        ))
        .map_err(|e| format_db_error("POMODORO_QUERY_FAILED", "prepare list presets", e))?;
    let rows = stmt
        .query_map([], parse_preset_row)
        .map_err(|e| format_db_error("POMODORO_QUERY_FAILED", "query presets", e))?;
    let mut presets = vec![];
    for row in rows {
        presets.push(
            row.map_err(|e| format_db_error("POMODORO_QUERY_FAILED", "parse preset row", e))?,
        );
    }
    Ok(presets)
}

#[tauri::command]
pub fn pomodoro_create_preset(
    app: AppHandle,
    payload: CreatePomodoroPresetPayload,
) -> Result<PomodoroPreset, String> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err("POMODORO_INVALID_NAME: 预设名称不能为空".to_string());
    }
    if payload.mode != "countdown" && payload.mode != "countup" {
        return Err("POMODORO_INVALID_MODE: 模式必须是 countdown 或 countup".to_string());
    }
    let duration_min = payload.duration_min.unwrap_or(25).max(1);
    let conn = schema::open_active_database(&app)?;
    let now = now_millis();
    let max_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), 0) FROM pomodoro_presets",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format_db_error("POMODORO_QUERY_FAILED", "max sort order", e))?;
    conn.execute(
        "INSERT INTO pomodoro_presets (name, mode, duration_min, sort_order, archived, create_time, update_time) \
         VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)",
        params![name, payload.mode, duration_min, max_order + 1, now],
    )
    .map_err(|e| format_db_error("POMODORO_CREATE_FAILED", "insert preset", e))?;
    let id = conn.last_insert_rowid();
    query_preset_by_id(&conn, id)?.ok_or_else(|| "POMODORO_CREATE_FAILED: 建后读取失败".to_string())
}

#[tauri::command]
pub fn pomodoro_update_preset(
    app: AppHandle,
    payload: UpdatePomodoroPresetPayload,
) -> Result<PomodoroPreset, String> {
    let conn = schema::open_active_database(&app)?;
    let existing = query_preset_by_id(&conn, payload.id)?
        .ok_or_else(|| "POMODORO_NOT_FOUND: 预设不存在".to_string())?;
    let name = match payload.name.as_deref() {
        Some(n) => {
            let trimmed = n.trim();
            if trimmed.is_empty() {
                return Err("POMODORO_INVALID_NAME: 预设名称不能为空".to_string());
            }
            trimmed.to_string()
        }
        None => existing.name,
    };
    let mode = match payload.mode.as_deref() {
        Some("countdown") | Some("countup") => payload.mode.clone().unwrap(),
        Some(_) => return Err("POMODORO_INVALID_MODE: 模式必须是 countdown 或 countup".to_string()),
        None => existing.mode,
    };
    let duration_min = payload
        .duration_min
        .map(|v| v.max(1))
        .unwrap_or(existing.duration_min);
    let now = now_millis();
    conn.execute(
        "UPDATE pomodoro_presets SET name = ?1, mode = ?2, duration_min = ?3, update_time = ?4 WHERE id = ?5",
        params![name, mode, duration_min, now, payload.id],
    )
    .map_err(|e| format_db_error("POMODORO_UPDATE_FAILED", "update preset", e))?;
    query_preset_by_id(&conn, payload.id)?
        .ok_or_else(|| "POMODORO_NOT_FOUND: 更新后读取失败".to_string())
}

#[tauri::command]
pub fn pomodoro_archive_preset(
    app: AppHandle,
    payload: ArchivePomodoroPresetPayload,
) -> Result<i64, String> {
    let conn = schema::open_active_database(&app)?;
    conn.execute(
        "UPDATE pomodoro_presets SET archived = ?1, update_time = ?2 WHERE id = ?3",
        params![
            if payload.archived { 1 } else { 0 },
            now_millis(),
            payload.id
        ],
    )
    .map_err(|e| format_db_error("POMODORO_UPDATE_FAILED", "archive preset", e))?;
    Ok(payload.id)
}

#[tauri::command]
pub fn pomodoro_reorder_presets(
    app: AppHandle,
    payload: ReorderPomodoroPresetsPayload,
) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("POMODORO_UPDATE_FAILED", "begin transaction", e))?;
    let now = now_millis();
    for (index, id) in payload.ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE pomodoro_presets SET sort_order = ?1, update_time = ?2 WHERE id = ?3 AND archived = 0",
            params![(index + 1) as i64, now, id],
        )
        .map_err(|e| format_db_error("POMODORO_UPDATE_FAILED", "reorder preset", e))?;
    }
    tx.commit()
        .map_err(|e| format_db_error("POMODORO_UPDATE_FAILED", "commit reorder", e))?;
    Ok(payload.ordered_ids.len() as i64)
}

#[tauri::command]
pub fn pomodoro_delete_preset(
    app: AppHandle,
    payload: DeletePomodoroPresetPayload,
) -> Result<i64, String> {
    let conn = schema::open_active_database(&app)?;
    conn.execute(
        "DELETE FROM pomodoro_presets WHERE id = ?1",
        params![payload.id],
    )
    .map_err(|e| format_db_error("POMODORO_DELETE_FAILED", "delete preset", e))?;
    Ok(payload.id)
}
