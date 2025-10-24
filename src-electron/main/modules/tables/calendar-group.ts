import Database from "better-sqlite3";

export interface CalendarGroupRow {
  id: number;
  name: string;
  is_system: number;
  order_index: number;
  create_time: number;
  update_time: number;
}

export interface CalendarGroup {
  id: number;
  name: string;
  isSystem: boolean;
  orderIndex: number;
  createTime: number;
  updateTime: number;
}

export interface CreateCalendarGroup {
  name: string;
  isSystem: boolean;
  orderIndex?: number;
}

export interface UpdateCalendarGroup {
  id: number;
  name?: string;
  orderIndex?: number;
}

const parse = (row: CalendarGroupRow): CalendarGroup => ({
  id: row.id,
  name: row.name,
  isSystem: Boolean(row.is_system),
  orderIndex: row.order_index,
  createTime: row.create_time,
  updateTime: row.update_time,
});

export default class CalendarGroupTable {
  static getListenEvents() {
    return {
      "calendar-group:create": this.createGroup.bind(this),
      "calendar-group:update": this.updateGroup.bind(this),
      "calendar-group:delete": this.deleteGroup.bind(this),
      "calendar-group:get-all": this.getAllGroups.bind(this),
      "calendar-group:get-by-id": this.getGroupById.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS calendar_group (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        is_system INTEGER DEFAULT 0,
        order_index INTEGER DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      )
    `;
    db.exec(createTableSql);

    // 添加索引
    const createIndexSql = `
      CREATE INDEX IF NOT EXISTS idx_calendar_group_is_system ON calendar_group(is_system);
      CREATE INDEX IF NOT EXISTS idx_calendar_group_order_index ON calendar_group(order_index);
    `;
    db.exec(createIndexSql);
  }

  static upgradeTable(_db: Database.Database) {
    // 数据迁移和升级逻辑
  }

  static parseGroup(row: CalendarGroupRow): CalendarGroup {
    return parse(row);
  }

  static getSystemGroup(db: Database.Database): CalendarGroup {
    // 尝试获取系统分组
    const stmt = db.prepare("SELECT * FROM calendar_group WHERE is_system = 1");
    const row = stmt.get() as CalendarGroupRow | undefined;

    if (row) {
      return parse(row);
    }

    // 如果不存在，创建系统分组
    const now = Date.now();
    const insertStmt = db.prepare(`
      INSERT INTO calendar_group (name, is_system, order_index, create_time, update_time)
      VALUES (?, 1, 0, ?, ?)
    `);

    const res = insertStmt.run("系统日历", now, now);
    const newRow = db
      .prepare("SELECT * FROM calendar_group WHERE id = ?")
      .get(res.lastInsertRowid) as CalendarGroupRow;

    return parse(newRow);
  }

  static createGroup(
    db: Database.Database,
    data: CreateCalendarGroup,
  ): CalendarGroup {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO calendar_group (name, is_system, order_index, create_time, update_time)
      VALUES (?, ?, ?, ?, ?)
    `);

    const res = stmt.run(
      data.name,
      Number(data.isSystem || false),
      data.orderIndex || 0,
      now,
      now,
    );

    return this.getGroupById(db, Number(res.lastInsertRowid));
  }

  static updateGroup(
    db: Database.Database,
    data: UpdateCalendarGroup,
  ): CalendarGroup {
    const now = Date.now();
    const existing = this.getGroupById(db, data.id);

    const stmt = db.prepare(`
      UPDATE calendar_group SET
        name = ?,
        order_index = ?,
        update_time = ?
      WHERE id = ?
    `);

    stmt.run(
      data.name ?? existing.name,
      data.orderIndex ?? existing.orderIndex,
      now,
      data.id,
    );

    return this.getGroupById(db, data.id);
  }

  static deleteGroup(db: Database.Database, id: number): number {
    // 检查是否为系统分组
    const group = this.getGroupById(db, id);
    if (group.isSystem) {
      throw new Error("Cannot delete system group");
    }

    // 将该分组下的日历的 group_id 设置为 NULL
    db.prepare("UPDATE calendar SET group_id = NULL WHERE group_id = ?").run(
      id,
    );

    const stmt = db.prepare("DELETE FROM calendar_group WHERE id = ?");
    return stmt.run(id).changes;
  }

  static getGroupById(db: Database.Database, id: number): CalendarGroup {
    const stmt = db.prepare("SELECT * FROM calendar_group WHERE id = ?");
    const row = stmt.get(id) as CalendarGroupRow | undefined;
    if (!row) {
      throw new Error(`CalendarGroup with id ${id} not found`);
    }
    return parse(row);
  }

  static getAllGroups(db: Database.Database): CalendarGroup[] {
    const stmt = db.prepare(
      "SELECT * FROM calendar_group ORDER BY is_system DESC, order_index ASC, create_time ASC",
    );
    const rows = stmt.all() as CalendarGroupRow[];
    return rows.map(parse);
  }
}
