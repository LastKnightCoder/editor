import Database from "better-sqlite3";
import {
  CalendarEvent,
  CreateCalendarEvent,
  UpdateCalendarEvent,
} from "@/types/calendar";
import Operation from "./operation";
import ContentTable from "./content";
import CalendarGroupTable from "./calendar-group";
import CalendarTable from "./calendar";
import log from "electron-log";

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
        all_day INTEGER DEFAULT 0,
        value REAL DEFAULT NULL
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

  static upgradeTable(db: Database.Database) {
    // 检查并添加 value 字段
    const tableInfo = db
      .prepare(`PRAGMA table_info(calendar_event)`)
      .all() as Array<{
      name: string;
    }>;
    const hasValue = tableInfo.some((column) => column.name === "value");

    if (!hasValue) {
      log.info("Adding value column to calendar_event table");
      db.exec(`ALTER TABLE calendar_event ADD COLUMN value REAL DEFAULT NULL;`);
    }

    // 检查是否已经迁移时间记录（通过查询是否存在"时间记录"分组）
    const checkGroupStmt = db.prepare(
      `SELECT id FROM calendar_group WHERE name = ? AND is_system = 0`,
    );
    const existingGroup = checkGroupStmt.get("时间记录");

    if (existingGroup) {
      log.info("Time records already migrated, skipping migration");
      return;
    }

    // 检查 time_records 表是否存在
    const checkTableStmt = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='time_records'`,
    );
    const timeRecordsTableExists = checkTableStmt.get();

    if (!timeRecordsTableExists) {
      log.info("time_records table does not exist, skipping migration");
      return;
    }

    // 检查是否有时间记录数据
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM time_records`);
    const { count } = countStmt.get() as { count: number };

    if (count === 0) {
      log.info("No time records to migrate");
      return;
    }

    log.info(`Starting migration of ${count} time records to calendar`);

    try {
      // 1. 创建"时间记录"分组
      const timeRecordGroup = CalendarGroupTable.createGroup(db, {
        name: "时间记录",
        isSystem: false,
        orderIndex: 999,
      });
      log.info(`Created time record group with id: ${timeRecordGroup.id}`);

      // 2. 获取所有不同的 time_type
      const timeTypesStmt = db.prepare(
        "SELECT DISTINCT time_type FROM time_records",
      );
      const timeTypes = (timeTypesStmt.all() as { time_type: string }[]).map(
        (t) => t.time_type,
      );
      log.info(`Found ${timeTypes.length} time types: ${timeTypes.join(", ")}`);

      // 3. 为每个 time_type 创建一个日历
      const colors = [
        "red",
        "orange",
        "yellow",
        "green",
        "blue",
        "purple",
        "pink",
        "gray",
      ];
      const timeTypeToCalendarId: { [key: string]: number } = {};

      timeTypes.forEach((timeType, index) => {
        const color = colors[index % colors.length];
        const calendar = CalendarTable.createCalendar(db, {
          title: timeType,
          color: color as any,
          descriptionContentId: 0,
          archived: false,
          pinned: false,
          visible: true,
          orderIndex: index,
          groupId: timeRecordGroup.id,
        });
        timeTypeToCalendarId[timeType] = calendar.id;
        log.info(`Created calendar "${timeType}" with id: ${calendar.id}`);
      });

      // 4. 遍历所有时间记录并创建日历事件
      const recordsStmt = db.prepare(
        "SELECT * FROM time_records ORDER BY date",
      );
      const records = recordsStmt.all() as Array<{
        id: number;
        date: string;
        cost: number;
        content: string;
        event_type: string;
        time_type: string;
      }>;
      let migratedCount = 0;

      for (const record of records) {
        try {
          // 解析记录
          const parsedRecord = {
            id: record.id,
            date: record.date,
            cost: record.cost,
            content: JSON.parse(record.content),
            eventType: record.event_type,
            timeType: record.time_type,
          };

          // 创建内容记录
          const contentId = ContentTable.createContent(db, {
            content: parsedRecord.content,
          });

          // 解析日期为时间戳
          const startDate = new Date(parsedRecord.date).setHours(0, 0, 0, 0);

          // 创建日历事件
          const calendarId = timeTypeToCalendarId[parsedRecord.timeType];
          if (!calendarId) {
            log.warn(
              `No calendar found for time type: ${parsedRecord.timeType}`,
            );
            continue;
          }

          this.createEvent(db, {
            title: parsedRecord.eventType,
            calendarId: calendarId,
            detailContentId: contentId,
            startDate: startDate,
            endDate: startDate,
            startTime: null,
            endTime: null,
            allDay: true,
            color: null,
            value: parsedRecord.cost,
          });

          migratedCount++;
        } catch (error) {
          log.error(`Failed to migrate time record ${record.id}:`, error);
        }
      }

      log.info(
        `Successfully migrated ${migratedCount} time records to calendar`,
      );

      // 5. 迁移成功后删除 time_records 表
      try {
        db.exec(`DROP TABLE IF EXISTS time_records`);
        log.info("Successfully dropped time_records table after migration");
      } catch (error) {
        log.error("Failed to drop time_records table:", error);
        // 不抛出错误，因为迁移已经成功，删除表失败不应该影响主流程
      }
    } catch (error) {
      log.error("Failed to migrate time records:", error);
      throw error;
    }
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
      value:
        row.value !== null && row.value !== undefined ? row.value : undefined,
    };
  }

  static createEvent(
    db: Database.Database,
    data: CreateCalendarEvent,
  ): CalendarEvent {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO calendar_event
      (create_time, update_time, calendar_id, title, detail_content_id, start_date, end_date, start_time, end_time, color, all_day, value)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      data.value !== undefined ? data.value : null,
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
        all_day = ?,
        value = ?
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
      data.value !== undefined ? data.value : null,
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
