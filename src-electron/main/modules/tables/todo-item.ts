import Database from "better-sqlite3";
import {
  TodoItem,
  CreateTodoItem,
  UpdateTodoItem,
  MoveAndReorderPayload,
} from "@/types";

export default class TodoItemTable {
  static initTable(db: Database.Database) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS todo_item (
        id INTEGER PRIMARY KEY,
        group_id INTEGER NOT NULL,
        parent_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        is_completed INTEGER NOT NULL DEFAULT 0 CHECK(is_completed IN (0,1)),
        due_at INTEGER,
        completed_at INTEGER,
        sort_index INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0,1)),
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_item_group ON todo_item(group_id);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_item_parent ON todo_item(parent_id);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_item_sort ON todo_item(parent_id, sort_index);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_item_completed ON todo_item(is_completed);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_item_due ON todo_item(due_at);`,
    );
  }

  static upgradeTable(_db: Database.Database) {
    // no-opno-op
  }

  static getListenEvents() {
    return {
      "todo:list-items": this.listItems.bind(this),
      "todo:create-item": this.createItem.bind(this),
      "todo:create-item-relative": this.createItemRelative.bind(this),
      "todo:update-item": this.updateItem.bind(this),
      "todo:toggle-complete-cascade": this.toggleCompleteCascade.bind(this),
      "todo:move-and-reorder": this.moveAndReorder.bind(this),
      "todo:archive-item": this.archiveItem.bind(this),
      "todo:delete-item": this.deleteItem.bind(this),
      "todo:delete-item-cascade": this.deleteItemCascade.bind(this),
    } as const;
  }

  static parse(row: any): TodoItem {
    return {
      id: row.id,
      groupId: row.group_id,
      parentId: row.parent_id ?? null,
      title: row.title,
      description: row.description ?? undefined,
      isCompleted: Boolean(row.is_completed),
      dueAt: row.due_at ?? null,
      completedAt: row.completed_at ?? null,
      sortIndex: row.sort_index,
      isArchived: Boolean(row.is_archived),
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static listItems(
    db: Database.Database,
    params: { groupId: number },
  ): TodoItem[] {
    const stmt = db.prepare(
      `SELECT * FROM todo_item WHERE group_id = ? AND is_archived = 0 ORDER BY parent_id IS NOT NULL, parent_id, sort_index`,
    );
    return (stmt.all(params.groupId) as any[]).map(this.parse);
  }

  static getMaxSortIndexInParent(
    db: Database.Database,
    parentId: number | null,
    groupId: number,
  ): number {
    const stmt = parentId
      ? db.prepare(
          `SELECT MAX(sort_index) AS max_idx FROM todo_item WHERE parent_id = ? AND group_id = ?`,
        )
      : db.prepare(
          `SELECT MAX(sort_index) AS max_idx FROM todo_item WHERE parent_id IS NULL AND group_id = ?`,
        );
    const row = parentId
      ? (stmt.get(parentId, groupId) as any)
      : (stmt.get(groupId) as any);
    return row?.max_idx ?? 0;
  }

  static createItem(db: Database.Database, payload: CreateTodoItem): TodoItem {
    const now = Date.now();
    const sortIndex =
      this.getMaxSortIndexInParent(
        db,
        payload.parentId ?? null,
        payload.groupId,
      ) + 1024;
    const insert = db.prepare(
      `INSERT INTO todo_item (group_id, parent_id, title, description, is_completed, due_at, completed_at, sort_index, is_archived, create_time, update_time)
       VALUES (?, ?, ?, ?, 0, ?, NULL, ?, 0, ?, ?)`,
    );
    const res = insert.run(
      payload.groupId,
      payload.parentId ?? null,
      payload.title,
      payload.description ?? null,
      payload.dueAt ?? null,
      sortIndex,
      now,
      now,
    );
    const id = Number(res.lastInsertRowid);
    const row = db.prepare(`SELECT * FROM todo_item WHERE id = ?`).get(id);
    return this.parse(row);
  }

  static updateItem(db: Database.Database, payload: UpdateTodoItem): TodoItem {
    const now = Date.now();
    const cur = db
      .prepare(`SELECT * FROM todo_item WHERE id = ?`)
      .get(payload.id) as
      | {
          title: string;
          description: string | null;
          due_at: number | null;
        }
      | undefined;
    if (!cur) throw new Error("todo_item not found");
    const title = payload.title ?? cur.title;
    const description =
      (payload.description === undefined
        ? cur.description
        : payload.description) ?? null;
    const dueAt =
      (payload.dueAt === undefined ? cur.due_at : payload.dueAt) ?? null;
    db.prepare(
      `UPDATE todo_item SET title = ?, description = ?, due_at = ?, update_time = ? WHERE id = ?`,
    ).run(title, description, dueAt, now, payload.id);
    const row = db
      .prepare(`SELECT * FROM todo_item WHERE id = ?`)
      .get(payload.id);
    return this.parse(row);
  }

  static archiveItem(
    db: Database.Database,
    params: { id: number; isArchived: boolean },
  ): number {
    const now = Date.now();
    const res = db
      .prepare(
        `UPDATE todo_item SET is_archived = ?, update_time = ? WHERE id = ?`,
      )
      .run(params.isArchived ? 1 : 0, now, params.id);
    return res.changes;
  }

  static deleteItem(db: Database.Database, id: number): number {
    const changes = db
      .prepare(`DELETE FROM todo_item WHERE id = ?`)
      .run(id).changes;
    return changes;
  }

  static toggleCompleteCascade(
    db: Database.Database,
    params: { id: number; isCompleted: boolean },
  ): number {
    const now = Date.now();
    const isCompleted = params.isCompleted ? 1 : 0;
    db.exec(
      `WITH RECURSIVE descendants(id) AS (
        SELECT id FROM todo_item WHERE id = ${params.id}
        UNION ALL
        SELECT ti.id FROM todo_item ti JOIN descendants d ON ti.parent_id = d.id
      )
      UPDATE todo_item
      SET is_completed = ${isCompleted},
          completed_at = CASE WHEN ${isCompleted} = 1 THEN ${now} ELSE NULL END,
          update_time = ${now}
      WHERE id IN (SELECT id FROM descendants);`,
    );
    const res = db.prepare(`SELECT changes() AS c`).get() as { c: number };
    return res.c;
  }

  static moveAndReorder(
    db: Database.Database,
    payload: MoveAndReorderPayload,
  ): TodoItem {
    const now = Date.now();
    let newIndex: number;

    const getIndex = (id?: number) => {
      if (!id) return undefined;
      const row = db
        .prepare(`SELECT sort_index, parent_id FROM todo_item WHERE id = ?`)
        .get(id) as
        | { sort_index: number; parent_id: number | null }
        | undefined;
      return row?.sort_index;
    };

    const siblings = this.listSiblings(
      db,
      payload.toGroupId,
      payload.toParentId ?? null,
    )
      .filter((s) => s.id !== payload.id)
      .sort((a, b) => a.sortIndex - b.sortIndex);

    const beforeIdx = getIndex(payload.beforeId);
    const afterIdx = getIndex(payload.afterId);

    const recomputeWithNormalized = (): number => {
      const step = 1024;
      const upd = db.prepare(
        `UPDATE todo_item SET sort_index = ?, update_time = ? WHERE id = ?`,
      );
      siblings.forEach((it, idx) => upd.run((idx + 1) * step, now, it.id));
      // 将目标放到末尾作为兜底
      return (siblings.length + 1) * step;
    };

    if (beforeIdx !== undefined && afterIdx !== undefined) {
      newIndex = Math.floor((beforeIdx + afterIdx) / 2);
    } else if (beforeIdx !== undefined) {
      // 插入到 beforeId 前面 => 介于 prevSibling 与 beforeId 之间
      const prev = siblings.filter((s) => s.sortIndex < beforeIdx).pop();
      const lower = prev?.sortIndex ?? 0;
      newIndex = Math.floor((lower + beforeIdx) / 2);
      if (
        !Number.isFinite(newIndex) ||
        newIndex <= 0 ||
        newIndex === lower ||
        newIndex === beforeIdx
      ) {
        newIndex = recomputeWithNormalized();
      }
    } else if (afterIdx !== undefined) {
      // 插入到 afterId 后面 => 介于 afterId 与 nextSibling 之间
      const next = siblings.find((s) => s.sortIndex > afterIdx);
      const upper = next?.sortIndex ?? afterIdx + 1024;
      newIndex = Math.floor((afterIdx + upper) / 2);
      if (
        !Number.isFinite(newIndex) ||
        newIndex <= afterIdx ||
        newIndex >= upper
      ) {
        newIndex = recomputeWithNormalized();
      }
    } else {
      // 末尾
      const lastIdx =
        siblings.length > 0 ? siblings[siblings.length - 1].sortIndex : 0;
      newIndex = lastIdx + 1024;
    }

    db.prepare(
      `UPDATE todo_item SET group_id = ?, parent_id = ?, sort_index = ?, update_time = ? WHERE id = ?`,
    ).run(
      payload.toGroupId,
      payload.toParentId ?? null,
      newIndex,
      now,
      payload.id,
    );

    const row = db
      .prepare(`SELECT * FROM todo_item WHERE id = ?`)
      .get(payload.id);
    return this.parse(row);
  }

  static listSiblings(
    db: Database.Database,
    groupId: number,
    parentId: number | null,
  ): TodoItem[] {
    const stmt =
      parentId !== null
        ? db.prepare(
            `SELECT * FROM todo_item WHERE group_id = ? AND parent_id = ? ORDER BY sort_index`,
          )
        : db.prepare(
            `SELECT * FROM todo_item WHERE group_id = ? AND parent_id IS NULL ORDER BY sort_index`,
          );
    const rows =
      parentId !== null
        ? (stmt.all(groupId, parentId) as any[])
        : (stmt.all(groupId) as any[]);
    return rows.map(this.parse);
  }

  // 新增：相对位置创建 TodoItem
  static createItemRelative(
    db: Database.Database,
    payload: {
      refId: number;
      position: "child" | "above" | "below";
      title: string;
      description?: string;
      dueAt?: number | null;
    },
  ): TodoItem {
    const ref = db
      .prepare(`SELECT * FROM todo_item WHERE id = ?`)
      .get(payload.refId) as any;
    if (!ref) throw new Error("ref todo_item not found");

    const refItem = this.parse(ref);

    // 1) 先创建
    const created = this.createItem(db, {
      groupId: refItem.groupId,
      parentId: payload.position === "child" ? refItem.id : refItem.parentId,
      title: payload.title,
      description: payload.description,
      dueAt: payload.dueAt ?? null,
    });

    if (payload.position === "child") {
      return created;
    }

    // 2) 计算相对排序并移动
    let beforeId: number | undefined;
    let afterId: number | undefined;

    if (payload.position === "above") {
      // 插到 ref 上方 => between(prevSibling, ref)
      const siblings = this.listSiblings(db, refItem.groupId, refItem.parentId);
      const idx = siblings.findIndex((s) => s.id === refItem.id);
      const prev = idx > 0 ? siblings[idx - 1] : undefined;
      beforeId = prev?.id;
      afterId = refItem.id;
    } else if (payload.position === "below") {
      // 插到 ref 下方 => between(ref, nextSibling)
      const siblings = this.listSiblings(db, refItem.groupId, refItem.parentId);
      const idx = siblings.findIndex((s) => s.id === refItem.id);
      const next =
        idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : undefined;
      beforeId = refItem.id;
      afterId = next?.id;
    }

    const moved = this.moveAndReorder(db, {
      id: created.id,
      toGroupId: refItem.groupId,
      toParentId: refItem.parentId,
      beforeId,
      afterId,
    });

    return moved;
  }

  // 递归删除：删除指定节点及其所有子节点
  static deleteItemCascade(
    db: Database.Database,
    params: { id: number },
  ): number {
    const id =
      typeof params === "object"
        ? (params as any).id
        : (params as unknown as number);
    const stmt = db.prepare(`
      WITH RECURSIVE descendants(id) AS (
        SELECT id FROM todo_item WHERE id = ?
        UNION ALL
        SELECT ti.id FROM todo_item ti JOIN descendants d ON ti.parent_id = d.id
      )
      DELETE FROM todo_item WHERE id IN (SELECT id FROM descendants)
    `);
    const res = stmt.run(id);
    const changes =
      (db.prepare(`SELECT changes() AS c`).get() as any)?.c ?? res.changes ?? 0;
    return changes;
  }
}
