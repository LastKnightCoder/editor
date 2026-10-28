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
    let mut conn = connection(&app, &database)?;
    clear_plugin_storage(&mut conn, &plugin_id)
}

fn clear_plugin_storage(conn: &mut rusqlite::Connection, plugin_id: &str) -> Result<(), String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM plugin_kv WHERE plugin_id=?1",
        params![plugin_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM plugin_ref_grants WHERE plugin_id=?1",
        params![plugin_id],
    )
    .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&conn).unwrap();
        for plugin in ["alpha", "beta"] {
            conn.execute("INSERT INTO plugin_kv(plugin_id,key,value,update_time) VALUES(?1,'settings','{}',1)", [plugin]).unwrap();
            conn.execute("INSERT INTO plugin_ref_grants(plugin_id,kind,ref_id,target_created_at,create_time) VALUES(?1,'card','1',10,1)", [plugin]).unwrap();
        }
        conn
    }

    fn counts(conn: &rusqlite::Connection, plugin: &str) -> (i64, i64) {
        conn.query_row(
            "SELECT (SELECT COUNT(*) FROM plugin_kv WHERE plugin_id=?1),(SELECT COUNT(*) FROM plugin_ref_grants WHERE plugin_id=?1)",
            [plugin], |row| Ok((row.get(0)?, row.get(1)?)),
        ).unwrap()
    }

    #[test]
    fn clearing_storage_revokes_only_current_plugin_and_database_grants() {
        let mut conn = database();
        let other = database();
        clear_plugin_storage(&mut conn, "alpha").unwrap();
        assert_eq!(counts(&conn, "alpha"), (0, 0));
        assert_eq!(counts(&conn, "beta"), (1, 1));
        assert_eq!(counts(&other, "alpha"), (1, 1));
        clear_plugin_storage(&mut conn, "alpha").unwrap();
        assert_eq!(counts(&conn, "alpha"), (0, 0));
    }

    #[test]
    fn grant_cleanup_failure_rolls_back_storage_deletion() {
        let mut conn = database();
        conn.execute_batch("CREATE TRIGGER refuse_grant_cleanup BEFORE DELETE ON plugin_ref_grants BEGIN SELECT RAISE(ABORT,'模拟授权清理失败'); END;").unwrap();
        assert!(clear_plugin_storage(&mut conn, "alpha").is_err());
        assert_eq!(counts(&conn, "alpha"), (1, 1));
        assert_eq!(counts(&conn, "beta"), (1, 1));
    }
}
