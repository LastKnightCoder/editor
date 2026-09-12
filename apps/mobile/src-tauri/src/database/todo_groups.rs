use super::*;

fn ensure_system_groups(tx: &Transaction<'_>) -> Result<(), String> {
    let now = now_millis();
    let mut stmt = tx
        .prepare("SELECT system_type FROM todo_group WHERE is_system = 1")
        .map_err(|e| format_db_error("TODO_GROUP_INIT_FAILED", "prepare system group query", e))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, Option<String>>(0))
        .map_err(|e| format_db_error("TODO_GROUP_INIT_FAILED", "query system groups", e))?;
    let mut existing = std::collections::HashSet::new();
    for row in rows {
        if let Ok(Some(system_type)) = row {
            existing.insert(system_type);
        }
    }

    for (index, (system_type, title)) in SYSTEM_GROUPS.iter().enumerate() {
        if existing.contains(*system_type) {
            continue;
        }
        tx.execute(
            "
            INSERT INTO todo_group (title, color, sort_index, is_archived, is_system, system_type, create_time, update_time)
            VALUES (?1, NULL, ?2, 0, 1, ?3, ?4, ?4)
            ",
            params![title, (index as i64) * 1024, system_type, now],
        )
        .map_err(|e| format_db_error("TODO_GROUP_INIT_FAILED", "insert system group", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn todo_list_groups(app: AppHandle) -> Result<Vec<TodoGroup>, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "begin transaction", e))?;
    ensure_system_groups(&tx)?;
    let mut groups = vec![];
    {
        let mut stmt = tx
            .prepare(
                "
                SELECT id, title, color, sort_index, is_archived, is_system, system_type, create_time, update_time
                FROM todo_group
                WHERE is_archived = 0 AND is_system = 0
                ORDER BY sort_index ASC, create_time ASC
                ",
            )
            .map_err(|e| format_db_error("TODO_QUERY_FAILED", "prepare list groups", e))?;
        let rows = stmt
            .query_map([], parse_group_row)
            .map_err(|e| format_db_error("TODO_QUERY_FAILED", "query groups", e))?;
        for row in rows {
            groups
                .push(row.map_err(|e| format_db_error("TODO_QUERY_FAILED", "parse group row", e))?);
        }
    }
    tx.commit()
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "commit transaction", e))?;
    Ok(groups)
}

#[tauri::command]
pub fn todo_get_system_groups(app: AppHandle) -> Result<Vec<TodoGroup>, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "begin transaction", e))?;
    ensure_system_groups(&tx)?;
    let mut groups = vec![];
    {
        let mut stmt = tx
            .prepare(
                "
                SELECT id, title, color, sort_index, is_archived, is_system, system_type, create_time, update_time
                FROM todo_group
                WHERE is_system = 1
                ORDER BY sort_index ASC, create_time ASC
                ",
            )
            .map_err(|e| format_db_error("TODO_QUERY_FAILED", "prepare system groups", e))?;
        let rows = stmt
            .query_map([], parse_group_row)
            .map_err(|e| format_db_error("TODO_QUERY_FAILED", "query system groups", e))?;
        for row in rows {
            groups.push(
                row.map_err(|e| format_db_error("TODO_QUERY_FAILED", "parse system group", e))?,
            );
        }
    }
    tx.commit()
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "commit transaction", e))?;
    Ok(groups)
}

#[tauri::command]
pub fn todo_create_group(
    app: AppHandle,
    payload: CreateTodoGroupPayload,
) -> Result<TodoGroup, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_GROUP_CREATE_FAILED", "begin transaction", e))?;
    let now = now_millis();
    let max_sort = tx
        .query_row(
            "SELECT COALESCE(MAX(sort_index), 0) FROM todo_group",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| format_db_error("TODO_GROUP_CREATE_FAILED", "query max sort", e))?;
    tx.execute(
        "
        INSERT INTO todo_group (title, color, sort_index, is_archived, is_system, system_type, create_time, update_time)
        VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6, ?6)
        ",
        params![
            payload.title,
            payload.color,
            max_sort + 1024,
            if payload.is_system.unwrap_or(false) { 1 } else { 0 },
            payload.system_type,
            now
        ],
    )
    .map_err(|e| format_db_error("TODO_GROUP_CREATE_FAILED", "insert group", e))?;
    let id = tx.last_insert_rowid();
    let group = tx
        .query_row(
            "
            SELECT id, title, color, sort_index, is_archived, is_system, system_type, create_time, update_time
            FROM todo_group WHERE id = ?1
            ",
            params![id],
            parse_group_row,
        )
        .map_err(|e| format_db_error("TODO_GROUP_CREATE_FAILED", "query created group", e))?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_GROUP_CREATE_FAILED", "commit transaction", e))?;
    Ok(group)
}

