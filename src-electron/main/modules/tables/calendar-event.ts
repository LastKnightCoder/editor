import Database from "better-sqlite3";
import {
  CalendarEvent,
  CreateCalendarEvent,
  UpdateCalendarEvent,
} from "@/types/calendar";
import Operation from "./operation";
import ContentTable from "./content";

export default class CalendarEventTable {
  static getListenEvents() {
    return {
      "calendar-event:create": this.createEvent.bind(this),
      "calendar-event:update": this.updateEvent.bind(this),
      "calendar-event:delete": this.deleteEvent.bind(this),
      "calendar-event:get-by-id": this.getEventById.bind(this),
      "calendar-event:get-by-calendar-id":
        this.getEventsByCalendarId.bind(this),
      "calendar-event:get-by-date-range": this.getEventsByDateRange.bind(this),
      "calendar-event:get-for-day": this.getEventsForDay.bind(this),
      "calendar-event:get-for-week": this.getEventsForWeek.bind(this),
      "calendar-event:get-for-month": this.getEventsForMonth.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS calendar_event (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        calendar_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        detail_content_id INTEGER DEFAULT 0,
        start_date INTEGER NOT NULL,
        end_date INTEGER,
        start_time INTEGER,
        end_time INTEGER,
        color TEXT,
        all_day INTEGER DEFAULT 0
      )
    `;
    db.exec(createTableSql);

    // 添加索引
    const createIndexSql = `
      CREATE INDEX IF NOT EXISTS idx_calendar_event_calendar_id ON calendar_event(calendar_id);
      CREATE INDEX IF NOT EXISTS idx_calendar_event_start_date ON calendar_event(start_date);
      CREATE INDEX IF NOT EXISTS idx_calendar_event_end_date ON calendar_event(end_date);
      CREATE INDEX IF NOT EXISTS idx_calendar_event_date_range ON calendar_event(start_date, end_date);
    `;
    db.exec(createIndexSql);
  }

  static upgradeTable(_db: Database.Database) {
    // 数据迁移和升级逻辑
  }

  static parseCalendarEvent(row: any): CalendarEvent {
    return {
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
    };
  }

  static createEvent(
    db: Database.Database,
    data: CreateCalendarEvent,
  ): CalendarEvent {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO calendar_event
      (create_time, update_time, calendar_id, title, detail_content_id, start_date, end_date, start_time, end_time, color, all_day)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = stmt.run(
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
    );

    Operation.insertOperation(
      db,
      "calendar_event",
      "insert",
      res.lastInsertRowid,
      now,
    );

    return this.getEventById(db, Number(res.lastInsertRowid));
  }

  static updateEvent(
    db: Database.Database,
    data: UpdateCalendarEvent,
  ): CalendarEvent {
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
      data.id,
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

  static getEventsByCalendarId(
    db: Database.Database,
    calendarId: number,
  ): CalendarEvent[] {
    const stmt = db.prepare(
      "SELECT * FROM calendar_event WHERE calendar_id = ? ORDER BY start_date ASC, start_time ASC",
    );
    const rows = stmt.all(calendarId);
    return rows.map((row) => this.parseCalendarEvent(row));
  }

  static getEventsByDateRange(
    db: Database.Database,
    startDate: number,
    endDate: number,
    calendarIds?: number[],
  ): CalendarEvent[] {
    let query = `
      SELECT * FROM calendar_event
      WHERE (
        (start_date >= ? AND start_date <= ?) OR
        (end_date >= ? AND end_date <= ?) OR
        (start_date <= ? AND (end_date >= ? OR end_date IS NULL))
      )
    `;
    const params: any[] = [
      startDate,
      endDate,
      startDate,
      endDate,
      startDate,
      endDate,
    ];

    if (calendarIds && calendarIds.length > 0) {
      const placeholders = calendarIds.map(() => "?").join(",");
      query += ` AND calendar_id IN (${placeholders})`;
      params.push(...calendarIds);
    }

    query += " ORDER BY start_date ASC, start_time ASC";

    const stmt = db.prepare(query);
    const rows = stmt.all(...params);
    return rows.map((row) => this.parseCalendarEvent(row));
  }

  static getEventsForDay(
    db: Database.Database,
    date: number,
    calendarIds?: number[],
  ): CalendarEvent[] {
    return this.getEventsByDateRange(db, date, date, calendarIds);
  }

  static getEventsForWeek(
    db: Database.Database,
    startDate: number,
    calendarIds?: number[],
  ): CalendarEvent[] {
    // 假设一周是 7 天
    const endDate = startDate + 6 * 24 * 60 * 60 * 1000;
    return this.getEventsByDateRange(db, startDate, endDate, calendarIds);
  }

  static getEventsForMonth(
    db: Database.Database,
    year: number,
    month: number,
    calendarIds?: number[],
  ): CalendarEvent[] {
    // 计算月份的开始和结束日期
    const startDate = new Date(year, month - 1, 1).setHours(0, 0, 0, 0);
    const endDate = new Date(year, month, 0).setHours(23, 59, 59, 999);
    return this.getEventsByDateRange(db, startDate, endDate, calendarIds);
  }
}
