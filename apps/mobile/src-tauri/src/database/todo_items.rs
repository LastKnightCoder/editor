use super::*;

fn get_item_by_id(tx: &Transaction<'_>, id: i64) -> Result<Option<TodoItem>, String> {
    tx.query_row(
        "
        SELECT
          ti.id, ti.group_id, ti.parent_id, ti.title, ti.type, ti.description_content_id,
          c.content AS description_content,
          ti.is_completed, ti.start_at, ti.due_at, ti.remind_before, ti.completed_at,
          ti.sort_index, ti.is_archived, ti.create_time, ti.update_time,
          tr.id, tr.todo_item_id, tr.type, tr.interval, tr.weekdays, tr.month_day, tr.year_month, tr.year_day,
          tr.exclude_holidays, tr.start_date, tr.end_date, tr.max_occurrences, tr.create_time, tr.update_time
        FROM todo_item ti
        LEFT JOIN contents c ON c.id = ti.description_content_id
        LEFT JOIN todo_recurrence tr ON tr.todo_item_id = ti.id
        WHERE ti.id = ?1
        LIMIT 1
        ",
        params![id],
        parse_item_row,
    )
    .optional()
    .map_err(|e| format_db_error("TODO_QUERY_FAILED", "query todo item", e))
}

fn query_items_with_sql(
    tx: &Transaction<'_>,
    sql: &str,
    params_any: &[&dyn rusqlite::ToSql],
) -> Result<Vec<TodoItem>, String> {
    let mut stmt = tx
        .prepare(sql)
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "prepare item query", e))?;
    let rows = stmt
        .query_map(params_any, parse_item_row)
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "query items", e))?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| format_db_error("TODO_QUERY_FAILED", "parse item row", e))?);
    }
    Ok(items)
}

fn query_max_sort_index(
    tx: &Transaction<'_>,
    group_id: i64,
    parent_id: Option<i64>,
) -> Result<i64, String> {
    if let Some(pid) = parent_id {
        tx.query_row(
            "SELECT COALESCE(MAX(sort_index), 0) FROM todo_item WHERE group_id = ?1 AND parent_id = ?2",
            params![group_id, pid],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| format_db_error("TODO_CREATE_FAILED", "query max sort index", e))
    } else {
        tx.query_row(
            "SELECT COALESCE(MAX(sort_index), 0) FROM todo_item WHERE group_id = ?1 AND parent_id IS NULL",
            params![group_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| format_db_error("TODO_CREATE_FAILED", "query max sort index", e))
    }
}

fn create_item_with_payload(
    tx: &Transaction<'_>,
    payload: &CreateTodoItemPayload,
    time_zone: crate::database::calendar_time::CalendarTimeZone,
) -> Result<TodoItem, String> {
    let item_type = normalize_item_type(payload.item_type.clone());
    let sort_index = query_max_sort_index(tx, payload.group_id, payload.parent_id)? + 1024;
    let now = now_millis();
    let description_content_id = if let Some(text) = &payload.description {
        if text.trim().is_empty() {
            None
        } else {
            let content = Value::Array(vec![serde_json::json!({
                "type": "paragraph",
                "children": [{"type": "formatted", "text": text}]
            })]);
            Some(insert_content_record(
                tx,
                &content,
                text.chars().count() as i64,
            )?)
        }
    } else {
        None
    };

    tx.execute(
        "
        INSERT INTO todo_item
        (group_id, parent_id, title, type, description_content_id, is_completed, start_at, due_at, remind_before, completed_at, sort_index, is_archived, create_time, update_time)
        VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8, NULL, ?9, 0, ?10, ?10)
        ",
        params![
            payload.group_id,
            payload.parent_id,
            payload.title,
            item_type,
            description_content_id,
            payload.start_at,
            payload.due_at,
            payload.remind_before,
            sort_index,
            now
        ],
    )
    .map_err(|e| format_db_error("TODO_CREATE_FAILED", "insert todo item", e))?;
    let item_id = tx.last_insert_rowid();
    todo_calendar_sync::sync_single_item(tx, item_id, time_zone)?;
    get_item_by_id(tx, item_id)?.ok_or_else(|| "TODO_NOT_FOUND: todo item not found".to_string())
}