#[tauri::command]
pub fn todo_update_group(
    app: AppHandle,
    payload: UpdateTodoGroupPayload,
) -> Result<TodoGroup, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_GROUP_UPDATE_FAILED", "begin transaction", e))?;
    let current = tx
        .query_row(
            "
            SELECT id, title, color, sort_index, is_archived, is_system, system_type, create_time, update_time
            FROM todo_group WHERE id = ?1
            ",
            params![payload.id],
            parse_group_row,
        )
        .optional()
        .map_err(|e| format_db_error("TODO_GROUP_UPDATE_FAILED", "query current group", e))?
        .ok_or_else(|| "TODO_GROUP_NOT_FOUND: todo group does not exist".to_string())?;

    let now = now_millis();
    if current.is_system {
        tx.execute(
            "UPDATE todo_group SET color = ?1, update_time = ?2 WHERE id = ?3",
            params![payload.color.or(current.color), now, payload.id],
        )
        .map_err(|e| format_db_error("TODO_GROUP_UPDATE_FAILED", "update system group", e))?;
    } else {
        tx.execute(
            "
            UPDATE todo_group
            SET title = ?1, color = ?2, sort_index = ?3, is_archived = ?4, update_time = ?5
            WHERE id = ?6
            ",
            params![
                payload.title.unwrap_or(current.title),
                payload.color.or(current.color),
                payload.sort_index.unwrap_or(current.sort_index),
                if payload.is_archived.unwrap_or(current.is_archived) {
                    1
                } else {
                    0
                },
                now,
                payload.id
            ],
        )
        .map_err(|e| format_db_error("TODO_GROUP_UPDATE_FAILED", "update group", e))?;
    }

    let group = tx
        .query_row(
            "
            SELECT id, title, color, sort_index, is_archived, is_system, system_type, create_time, update_time
            FROM todo_group WHERE id = ?1
            ",
            params![payload.id],
            parse_group_row,
        )
        .map_err(|e| format_db_error("TODO_GROUP_UPDATE_FAILED", "query updated group", e))?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_GROUP_UPDATE_FAILED", "commit transaction", e))?;
    Ok(group)
}

#[tauri::command]
pub fn todo_archive_group(app: AppHandle, payload: ArchiveTodoGroupPayload) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_GROUP_ARCHIVE_FAILED", "begin transaction", e))?;
    let is_system = tx
        .query_row(
            "SELECT is_system FROM todo_group WHERE id = ?1 LIMIT 1",
            params![payload.id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| format_db_error("TODO_GROUP_ARCHIVE_FAILED", "query group", e))?
        .ok_or_else(|| "TODO_GROUP_NOT_FOUND: todo group does not exist".to_string())?;
    if is_system == 1 {
        return Err("TODO_GROUP_INVALID: cannot archive system group".to_string());
    }
    let changed = tx
        .execute(
            "UPDATE todo_group SET is_archived = ?1, update_time = ?2 WHERE id = ?3",
            params![
                if payload.is_archived { 1 } else { 0 },
                now_millis(),
                payload.id
            ],
        )
        .map_err(|e| format_db_error("TODO_GROUP_ARCHIVE_FAILED", "archive group", e))?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_GROUP_ARCHIVE_FAILED", "commit transaction", e))?;
    Ok(changed as i64)
}

#[tauri::command]
pub fn todo_reorder_groups(app: AppHandle, payload: ReorderGroupsPayload) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_GROUP_REORDER_FAILED", "begin transaction", e))?;
    let now = now_millis();
    for (index, id) in payload.ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE todo_group SET sort_index = ?1, update_time = ?2 WHERE id = ?3 AND is_system = 0",
            params![((index as i64) + 1) * 1024, now, *id],
        )
        .map_err(|e| format_db_error("TODO_GROUP_REORDER_FAILED", "update group order", e))?;
    }
    tx.commit()
        .map_err(|e| format_db_error("TODO_GROUP_REORDER_FAILED", "commit transaction", e))?;
    Ok(payload.ordered_ids.len() as i64)
}

