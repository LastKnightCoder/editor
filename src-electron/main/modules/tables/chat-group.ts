import Database from "better-sqlite3";

export interface ChatGroupRow {
  id: number;
  name: string;
  parent_id: number | null;
  order_index: number;
  create_time: number;
  update_time: number;
}

export interface ChatGroup {
  id: number;
  name: string;
  parentId: number | null;
  orderIndex: number;
  createTime: number;
  updateTime: number;
}

export interface CreateChatGroup {
  name: string;
  parentId?: number | null;
  orderIndex?: number;
}

export interface UpdateChatGroup {
  id: number;
  name?: string;
  parentId?: number | null;
  orderIndex?: number;
}

const parse = (row: ChatGroupRow): ChatGroup => ({
  id: row.id,
  name: row.name,
  parentId: row.parent_id,
  orderIndex: row.order_index,
  createTime: row.create_time,
  updateTime: row.update_time,
});

export default class ChatGroupTable {
  static getListenEvents() {
    return {
      "chat-group:create": this.createGroup.bind(this),
      "chat-group:update": this.updateGroup.bind(this),
      "chat-group:delete": this.deleteGroup.bind(this),
      "chat-group:get-all": this.getAllGroups.bind(this),
      "chat-group:get-by-id": this.getGroupById.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS chat_group (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id INTEGER,
        order_index INTEGER DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES chat_group(id) ON DELETE CASCADE
      )
    `;
    db.exec(createTableSql);

    // 添加索引
    const createIndexSql = `
      CREATE INDEX IF NOT EXISTS idx_chat_group_parent_id ON chat_group(parent_id);
      CREATE INDEX IF NOT EXISTS idx_chat_group_order_index ON chat_group(order_index);
    `;
    db.exec(createIndexSql);
  }

  static upgradeTable(_db: Database.Database) {
    // 数据迁移和升级逻辑
  }

  static parseGroup(row: ChatGroupRow): ChatGroup {
    return parse(row);
  }

  static createGroup(db: Database.Database, data: CreateChatGroup): ChatGroup {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO chat_group (name, parent_id, order_index, create_time, update_time)
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

  static updateGroup(db: Database.Database, data: UpdateChatGroup): ChatGroup {
    const now = Date.now();
    const existing = this.getGroupById(db, data.id);

    const stmt = db.prepare(`
      UPDATE chat_group SET
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
      "SELECT COUNT(*) as count FROM chat_group WHERE parent_id = ?",
    );
    const childCount = (childCountStmt.get(id) as any).count;

    if (childCount > 0) {
      throw new Error("Cannot delete group with children");
    }

    // 将该分组下的对话的 group_id 设置为 NULL
    db.prepare(
      "UPDATE chat_message SET group_id = NULL WHERE group_id = ?",
    ).run(id);

    const stmt = db.prepare("DELETE FROM chat_group WHERE id = ?");
    return stmt.run(id).changes;
  }

  static getGroupById(db: Database.Database, id: number): ChatGroup {
    const stmt = db.prepare("SELECT * FROM chat_group WHERE id = ?");
    const row = stmt.get(id) as ChatGroupRow | undefined;
    if (!row) {
      throw new Error(`ChatGroup with id ${id} not found`);
    }
    return parse(row);
  }

  static getAllGroups(db: Database.Database): ChatGroup[] {
    const stmt = db.prepare(
      "SELECT * FROM chat_group ORDER BY order_index ASC, create_time ASC",
    );
    const rows = stmt.all() as ChatGroupRow[];
    return rows.map(parse);
  }
}