fn normalize_order_for_siblings(
    tx: &Transaction<'_>,
    group_id: i64,
    parent_id: Option<i64>,
) -> Result<(), String> {
    let mut stmt = if parent_id.is_some() {
        tx.prepare(
            "SELECT id FROM todo_item WHERE group_id = ?1 AND parent_id = ?2 ORDER BY sort_index ASC",
        )
        .map_err(|e| format_db_error("TODO_REORDER_FAILED", "prepare sibling query", e))?
    } else {
        tx.prepare(
            "SELECT id FROM todo_item WHERE group_id = ?1 AND parent_id IS NULL ORDER BY sort_index ASC",
        )
        .map_err(|e| format_db_error("TODO_REORDER_FAILED", "prepare sibling query", e))?
    };

    let mut sibling_ids = Vec::new();
    if let Some(pid) = parent_id {
        let rows = stmt
            .query_map(params![group_id, pid], |row| row.get::<_, i64>(0))
            .map_err(|e| format_db_error("TODO_REORDER_FAILED", "query siblings", e))?;
        for row in rows {
            sibling_ids.push(
                row.map_err(|e| format_db_error("TODO_REORDER_FAILED", "parse sibling row", e))?,
            );
        }
    } else {
        let rows = stmt
            .query_map(params![group_id], |row| row.get::<_, i64>(0))
            .map_err(|e| format_db_error("TODO_REORDER_FAILED", "query siblings", e))?;
        for row in rows {
            sibling_ids.push(
                row.map_err(|e| format_db_error("TODO_REORDER_FAILED", "parse sibling row", e))?,
            );
        }
    }

    let now = now_millis();
    for (index, id) in sibling_ids.into_iter().enumerate() {
        tx.execute(
            "UPDATE todo_item SET sort_index = ?1, update_time = ?2 WHERE id = ?3",
            params![((index as i64) + 1) * 1024, now, id],
        )
        .map_err(|e| format_db_error("TODO_REORDER_FAILED", "normalize sibling order", e))?;
    }
    Ok(())
}

