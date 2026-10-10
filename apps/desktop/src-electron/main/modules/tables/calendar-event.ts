import Database from "better-sqlite3";
import { CalendarEvent, CreateCalendarEvent, UpdateCalendarEvent } from "@/types/calendar";
import type { CreateTodoSchedule } from "@/types/calendar";
import Operation from "./operation";
import ContentTable from "./content";
import CalendarTable from "./calendar";
import TodoCalendarSyncTable from "./todo-calendar-sync";
import TodoItemTable from "./todo-item";
import log from "electron-log";
import { getMarkdown } from "@/utils/markdown.ts";
import { getNextTaskEntityId } from "./module-entity-id";

export default class CalendarEventTable {
  static getListenEvents() {
    return {
      "calendar-event:create": this.createEvent.bind(this),
      "calendar-event:create-for-todo": this.createEventForTodo.bind(this),
      "calendar-event:get-todo-schedules": this.getTodoSchedules.bind(this),
      "calendar-event:update": this.updateEvent.bind(this),
      "calendar-event:delete": this.deleteEvent.bind(this),
      "calendar-event:get-by-id": this.getEventById.bind(this),
      "calendar-event:get-by-calendar-id": this.getEventsByCalendarId.bind(this),
      "calendar-event:count-by-calendar-ids": this.countCalendarEvents.bind(this),
      "calendar-event:get-by-date-range": this.getEventsByDateRange.bind(this),
      "calendar-event:get-for-day": this.getEventsForDay.bind(this),
      "calendar-event:get-for-week": this.getEventsForWeek.bind(this),
      "calendar-event:get-for-month": this.getEventsForMonth.bind(this),
      "calendar-event:transfer-between-calendars": this.transferEventsBetweenCalendars.bind(this),
      "calendar-event:get-events-with-content": this.getEventsWithContent.bind(this),
    };
  }
  static parseCalendarEvent(row: any): CalendarEvent {
    const event: CalendarEvent = {
      id: row.id,
      createTime: row.create_time,
      updateTime: row.update_time,
      calendarId: row.calendar_id,
      title: row.title,
      detailContentId: row.detail_content_id || 0,
      startDate: row.start_date,
      endDate: row.end_date || null,
      startTime: row.start_time !== null ? row.start_time : null,
      endTime: row.end_time !== null ? row.end_time : null,
      color: row.color || null,
      allDay: Boolean(row.all_day),
      todoItemId: row.todo_item_id ?? null,
    };

    // 解析预加载的描述内容
    if (row.detail_content) {
      try {
        event.detailContent = JSON.parse(row.detail_content);
      } catch (error) {
        log.error("Failed to parse detail_content:", error);
      }
    }

    return event;
  }

