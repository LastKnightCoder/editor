import Database from "better-sqlite3";
import { Notification } from "electron";
import CalendarGroupTable from "./calendar-group";
import CalendarTable from "./calendar";
import CalendarEventTable from "./calendar-event";
import PomodoroPresetTable from "./pomodoro-preset";
import PomodoroCalendarMappingTable from "./pomodoro-calendar-mapping";

export type PomodoroStatus =
  | "running"
  | "paused"
  | "completed"
  | "stopped"
  | "aborted";

export interface PauseSpan {
  start: number;
  end?: number;
}

export interface PomodoroSessionRow {
  id: number;
  preset_id: number;
  start_time: number;
  end_time: number | null;
  expected_ms: number | null;
  focus_ms: number;
  pause_total_ms: number;
  pause_count: number;
  pauses: string; // JSON
  status: PomodoroStatus;
  create_time: number;
  update_time: number;
}

export interface PomodoroSession {
  id: number;
  presetId: number;
  startTime: number;
  endTime?: number;
  expectedMs?: number;
  focusMs: number;
  pauseTotalMs: number;
  pauseCount: number;
  pauses: PauseSpan[];
  status: PomodoroStatus;
  createTime: number;
  updateTime: number;
}

const parse = (row: PomodoroSessionRow): PomodoroSession => ({
  id: row.id,
  presetId: row.preset_id,
  startTime: row.start_time,
  endTime: row.end_time ?? undefined,
  expectedMs: row.expected_ms ?? undefined,
  focusMs: row.focus_ms,
  pauseTotalMs: row.pause_total_ms,
  pauseCount: row.pause_count,
  pauses: JSON.parse(row.pauses || "[]"),
  status: row.status,
  createTime: row.create_time,
  updateTime: row.update_time,
});

interface CalendarEventSegment {
  startDate: number; // 开始日期时间戳
  endDate: number | null; // 结束日期时间戳（可能为null表示同一天）
  startTime: number; // 开始时间（分钟数 0-1439）
  endTime: number; // 结束时间（分钟数 0-1439）
}

/**
 * 将可能跨天的番茄钟会话分割成多个日历事件段
 * @param startTimeMs 开始时间戳（毫秒）
 * @param endTimeMs 结束时间戳（毫秒）
 * @returns 事件段数组
 */
function splitCrossDaySession(
  startTimeMs: number,
  endTimeMs: number,
): CalendarEventSegment[] {
  const startDate = new Date(startTimeMs);
  const endDate = new Date(endTimeMs);

  // 获取开始日期的午夜时间戳
  const startDayTimestamp = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
  ).getTime();

  // 获取结束日期的午夜时间戳
  const endDayTimestamp = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate(),
  ).getTime();

  // 如果在同一天
  if (startDayTimestamp === endDayTimestamp) {
    const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
    const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();

    return [
      {
        startDate: startDayTimestamp,
        endDate: null,
        startTime: startMinutes,
        endTime: endMinutes,
      },
    ];
  }

  // 跨天情况，需要分割
  const segments: CalendarEventSegment[] = [];

  // 第一天：从开始时间到 23:59
  const firstDayStartMinutes =
    startDate.getHours() * 60 + startDate.getMinutes();
  segments.push({
    startDate: startDayTimestamp,
    endDate: startDayTimestamp,
    startTime: firstDayStartMinutes,
    endTime: 1439, // 23:59
  });

  // 中间的完整天（如果有）
  let currentDayTimestamp = startDayTimestamp + 24 * 60 * 60 * 1000;
  while (currentDayTimestamp < endDayTimestamp) {
    segments.push({
      startDate: currentDayTimestamp,
      endDate: currentDayTimestamp,
      startTime: 0, // 00:00
      endTime: 1439, // 23:59
    });
    currentDayTimestamp += 24 * 60 * 60 * 1000;
  }

  // 最后一天：从 00:00 到结束时间
  const lastDayEndMinutes = endDate.getHours() * 60 + endDate.getMinutes();
  segments.push({
    startDate: endDayTimestamp,
    endDate: endDayTimestamp,
    startTime: 0, // 00:00
    endTime: lastDayEndMinutes,
  });

  return segments;
}

