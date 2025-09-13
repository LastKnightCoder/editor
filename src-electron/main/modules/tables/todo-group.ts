import Database from "better-sqlite3";
import { TodoGroup, CreateTodoGroup, UpdateTodoGroup } from "@/types";

export default class TodoGroupTable {
  static initTable(db: Database.Database) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS todo_group (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        color TEXT,
        sort_index INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0,1)),
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );`,
    );

    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_group_sort ON todo_group(sort_index);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_group_archived ON todo_group(is_archived);`,
    );
  }

  static upgradeTable(_db: Database.Database) {
    // no-opno-op
  }

  static getListenEvents() {
    return {
      "todo:list-groups": this.listGroups.bind(this),
      "todo:create-group": this.createGroup.bind(this),
      "todo:update-group": this.updateGroup.bind(this),
      "todo:archive-group": this.archiveGroup.bind(this),
      "todo:reorder-groups": this.reorderGroups.bind(this),
      "todo:get-group-stats": this.getGroupStats.bind(this),
    } as const;
  }

  static parse(row: any): TodoGroup {
    return {
      id: row.id,
      title: row.title,
      color: row.color ?? undefined,
      sortIndex: row.sort_index,
      isArchived: Boolean(row.is_archived),
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static listGroups(db: Database.Database): TodoGroup[] {
    const stmt = db.prepare(
      `SELECT * FROM todo_group WHERE is_archived = 0 ORDER BY sort_index ASC, create_time ASC`,
    );
    return (stmt.all() as any[]).map(this.parse);
  }

  static getMaxSortIndex(db: Database.Database): number {
    const row = db
      .prepare(`SELECT MAX(sort_index) AS max_idx FROM todo_group`)
      .get() as { max_idx: number | null };
    return row?.max_idx ?? 0;
  }

  static getGroupById(db: Database.Database, id: number): TodoGroup | null {
    const row = db.prepare(`SELECT * FROM todo_group WHERE id = ?`).get(id);
    return row ? this.parse(row) : null;
  }

  static createGroup(
    db: Database.Database,
    payload: CreateTodoGroup,
  ): TodoGroup | null {
    const now = Date.now();
    const sortIndex = this.getMaxSortIndex(db) + 1024;
    const insert = db.prepare(
      `INSERT INTO todo_group (title, color, sort_index, is_archived, create_time, update_time)
       VALUES (?, ?, ?, 0, ?, ?)`,
    );
    const res = insert.run(
      payload.title,
      payload.color ?? null,
      sortIndex,
      now,
      now,
    );
    const id = Number(res.lastInsertRowid);
    return this.getGroupById(db, id);
  }

  static updateGroup(
    db: Database.Database,
    payload: UpdateTodoGroup,
  ): TodoGroup {
    const now = Date.now();
    const cur = db
      .prepare(`SELECT * FROM todo_group WHERE id = ?`)
      .get(payload.id) as
      | {
          title: string;
          color: string | null;
          sort_index: number;
          is_archived: number;
        }
      | undefined;
    if (!cur) throw new Error("todo_group not found");
    const title = payload.title ?? cur.title;
    const color =
      (payload.color === undefined ? cur.color : payload.color) ?? null;
    const sortIndex = payload.sortIndex ?? cur.sort_index;
    const isArchived = payload.isArchived ?? Boolean(cur.is_archived);
    db.prepare(
      `UPDATE todo_group SET title = ?, color = ?, sort_index = ?, is_archived = ?, update_time = ? WHERE id = ?`,
    ).run(title, color, sortIndex, isArchived ? 1 : 0, now, payload.id);
    const row = db
      .prepare(`SELECT * FROM todo_group WHERE id = ?`)
      .get(payload.id);
    return this.parse(row);
  }

  static archiveGroup(
    db: Database.Database,
    params: { id: string; isArchived: boolean },
  ): number {
    const now = Date.now();
    const res = db
      .prepare(
        `UPDATE todo_group SET is_archived = ?, update_time = ? WHERE id = ?`,
      )
      .run(params.isArchived ? 1 : 0, now, params.id);
    return res.changes;
  }

  static reorderGroups(
    db: Database.Database,
    params: { orderedIds: number[] },
  ): number {
    const ids = params.orderedIds;
    const step = 1024;
    const upd = db.prepare(
      `UPDATE todo_group SET sort_index = ?, update_time = ? WHERE id = ?`,
    );
    const now = Date.now();
    ids.forEach((id, idx) => {
      upd.run((idx + 1) * step, now, id);
    });
    return ids.length;
  }

  static getGroupStats(db: Database.Database): {
    groupId: number;
    total: number;
    uncompleted: number;
    overdue: number;
  }[] {
    const now = Date.now();
    const stmt = db.prepare(
      `SELECT 
         group_id as groupId,
         COUNT(*) as total,
         SUM(CASE WHEN is_completed = 0 THEN 1 ELSE 0 END) as uncompleted,
         SUM(CASE WHEN is_completed = 0 AND due_at IS NOT NULL AND due_at < ? THEN 1 ELSE 0 END) as overdue
       FROM todo_item
       WHERE is_archived = 0
       GROUP BY group_id`,
    );
    const rows = stmt.all(now) as any[];
    return rows.map((r) => ({
      groupId: Number(r.groupId),
      total: Number(r.total || 0),
      uncompleted: Number(r.uncompleted || 0),
      overdue: Number(r.overdue || 0),
    }));
  }
}
