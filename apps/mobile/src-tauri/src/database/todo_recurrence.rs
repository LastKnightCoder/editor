use super::*;

#[tauri::command]
pub fn todo_get_recurrence(
    app: AppHandle,
    payload: TodoIdPayload,
) -> Result<Option<TodoRecurrence>, String> {
    let conn = schema::open_active_database(&app)?;
    conn.query_row(
        "
        SELECT id, todo_item_id, type, interval, weekdays, month_day, year_month, year_day, exclude_holidays, start_date, end_date, max_occurrences, create_time, update_time
        FROM todo_recurrence WHERE id = ?1 LIMIT 1
        ",
        params![payload.id],
        |row| {
            Ok(TodoRecurrence {
                id: row.get(0)?,
                todo_item_id: row.get(1)?,
                r#type: row.get(2)?,
                interval: row.get(3)?,
                weekdays: parse_weekdays(row.get::<_, Option<String>>(4)?),
                month_day: row.get(5)?,
                year_month: row.get(6)?,
                year_day: row.get(7)?,
                exclude_holidays: parse_bool(row.get::<_, i64>(8)?),
                start_date: row.get(9)?,
                end_date: row.get(10)?,
                max_occurrences: row.get(11)?,
                create_time: row.get(12)?,
                update_time: row.get(13)?,
            })
        },
    )
    .optional()
    .map_err(|e| format_db_error("TODO_RECURRENCE_QUERY_FAILED", "query recurrence", e))
}

#[tauri::command]
pub fn todo_get_recurrence_by_item(
    app: AppHandle,
    payload: TodoItemIdPayload,
) -> Result<Option<TodoRecurrence>, String> {
    let conn = schema::open_active_database(&app)?;
    conn.query_row(
        "
        SELECT id, todo_item_id, type, interval, weekdays, month_day, year_month, year_day, exclude_holidays, start_date, end_date, max_occurrences, create_time, update_time
        FROM todo_recurrence WHERE todo_item_id = ?1 LIMIT 1
        ",
        params![payload.todo_item_id],
        |row| {
            Ok(TodoRecurrence {
                id: row.get(0)?,
                todo_item_id: row.get(1)?,
                r#type: row.get(2)?,
                interval: row.get(3)?,
                weekdays: parse_weekdays(row.get::<_, Option<String>>(4)?),
                month_day: row.get(5)?,
                year_month: row.get(6)?,
                year_day: row.get(7)?,
                exclude_holidays: parse_bool(row.get::<_, i64>(8)?),
                start_date: row.get(9)?,
                end_date: row.get(10)?,
                max_occurrences: row.get(11)?,
                create_time: row.get(12)?,
                update_time: row.get(13)?,
            })
        },
    )
    .optional()
    .map_err(|e| format_db_error("TODO_RECURRENCE_QUERY_FAILED", "query recurrence by item", e))
}

#[tauri::command]
pub fn todo_create_recurrence(
    app: AppHandle,
    payload: CreateTodoRecurrencePayload,
    time_zone: crate::database::calendar_time::CalendarTimeZone,
) -> Result<TodoRecurrence, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_RECURRENCE_CREATE_FAILED", "begin transaction", e))?;
    let exists = tx
        .query_row(
            "SELECT id FROM todo_recurrence WHERE todo_item_id = ?1 LIMIT 1",
            params![payload.todo_item_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| {
            format_db_error(
                "TODO_RECURRENCE_CREATE_FAILED",
                "query existing recurrence",
                e,
            )
        })?;
    if exists.is_some() {
        return Err("TODO_RECURRENCE_INVALID: recurrence already exists for todo item".to_string());
    }
    let now = now_millis();
    let weekdays = payload
        .weekdays
        .as_ref()
        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()));
    tx.execute(
        "
        INSERT INTO todo_recurrence
        (todo_item_id, type, interval, weekdays, month_day, year_month, year_day, exclude_holidays, start_date, end_date, max_occurrences, create_time, update_time)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)
        ",
        params![
            payload.todo_item_id,
            payload.recurrence_type,
            payload.interval.unwrap_or(1).max(1),
            weekdays,
            payload.month_day,
            payload.year_month,
            payload.year_day,
            if payload.exclude_holidays.unwrap_or(false) {
                1
            } else {
                0
            },
            payload.start_date,
            payload.end_date,
            payload.max_occurrences,
            now
        ],
    )
    .map_err(|e| format_db_error("TODO_RECURRENCE_CREATE_FAILED", "insert recurrence", e))?;
    let id = tx.last_insert_rowid();
    let recurrence = tx
        .query_row(
            "
            SELECT id, todo_item_id, type, interval, weekdays, month_day, year_month, year_day, exclude_holidays, start_date, end_date, max_occurrences, create_time, update_time
            FROM todo_recurrence WHERE id = ?1
            ",
            params![id],
            |row| {
                Ok(TodoRecurrence {
                    id: row.get(0)?,
                    todo_item_id: row.get(1)?,
                    r#type: row.get(2)?,
                    interval: row.get(3)?,
                    weekdays: parse_weekdays(row.get::<_, Option<String>>(4)?),
                    month_day: row.get(5)?,
                    year_month: row.get(6)?,
                    year_day: row.get(7)?,
                    exclude_holidays: parse_bool(row.get::<_, i64>(8)?),
                    start_date: row.get(9)?,
                    end_date: row.get(10)?,
                    max_occurrences: row.get(11)?,
                    create_time: row.get(12)?,
                    update_time: row.get(13)?,
                })
            },
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_CREATE_FAILED", "query created recurrence", e))?;
    super::super::assistant_tasks::record_rule_change(&tx, &recurrence, time_zone)?;
    todo_calendar_sync::rematerialize_recurring_item(&tx, payload.todo_item_id, time_zone)?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_RECURRENCE_CREATE_FAILED", "commit transaction", e))?;
    Ok(recurrence)
}

