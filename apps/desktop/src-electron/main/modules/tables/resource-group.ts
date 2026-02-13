import Database from "better-sqlite3";

export interface ResourceGroupRow {
  id: number;
  name: string;
  parent_id: number | null;
  order_index: number;
  create_time: number;
  update_time: number;
}

export interface ResourceGroup {
  id: number;
  name: string;
  parentId: number | null;
  orderIndex: number;
  createTime: number;
  updateTime: number;
}

export interface CreateResourceGroup {
  name: string;
  parentId?: number | null;
  orderIndex?: number;
}

export interface UpdateResourceGroup {
  id: number;
  name?: string;
  parentId?: number | null;
  orderIndex?: number;
}

const parse = (row: ResourceGroupRow): ResourceGroup => ({
  id: row.id,
  name: row.name,
  parentId: row.parent_id,
  orderIndex: row.order_index,
  createTime: row.create_time,
  updateTime: row.update_time,
});

export default class ResourceGroupTable {
  static getListenEvents() {
    return {
      "resource-group:create": this.createGroup.bind(this),
      "resource-group:update": this.updateGroup.bind(this),
      "resource-group:delete": this.deleteGroup.bind(this),
      "resource-group:get-all": this.getAllGroups.bind(this),
      "resource-group:get-by-id": this.getGroupById.bind(this),
    };
  }

  static upgradeTable(_db: Database.Database) {
    // 数据迁移和升级逻辑
  }

  static parseGroup(row: ResourceGroupRow): ResourceGroup {
    return parse(row);
  }

  static createGroup(
    db: Database.Database,
    data: CreateResourceGroup,
  ): ResourceGroup {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO resource_group (name, parent_id, order_index, create_time, update_time)
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
    data: UpdateResourceGroup,
  ): ResourceGroup {
    const now = Date.now();
    const existing = this.getGroupById(db, data.id);

    const stmt = db.prepare(`
      UPDATE resource_group SET
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
      "SELECT COUNT(*) as count FROM resource_group WHERE parent_id = ?",
    );
    const childCount = (childCountStmt.get(id) as { count: number }).count;

    if (childCount > 0) {
      throw new Error("不能删除含有子分组的分组");
    }

    // 将该分组下的资源的 group_id 设置为 NULL
    db.prepare("UPDATE resource SET group_id = NULL WHERE group_id = ?").run(
      id,
    );

    const stmt = db.prepare("DELETE FROM resource_group WHERE id = ?");
    return stmt.run(id).changes;
  }

  static getGroupById(db: Database.Database, id: number): ResourceGroup {
    const stmt = db.prepare("SELECT * FROM resource_group WHERE id = ?");
    const row = stmt.get(id) as ResourceGroupRow | undefined;
    if (!row) {
      throw new Error(`ResourceGroup with id ${id} not found`);
    }
    return parse(row);
  }

  static getAllGroups(db: Database.Database): ResourceGroup[] {
    const stmt = db.prepare(
      "SELECT * FROM resource_group ORDER BY order_index ASC, create_time ASC",
    );
    const rows = stmt.all() as ResourceGroupRow[];
    return rows.map(parse);
  }
}