  static createEvent(db: Database.Database, data: CreateCalendarEvent): CalendarEvent {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO calendar_event
      (id, create_time, update_time, calendar_id, title, detail_content_id, start_date, end_date, start_time, end_time, color, all_day, todo_item_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = stmt.run(
      getNextTaskEntityId(db, "calendar_event"),
      now,
      now,
      data.calendarId,
      data.title,
      data.detailContentId || 0,
      data.startDate,
      data.endDate || null,
      data.startTime !== null ? data.startTime : null,
      data.endTime !== null ? data.endTime : null,
      data.color || null,
      Number(data.allDay || false),
      data.todoItemId ?? null
    );

    Operation.insertOperation(db, "calendar_event", "insert", res.lastInsertRowid, now);

    return this.getEventById(db, Number(res.lastInsertRowid));
  }

  /** 默认用户日历：首个非系统分组、未归档的日历（与日程页补记同口径） */
  static getDefaultUserCalendarId(db: Database.Database): number | null {
    return (
      CalendarTable.getAllCalendars(db).find(c => !c.isInSystemGroup && !c.archived)?.id ?? null
    );
  }

  /** 新建待办的全天或定时安排（标题取待办，备注不与待办描述共用）。 */
  static createEventForTodo(db: Database.Database, data: CreateTodoSchedule): CalendarEvent {
    const todo = db.prepare("SELECT title FROM todo_item WHERE id = ?").get(data.todoItemId) as
      { title: string } | undefined;
    if (!todo) throw new Error(`Todo ${data.todoItemId} not found`);
    const calendarId = data.calendarId ?? this.getDefaultUserCalendarId(db);
    if (calendarId == null) throw new Error("NO_USER_CALENDAR: 请先创建一个日历");
    return this.createEvent(db, {
      calendarId,
      title: todo.title,
      detailContentId: 0,
      startDate: data.startDate,
      endDate: data.startDate,
      startTime: data.allDay ? null : data.startTime,
      endTime: data.allDay ? null : data.endTime,
      color: null,
      allDay: data.allDay ?? false,
      todoItemId: data.todoItemId,
    });
  }

  /**
   * 每条待办的安排：next = 尚未结束的最早一条（含进行中），last = 已结束的最近一条，count = 总条数。
   * 按 todo_item_id 索引取，每条待办的安排数量很小，排序在内存里做。
   */
  static getTodoSchedules(
    db: Database.Database,
    params: { todoItemIds: number[]; now: number }
  ): Record<number, { next?: CalendarEvent; last?: CalendarEvent; count: number }> {
    const result: Record<number, { next?: CalendarEvent; last?: CalendarEvent; count: number }> =
      {};
    const ids = [...new Set(params.todoItemIds)];
    const MINUTE = 60_000;
    const startOf = (e: CalendarEvent) =>
      e.startDate + (e.allDay ? 0 : (e.startTime ?? 0)) * MINUTE;
    const endOf = (e: CalendarEvent) =>
      (e.endDate ?? e.startDate) +
      (e.allDay ? 24 * 60 : (e.endTime ?? (e.startTime ?? 0) + 60)) * MINUTE;
    for (let i = 0; i < ids.length; i += 500) {
      const part = ids.slice(i, i + 500);
      const rows = db
        .prepare(
          `SELECT * FROM calendar_event WHERE todo_item_id IN (${part.map(() => "?").join(",")})`
        )
        .all(...part);
      for (const event of rows.map(row => this.parseCalendarEvent(row))) {
        const entry = (result[event.todoItemId!] ??= { count: 0 });
        entry.count += 1;
        if (endOf(event) > params.now) {
          if (!entry.next || startOf(event) < startOf(entry.next)) entry.next = event;
        } else if (!entry.last || startOf(event) > startOf(entry.last)) {
          entry.last = event;
        }
      }
    }
    return result;
  }

  static updateEvent(db: Database.Database, data: UpdateCalendarEvent): CalendarEvent {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE calendar_event SET
        update_time = ?,
        calendar_id = ?,
        title = ?,
        detail_content_id = ?,
        start_date = ?,
        end_date = ?,
        start_time = ?,
        end_time = ?,
        color = ?,
        all_day = ?
      WHERE id = ?
    `);

    stmt.run(
      now,
      data.calendarId,
      data.title,
      data.detailContentId || 0,
      data.startDate,
      data.endDate || null,
      data.startTime !== null ? data.startTime : null,
      data.endTime !== null ? data.endTime : null,
      data.color || null,
      Number(data.allDay || false),
      data.id
    );

    Operation.insertOperation(db, "calendar_event", "update", data.id, now);

    return this.getEventById(db, data.id);
  }

  static deleteEvent(db: Database.Database, id: number): number {
    // 删除关联的详情内容
    const event = this.getEventById(db, id);
    if (event && event.detailContentId) {
      ContentTable.deleteContent(db, event.detailContentId);
    }
    db.prepare("DELETE FROM doc_task_calendar_link WHERE calendar_event_id=?").run(id);
    db.prepare("DELETE FROM todo_schedule_occurrence WHERE calendar_event_id=?").run(id);

    const stmt = db.prepare("DELETE FROM calendar_event WHERE id = ?");
    Operation.insertOperation(db, "calendar_event", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  static getEventById(db: Database.Database, id: number): CalendarEvent {
    const stmt = db.prepare("SELECT * FROM calendar_event WHERE id = ?");
    const row = stmt.get(id);
    if (!row) {
      throw new Error(`CalendarEvent with id ${id} not found`);
    }
    return this.parseCalendarEvent(row);
  }

  static getEventsByCalendarId(db: Database.Database, calendarId: number): CalendarEvent[] {
    const stmt = db.prepare(
      "SELECT * FROM calendar_event WHERE calendar_id = ? ORDER BY start_date ASC, start_time ASC"
    );
    const rows = stmt.all(calendarId);
    return rows.map(row => this.parseCalendarEvent(row));
  }

  static countCalendarEvents(db: Database.Database, calendarIds: number[]): Record<number, number> {
    const ids = [...new Set(calendarIds.filter(Number.isSafeInteger))];
    if (!ids.length) return {};
    const counts: Record<number, number> = Object.fromEntries(ids.map(id => [id, 0]));
    const rows = db
      .prepare(
        `
      SELECT calendar_id AS id, COUNT(*) AS count FROM calendar_event
      WHERE calendar_id IN (${ids.map(() => "?").join(",")}) GROUP BY calendar_id
    `
      )
      .all(...ids) as { id: number; count: number }[];
    for (const row of rows) counts[row.id] = row.count;
    return counts;
  }

  static async getEventsByDateRange(
    db: Database.Database,
    startDate: number,
    endDate: number,
    calendarIds?: number[]
  ): Promise<CalendarEvent[]> {
    // 获取待办清单日历 ID
    const todoCalendars = TodoCalendarSyncTable.getTodoCalendars(db);
    const recurringCalendarId = todoCalendars.recurring;

    let query = `
      SELECT
        e.*,
        c.content as detail_content
      FROM calendar_event e
      LEFT JOIN contents c ON e.detail_content_id = c.id
      WHERE (
        (e.start_date >= ? AND e.start_date <= ?) OR
        (e.end_date IS NOT NULL AND e.end_date >= ? AND e.end_date <= ?) OR
        (e.end_date IS NOT NULL AND e.start_date <= ? AND e.end_date >= ?)
      )
    `;
    const params: any[] = [startDate, endDate, startDate, endDate, startDate, startDate];

    // 如果指定了日历过滤
    if (calendarIds && calendarIds.length > 0) {
      // 从过滤列表中排除周期任务日历（将动态生成）
      const filteredCalendarIds = calendarIds.filter(id => id !== recurringCalendarId);
      if (filteredCalendarIds.length > 0) {
        const placeholders = filteredCalendarIds.map(() => "?").join(",");
        query += ` AND e.calendar_id IN (${placeholders})`;
        params.push(...filteredCalendarIds);
      } else {
        // 如果过滤后为空，说明只选择了周期任务日历，返回空查询
        query += ` AND 1 = 0`;
      }
    } else {
      // 如果没有指定日历过滤，排除周期任务日历（将动态生成）
      query += ` AND e.calendar_id != ?`;
      params.push(recurringCalendarId);
    }

    query += " ORDER BY e.start_date ASC, e.start_time ASC";

    const stmt = db.prepare(query);
    const rows = stmt.all(...params);
    const events = rows.map(row => this.parseCalendarEvent(row));

    // 动态生成周期任务的日历事件
    try {
      // 检查是否需要显示周期任务日历
      const shouldShowRecurring =
        !calendarIds || calendarIds.length === 0 || calendarIds.includes(recurringCalendarId);

      if (shouldShowRecurring) {
        // 获取所有周期任务
        const recurringTodos = TodoItemTable.listItemsByType(db, {
          type: "recurring",
        });

        // 为每个周期任务生成日历事件
        for (const todo of recurringTodos) {
          if (todo.isArchived) continue; // 跳过已归档的任务

          try {
            // 调用同步方法生成事件
            const eventIds = await TodoCalendarSyncTable.syncRecurringTasksForRange(db, {
              todoItemId: todo.id,
              startDate,
              endDate,
            });

            // 获取生成的事件
            for (const eventId of eventIds) {
              try {
                const event = this.getEventById(db, eventId);
                events.push(event);
              } catch (e) {
                // 事件可能已被删除,忽略
              }
            }
          } catch (e) {
            log.error(`Failed to sync recurring task ${todo.id}:`, e);
          }
        }
      }
    } catch (e) {
      log.error("Failed to generate recurring task events:", e);
    }

    return events;
  }

  static async getEventsForDay(
    db: Database.Database,
    date: number,
    calendarIds?: number[]
  ): Promise<CalendarEvent[]> {
    return this.getEventsByDateRange(db, date, date, calendarIds);
  }

  static async getEventsForWeek(
    db: Database.Database,
    startDate: number,
    calendarIds?: number[]
  ): Promise<CalendarEvent[]> {
    // 假设一周是 7 天
    const endDate = startDate + 6 * 24 * 60 * 60 * 1000;
    return this.getEventsByDateRange(db, startDate, endDate, calendarIds);
  }

  static async getEventsForMonth(
    db: Database.Database,
    year: number,
    month: number,
    calendarIds?: number[]
  ): Promise<CalendarEvent[]> {
    // 计算月份的开始和结束日期
    const startDate = new Date(year, month - 1, 1).setHours(0, 0, 0, 0);
    const endDate = new Date(year, month, 0).setHours(23, 59, 59, 999);
    return this.getEventsByDateRange(db, startDate, endDate, calendarIds);
  }

  static transferEventsBetweenCalendars(
    db: Database.Database,
    sourceCalendarId: number,
    targetCalendarId: number
  ): number {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE calendar_event
      SET calendar_id = ?, update_time = ?
      WHERE calendar_id = ?
    `);

    const result = stmt.run(targetCalendarId, now, sourceCalendarId);

    // 记录操作日志
    if (result.changes > 0) {
      log.info(
        `Transferred ${result.changes} events from calendar ${sourceCalendarId} to ${targetCalendarId}`
      );
    }

    return result.changes;
  }