#[tauri::command]
pub fn todo_update_recurrence(
    app: AppHandle,
    payload: UpdateTodoRecurrencePayload,
    time_zone: crate::database::calendar_time::CalendarTimeZone,
) -> Result<TodoRecurrence, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_RECURRENCE_UPDATE_FAILED", "begin transaction", e))?;
    let current = tx
        .query_row(
            "
            SELECT id, todo_item_id, type, interval, weekdays, month_day, year_month, year_day, exclude_holidays, start_date, end_date, max_occurrences, create_time, update_time
            FROM todo_recurrence WHERE id = ?1
            ",
            params![payload.id],
            |row| {
                Ok(TodoRecurrence {
                    id: row.get(0)?,
                    todo_item_id: row.get(1)?,
                    r#type: row.get(2)?,
                    interval: row.get(3)?,
                    weekdays: parse_weekdays(row.get::<_, Option<String>>(4)?),
                    month_day: row.get(5)?,
                    year_month: row.get(6)?,
                    year_day: row.get(7)?,
                    exclude_holidays: parse_bool(row.get::<_, i64>(8)?),
                    start_date: row.get(9)?,
                    end_date: row.get(10)?,
                    max_occurrences: row.get(11)?,
                    create_time: row.get(12)?,
                    update_time: row.get(13)?,
                })
            },
        )
        .optional()
        .map_err(|e| format_db_error("TODO_RECURRENCE_UPDATE_FAILED", "query recurrence", e))?
        .ok_or_else(|| "TODO_RECURRENCE_NOT_FOUND: recurrence does not exist".to_string())?;
    let now = now_millis();
    let weekdays = payload
        .weekdays
        .as_ref()
        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()))
        .or_else(|| {
            current
                .weekdays
                .as_ref()
                .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()))
        });
    tx.execute(
        "
        UPDATE todo_recurrence
        SET type = ?1, interval = ?2, weekdays = ?3, month_day = ?4, year_month = ?5, year_day = ?6,
            exclude_holidays = ?7, start_date = ?8, end_date = ?9, max_occurrences = ?10, update_time = ?11
        WHERE id = ?12
        ",
        params![
            payload.recurrence_type.unwrap_or(current.r#type),
            payload.interval.unwrap_or(current.interval).max(1),
            weekdays,
            payload.month_day.or(current.month_day),
            payload.year_month.or(current.year_month),
            payload.year_day.or(current.year_day),
            if payload.exclude_holidays.unwrap_or(current.exclude_holidays) {
                1
            } else {
                0
            },
            payload.start_date.unwrap_or(current.start_date),
            payload.end_date.or(current.end_date),
            payload.max_occurrences.or(current.max_occurrences),
            now,
            payload.id
        ],
    )
    .map_err(|e| format_db_error("TODO_RECURRENCE_UPDATE_FAILED", "update recurrence", e))?;
    let recurrence = tx
        .query_row(
            "
            SELECT id, todo_item_id, type, interval, weekdays, month_day, year_month, year_day, exclude_holidays, start_date, end_date, max_occurrences, create_time, update_time
            FROM todo_recurrence WHERE id = ?1
            ",
            params![payload.id],
            |row| {
                Ok(TodoRecurrence {
                    id: row.get(0)?,
                    todo_item_id: row.get(1)?,
                    r#type: row.get(2)?,
                    interval: row.get(3)?,
                    weekdays: parse_weekdays(row.get::<_, Option<String>>(4)?),
                    month_day: row.get(5)?,
                    year_month: row.get(6)?,
                    year_day: row.get(7)?,
                    exclude_holidays: parse_bool(row.get::<_, i64>(8)?),
                    start_date: row.get(9)?,
                    end_date: row.get(10)?,
                    max_occurrences: row.get(11)?,
                    create_time: row.get(12)?,
                    update_time: row.get(13)?,
                })
            },
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_UPDATE_FAILED", "query updated recurrence", e))?;
    super::super::assistant_tasks::record_rule_change(&tx, &recurrence, time_zone)?;
    todo_calendar_sync::rematerialize_recurring_item(&tx, current.todo_item_id, time_zone)?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_RECURRENCE_UPDATE_FAILED", "commit transaction", e))?;
    Ok(recurrence)
}

#[tauri::command]
pub fn todo_delete_recurrence(
    app: AppHandle,
    payload: TodoIdPayload,
    time_zone: crate::database::calendar_time::CalendarTimeZone,
) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "begin transaction", e))?;
    let todo_item_id = tx
        .query_row(
            "SELECT todo_item_id FROM todo_recurrence WHERE id = ?1 LIMIT 1",
            params![payload.id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "query recurrence", e))?
        .ok_or_else(|| "TODO_RECURRENCE_NOT_FOUND: recurrence does not exist".to_string())?;
    super::super::assistant_tasks::stop_rule(&tx, todo_item_id, time_zone)?;
    tx.execute(
        "DELETE FROM todo_recurrence_completion WHERE recurrence_id = ?1",
        params![payload.id],
    )
    .map_err(|e| {
        format_db_error(
            "TODO_RECURRENCE_DELETE_FAILED",
            "delete recurrence completions",
            e,
        )
    })?;
    let changed = tx
        .execute(
            "DELETE FROM todo_recurrence WHERE id = ?1",
            params![payload.id],
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "delete recurrence", e))?;
    todo_calendar_sync::remove_all_by_todo(&tx, todo_item_id)?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "commit transaction", e))?;
    Ok(changed as i64)
}