#[tauri::command]
pub fn todo_get_group_stats(app: AppHandle) -> Result<Vec<TodoGroupStats>, String> {
    let conn = schema::open_active_database(&app)?;
    let now = now_millis();
    let mut stmt = conn
        .prepare(
            "
            SELECT
              group_id,
              COUNT(1) AS total,
              SUM(CASE WHEN is_completed = 0 THEN 1 ELSE 0 END) AS uncompleted,
              SUM(CASE WHEN is_completed = 0 AND due_at IS NOT NULL AND due_at < ?1 THEN 1 ELSE 0 END) AS overdue
            FROM todo_item
            WHERE is_archived = 0
            GROUP BY group_id
            ",
        )
        .map_err(|e| format_db_error("TODO_STATS_FAILED", "prepare stats query", e))?;
    let rows = stmt
        .query_map(params![now], |row| {
            Ok(TodoGroupStats {
                group_id: row.get(0)?,
                total: row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                uncompleted: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                overdue: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
            })
        })
        .map_err(|e| format_db_error("TODO_STATS_FAILED", "query stats", e))?;
    let mut stats = vec![];
    for row in rows {
        stats.push(row.map_err(|e| format_db_error("TODO_STATS_FAILED", "parse stats row", e))?);
    }
    Ok(stats)
}

#[tauri::command]
pub fn todo_get_system_group_stats(app: AppHandle) -> Result<Vec<TodoGroupStats>, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_STATS_FAILED", "begin transaction", e))?;
    ensure_system_groups(&tx)?;
    let mut type_to_group = std::collections::HashMap::new();
    {
        let mut group_stmt = tx
            .prepare("SELECT id, system_type FROM todo_group WHERE is_system = 1")
            .map_err(|e| format_db_error("TODO_STATS_FAILED", "prepare system group query", e))?;
        let group_rows = group_stmt
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?))
            })
            .map_err(|e| format_db_error("TODO_STATS_FAILED", "query system groups", e))?;
        for row in group_rows {
            let (id, system_type) =
                row.map_err(|e| format_db_error("TODO_STATS_FAILED", "parse system group row", e))?;
            if let Some(t) = system_type {
                type_to_group.insert(t, id);
            }
        }
    }
    let now = now_millis();
    let all_row = tx
        .query_row(
            "
            SELECT
              COUNT(1) AS total,
              SUM(CASE WHEN is_completed = 0 THEN 1 ELSE 0 END) AS uncompleted,
              SUM(CASE WHEN is_completed = 0 AND due_at IS NOT NULL AND due_at < ?1 THEN 1 ELSE 0 END) AS overdue
            FROM todo_item
            WHERE is_archived = 0
            ",
            params![now],
            |row| {
                Ok((
                    row.get::<_, Option<i64>>(0)?.unwrap_or(0),
                    row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                    row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                ))
            },
        )
        .map_err(|e| format_db_error("TODO_STATS_FAILED", "query all stats", e))?;

    let mut stats = Vec::new();
    if let Some(group_id) = type_to_group.get("all") {
        stats.push(TodoGroupStats {
            group_id: *group_id,
            total: all_row.0,
            uncompleted: all_row.1,
            overdue: all_row.2,
        });
    }

    {
        let mut stmt = tx
            .prepare(
                "
                SELECT
                  type,
                  COUNT(1) AS total,
                  SUM(CASE WHEN is_completed = 0 THEN 1 ELSE 0 END) AS uncompleted,
                  SUM(CASE WHEN is_completed = 0 AND due_at IS NOT NULL AND due_at < ?1 THEN 1 ELSE 0 END) AS overdue
                FROM todo_item
                WHERE is_archived = 0
                GROUP BY type
                ",
            )
            .map_err(|e| format_db_error("TODO_STATS_FAILED", "prepare type stats query", e))?;
        let rows = stmt
            .query_map(params![now], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                    row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                    row.get::<_, Option<i64>>(3)?.unwrap_or(0),
                ))
            })
            .map_err(|e| format_db_error("TODO_STATS_FAILED", "query type stats", e))?;
        for row in rows {
            let (item_type, total, uncompleted, overdue) =
                row.map_err(|e| format_db_error("TODO_STATS_FAILED", "parse type stats row", e))?;
            if let Some(group_id) = type_to_group.get(&item_type) {
                stats.push(TodoGroupStats {
                    group_id: *group_id,
                    total,
                    uncompleted,
                    overdue,
                });
            }
        }
    }
    tx.commit()
        .map_err(|e| format_db_error("TODO_STATS_FAILED", "commit transaction", e))?;
    Ok(stats)
}