  // 根据精确日期列表查询事件（只查询 start_date 在指定日期的事件）
  static getEventsByExactDates(
    db: Database.Database,
    dates: string[],
    calendarIds?: number[]
  ): CalendarEvent[] {
    if (dates.length === 0) return [];

    // 将日期字符串转换为时间戳范围
    const dateRanges = dates.map(dateStr => ({
      start: new Date(dateStr).setHours(0, 0, 0, 0),
      end: new Date(dateStr).setHours(23, 59, 59, 999),
    }));

    // 构建 OR 条件
    const dateConditions = dateRanges
      .map(() => "(e.start_date >= ? AND e.start_date <= ?)")
      .join(" OR ");

    let query = `
      SELECT
        e.*,
        c.content as detail_content
      FROM calendar_event e
      LEFT JOIN contents c ON e.detail_content_id = c.id
      WHERE (${dateConditions})
    `;

    const queryParams: any[] = [];
    dateRanges.forEach(range => {
      queryParams.push(range.start, range.end);
    });

    // 日历过滤
    if (calendarIds && calendarIds.length > 0) {
      const placeholders = calendarIds.map(() => "?").join(",");
      query += ` AND e.calendar_id IN (${placeholders})`;
      queryParams.push(...calendarIds);
    }

    query += " ORDER BY e.start_date ASC, e.start_time ASC";

    const stmt = db.prepare(query);
    const rows = stmt.all(...queryParams);
    return rows.map(row => this.parseCalendarEvent(row));
  }