#[tauri::command]
pub fn todo_delete_recurrence_by_item(
    app: AppHandle,
    payload: TodoItemIdPayload,
    time_zone: crate::database::calendar_time::CalendarTimeZone,
) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "begin transaction", e))?;
    let recurrence_id = tx
        .query_row(
            "SELECT id FROM todo_recurrence WHERE todo_item_id = ?1 LIMIT 1",
            params![payload.todo_item_id],
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
    let Some(id) = recurrence_id else {
        return Ok(0);
    };
    super::super::assistant_tasks::stop_rule(&tx, payload.todo_item_id, time_zone)?;
    tx.execute(
        "DELETE FROM todo_recurrence_completion WHERE recurrence_id = ?1",
        params![id],
    )
    .map_err(|e| {
        format_db_error(
            "TODO_RECURRENCE_DELETE_FAILED",
            "delete recurrence completions",
            e,
        )
    })?;
    let changed = tx
        .execute("DELETE FROM todo_recurrence WHERE id = ?1", params![id])
        .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "delete recurrence", e))?;
    todo_calendar_sync::remove_all_by_todo(&tx, payload.todo_item_id)?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_RECURRENCE_DELETE_FAILED", "commit transaction", e))?;
    Ok(changed as i64)
}

#[tauri::command]
pub fn todo_get_recurrence_completions(
    app: AppHandle,
    payload: RecurrenceCompletionsPayload,
) -> Result<Vec<TodoRecurrenceCompletion>, String> {
    let conn = schema::open_active_database(&app)?;
    let mut sql = String::from(
        "
        SELECT id, recurrence_id, scheduled_date, completed_at, skipped, create_time
        FROM todo_recurrence_completion
        WHERE recurrence_id = ?1
        ",
    );
    let mut params_vec: Vec<i64> = vec![payload.recurrence_id];
    if let Some(start) = payload.start_date {
        sql.push_str(" AND scheduled_date >= ?2 ");
        params_vec.push(start);
    }
    if let Some(end) = payload.end_date {
        let marker = if payload.start_date.is_some() { 3 } else { 2 };
        sql.push_str(&format!(" AND scheduled_date <= ?{marker} "));
        params_vec.push(end);
    }
    sql.push_str(" ORDER BY scheduled_date ASC ");
    let mut stmt = conn.prepare(&sql).map_err(|e| {
        format_db_error(
            "TODO_RECURRENCE_QUERY_FAILED",
            "prepare recurrence completions",
            e,
        )
    })?;
    let mut rows = stmt
        .query(rusqlite::params_from_iter(params_vec.iter()))
        .map_err(|e| {
            format_db_error(
                "TODO_RECURRENCE_QUERY_FAILED",
                "query recurrence completions",
                e,
            )
        })?;
    let mut results = vec![];
    while let Some(row) = rows.next().map_err(|e| {
        format_db_error(
            "TODO_RECURRENCE_QUERY_FAILED",
            "read recurrence completion row",
            e,
        )
    })? {
        results.push(TodoRecurrenceCompletion {
            id: row.get(0).map_err(|e| {
                format_db_error("TODO_RECURRENCE_QUERY_FAILED", "parse completion id", e)
            })?,
            recurrence_id: row.get(1).map_err(|e| {
                format_db_error("TODO_RECURRENCE_QUERY_FAILED", "parse recurrence_id", e)
            })?,
            scheduled_date: row.get(2).map_err(|e| {
                format_db_error("TODO_RECURRENCE_QUERY_FAILED", "parse scheduled_date", e)
            })?,
            completed_at: row.get(3).map_err(|e| {
                format_db_error("TODO_RECURRENCE_QUERY_FAILED", "parse completed_at", e)
            })?,
            skipped: parse_bool(row.get::<_, i64>(4).map_err(|e| {
                format_db_error("TODO_RECURRENCE_QUERY_FAILED", "parse skipped", e)
            })?),
            create_time: row.get(5).map_err(|e| {
                format_db_error("TODO_RECURRENCE_QUERY_FAILED", "parse create_time", e)
            })?,
        });
    }
    Ok(results)
}