fn move_and_reorder_in_tx(
    tx: &Transaction<'_>,
    payload: &MoveAndReorderPayload,
) -> Result<TodoItem, String> {
    let _cur = get_item_by_id(tx, payload.id)?
        .ok_or_else(|| "TODO_NOT_FOUND: todo item does not exist".to_string())?;
    let now = now_millis();

    let before_sort = payload.before_id.and_then(|id| {
        tx.query_row(
            "SELECT sort_index FROM todo_item WHERE id = ?1 LIMIT 1",
            params![id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .ok()
        .flatten()
    });
    let after_sort = payload.after_id.and_then(|id| {
        tx.query_row(
            "SELECT sort_index FROM todo_item WHERE id = ?1 LIMIT 1",
            params![id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .ok()
        .flatten()
    });

    let mut new_sort = if let (Some(before), Some(after)) = (before_sort, after_sort) {
        ((before + after) / 2).max(1)
    } else if let Some(before) = before_sort {
        let prev = tx
            .query_row(
                "
                SELECT sort_index FROM todo_item
                WHERE group_id = ?1 AND ((parent_id IS NULL AND ?2 IS NULL) OR parent_id = ?2) AND sort_index < ?3
                ORDER BY sort_index DESC LIMIT 1
                ",
                params![payload.to_group_id, payload.to_parent_id, before],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|e| format_db_error("TODO_REORDER_FAILED", "query previous sibling", e))?;
        ((prev.unwrap_or(0) + before) / 2).max(1)
    } else if let Some(after) = after_sort {
        let next = tx
            .query_row(
                "
                SELECT sort_index FROM todo_item
                WHERE group_id = ?1 AND ((parent_id IS NULL AND ?2 IS NULL) OR parent_id = ?2) AND sort_index > ?3
                ORDER BY sort_index ASC LIMIT 1
                ",
                params![payload.to_group_id, payload.to_parent_id, after],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|e| format_db_error("TODO_REORDER_FAILED", "query next sibling", e))?;
        ((after + next.unwrap_or(after + 1024)) / 2).max(1)
    } else {
        query_max_sort_index(tx, payload.to_group_id, payload.to_parent_id)? + 1024
    };

    if new_sort <= 0 {
        new_sort = 1024;
    }

    tx.execute(
        "
        UPDATE todo_item
        SET group_id = ?1, parent_id = ?2, sort_index = ?3, update_time = ?4
        WHERE id = ?5
        ",
        params![
            payload.to_group_id,
            payload.to_parent_id,
            new_sort,
            now,
            payload.id
        ],
    )
    .map_err(|e| format_db_error("TODO_REORDER_FAILED", "update todo order", e))?;

    normalize_order_for_siblings(tx, payload.to_group_id, payload.to_parent_id)?;
    get_item_by_id(tx, payload.id)?.ok_or_else(|| "TODO_NOT_FOUND: todo item not found".to_string())
}

pub(super) fn delete_recurrence_by_item_in_tx(
    tx: &Transaction<'_>,
    todo_item_id: i64,
) -> Result<(), String> {
    let recurrence_id = tx
        .query_row(
            "SELECT id FROM todo_recurrence WHERE todo_item_id = ?1 LIMIT 1",
            params![todo_item_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| {
            format_db_error(
                "TODO_RECURRENCE_DELETE_FAILED",
                "query recurrence by item",
                e,
            )
        })?;
    if let Some(rid) = recurrence_id {
        tx.execute(
            "DELETE FROM todo_recurrence_completion WHERE recurrence_id = ?1",
            params![rid],
        )
        .map_err(|e| {
            format_db_error(
                "TODO_RECURRENCE_DELETE_FAILED",
                "delete recurrence completions",
                e,
            )
        })?;
        tx.execute("DELETE FROM todo_recurrence WHERE id = ?1", params![rid])
            .map_err(|e| {
                format_db_error("TODO_RECURRENCE_DELETE_FAILED", "delete recurrence", e)
            })?;
    }
    Ok(())
}

#[tauri::command]
pub fn todo_list_items(app: AppHandle, payload: ListItemsPayload) -> Result<Vec<TodoItem>, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "begin transaction", e))?;
    let items = query_items_with_sql(
        &tx,
        "
        SELECT
          ti.id, ti.group_id, ti.parent_id, ti.title, ti.type, ti.description_content_id,
          c.content AS description_content,
          ti.is_completed, ti.start_at, ti.due_at, ti.remind_before, ti.completed_at,
          ti.sort_index, ti.is_archived, ti.create_time, ti.update_time,
          tr.id, tr.todo_item_id, tr.type, tr.interval, tr.weekdays, tr.month_day, tr.year_month, tr.year_day,
          tr.exclude_holidays, tr.start_date, tr.end_date, tr.max_occurrences, tr.create_time, tr.update_time
        FROM todo_item ti
        LEFT JOIN contents c ON c.id = ti.description_content_id
        LEFT JOIN todo_recurrence tr ON tr.todo_item_id = ti.id
        WHERE ti.group_id = ?1 AND ti.is_archived = 0
        ORDER BY ti.parent_id IS NOT NULL, ti.parent_id, ti.sort_index ASC
        ",
        &[&payload.group_id],
    )?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "commit transaction", e))?;
    Ok(items)
}

