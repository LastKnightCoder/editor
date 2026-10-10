import Database from "better-sqlite3";
import { TodoCalendarEventSource, TodoCalendarMapping, TodoCalendarSyncType } from "@/types";

export default class TodoCalendarMappingTable {
  static getListenEvents() {
    return {
      "todo:get-calendar-mappings-by-todo": this.getMappingsByTodoId.bind(this),
      "todo:get-calendar-mappings-by-todo-ids": this.getMappingsByTodoIds.bind(this),
      "todo:get-calendar-mapping-by-id": this.getMappingById.bind(this),
      "todo:get-calendar-mapping-by-event": this.getMappingByEventId.bind(this),
      "todo:get-calendar-event-sources": this.getEventSources.bind(this),
      "todo:create-calendar-mapping": this.createMapping.bind(this),
      "todo:delete-calendar-mapping": this.deleteMapping.bind(this),
      "todo:delete-calendar-mappings-by-todo": this.deleteMappingsByTodoId.bind(this),
      "todo:delete-calendar-mappings-by-event": this.deleteMappingsByEventId.bind(this),
    } as const;
  }

  static parse(row: any): TodoCalendarMapping {
    return {
      id: row.id,
      todoItemId: row.todo_item_id,
      calendarEventId: row.calendar_event_id,
      syncType: row.sync_type as TodoCalendarSyncType,
      recurrenceDate: row.recurrence_date ?? null,
      createTime: row.create_time,
    };
  }

  // 根据待办项 ID 获取所有日历映射
  static getMappingsByTodoId(
    db: Database.Database,
    params: { todoItemId: number }
  ): TodoCalendarMapping[] {
    const rows = db
      .prepare(`SELECT * FROM todo_calendar_mapping WHERE todo_item_id = ?`)
      .all(params.todoItemId) as any[];
    return rows.map(this.parse);
  }

  static getMappingsByTodoIds(
    db: Database.Database,
    params: { todoItemIds: number[] }
  ): Record<number, TodoCalendarMapping[]> {
    if (!params.todoItemIds.length) {
      return {};
    }

    const placeholders = params.todoItemIds.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT * FROM todo_calendar_mapping WHERE todo_item_id IN (${placeholders}) ORDER BY todo_item_id ASC, create_time ASC`
      )
      .all(...params.todoItemIds) as any[];

    const grouped: Record<number, TodoCalendarMapping[]> = {};
    rows.forEach(row => {
      const mapping = this.parse(row);
      grouped[mapping.todoItemId] = [...(grouped[mapping.todoItemId] ?? []), mapping];
    });

    return grouped;
  }

  // 根据日历事件 ID 获取映射
  static getMappingByEventId(
    db: Database.Database,
    params: { calendarEventId: number }
  ): TodoCalendarMapping | null {
    const row = db
      .prepare(`SELECT * FROM todo_calendar_mapping WHERE calendar_event_id = ?`)
      .get(params.calendarEventId);
    return row ? this.parse(row) : null;
  }

  // 批量查询日程的待办来源与完成状态（日历页一次拉齐可见日程）
  static getEventSources(
    db: Database.Database,
    params: { calendarEventIds: number[] }
  ): Record<number, TodoCalendarEventSource> {
    const ids = params.calendarEventIds;
    if (!ids.length) return {};

    const placeholders = ids.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT
          m.calendar_event_id,
          m.todo_item_id,
          m.sync_type,
          m.recurrence_date,
          ti.is_completed,
          r.id AS recurrence_id,
          rc.completed_at AS occurrence_completed_at,
          rc.skipped AS occurrence_skipped
        FROM todo_calendar_mapping m
        JOIN todo_item ti ON ti.id = m.todo_item_id
        LEFT JOIN todo_recurrence r
          ON m.sync_type = 'recurring' AND r.todo_item_id = m.todo_item_id
        LEFT JOIN todo_recurrence_completion rc
          ON rc.recurrence_id = r.id AND rc.scheduled_date = m.recurrence_date
        WHERE m.calendar_event_id IN (${placeholders})`
      )
      .all(...ids) as any[];

    const result: Record<number, TodoCalendarEventSource> = {};
    for (const row of rows) {
      const recurring = row.sync_type === "recurring";
      result[row.calendar_event_id] = {
        calendarEventId: row.calendar_event_id,
        todoItemId: row.todo_item_id,
        syncType: row.sync_type as TodoCalendarSyncType,
        recurrenceDate: row.recurrence_date ?? null,
        recurrenceId: recurring ? (row.recurrence_id ?? null) : null,
        isCompleted: recurring
          ? row.occurrence_completed_at != null && !row.occurrence_skipped
          : Boolean(row.is_completed),
      };
    }

