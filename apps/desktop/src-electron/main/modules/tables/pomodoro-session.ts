import Database from "better-sqlite3";
import type {
  PauseSpan,
  PomodoroBindTarget,
  PomodoroEventBinding,
  PomodoroFocusSummary,
  PomodoroSession,
  PomodoroStatus,
} from "@/types";
import { Notification } from "electron";
import CalendarGroupTable from "./calendar-group";
import CalendarTable from "./calendar";
import CalendarEventTable from "./calendar-event";
import PomodoroPresetTable from "./pomodoro-preset";
import PomodoroCalendarMappingTable from "./pomodoro-calendar-mapping";
import TodoCalendarMappingTable from "./todo-calendar-mapping";

export type { PauseSpan, PomodoroSession, PomodoroStatus } from "@/types";

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
  bound_event_id: number | null;
  bound_todo_id: number | null;
  bound_title: string | null;
}

/** 会话上的绑定三列 */
export interface PomodoroBinding {
  boundEventId?: number;
  boundTodoId?: number;
  boundTitle?: string;
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
  boundEventId: row.bound_event_id ?? undefined,
  boundTodoId: row.bound_todo_id ?? undefined,
  boundTitle: row.bound_title ?? undefined,
});

/** 番茄写入日历的标题：有绑定用绑定标题，否则用预设名 */
export function pomodoroEventTitle(boundTitle: string | undefined, presetName: string): string {
  return `🍅 ${boundTitle || presetName}`;
}

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
export function splitCrossDaySession(
  startTimeMs: number,
  endTimeMs: number
): CalendarEventSegment[] {
  const startDate = new Date(startTimeMs);
  const endDate = new Date(endTimeMs);

  // 获取开始日期的午夜时间戳
  const startDayTimestamp = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate()
  ).getTime();

  // 获取结束日期的午夜时间戳
  const endDayTimestamp = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate()
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
  const firstDayStartMinutes = startDate.getHours() * 60 + startDate.getMinutes();
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
  static upgradeTable(db: Database.Database): void {
    // 绑定三列：必须在「番茄钟日历已存在就返回」之前补齐
    const columns = (db.pragma("table_info(pomodoro_sessions)") as Array<{ name: string }>).map(
      c => c.name
    );
    for (const [name, type] of [
      ["bound_event_id", "INTEGER"],
      ["bound_todo_id", "INTEGER"],
      ["bound_title", "TEXT"],
    ] as const) {
      if (!columns.includes(name)) {
        db.exec(`ALTER TABLE pomodoro_sessions ADD COLUMN ${name} ${type}`);
      }
    }

    // 迁移番茄钟记录到日历
    try {
      // 1. 获取或创建系统分组
      const systemGroup = CalendarGroupTable.getSystemGroup(db);

      // 2. 检查是否已经存在"番茄钟"日历
      const existingCalendar = db
        .prepare("SELECT id, group_id FROM calendar WHERE title = ?")
        .get("番茄钟") as { id: number; group_id: number } | undefined;

      if (existingCalendar) {
        // 如果日历已存在，确保它在系统分组下
        if (existingCalendar.group_id !== systemGroup.id) {
          db.prepare("UPDATE calendar SET group_id = ? WHERE id = ?").run(
            systemGroup.id,
            existingCalendar.id
          );
          console.log(`Moved pomodoro calendar to system group (id: ${systemGroup.id})`);
        }
        // 已经迁移过，跳过会话迁移
        return;
      }

      // 3. 创建"番茄钟"日历
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
           ORDER BY start_time ASC`
        )
        .all() as PomodoroSessionRow[];

      console.log(`Migrating ${sessions.length} pomodoro sessions to calendar...`);

      // 4. 为每个会话创建对应的日历事件
      for (const sessionRow of sessions) {
        try {
          // 获取预设名称
          let presetName = "未知";
          try {
            const preset = PomodoroPresetTable.getById(db, sessionRow.preset_id);
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
          const segments = splitCrossDaySession(sessionRow.start_time, sessionRow.end_time!);

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
            PomodoroCalendarMappingTable.createMappings(db, sessionRow.id, eventIds);
          }
        } catch (e) {
          console.error(`Failed to migrate pomodoro session ${sessionRow.id}:`, e);
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
      "pomodoro:update-session": this.updateSession.bind(this),
      "pomodoro:summary-by-todo": this.summaryByTodo.bind(this),
      "pomodoro:get-event-bindings": this.getEventBindings.bind(this),
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
    } & PomodoroBinding
  ): PomodoroSession {
    const now = Date.now();

    // 直接插入完成的 session
    db.prepare(
      `INSERT INTO pomodoro_sessions (preset_id, start_time, end_time, expected_ms, focus_ms, pause_total_ms, pause_count, pauses, status, create_time, update_time, bound_event_id, bound_todo_id, bound_title)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      session.boundEventId ?? null,
      session.boundTodoId ?? null,
      session.boundTitle ?? null
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
    const row = db.prepare(`SELECT * FROM pomodoro_sessions WHERE id = ?`).get(id) as
      PomodoroSessionRow | undefined;
    return row ? parse(row) : null;
  }

  static listSessions(
    db: Database.Database,
    params: {
      presetId?: number;
      start?: number;
      end?: number;
      limit?: number;
      offset?: number;
      status?: PomodoroStatus;
    }
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
    const limitValue = params.limit !== undefined ? Math.max(0, Math.floor(params.limit)) : null;
    const offsetValue = params.offset !== undefined ? Math.max(0, Math.floor(params.offset)) : null;
    const limitClause =
      limitValue !== null ? ` LIMIT ${limitValue}` : offsetValue !== null ? " LIMIT -1" : "";
    const offsetClause = offsetValue !== null ? ` OFFSET ${offsetValue}` : "";
    const rows = db
      .prepare(
        `SELECT * FROM pomodoro_sessions ${where} ORDER BY start_time DESC${limitClause}${offsetClause}`
      )
      .all(...values) as PomodoroSessionRow[];
    return rows.map(parse);
  }

  /** 系统分组下的「番茄钟」日历；只读，不创建 */
  static getPomodoroCalendarId(db: Database.Database): number | null {
    const row = db
      .prepare(
        `SELECT c.id FROM calendar c JOIN calendar_group g ON c.group_id = g.id
         WHERE c.title = '番茄钟' AND g.is_system = 1 AND g.parent_group_id IS NULL
         ORDER BY c.id LIMIT 1`
      )
      .get() as { id: number } | undefined;
    return row?.id ?? null;
  }

  /** 绑定对象 → 三列；绑定待办来源事件时反查待办 */
  static resolveBinding(
    db: Database.Database,
    target: PomodoroBindTarget | null | undefined
  ): PomodoroBinding {
    if (!target) return {};
    if (target.kind === "todo") {
      const todo = db.prepare("SELECT title FROM todo_item WHERE id = ?").get(target.todoId) as
        { title: string } | undefined;
      if (!todo) throw new Error(`Todo ${target.todoId} not found`);
      return { boundTodoId: target.todoId, boundTitle: todo.title };
    }
    const event = db
      .prepare("SELECT title, calendar_id FROM calendar_event WHERE id = ?")
      .get(target.eventId) as { title: string; calendar_id: number } | undefined;
    if (!event) throw new Error(`Calendar event ${target.eventId} not found`);
    if (event.calendar_id === this.getPomodoroCalendarId(db)) {
      throw new Error("Cannot bind a pomodoro event");
    }
    const todoId = TodoCalendarMappingTable.getTodoIdByEventId(db, target.eventId);
    return {
      boundEventId: target.eventId,
      boundTodoId: todoId ?? undefined,
      boundTitle: event.title,
    };
  }

  /** 结束时刷新标题：对象仍在取最新标题（待办优先，事件 id 可能被移动端重建换掉），否则保留快照 */
  static refreshBinding(db: Database.Database, binding: PomodoroBinding): PomodoroBinding {
    const fresh = (sql: string, id?: number) =>
      id === undefined
        ? undefined
        : (db.prepare(sql).get(id) as { title: string } | undefined)?.title;
    const title =
      fresh("SELECT title FROM todo_item WHERE id = ?", binding.boundTodoId) ??
      fresh("SELECT title FROM calendar_event WHERE id = ?", binding.boundEventId) ??
      binding.boundTitle;
    return { ...binding, boundTitle: title };
  }

  /** 为已落库的会话写「番茄钟」日历事件（跨天切段）与映射；日历缺失时跳过 */
  static writeCalendarEvents(db: Database.Database, sessionId: number): number[] {
    const session = this.getById(db, sessionId);
    const calendarId = this.getPomodoroCalendarId(db);
    if (!session?.endTime || calendarId === null) {
      if (calendarId === null) console.error("Pomodoro calendar not found");
      return [];
    }
    const presetName = PomodoroPresetTable.getById(db, session.presetId)?.name ?? "未知";
    const title = pomodoroEventTitle(session.boundTitle, presetName);
    const eventIds = splitCrossDaySession(session.startTime, session.endTime).map(
      segment =>
        CalendarEventTable.createEvent(db, {
          calendarId,
          title,
          detailContentId: 0,
          startDate: segment.startDate,
          endDate: segment.endDate,
          startTime: segment.startTime,
          endTime: segment.endTime,
          allDay: false,
          color: null,
        }).id
    );
    if (eventIds.length > 0) {
      PomodoroCalendarMappingTable.createMappings(db, sessionId, eventIds);
    }
    return eventIds;
  }

  static summaryByTodo(db: Database.Database, todoId: number): PomodoroFocusSummary {
    const row = db
      .prepare(
        `SELECT COUNT(*) as c, COALESCE(SUM(focus_ms), 0) as s FROM pomodoro_sessions
         WHERE bound_todo_id = ? AND end_time IS NOT NULL`
      )
      .get(todoId) as { c: number; s: number };
    return { count: row.c || 0, focusMs: row.s || 0 };
  }

  /** 番茄自身生成的日历事件 → 所属会话的绑定（日程画专注条用） */
  static getEventBindings(
    db: Database.Database,
    params: { calendarEventIds: number[] }
  ): Record<number, PomodoroEventBinding> {
    const ids = params.calendarEventIds;
    const result: Record<number, PomodoroEventBinding> = {};
    if (ids.length === 0) return result;
    const rows = db
      .prepare(
        `SELECT m.calendar_event_id as eventId, s.id as sessionId,
                s.bound_event_id as boundEventId, s.bound_todo_id as boundTodoId
         FROM pomodoro_calendar_mapping m JOIN pomodoro_sessions s ON s.id = m.pomodoro_session_id
         WHERE m.calendar_event_id IN (${ids.map(() => "?").join(",")})`
      )
      .all(...ids) as Array<PomodoroEventBinding & { eventId: number }>;
    for (const { eventId, ...binding } of rows) result[eventId] = binding;
    return result;
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
        `SELECT focus_ms FROM pomodoro_sessions WHERE end_time IS NOT NULL AND end_time >= ? AND end_time <= ?`
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
        `SELECT COUNT(*) as c, COALESCE(SUM(focus_ms),0) as s FROM pomodoro_sessions WHERE end_time IS NOT NULL`
      )
      .get() as { c: number; s: number };
    return { count: row.c || 0, focusMs: row.s || 0 };
  }

  static deleteSession(db: Database.Database, sessionId: number): number {
    try {
      // 1. 获取关联的日历事件 ID
      const eventIds = PomodoroCalendarMappingTable.getEventsBySessionId(db, sessionId);

      // 2. 删除所有关联的日历事件
      for (const eventId of eventIds) {
        try {
          CalendarEventTable.deleteEvent(db, eventId);
        } catch (e) {
          console.error(`Failed to delete calendar event ${eventId} for session ${sessionId}:`, e);
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

  static updateSession(
    db: Database.Database,
    params: { sessionId: number; focusMs: number }
  ): PomodoroSession {
    const { sessionId, focusMs } = params;

    // 1. 获取原有 session 数据
    const existingSession = this.getById(db, sessionId);
    if (!existingSession) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!existingSession.endTime) {
      throw new Error(`Cannot update running session ${sessionId}`);
    }

    // 2. 从后向前处理暂停记录，计算有效的暂停
    const validPauses: PauseSpan[] = [];
    let pauseTotalMs = 0;

    // 计算新的结束时间（不包括暂停）
    let newEndTime = existingSession.startTime + focusMs;

    // 从后向前遍历暂停记录，只保留在新结束时间之前的暂停
    for (const pause of existingSession.pauses) {
      if (pause.start < newEndTime && pause.end) {
        // 暂停开始在新结束时间之前
        const pauseEnd = Math.min(pause.end, newEndTime);
        const pauseDuration = pauseEnd - pause.start;

        if (pauseDuration > 0) {
          validPauses.push({ start: pause.start, end: pauseEnd });
          pauseTotalMs += pauseDuration;
          // 延长结束时间以补偿暂停
          newEndTime += pauseDuration;
        }
      }
    }

    const pauseCount = validPauses.length;
    const now = Date.now();

    // 3. 获取关联的日历事件并删除
    const eventIds = PomodoroCalendarMappingTable.getEventsBySessionId(db, sessionId);

    for (const eventId of eventIds) {
      try {
        CalendarEventTable.deleteEvent(db, eventId);
      } catch (e) {
        console.error(`Failed to delete calendar event ${eventId} for session ${sessionId}:`, e);
      }
    }

    // 4. 删除旧的映射关系
    PomodoroCalendarMappingTable.deleteBySessionId(db, sessionId);

    // 5. 更新数据库中的 session 记录
    db.prepare(
      `UPDATE pomodoro_sessions 
       SET focus_ms = ?, 
           end_time = ?, 
           pause_total_ms = ?, 
           pause_count = ?, 
           pauses = ?, 
           update_time = ?
       WHERE id = ?`
    ).run(
      focusMs,
      newEndTime,
      pauseTotalMs,
      pauseCount,
      JSON.stringify(validPauses),
      now,
      sessionId
    );

    // 6. 按同一标题规则重建日历事件
    this.writeCalendarEvents(db, sessionId);

    // 7. 返回更新后的 session
    const updatedSession = this.getById(db, sessionId);
    if (!updatedSession) {
      throw new Error("Failed to fetch updated session");
    }

    return updatedSession;
  }
}

export default PomodoroSessionTable;