class PomodoroSessionTable {
  static initTable(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pomodoro_sessions (
        id INTEGER PRIMARY KEY,
        preset_id INTEGER NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        expected_ms INTEGER,
        focus_ms INTEGER NOT NULL DEFAULT 0,
        pause_total_ms INTEGER NOT NULL DEFAULT 0,
        pause_count INTEGER NOT NULL DEFAULT 0,
        pauses TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
    `);

    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_session_status ON pomodoro_sessions(status);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_session_start ON pomodoro_sessions(start_time);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_session_preset ON pomodoro_sessions(preset_id);`,
    );
  }

  static upgradeTable(db: Database.Database): void {
    // 迁移番茄钟记录到日历
    try {
      // 检查是否已经迁移过（通过检查是否存在名为"番茄钟"的日历）
      const existingCalendar = db
        .prepare("SELECT id FROM calendar WHERE title = ?")
        .get("番茄钟");

      if (existingCalendar) {
        // 已经迁移过，跳过
        return;
      }

      // 1. 获取或创建系统分组
      const systemGroup = CalendarGroupTable.getSystemGroup(db);

      // 2. 创建"番茄钟"日历
      const pomodoroCalendar = CalendarTable.createCalendar(db, {
        title: "番茄钟",
        color: "red" as any,
        descriptionContentId: 0,
        archived: false,
        pinned: false,
        visible: true,
        orderIndex: 0,
        groupId: systemGroup.id,
      });

      // 3. 查询所有已完成的番茄钟会话
      const sessions = db
        .prepare(
          `SELECT * FROM pomodoro_sessions 
           WHERE (status = 'completed' OR status = 'stopped') 
           AND end_time IS NOT NULL
           ORDER BY start_time ASC`,
        )
        .all() as PomodoroSessionRow[];

      console.log(
        `Migrating ${sessions.length} pomodoro sessions to calendar...`,
      );

      // 4. 为每个会话创建对应的日历事件
      for (const sessionRow of sessions) {
        try {
          // 获取预设名称
          let presetName = "未知";
          try {
            const preset = PomodoroPresetTable.getById(
              db,
              sessionRow.preset_id,
            );
            if (preset) {
              presetName = preset.name;
            }
          } catch (e) {
            // 预设可能已被删除
          }

          // 计算实际专注分钟数
          const focusMinutes = Math.round(sessionRow.focus_ms / 60000);

          // 生成标题
          const title = `专注 ${presetName} ${focusMinutes} 分钟`;

          // 分割跨天会话
          const segments = splitCrossDaySession(
            sessionRow.start_time,
            sessionRow.end_time!,
          );

          // 为每个段创建日历事件并建立映射关系
          const eventIds: number[] = [];
          for (const segment of segments) {
            const event = CalendarEventTable.createEvent(db, {
              calendarId: pomodoroCalendar.id,
              title,
              detailContentId: 0,
              startDate: segment.startDate,
              endDate: segment.endDate,
              startTime: segment.startTime,
              endTime: segment.endTime,
              allDay: false,
              color: null,
            });
            eventIds.push(event.id);
          }

          // 创建映射关系
          if (eventIds.length > 0) {
            PomodoroCalendarMappingTable.createMappings(
              db,
              sessionRow.id,
              eventIds,
            );
          }
        } catch (e) {
          console.error(
            `Failed to migrate pomodoro session ${sessionRow.id}:`,
            e,
          );
        }
      }

      console.log("Pomodoro sessions migration completed");
    } catch (e) {
      console.error("Failed to migrate pomodoro sessions:", e);
      // 不抛出异常，避免阻塞数据库初始化
    }
  }

  static getListenEvents() {
    return {
      "pomodoro:list-sessions": this.listSessions.bind(this),
      "pomodoro:summary-today": this.summaryToday.bind(this),
      "pomodoro:summary-total": this.summaryTotal.bind(this),
      "pomodoro:delete-session": this.deleteSession.bind(this),
      "pomodoro:delete-sessions": this.deleteSessions.bind(this),
    } as const;
  }