#[tauri::command]
pub fn todo_list_items_by_type(
    app: AppHandle,
    payload: ListItemsByTypePayload,
) -> Result<Vec<TodoItem>, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "begin transaction", e))?;
    let items = if payload.item_type.trim().eq_ignore_ascii_case("all") {
        query_items_with_sql(
            &tx,
            "
            SELECT
              ti.id, ti.group_id, ti.parent_id, ti.title, ti.type, ti.description_content_id,
              c.content AS description_content,
              ti.is_completed, ti.start_at, ti.due_at, ti.remind_before, ti.completed_at,
              ti.sort_index, ti.is_archived, ti.create_time, ti.update_time,
              tr.id, tr.todo_item_id, tr.type, tr.interval, tr.weekdays, tr.month_day, tr.year_month, tr.year_day,
              tr.exclude_holidays, tr.start_date, tr.end_date, tr.max_occurrences, tr.create_time, tr.update_time
            FROM todo_item ti
            LEFT JOIN contents c ON c.id = ti.description_content_id
            LEFT JOIN todo_recurrence tr ON tr.todo_item_id = ti.id
            WHERE ti.is_archived = 0
            ORDER BY ti.group_id, ti.parent_id IS NOT NULL, ti.parent_id, ti.sort_index ASC
            ",
            &[],
        )?
    } else {
        query_items_with_sql(
            &tx,
            "
            SELECT
              ti.id, ti.group_id, ti.parent_id, ti.title, ti.type, ti.description_content_id,
              c.content AS description_content,
              ti.is_completed, ti.start_at, ti.due_at, ti.remind_before, ti.completed_at,
              ti.sort_index, ti.is_archived, ti.create_time, ti.update_time,
              tr.id, tr.todo_item_id, tr.type, tr.interval, tr.weekdays, tr.month_day, tr.year_month, tr.year_day,
              tr.exclude_holidays, tr.start_date, tr.end_date, tr.max_occurrences, tr.create_time, tr.update_time
            FROM todo_item ti
            LEFT JOIN contents c ON c.id = ti.description_content_id
            LEFT JOIN todo_recurrence tr ON tr.todo_item_id = ti.id
            WHERE ti.is_archived = 0 AND ti.type = ?1
            ORDER BY ti.group_id, ti.parent_id IS NOT NULL, ti.parent_id, ti.sort_index ASC
            ",
            &[&payload.item_type],
        )?
    };
    tx.commit()
        .map_err(|e| format_db_error("TODO_QUERY_FAILED", "commit transaction", e))?;
    Ok(items)
}

#[tauri::command]
pub fn todo_create_item(
    app: AppHandle,
    payload: CreateTodoItemPayload,
    time_zone: crate::database::calendar_time::CalendarTimeZone,
) -> Result<TodoItem, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_CREATE_FAILED", "begin transaction", e))?;
    let item = create_item_with_payload(&tx, &payload, time_zone)?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_CREATE_FAILED", "commit transaction", e))?;
    Ok(item)
}

#[tauri::command]
pub fn todo_create_item_relative(
    app: AppHandle,
    payload: CreateTodoItemRelativePayload,
    time_zone: crate::database::calendar_time::CalendarTimeZone,
) -> Result<TodoItem, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_CREATE_FAILED", "begin transaction", e))?;
    let ref_item = get_item_by_id(&tx, payload.ref_id)?
        .ok_or_else(|| "TODO_NOT_FOUND: ref todo item does not exist".to_string())?;

    let create_payload = CreateTodoItemPayload {
        group_id: ref_item.group_id,
        parent_id: if payload.position == "child" {
            Some(ref_item.id)
        } else {
            ref_item.parent_id
        },
        title: payload.title,
        item_type: payload.item_type,
        description: payload.description,
        start_at: payload.start_at,
        due_at: payload.due_at,
        remind_before: payload.remind_before,
    };
    let created = create_item_with_payload(&tx, &create_payload, time_zone)?;

    if payload.position == "above" || payload.position == "below" {
        let siblings = query_items_with_sql(
            &tx,
            "
            SELECT
              ti.id, ti.group_id, ti.parent_id, ti.title, ti.type, ti.description_content_id,
              c.content AS description_content,
              ti.is_completed, ti.start_at, ti.due_at, ti.remind_before, ti.completed_at,
              ti.sort_index, ti.is_archived, ti.create_time, ti.update_time,
              tr.id, tr.todo_item_id, tr.type, tr.interval, tr.weekdays, tr.month_day, tr.year_month, tr.year_day,
              tr.exclude_holidays, tr.start_date, tr.end_date, tr.max_occurrences, tr.create_time, tr.update_time
            FROM todo_item ti
            LEFT JOIN contents c ON c.id = ti.description_content_id
            LEFT JOIN todo_recurrence tr ON tr.todo_item_id = ti.id
            WHERE ti.group_id = ?1
              AND ((ti.parent_id IS NULL AND ?2 IS NULL) OR ti.parent_id = ?2)
            ORDER BY ti.sort_index ASC
            ",
            &[&ref_item.group_id, &ref_item.parent_id],
        )?;
        let index = siblings
            .iter()
            .position(|item| item.id == ref_item.id)
            .unwrap_or(0);
        let before_id = if payload.position == "above" {
            siblings.get(index.saturating_sub(1)).map(|item| item.id)
        } else {
            Some(ref_item.id)
        };
        let after_id = if payload.position == "above" {
            Some(ref_item.id)
        } else {
            siblings.get(index + 1).map(|item| item.id)
        };
        let moved = move_and_reorder_in_tx(
            &tx,
            &MoveAndReorderPayload {
                id: created.id,
                to_group_id: ref_item.group_id,
                to_parent_id: ref_item.parent_id,
                before_id,
                after_id,
            },
        )?;
        tx.commit()
            .map_err(|e| format_db_error("TODO_CREATE_FAILED", "commit transaction", e))?;
        return Ok(moved);
    }

    tx.commit()
        .map_err(|e| format_db_error("TODO_CREATE_FAILED", "commit transaction", e))?;
    Ok(created)
}

