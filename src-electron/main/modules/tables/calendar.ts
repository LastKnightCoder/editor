import Database from "better-sqlite3";
import { Calendar, CreateCalendar, UpdateCalendar } from "@/types/calendar";
import { Descendant } from "slate";
import Operation from "./operation";
import ContentTable from "./content";
import CalendarGroupTable from "./calendar-group";

export default class CalendarTable {
  static getListenEvents() {
    return {
      "calendar:create": this.createCalendar.bind(this),
      "calendar:update": this.updateCalendar.bind(this),
      "calendar:delete": this.deleteCalendar.bind(this),
      "calendar:get-by-id": this.getCalendarById.bind(this),
      "calendar:get-all": this.getAllCalendars.bind(this),
      "calendar:get-visible": this.getVisibleCalendars.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS calendar (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        title TEXT NOT NULL,
        color TEXT NOT NULL,
        description_content_id INTEGER DEFAULT 0,
        archived INTEGER DEFAULT 0,
        pinned INTEGER DEFAULT 0,
        visible INTEGER DEFAULT 1,
        order_index INTEGER DEFAULT 0
      )
    `;
    db.exec(createTableSql);

    // 添加索引
    const createIndexSql = `
      CREATE INDEX IF NOT EXISTS idx_calendar_archived ON calendar(archived);
      CREATE INDEX IF NOT EXISTS idx_calendar_visible ON calendar(visible);
      CREATE INDEX IF NOT EXISTS idx_calendar_order_index ON calendar(order_index);
    `;
    db.exec(createIndexSql);
  }

  static upgradeTable(db: Database.Database) {
    // 数据迁移和升级逻辑

    // 检查 group_id 字段是否存在
    const tableInfo = db.prepare(`PRAGMA table_info(calendar)`).all() as Array<{
      name: string;
    }>;
    const hasGroupId = tableInfo.some((column) => column.name === "group_id");

    // 添加 group_id 字段
    if (!hasGroupId) {
      db.exec(`ALTER TABLE calendar ADD COLUMN group_id INTEGER DEFAULT NULL;`);
    }

    // 添加索引
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_calendar_group_id ON calendar(group_id);`,
    );
  }

  static parseCalendar(row: any, db: Database.Database): Calendar {
    let description: Descendant[] = [];
    const descriptionContentId = row.description_content_id || 0;

    if (descriptionContentId) {
      const content = ContentTable.getContentById(db, descriptionContentId);
      description = content?.content || [];
    }

    const groupId = row.group_id || undefined;
    let isInSystemGroup = false;

    // 判断是否在系统分组
    if (groupId) {
      try {
        const group = CalendarGroupTable.getGroupById(db, groupId);
        isInSystemGroup = group.isSystem;
      } catch (e) {
        // 分组不存在
      }
    }

    return {
      id: row.id,
      createTime: row.create_time,
      updateTime: row.update_time,
      title: row.title,
      color: row.color,
      description,
      descriptionContentId,
      archived: Boolean(row.archived),
      pinned: Boolean(row.pinned),
      visible: Boolean(row.visible),
      orderIndex: row.order_index,
      groupId,
      isInSystemGroup,
    };
  }

  static createCalendar(db: Database.Database, data: CreateCalendar): Calendar {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO calendar
      (create_time, update_time, title, color, description_content_id, archived, pinned, visible, order_index, group_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = stmt.run(
      now,
      now,
      data.title,
      data.color,
      data.descriptionContentId || 0,
      Number(data.archived || false),
      Number(data.pinned || false),
      Number(data.visible !== undefined ? data.visible : true),
      data.orderIndex || 0,
      data.groupId ?? null,
    );

    Operation.insertOperation(
      db,
      "calendar",
      "insert",
      res.lastInsertRowid,
      now,
    );

    return this.getCalendarById(db, Number(res.lastInsertRowid));
  }

  static updateCalendar(db: Database.Database, data: UpdateCalendar): Calendar {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE calendar SET
        update_time = ?,
        title = ?,
        color = ?,
        description_content_id = ?,
        archived = ?,
        pinned = ?,
        visible = ?,
        order_index = ?,
        group_id = ?
      WHERE id = ?
    `);

    stmt.run(
      now,
      data.title,
      data.color,
      data.descriptionContentId || 0,
      Number(data.archived || false),
      Number(data.pinned || false),
      Number(data.visible !== undefined ? data.visible : true),
      data.orderIndex || 0,
      data.groupId ?? null,
      data.id,
    );

    Operation.insertOperation(db, "calendar", "update", data.id, now);

    return this.getCalendarById(db, data.id);
  }

  static deleteCalendar(db: Database.Database, id: number): number {
    // 检查是否为系统日历
    const calendar = this.getCalendarById(db, id);
    if (calendar.isInSystemGroup) {
      throw new Error("Cannot delete calendar in system group");
    }

    // 删除所有关联的事件（直接执行 SQL）
    const eventStmt = db.prepare(
      "SELECT id, detail_content_id FROM calendar_event WHERE calendar_id = ?",
    );
    const events = eventStmt.all(id) as Array<{
      id: number;
      detail_content_id: number;
    }>;

    for (const event of events) {
      // 删除事件的详情内容
      if (event.detail_content_id) {
        ContentTable.deleteContent(db, event.detail_content_id);
      }
    }

    // 删除所有事件
    db.prepare("DELETE FROM calendar_event WHERE calendar_id = ?").run(id);

    // 删除日历描述内容
    if (calendar && calendar.descriptionContentId) {
      ContentTable.deleteContent(db, calendar.descriptionContentId);
    }

    const stmt = db.prepare("DELETE FROM calendar WHERE id = ?");
    Operation.insertOperation(db, "calendar", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  static getCalendarById(db: Database.Database, id: number): Calendar {
    const stmt = db.prepare("SELECT * FROM calendar WHERE id = ?");
    const row = stmt.get(id);
    if (!row) {
      throw new Error(`Calendar with id ${id} not found`);
    }
    return this.parseCalendar(row, db);
  }

  static getAllCalendars(db: Database.Database): Calendar[] {
    const stmt = db.prepare(
      "SELECT * FROM calendar ORDER BY order_index ASC, create_time DESC",
    );
    const rows = stmt.all();
    return rows.map((row) => this.parseCalendar(row, db));
  }

  static getVisibleCalendars(db: Database.Database): Calendar[] {
    const stmt = db.prepare(
      "SELECT * FROM calendar WHERE visible = 1 ORDER BY order_index ASC, create_time DESC",
    );
    const rows = stmt.all();
    return rows.map((row) => this.parseCalendar(row, db));
  }
}