#[tauri::command]
pub fn todo_get_recurrence_completion(
    app: AppHandle,
    payload: RecurrenceCompletionPayload,
) -> Result<Option<TodoRecurrenceCompletion>, String> {
    let conn = schema::open_active_database(&app)?;
    conn.query_row(
        "
        SELECT id, recurrence_id, scheduled_date, completed_at, skipped, create_time
        FROM todo_recurrence_completion
        WHERE recurrence_id = ?1 AND scheduled_date = ?2
        LIMIT 1
        ",
        params![payload.recurrence_id, payload.scheduled_date],
        |row| {
            Ok(TodoRecurrenceCompletion {
                id: row.get(0)?,
                recurrence_id: row.get(1)?,
                scheduled_date: row.get(2)?,
                completed_at: row.get(3)?,
                skipped: parse_bool(row.get::<_, i64>(4)?),
                create_time: row.get(5)?,
            })
        },
    )
    .optional()
    .map_err(|e| {
        format_db_error(
            "TODO_RECURRENCE_QUERY_FAILED",
            "query recurrence completion",
            e,
        )
    })
}

#[tauri::command]
pub fn todo_complete_recurrence(
    app: AppHandle,
    mut payload: RecurrenceCompletionPayload,
    time_zone: crate::database::calendar_time::CalendarTimeZone,
) -> Result<TodoRecurrenceCompletion, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "begin transaction", e))?;
    payload.scheduled_date = super::super::assistant_tasks::original_date(
        &tx,
        payload.recurrence_id,
        payload.scheduled_date,
        time_zone,
    )?;
    let now = now_millis();
    super::super::assistant_tasks::sync_completion(
        &tx,
        payload.recurrence_id,
        payload.scheduled_date,
        Some(now),
        false,
        time_zone,
    )?;
    let existing_id = tx
        .query_row(
            "
            SELECT id FROM todo_recurrence_completion
            WHERE recurrence_id = ?1 AND scheduled_date = ?2
            LIMIT 1
            ",
            params![payload.recurrence_id, payload.scheduled_date],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| {
            format_db_error(
                "TODO_RECURRENCE_COMPLETE_FAILED",
                "query existing completion",
                e,
            )
        })?;
    if let Some(id) = existing_id {
        tx.execute(
            "UPDATE todo_recurrence_completion SET completed_at = ?1, skipped = 0 WHERE id = ?2",
            params![now, id],
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "update completion", e))?;
    } else {
        tx.execute(
            "
            INSERT INTO todo_recurrence_completion (recurrence_id, scheduled_date, completed_at, skipped, create_time)
            VALUES (?1, ?2, ?3, 0, ?4)
            ",
            params![payload.recurrence_id, payload.scheduled_date, now, now],
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "insert completion", e))?;
    }
    let completion = tx
        .query_row(
            "
            SELECT id, recurrence_id, scheduled_date, completed_at, skipped, create_time
            FROM todo_recurrence_completion
            WHERE recurrence_id = ?1 AND scheduled_date = ?2
            LIMIT 1
            ",
            params![payload.recurrence_id, payload.scheduled_date],
            |row| {
                Ok(TodoRecurrenceCompletion {
                    id: row.get(0)?,
                    recurrence_id: row.get(1)?,
                    scheduled_date: row.get(2)?,
                    completed_at: row.get(3)?,
                    skipped: parse_bool(row.get::<_, i64>(4)?),
                    create_time: row.get(5)?,
                })
            },
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "query completion", e))?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "commit transaction", e))?;
    Ok(completion)
}