  static insertCompletedSession(
    db: Database.Database,
    session: {
      presetId: number;
      startTime: number;
      endTime: number;
      expectedMs?: number;
      focusMs: number;
      pauseTotalMs: number;
      pauseCount: number;
      pauses: PauseSpan[];
      status: "completed" | "stopped";
    },
  ): PomodoroSession {
    const now = Date.now();

    // 直接插入完成的 session
    db.prepare(
      `INSERT INTO pomodoro_sessions (preset_id, start_time, end_time, expected_ms, focus_ms, pause_total_ms, pause_count, pauses, status, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      session.presetId,
      session.startTime,
      session.endTime,
      session.expectedMs ?? null,
      session.focusMs,
      session.pauseTotalMs,
      session.pauseCount,
      JSON.stringify(session.pauses),
      session.status,
      now,
      now,
    );

    const inserted = db.prepare(`SELECT last_insert_rowid() as id`).get() as {
      id: number | bigint;
    };
    const id = Number(inserted.id);

    // 发送系统通知
    try {
      const title = session.status === "completed" ? "番茄完成" : "专注结束";
      const body = `专注 ${Math.round(session.focusMs / 60000)} 分钟`;
      new Notification({ title, body }).show();
    } catch (_e) {
      // ignore
    }

    const res = this.getById(db, id);
    if (!res) throw new Error("failed to fetch inserted pomodoro session");
    return res;
  }

  static getById(db: Database.Database, id: number): PomodoroSession | null {
    const row = db
      .prepare(`SELECT * FROM pomodoro_sessions WHERE id = ?`)
      .get(id) as PomodoroSessionRow | undefined;
    return row ? parse(row) : null;
  }

  static listSessions(
    db: Database.Database,
    params: {
      presetId?: number;
      start?: number;
      end?: number;
      limit?: number;
      status?: PomodoroStatus;
    },
  ): PomodoroSession[] {
    const clauses: string[] = [];
    const values: (number | string)[] = [];
    if (params.presetId !== undefined) {
      clauses.push("preset_id = ?");
      values.push(params.presetId);
    }
    if (params.status) {
      clauses.push("status = ?");
      values.push(params.status);
    }
    if (params.start) {
      clauses.push("start_time >= ?");
      values.push(params.start);
    }
    if (params.end) {
      clauses.push("start_time < ?");
      values.push(params.end);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = params.limit ? `LIMIT ${params.limit}` : "";
    const rows = db
      .prepare(
        `SELECT * FROM pomodoro_sessions ${where} ORDER BY start_time DESC ${limit}`,
      )
      .all(...values) as PomodoroSessionRow[];
    return rows.map(parse);
  }

  static summaryToday(db: Database.Database): {
    count: number;
    focusMs: number;
  } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const rows = db
      .prepare(
        `SELECT focus_ms FROM pomodoro_sessions WHERE end_time IS NOT NULL AND end_time >= ? AND end_time <= ?`,
      )
      .all(start.getTime(), end.getTime()) as Array<{ focus_ms: number }>;
    return {
      count: rows.length,
      focusMs: rows.reduce((a, b) => a + (b.focus_ms || 0), 0),
    };
  }

  static summaryTotal(db: Database.Database): {
    count: number;
    focusMs: number;
  } {
    const row = db
      .prepare(
        `SELECT COUNT(*) as c, COALESCE(SUM(focus_ms),0) as s FROM pomodoro_sessions WHERE end_time IS NOT NULL`,
      )
      .get() as { c: number; s: number };
    return { count: row.c || 0, focusMs: row.s || 0 };
  }

  static deleteSession(db: Database.Database, sessionId: number): number {
    try {
      // 1. 获取关联的日历事件 ID
      const eventIds = PomodoroCalendarMappingTable.getEventsBySessionId(
        db,
        sessionId,
      );

      // 2. 删除所有关联的日历事件
      for (const eventId of eventIds) {
        try {
          CalendarEventTable.deleteEvent(db, eventId);
        } catch (e) {
          console.error(
            `Failed to delete calendar event ${eventId} for session ${sessionId}:`,
            e,
          );
          // 继续删除其他事件
        }
      }

      // 3. 删除映射关系
      PomodoroCalendarMappingTable.deleteBySessionId(db, sessionId);

      // 4. 删除会话记录
      const stmt = db.prepare("DELETE FROM pomodoro_sessions WHERE id = ?");
      const result = stmt.run(sessionId);

      return result.changes;
    } catch (e) {
      console.error(`Failed to delete pomodoro session ${sessionId}:`, e);
      throw e;
    }
  }

  static deleteSessions(db: Database.Database, sessionIds: number[]): number {
    let totalDeleted = 0;
    for (const sessionId of sessionIds) {
      try {
        const deleted = this.deleteSession(db, sessionId);
        totalDeleted += deleted;
      } catch (e) {
        console.error(`Failed to delete session ${sessionId}:`, e);
        // 继续删除其他会话
      }
    }
    return totalDeleted;
  }
}

export default PomodoroSessionTable;