  // 获取带内容的事件（Markdown 格式）
  static async getEventsWithContent(
    db: Database.Database,
    params: {
      dates?: string[];
      startDate?: string;
      endDate?: string;
      calendarIds?: number[];
      maxLength?: number;
    }
  ): Promise<
    Array<{
      id: number;
      title: string;
      calendarId: number;
      startDate: string;
      endDate: string | null;
      startTime: number | null;
      endTime: number | null;
      allDay: boolean;
      color: string | null;
      detailContent: string;
    }>
  > {
    let events: CalendarEvent[];

    if (params.dates && params.dates.length > 0) {
      // 批量日期查询 - 精确匹配指定日期
      events = this.getEventsByExactDates(db, params.dates, params.calendarIds);
    } else if (params.startDate && params.endDate) {
      // 范围查询
      const startTimestamp = new Date(params.startDate).setHours(0, 0, 0, 0);
      const endTimestamp = new Date(params.endDate).setHours(23, 59, 59, 999);
      events = await this.getEventsByDateRange(
        db,
        startTimestamp,
        endTimestamp,
        params.calendarIds
      );
    } else {
      return [];
    }

    return events.map(event => {
      let detailContent = "";

      if (event.detailContentId && event.detailContentId > 0) {
        const content = ContentTable.getContentById(db, event.detailContentId);
        if (content && content.content) {
          detailContent = getMarkdown(content.content);
        }
      }

      const maxLength = params.maxLength;
      if (maxLength && detailContent.length > maxLength) {
        let truncated = detailContent.substring(0, maxLength);
        const breakPoints = ["\n\n", "\n", "。", "！", "？", ".", "!", "?"];
        let bestBreak = -1;

        for (const bp of breakPoints) {
          const idx = truncated.lastIndexOf(bp);
          if (idx > maxLength * 0.8) {
            bestBreak = idx + bp.length;
            break;
          }
        }

        if (bestBreak > 0) {
          truncated = truncated.substring(0, bestBreak);
        }

        detailContent = truncated + "\n\n[内容已截断...]";
      }

      const formatDate = (timestamp: number) => {
        return new Date(timestamp).toISOString().split("T")[0];
      };

      return {
        id: event.id,
        title: event.title,
        calendarId: event.calendarId,
        startDate: formatDate(event.startDate),
        endDate: event.endDate ? formatDate(event.endDate) : null,
        startTime: event.startTime,
        endTime: event.endTime,
        allDay: event.allDay,
        color: event.color,
        detailContent,
      };
    });
  }
}