#[tauri::command]
pub fn todo_uncomplete_recurrence(
    app: AppHandle,
    mut payload: RecurrenceCompletionPayload,
    time_zone: crate::database::calendar_time::CalendarTimeZone,
) -> Result<i64, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    payload.scheduled_date = super::super::assistant_tasks::original_date(
        &tx,
        payload.recurrence_id,
        payload.scheduled_date,
        time_zone,
    )?;
    super::super::assistant_tasks::sync_completion(
        &tx,
        payload.recurrence_id,
        payload.scheduled_date,
        None,
        false,
        time_zone,
    )?;
    let changed = tx
        .execute(
            "DELETE FROM todo_recurrence_completion WHERE recurrence_id = ?1 AND scheduled_date = ?2",
            params![payload.recurrence_id, payload.scheduled_date],
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "delete completion", e))?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(changed as i64)
}

#[tauri::command]
pub fn todo_skip_recurrence(
    app: AppHandle,
    mut payload: RecurrenceCompletionPayload,
    time_zone: crate::database::calendar_time::CalendarTimeZone,
) -> Result<TodoRecurrenceCompletion, String> {
    let mut conn = schema::open_active_database(&app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "begin transaction", e))?;
    payload.scheduled_date = super::super::assistant_tasks::original_date(
        &tx,
        payload.recurrence_id,
        payload.scheduled_date,
        time_zone,
    )?;
    super::super::assistant_tasks::sync_completion(
        &tx,
        payload.recurrence_id,
        payload.scheduled_date,
        None,
        true,
        time_zone,
    )?;
    let existing_id = tx
        .query_row(
            "
            SELECT id FROM todo_recurrence_completion
            WHERE recurrence_id = ?1 AND scheduled_date = ?2
            LIMIT 1
            ",
            params![payload.recurrence_id, payload.scheduled_date],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| {
            format_db_error(
                "TODO_RECURRENCE_COMPLETE_FAILED",
                "query existing completion",
                e,
            )
        })?;
    if let Some(id) = existing_id {
        tx.execute(
            "UPDATE todo_recurrence_completion SET completed_at = NULL, skipped = 1 WHERE id = ?1",
            params![id],
        )
        .map_err(|e| {
            format_db_error(
                "TODO_RECURRENCE_COMPLETE_FAILED",
                "update skipped completion",
                e,
            )
        })?;
    } else {
        let now = now_millis();
        tx.execute(
            "
            INSERT INTO todo_recurrence_completion (recurrence_id, scheduled_date, completed_at, skipped, create_time)
            VALUES (?1, ?2, NULL, 1, ?3)
            ",
            params![payload.recurrence_id, payload.scheduled_date, now],
        )
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "insert skipped completion", e))?;
    }
    let completion = tx
        .query_row(
            "
            SELECT id, recurrence_id, scheduled_date, completed_at, skipped, create_time
            FROM todo_recurrence_completion
            WHERE recurrence_id = ?1 AND scheduled_date = ?2
            LIMIT 1
            ",
            params![payload.recurrence_id, payload.scheduled_date],
            |row| {
                Ok(TodoRecurrenceCompletion {
                    id: row.get(0)?,
                    recurrence_id: row.get(1)?,
                    scheduled_date: row.get(2)?,
                    completed_at: row.get(3)?,
                    skipped: parse_bool(row.get::<_, i64>(4)?),
                    create_time: row.get(5)?,
                })
            },
        )
        .map_err(|e| {
            format_db_error(
                "TODO_RECURRENCE_COMPLETE_FAILED",
                "query skipped completion",
                e,
            )
        })?;
    tx.commit()
        .map_err(|e| format_db_error("TODO_RECURRENCE_COMPLETE_FAILED", "commit transaction", e))?;
    Ok(completion)
}
