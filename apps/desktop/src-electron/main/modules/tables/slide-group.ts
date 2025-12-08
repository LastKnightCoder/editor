import Database from "better-sqlite3";

export interface SlideGroupRow {
  id: number;
  name: string;
  parent_id: number | null;
  order_index: number;
  create_time: number;
  update_time: number;
}

export interface SlideGroup {
  id: number;
  name: string;
  parentId: number | null;
  orderIndex: number;
  createTime: number;
  updateTime: number;
}

export interface CreateSlideGroup {
  name: string;
  parentId?: number | null;
  orderIndex?: number;
}

export interface UpdateSlideGroup {
  id: number;
  name?: string;
  parentId?: number | null;
  orderIndex?: number;
}

const parse = (row: SlideGroupRow): SlideGroup => ({
  id: row.id,
  name: row.name,
  parentId: row.parent_id,
  orderIndex: row.order_index,
  createTime: row.create_time,
  updateTime: row.update_time,
});

export default class SlideGroupTable {
  static getListenEvents() {
    return {
      "slide-group:create": this.createGroup.bind(this),
      "slide-group:update": this.updateGroup.bind(this),
      "slide-group:delete": this.deleteGroup.bind(this),
      "slide-group:get-all": this.getAllGroups.bind(this),
      "slide-group:get-by-id": this.getGroupById.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS slide_group (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id INTEGER,
        order_index INTEGER DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES slide_group(id) ON DELETE CASCADE
      )
    `;
    db.exec(createTableSql);

    // 添加索引
    const createIndexSql = `
      CREATE INDEX IF NOT EXISTS idx_slide_group_parent_id ON slide_group(parent_id);
      CREATE INDEX IF NOT EXISTS idx_slide_group_order_index ON slide_group(order_index);
    `;
    db.exec(createIndexSql);
  }

  static upgradeTable(_db: Database.Database) {
    // 数据迁移和升级逻辑
  }

  static parseGroup(row: SlideGroupRow): SlideGroup {
    return parse(row);
  }

  static createGroup(
    db: Database.Database,
    data: CreateSlideGroup,
  ): SlideGroup {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO slide_group (name, parent_id, order_index, create_time, update_time)
      VALUES (?, ?, ?, ?, ?)
    `);

    const res = stmt.run(
      data.name,
      data.parentId ?? null,
      data.orderIndex ?? 0,
      now,
      now,
    );

    return this.getGroupById(db, Number(res.lastInsertRowid));
  }

  static updateGroup(
    db: Database.Database,
    data: UpdateSlideGroup,
  ): SlideGroup {
    const now = Date.now();
    const existing = this.getGroupById(db, data.id);

    const stmt = db.prepare(`
      UPDATE slide_group SET
        name = ?,
        parent_id = ?,
        order_index = ?,
        update_time = ?
      WHERE id = ?
    `);

    stmt.run(
      data.name ?? existing.name,
      data.parentId !== undefined ? data.parentId : existing.parentId,
      data.orderIndex ?? existing.orderIndex,
      now,
      data.id,
    );

    return this.getGroupById(db, data.id);
  }

  static deleteGroup(db: Database.Database, id: number): number {
    // 检查是否有子分组
    const childCountStmt = db.prepare(
      "SELECT COUNT(*) as count FROM slide_group WHERE parent_id = ?",
    );
    const childCount = (childCountStmt.get(id) as { count: number }).count;

    if (childCount > 0) {
      throw new Error("不能删除含有子分组的分组");
    }

    // 将该分组下的 slide_decks 的 group_id 设置为 NULL
    db.prepare("UPDATE slide_decks SET group_id = NULL WHERE group_id = ?").run(
      id,
    );

    const stmt = db.prepare("DELETE FROM slide_group WHERE id = ?");
    return stmt.run(id).changes;
  }

  static getGroupById(db: Database.Database, id: number): SlideGroup {
    const stmt = db.prepare("SELECT * FROM slide_group WHERE id = ?");
    const row = stmt.get(id) as SlideGroupRow | undefined;
    if (!row) {
      throw new Error(`SlideGroup with id ${id} not found`);
    }
    return parse(row);
  }

  static getAllGroups(db: Database.Database): SlideGroup[] {
    const stmt = db.prepare(
      "SELECT * FROM slide_group ORDER BY order_index ASC, create_time ASC",
    );
    const rows = stmt.all() as SlideGroupRow[];
    return rows.map(parse);
  }
}