#[tauri::command]
pub fn todo_update_item(
    app: AppHandle,
    payload: UpdateTodoItemPayload,
    time_zone: crate::database::calendar_time::CalendarTimeZone,
) -> Result<TodoItem, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_UPDATE_FAILED", "begin transaction", e))?;
    let current = get_item_by_id(&tx, payload.id)?
        .ok_or_else(|| "TODO_NOT_FOUND: todo item does not exist".to_string())?;
    let now = now_millis();
    let next_type = normalize_item_type(
        payload
            .item_type
            .clone()
            .or_else(|| Some(current.r#type.clone())),
    );
    tx.execute(
        "
        UPDATE todo_item
        SET title = ?1, type = ?2, description_content_id = ?3, start_at = ?4, due_at = ?5, remind_before = ?6, update_time = ?7
        WHERE id = ?8
        ",
        params![
            payload.title.unwrap_or(current.title),
            next_type,
            payload.description_content_id.or(current.description_content_id),
            payload.start_at.or(current.start_at),
            payload.due_at.or(current.due_at),
            payload.remind_before.or(current.remind_before),
            now,
            payload.id
        ],
    )
    .map_err(|e| format_db_error("TODO_UPDATE_FAILED", "update todo item", e))?;

    todo_calendar_sync::sync_single_item(&tx, payload.id, time_zone)?;
    let item = get_item_by_id(&tx, payload.id)?
        .ok_or_else(|| "TODO_NOT_FOUND: todo item does not exist".to_string())?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_UPDATE_FAILED", "commit transaction", e))?;
    Ok(item)
}

#[tauri::command]
pub fn todo_toggle_complete_cascade(
    app: AppHandle,
    payload: ToggleCompleteCascadePayload,
) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_COMPLETE_FAILED", "begin transaction", e))?;
    let now = now_millis();
    let completed = if payload.is_completed { 1 } else { 0 };
    tx.execute(
        &format!(
            "
            WITH RECURSIVE descendants(id) AS (
              SELECT id FROM todo_item WHERE id = {id}
              UNION
              SELECT ti.id FROM todo_item ti JOIN descendants d ON ti.parent_id = d.id
            )
            UPDATE todo_item
            SET is_completed = {completed},
                completed_at = CASE WHEN {completed} = 1 THEN {now} ELSE NULL END,
                update_time = {now}
            WHERE id IN (SELECT id FROM descendants)
            ",
            id = payload.id,
            completed = completed,
            now = now
        ),
        [],
    )
    .map_err(|e| format_db_error("TODO_COMPLETE_FAILED", "toggle complete cascade", e))?;
    let changed = tx
        .query_row("SELECT changes()", [], |row| row.get::<_, i64>(0))
        .map_err(|e| format_db_error("TODO_COMPLETE_FAILED", "query changed rows", e))?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_COMPLETE_FAILED", "commit transaction", e))?;
    Ok(changed)
}

#[tauri::command]
pub fn todo_move_and_reorder(
    app: AppHandle,
    payload: MoveAndReorderPayload,
) -> Result<TodoItem, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_REORDER_FAILED", "begin transaction", e))?;
    let item = move_and_reorder_in_tx(&tx, &payload)?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_REORDER_FAILED", "commit transaction", e))?;
    Ok(item)
}

