use rusqlite::{params, OptionalExtension};
use serde_json::Value;
use tauri::AppHandle;

fn connection(app: &AppHandle, database: &str) -> Result<rusqlite::Connection, String> {
    let setting = crate::setting::load_or_init_setting(app)?;
    if crate::setting::get_active_database_name(&setting) != database {
        return Err("PLUGIN_WORKSPACE_CHANGED: 工作区已切换".into());
    }
    // 固定原库连接，检查后的切库也不会把写入转移到新库。
    super::schema::open_database_by_name(app, database)
}

fn validate(values: &[&str]) -> Result<(), String> {
    for value in values {
        if value.is_empty()
            || value.len() > 256
            || !value
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
        {
            return Err("PLUGIN_STORAGE_INVALID: 身份或键无效".into());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn plugin_kv_read(
    app: AppHandle,
    database: String,
    plugin_id: String,
    key: String,
) -> Result<Option<String>, String> {
    validate(&[&plugin_id, &key])?;
    let conn = connection(&app, &database)?;
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM plugin_kv WHERE plugin_id=?1 AND key=?2",
            params![plugin_id, key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(raw)
}

#[tauri::command]
pub fn plugin_kv_write(
    app: AppHandle,
    database: String,
    plugin_id: String,
    key: String,
    value: Option<Value>,
    remove: bool,
) -> Result<(), String> {
    validate(&[&plugin_id, &key])?;
    let conn = connection(&app, &database)?;
    if remove {
        conn.execute(
            "DELETE FROM plugin_kv WHERE plugin_id=?1 AND key=?2",
            params![plugin_id, key],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let raw =
            serde_json::to_string(&value.unwrap_or(Value::Null)).map_err(|e| e.to_string())?;
        if raw.len() > 1024 * 1024 {
            return Err("PLUGIN_STORAGE_LIMIT: 单值不能超过 1 MiB".into());
        }
        conn.execute("INSERT INTO plugin_kv(plugin_id,key,value,update_time) VALUES(?1,?2,?3,?4) ON CONFLICT(plugin_id,key) DO UPDATE SET value=excluded.value,update_time=excluded.update_time", params![plugin_id, key, raw, super::common::now_millis()]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn plugin_kv_clear(app: AppHandle, database: String, plugin_id: String) -> Result<(), String> {
    validate(&[&plugin_id])?;
    let conn = connection(&app, &database)?;
    conn.execute(
        "DELETE FROM plugin_kv WHERE plugin_id=?1",
        params![plugin_id],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}