    // 安排：用户日历里关联待办的事件（calendar_event.todo_item_id）
    const linked = db
      .prepare(
        `SELECT e.id AS calendar_event_id, e.todo_item_id, ti.is_completed,
          o.series_id,o.occurrence_date,r.id AS recurrence_id,override.state_json
        FROM calendar_event e
        JOIN todo_item ti ON ti.id = e.todo_item_id
        LEFT JOIN todo_schedule_occurrence o ON o.calendar_event_id=e.id
        LEFT JOIN todo_recurrence r ON r.todo_item_id=ti.id
        LEFT JOIN todo_occurrence_override override ON override.todo_item_id=ti.id AND override.todo_created_at=ti.create_time
          AND override.series_id=o.series_id AND override.occurrence_date=o.occurrence_date
        WHERE e.id IN (${placeholders})`
      )
      .all(...ids) as Array<{
      calendar_event_id: number;
      todo_item_id: number;
      is_completed: number;
      series_id: string | null;
      occurrence_date: string | null;
      recurrence_id: number | null;
      state_json: string | null;
    }>;
    for (const row of linked) {
      const date = row.occurrence_date
        ? new Date(`${row.occurrence_date}T00:00:00`).getTime()
        : null;
      const completion =
        date != null && row.recurrence_id != null
          ? (db
              .prepare(
                "SELECT completed_at,skipped FROM todo_recurrence_completion WHERE recurrence_id=? AND scheduled_date=?"
              )
              .get(row.recurrence_id, date) as
              { completed_at: number | null; skipped: number } | undefined)
          : undefined;
      const state = row.state_json
        ? (JSON.parse(row.state_json) as { completedAt?: number | null; skipped?: boolean })
        : undefined;
      result[row.calendar_event_id] ??= {
        calendarEventId: row.calendar_event_id,
        todoItemId: row.todo_item_id,
        syncType: date == null ? "linked" : "recurring",
        recurrenceDate: date,
        recurrenceId: date == null ? null : row.recurrence_id,
        isCompleted:
          date == null
            ? Boolean(row.is_completed)
            : state
              ? state.completedAt != null && !state.skipped
              : completion?.completed_at != null && !completion.skipped,
      };
    }
    return result;
  }

  static getMappingById(db: Database.Database, params: { id: number }): TodoCalendarMapping | null {
    const row = db.prepare(`SELECT * FROM todo_calendar_mapping WHERE id = ?`).get(params.id);
    return row ? this.parse(row) : null;
  }

  // 根据待办项 ID 和周期日期获取映射
  static getMappingByTodoAndDate(
    db: Database.Database,
    params: { todoItemId: number; recurrenceDate?: number | null }
  ): TodoCalendarMapping | null {
    const sql =
      params.recurrenceDate !== undefined && params.recurrenceDate !== null
        ? `SELECT * FROM todo_calendar_mapping WHERE todo_item_id = ? AND recurrence_date = ?`
        : `SELECT * FROM todo_calendar_mapping WHERE todo_item_id = ? AND recurrence_date IS NULL`;

    const row =
      params.recurrenceDate !== undefined && params.recurrenceDate !== null
        ? db.prepare(sql).get(params.todoItemId, params.recurrenceDate)
        : db.prepare(sql).get(params.todoItemId);

    return row ? this.parse(row) : null;
  }

  // 创建映射
  static createMapping(
    db: Database.Database,
    params: {
      todoItemId: number;
      calendarEventId: number;
      syncType: TodoCalendarSyncType;
      recurrenceDate?: number | null;
    }
  ): TodoCalendarMapping {
    const now = Date.now();

    const stmt = db.prepare(
      `INSERT INTO todo_calendar_mapping (todo_item_id, calendar_event_id, sync_type, recurrence_date, create_time)
       VALUES (?, ?, ?, ?, ?)`
    );

    const res = stmt.run(
      params.todoItemId,
      params.calendarEventId,
      params.syncType,
      params.recurrenceDate ?? null,
      now
    );

    const id = Number(res.lastInsertRowid);
    const row = db.prepare(`SELECT * FROM todo_calendar_mapping WHERE id = ?`).get(id);
    return this.parse(row);
  }

  // 删除单个映射
  static deleteMapping(db: Database.Database, params: { id: number }): number {
    const res = db.prepare(`DELETE FROM todo_calendar_mapping WHERE id = ?`).run(params.id);
    return res.changes;
  }

  // 删除待办项的所有映射
  static deleteMappingsByTodoId(db: Database.Database, params: { todoItemId: number }): number {
    const res = db
      .prepare(`DELETE FROM todo_calendar_mapping WHERE todo_item_id = ?`)
      .run(params.todoItemId);
    return res.changes;
  }

  // 删除日历事件的映射
  static deleteMappingsByEventId(
    db: Database.Database,
    params: { calendarEventId: number }
  ): number {
    const res = db
      .prepare(`DELETE FROM todo_calendar_mapping WHERE calendar_event_id = ?`)
      .run(params.calendarEventId);
    return res.changes;
  }

  // 获取日历事件 ID 列表
  static getEventIdsByTodoId(db: Database.Database, todoItemId: number): number[] {
    const rows = db
      .prepare(`SELECT calendar_event_id FROM todo_calendar_mapping WHERE todo_item_id = ?`)
      .all(todoItemId) as Array<{ calendar_event_id: number }>;
    return rows.map(r => r.calendar_event_id);
  }

  // 获取待办项 ID
  static getTodoIdByEventId(db: Database.Database, calendarEventId: number): number | null {
    const row = db
      .prepare(`SELECT todo_item_id FROM todo_calendar_mapping WHERE calendar_event_id = ?`)
      .get(calendarEventId) as { todo_item_id: number } | undefined;
    return row?.todo_item_id ?? null;
  }

  // 更新或创建映射
  static upsertMapping(
    db: Database.Database,
    params: {
      todoItemId: number;
      calendarEventId: number;
      syncType: TodoCalendarSyncType;
      recurrenceDate?: number | null;
    }
  ): TodoCalendarMapping {
    const existing = this.getMappingByTodoAndDate(db, {
      todoItemId: params.todoItemId,
      recurrenceDate: params.recurrenceDate,
    });

    if (existing) {
      // 更新现有映射
      db.prepare(
        `UPDATE todo_calendar_mapping SET calendar_event_id = ?, sync_type = ? WHERE id = ?`
      ).run(params.calendarEventId, params.syncType, existing.id);

      const row = db.prepare(`SELECT * FROM todo_calendar_mapping WHERE id = ?`).get(existing.id);
      return this.parse(row);
    }

    return this.createMapping(db, params);
  }
}