#[tauri::command]
pub fn todo_archive_item(
    app: AppHandle,
    payload: ArchiveTodoItemPayload,
    time_zone: crate::database::calendar_time::CalendarTimeZone,
) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_ARCHIVE_FAILED", "begin transaction", e))?;
    let changed = tx
        .execute(
            "UPDATE todo_item SET is_archived = ?1, update_time = ?2 WHERE id = ?3",
            params![
                if payload.is_archived { 1 } else { 0 },
                now_millis(),
                payload.id
            ],
        )
        .map_err(|e| format_db_error("TODO_ARCHIVE_FAILED", "archive todo item", e))?;
    if payload.is_archived {
        todo_calendar_sync::remove_all_by_todo(&tx, payload.id)?;
    } else {
        todo_calendar_sync::sync_single_item(&tx, payload.id, time_zone)?;
    }
    tx.commit()
        .map_err(|e| format_db_error("TODO_ARCHIVE_FAILED", "commit transaction", e))?;
    Ok(changed as i64)
}

#[tauri::command]
pub fn todo_delete_item(app: AppHandle, payload: TodoIdPayload) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_DELETE_FAILED", "begin transaction", e))?;
    let description_content_id = tx
        .query_row(
            "SELECT description_content_id FROM todo_item WHERE id = ?1 LIMIT 1",
            params![payload.id],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map_err(|e| format_db_error("TODO_DELETE_FAILED", "query todo item", e))?
        .ok_or_else(|| "TODO_NOT_FOUND: todo item does not exist".to_string())?;
    cleanup_todo_dependencies_in_tx(&tx, payload.id)?;
    let changed = tx
        .execute("DELETE FROM todo_item WHERE id = ?1", params![payload.id])
        .map_err(|e| format_db_error("TODO_DELETE_FAILED", "delete todo item", e))?;
    if let Some(content_id) = description_content_id {
        decrement_or_delete_content(&tx, content_id)?;
    }
    tx.commit()
        .map_err(|e| format_db_error("TODO_DELETE_FAILED", "commit transaction", e))?;
    Ok(changed as i64)
}

#[tauri::command]
pub fn todo_delete_item_cascade(app: AppHandle, payload: TodoIdPayload) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_DELETE_FAILED", "begin transaction", e))?;
    let mut todo_ids = Vec::new();
    let mut content_ids = std::collections::HashSet::new();
    {
        let mut stmt = tx
            .prepare(
                "
                WITH RECURSIVE descendants(id) AS (
                  SELECT id FROM todo_item WHERE id = ?1
                  UNION
                  SELECT ti.id FROM todo_item ti JOIN descendants d ON ti.parent_id = d.id
                )
                SELECT id, description_content_id FROM todo_item WHERE id IN (SELECT id FROM descendants)
                ",
            )
            .map_err(|e| format_db_error("TODO_DELETE_FAILED", "prepare descendant query", e))?;
        let rows = stmt
            .query_map(params![payload.id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, Option<i64>>(1)?))
            })
            .map_err(|e| format_db_error("TODO_DELETE_FAILED", "query descendants", e))?;

        for row in rows {
            let (todo_id, content_id) =
                row.map_err(|e| format_db_error("TODO_DELETE_FAILED", "parse descendant row", e))?;
            todo_ids.push(todo_id);
            if let Some(cid) = content_id {
                content_ids.insert(cid);
            }
        }
    }
    if todo_ids.is_empty() {
        return Err("TODO_NOT_FOUND: todo item does not exist".to_string());
    }

    for todo_id in todo_ids.iter().copied() {
        cleanup_todo_dependencies_in_tx(&tx, todo_id)?;
    }

    tx.execute(
        "
        WITH RECURSIVE descendants(id) AS (
          SELECT id FROM todo_item WHERE id = ?1
          UNION
          SELECT ti.id FROM todo_item ti JOIN descendants d ON ti.parent_id = d.id
        )
        DELETE FROM todo_item WHERE id IN (SELECT id FROM descendants)
        ",
        params![payload.id],
    )
    .map_err(|e| format_db_error("TODO_DELETE_FAILED", "delete descendants", e))?;
    let changed = tx
        .query_row("SELECT changes()", [], |row| row.get::<_, i64>(0))
        .map_err(|e| format_db_error("TODO_DELETE_FAILED", "query changed rows", e))?;

    for content_id in content_ids {
        decrement_or_delete_content(&tx, content_id)?;
    }

    tx.commit()
        .map_err(|e| format_db_error("TODO_DELETE_FAILED", "commit transaction", e))?;
    Ok(changed)
}
