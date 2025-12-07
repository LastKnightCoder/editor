import Database from "better-sqlite3";

export interface PomodoroCalendarMappingRow {
  id: number;
  pomodoro_session_id: number;
  calendar_event_id: number;
  create_time: number;
}

export interface PomodoroCalendarMapping {
  id: number;
  pomodoroSessionId: number;
  calendarEventId: number;
  createTime: number;
}

const parse = (row: PomodoroCalendarMappingRow): PomodoroCalendarMapping => ({
  id: row.id,
  pomodoroSessionId: row.pomodoro_session_id,
  calendarEventId: row.calendar_event_id,
  createTime: row.create_time,
});

export default class PomodoroCalendarMappingTable {
  static initTable(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pomodoro_calendar_mapping (
        id INTEGER PRIMARY KEY,
        pomodoro_session_id INTEGER NOT NULL,
        calendar_event_id INTEGER NOT NULL,
        create_time INTEGER NOT NULL,
        UNIQUE(pomodoro_session_id, calendar_event_id)
      );
    `);

    // 添加索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_mapping_session ON pomodoro_calendar_mapping(pomodoro_session_id);
      CREATE INDEX IF NOT EXISTS idx_mapping_event ON pomodoro_calendar_mapping(calendar_event_id);
    `);
  }

  static upgradeTable(_db: Database.Database): void {
    // 暂无迁移
  }

  static getListenEvents() {
    return {
      "pomodoro-calendar:get-events-by-session":
        this.getEventsBySessionId.bind(this),
      "pomodoro-calendar:get-session-by-event":
        this.getSessionByEventId.bind(this),
      "pomodoro-calendar:delete-by-session": this.deleteBySessionId.bind(this),
      "pomodoro-calendar:delete-by-event": this.deleteByEventId.bind(this),
    } as const;
  }

  /**
   * 创建映射关系
   */
  static createMapping(
    db: Database.Database,
    pomodoroSessionId: number,
    calendarEventId: number,
  ): PomodoroCalendarMapping {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO pomodoro_calendar_mapping (pomodoro_session_id, calendar_event_id, create_time)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(pomodoroSessionId, calendarEventId, now);
    const id = Number(result.lastInsertRowid);

    const row = db
      .prepare("SELECT * FROM pomodoro_calendar_mapping WHERE id = ?")
      .get(id) as PomodoroCalendarMappingRow;

    return parse(row);
  }

  /**
   * 批量创建映射关系
   */
  static createMappings(
    db: Database.Database,
    pomodoroSessionId: number,
    calendarEventIds: number[],
  ): PomodoroCalendarMapping[] {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO pomodoro_calendar_mapping (pomodoro_session_id, calendar_event_id, create_time)
      VALUES (?, ?, ?)
    `);

    const mappings: PomodoroCalendarMapping[] = [];
    for (const eventId of calendarEventIds) {
      try {
        const result = stmt.run(pomodoroSessionId, eventId, now);
        const id = Number(result.lastInsertRowid);
        const row = db
          .prepare("SELECT * FROM pomodoro_calendar_mapping WHERE id = ?")
          .get(id) as PomodoroCalendarMappingRow;
        mappings.push(parse(row));
      } catch (e) {
        // 忽略重复插入错误
        console.warn(
          `Failed to create mapping for session ${pomodoroSessionId} and event ${eventId}`,
        );
      }
    }

    return mappings;
  }

  /**
   * 根据番茄钟会话 ID 获取所有关联的日历事件 ID
   */
  static getEventsBySessionId(
    db: Database.Database,
    pomodoroSessionId: number,
  ): number[] {
    const rows = db
      .prepare(
        "SELECT calendar_event_id FROM pomodoro_calendar_mapping WHERE pomodoro_session_id = ?",
      )
      .all(pomodoroSessionId) as Array<{ calendar_event_id: number }>;

    return rows.map((row) => row.calendar_event_id);
  }

  /**
   * 根据日历事件 ID 获取关联的番茄钟会话 ID
   */
  static getSessionByEventId(
    db: Database.Database,
    calendarEventId: number,
  ): number | null {
    const row = db
      .prepare(
        "SELECT pomodoro_session_id FROM pomodoro_calendar_mapping WHERE calendar_event_id = ?",
      )
      .get(calendarEventId) as { pomodoro_session_id: number } | undefined;

    return row ? row.pomodoro_session_id : null;
  }

  /**
   * 根据番茄钟会话 ID 删除所有映射
   */
  static deleteBySessionId(
    db: Database.Database,
    pomodoroSessionId: number,
  ): number {
    const stmt = db.prepare(
      "DELETE FROM pomodoro_calendar_mapping WHERE pomodoro_session_id = ?",
    );
    return stmt.run(pomodoroSessionId).changes;
  }

  /**
   * 根据日历事件 ID 删除映射
   */
  static deleteByEventId(
    db: Database.Database,
    calendarEventId: number,
  ): number {
    const stmt = db.prepare(
      "DELETE FROM pomodoro_calendar_mapping WHERE calendar_event_id = ?",
    );
    return stmt.run(calendarEventId).changes;
  }

  /**
   * 获取所有映射
   */
  static getAllMappings(db: Database.Database): PomodoroCalendarMapping[] {
    const rows = db
      .prepare("SELECT * FROM pomodoro_calendar_mapping")
      .all() as PomodoroCalendarMappingRow[];

    return rows.map(parse);
  }
}
