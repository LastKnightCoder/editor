import Database from "better-sqlite3";
import { TodoCalendarMapping, TodoCalendarSyncType } from "@/types";

export default class TodoCalendarMappingTable {
  static initTable(db: Database.Database) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS todo_calendar_mapping (
        id INTEGER PRIMARY KEY,
        todo_item_id INTEGER NOT NULL,
        calendar_event_id INTEGER NOT NULL,
        sync_type TEXT NOT NULL,
        recurrence_date INTEGER,
        create_time INTEGER NOT NULL,
        UNIQUE(todo_item_id, calendar_event_id, recurrence_date)
      );`,
    );

    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_calendar_mapping_todo ON todo_calendar_mapping(todo_item_id);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_calendar_mapping_event ON todo_calendar_mapping(calendar_event_id);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_calendar_mapping_type ON todo_calendar_mapping(sync_type);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_calendar_mapping_recurrence_date ON todo_calendar_mapping(recurrence_date);`,
    );
  }

  static upgradeTable(_db: Database.Database) {
    // no-op for now
  }

  static getListenEvents() {
    return {
      "todo:get-calendar-mappings-by-todo": this.getMappingsByTodoId.bind(this),
      "todo:get-calendar-mapping-by-event": this.getMappingByEventId.bind(this),
      "todo:create-calendar-mapping": this.createMapping.bind(this),
      "todo:delete-calendar-mapping": this.deleteMapping.bind(this),
      "todo:delete-calendar-mappings-by-todo":
        this.deleteMappingsByTodoId.bind(this),
      "todo:delete-calendar-mappings-by-event":
        this.deleteMappingsByEventId.bind(this),
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
    params: { todoItemId: number },
  ): TodoCalendarMapping[] {
    const rows = db
      .prepare(`SELECT * FROM todo_calendar_mapping WHERE todo_item_id = ?`)
      .all(params.todoItemId) as any[];
    return rows.map(this.parse);
  }

  // 根据日历事件 ID 获取映射
  static getMappingByEventId(
    db: Database.Database,
    params: { calendarEventId: number },
  ): TodoCalendarMapping | null {
    const row = db
      .prepare(
        `SELECT * FROM todo_calendar_mapping WHERE calendar_event_id = ?`,
      )
      .get(params.calendarEventId);
    return row ? this.parse(row) : null;
  }

  // 根据待办项 ID 和周期日期获取映射
  static getMappingByTodoAndDate(
    db: Database.Database,
    params: { todoItemId: number; recurrenceDate?: number | null },
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
    },
  ): TodoCalendarMapping {
    const now = Date.now();

    const stmt = db.prepare(
      `INSERT INTO todo_calendar_mapping (todo_item_id, calendar_event_id, sync_type, recurrence_date, create_time)
       VALUES (?, ?, ?, ?, ?)`,
    );

    const res = stmt.run(
      params.todoItemId,
      params.calendarEventId,
      params.syncType,
      params.recurrenceDate ?? null,
      now,
    );

    const id = Number(res.lastInsertRowid);
    const row = db
      .prepare(`SELECT * FROM todo_calendar_mapping WHERE id = ?`)
      .get(id);
    return this.parse(row);
  }

  // 删除单个映射
  static deleteMapping(db: Database.Database, params: { id: number }): number {
    const res = db
      .prepare(`DELETE FROM todo_calendar_mapping WHERE id = ?`)
      .run(params.id);
    return res.changes;
  }

  // 删除待办项的所有映射
  static deleteMappingsByTodoId(
    db: Database.Database,
    params: { todoItemId: number },
  ): number {
    const res = db
      .prepare(`DELETE FROM todo_calendar_mapping WHERE todo_item_id = ?`)
      .run(params.todoItemId);
    return res.changes;
  }

  // 删除日历事件的映射
  static deleteMappingsByEventId(
    db: Database.Database,
    params: { calendarEventId: number },
  ): number {
    const res = db
      .prepare(`DELETE FROM todo_calendar_mapping WHERE calendar_event_id = ?`)
      .run(params.calendarEventId);
    return res.changes;
  }

  // 获取日历事件 ID 列表
  static getEventIdsByTodoId(
    db: Database.Database,
    todoItemId: number,
  ): number[] {
    const rows = db
      .prepare(
        `SELECT calendar_event_id FROM todo_calendar_mapping WHERE todo_item_id = ?`,
      )
      .all(todoItemId) as Array<{ calendar_event_id: number }>;
    return rows.map((r) => r.calendar_event_id);
  }

  // 获取待办项 ID
  static getTodoIdByEventId(
    db: Database.Database,
    calendarEventId: number,
  ): number | null {
    const row = db
      .prepare(
        `SELECT todo_item_id FROM todo_calendar_mapping WHERE calendar_event_id = ?`,
      )
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
    },
  ): TodoCalendarMapping {
    const existing = this.getMappingByTodoAndDate(db, {
      todoItemId: params.todoItemId,
      recurrenceDate: params.recurrenceDate,
    });

    if (existing) {
      // 更新现有映射
      db.prepare(
        `UPDATE todo_calendar_mapping SET calendar_event_id = ?, sync_type = ? WHERE id = ?`,
      ).run(params.calendarEventId, params.syncType, existing.id);

      const row = db
        .prepare(`SELECT * FROM todo_calendar_mapping WHERE id = ?`)
        .get(existing.id);
      return this.parse(row);
    }

    return this.createMapping(db, params);
  }
}
