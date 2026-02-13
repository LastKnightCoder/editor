import Database from "better-sqlite3";
import {
  TodoItem,
  CreateTodoItem,
  UpdateTodoItem,
  MoveAndReorderPayload,
  TodoItemType,
} from "@/types";
import ContentTable from "./content";
import TodoCalendarSyncTable from "./todo-calendar-sync";
import { Descendant } from "slate";

export default class TodoItemTable {
  static upgradeTable(db: Database.Database) {
    const tableInfo = db.pragma("table_info(todo_item)") as Array<{
      name: string;
    }>;
    const columnNames = new Set(tableInfo.map((col) => col.name));

    // 迁移旧的 description 列到 description_content_id
    const hasOldDescription = columnNames.has("description");
    const hasNewDescriptionContentId = columnNames.has(
      "description_content_id",
    );

    if (hasOldDescription && !hasNewDescriptionContentId) {
      // 添加新列
      db.exec(
        `ALTER TABLE todo_item ADD COLUMN description_content_id INTEGER;`,
      );

      // 获取所有有描述的待办项
      const itemsWithDescription = db
        .prepare(
          `SELECT id, description FROM todo_item WHERE description IS NOT NULL AND description != ''`,
        )
        .all() as Array<{ id: number; description: string }>;

      // 为每个描述创建 content 记录
      for (const item of itemsWithDescription) {
        const content = [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: item.description }],
          },
        ] satisfies Descendant[];
        const contentId = ContentTable.createContent(db, { content });

        // 更新 todo_item 的 description_content_id
        db.prepare(
          `UPDATE todo_item SET description_content_id = ? WHERE id = ?`,
        ).run(contentId, item.id);
      }

      // 删除旧的 description 列（SQLite 需要重建表）
      db.exec(`
        CREATE TABLE todo_item_new (
          id INTEGER PRIMARY KEY,
          group_id INTEGER NOT NULL,
          parent_id INTEGER,
          title TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'normal',
          description_content_id INTEGER,
          is_completed INTEGER NOT NULL DEFAULT 0 CHECK(is_completed IN (0,1)),
          start_at INTEGER,
          due_at INTEGER,
          remind_before INTEGER,
          completed_at INTEGER,
          sort_index INTEGER NOT NULL DEFAULT 0,
          is_archived INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0,1)),
          create_time INTEGER NOT NULL,
          update_time INTEGER NOT NULL
        );
      `);

      db.exec(`
        INSERT INTO todo_item_new
        SELECT id, group_id, parent_id, title, 'normal', description_content_id,
               is_completed, NULL, due_at, NULL, completed_at, sort_index, is_archived,
               create_time, update_time
        FROM todo_item;
      `);

      db.exec(`DROP TABLE todo_item;`);
      db.exec(`ALTER TABLE todo_item_new RENAME TO todo_item;`);

      // 重建索引
      this.rebuildIndexes(db);
    }

    // 添加新字段（如果不存在）
    if (!columnNames.has("type")) {
      db.exec(
        `ALTER TABLE todo_item ADD COLUMN type TEXT NOT NULL DEFAULT 'normal';`,
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_todo_item_type ON todo_item(type);`,
      );
    }

    if (!columnNames.has("start_at")) {
      db.exec(`ALTER TABLE todo_item ADD COLUMN start_at INTEGER;`);
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_todo_item_start ON todo_item(start_at);`,
      );
    }

    if (!columnNames.has("remind_before")) {
      db.exec(`ALTER TABLE todo_item ADD COLUMN remind_before INTEGER;`);
    }

    // 数据迁移：根据 due_at 设置任务类型
    // 有 due_at 的任务设为 deadline 类型
    db.exec(`
      UPDATE todo_item
      SET type = 'deadline'
      WHERE due_at IS NOT NULL AND type = 'normal';
    `);
  }

  static rebuildIndexes(db: Database.Database) {
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
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_item_description_content ON todo_item(description_content_id);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_item_type ON todo_item(type);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_item_start ON todo_item(start_at);`,
    );
  }

  static getListenEvents() {
    return {
      "todo:list-items": this.listItems.bind(this),
      "todo:list-items-by-type": this.listItemsByType.bind(this),
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
    const item: TodoItem = {
      id: row.id,
      groupId: row.group_id,
      parentId: row.parent_id ?? null,
      title: row.title,
      type: (row.type as TodoItemType) || "normal",
      descriptionContentId: row.description_content_id ?? null,
      isCompleted: Boolean(row.is_completed),
      startAt: row.start_at ?? null,
      dueAt: row.due_at ?? null,
      remindBefore: row.remind_before ?? null,
      completedAt: row.completed_at ?? null,
      sortIndex: row.sort_index,
      isArchived: Boolean(row.is_archived),
      createTime: row.create_time,
      updateTime: row.update_time,
    };

    // 如果 JOIN 了 content 表，添加 descriptionContent
    if (row.content_content) {
      item.descriptionContent = JSON.parse(row.content_content);
    }

    return item;
  }

  static listItems(
    db: Database.Database,
    params: { groupId: number },
  ): TodoItem[] {
    const stmt = db.prepare(
      `SELECT
        ti.*,
        c.content as content_content
      FROM todo_item ti
      LEFT JOIN contents c ON ti.description_content_id = c.id
      WHERE ti.group_id = ? AND ti.is_archived = 0
      ORDER BY ti.parent_id IS NOT NULL, ti.parent_id, ti.sort_index`,
    );
    return (stmt.all(params.groupId) as any[]).map(this.parse);
  }

  // 按任务类型列出所有任务（用于系统组）
  static listItemsByType(
    db: Database.Database,
    params: { type: TodoItemType | "all" },
  ): TodoItem[] {
    let sql = `
      SELECT
        ti.*,
        c.content as content_content
      FROM todo_item ti
      LEFT JOIN contents c ON ti.description_content_id = c.id
      WHERE ti.is_archived = 0
    `;

    if (params.type !== "all") {
      sql += ` AND ti.type = ?`;
    }

    sql += ` ORDER BY ti.group_id, ti.parent_id IS NOT NULL, ti.parent_id, ti.sort_index`;

    const stmt = db.prepare(sql);
    const rows = params.type === "all" ? stmt.all() : stmt.all(params.type);
    return (rows as any[]).map(this.parse);
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

    // 如果提供了 description，创建 content 记录
    let descriptionContentId: number | null = null;
    if (payload.description) {
      const content = [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: payload.description }],
        },
      ] satisfies Descendant[];
      descriptionContentId = ContentTable.createContent(db, { content });
    }

    // 确定任务类型
    const type = payload.type || "normal";

    const insert = db.prepare(
      `INSERT INTO todo_item (group_id, parent_id, title, type, description_content_id, is_completed, start_at, due_at, remind_before, completed_at, sort_index, is_archived, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, ?, 0, ?, ?)`,
    );
    const res = insert.run(
      payload.groupId,
      payload.parentId ?? null,
      payload.title,
      type,
      descriptionContentId,
      payload.startAt ?? null,
      payload.dueAt ?? null,
      payload.remindBefore ?? null,
      sortIndex,
      now,
      now,
    );
    const id = Number(res.lastInsertRowid);
    const row = db
      .prepare(
        `SELECT
          ti.*,
          c.content as content_content
        FROM todo_item ti
        LEFT JOIN contents c ON ti.description_content_id = c.id
        WHERE ti.id = ?`,
      )
      .get(id);
    return this.parse(row);
  }

  static updateItem(db: Database.Database, payload: UpdateTodoItem): TodoItem {
    const now = Date.now();
    const cur = db
      .prepare(`SELECT * FROM todo_item WHERE id = ?`)
      .get(payload.id) as
      | {
          title: string;
          type: string;
          description_content_id: number | null;
          start_at: number | null;
          due_at: number | null;
          remind_before: number | null;
        }
      | undefined;
    if (!cur) throw new Error("todo_item not found");

    const title = payload.title ?? cur.title;
    const type = payload.type ?? cur.type;
    const descriptionContentId =
      payload.descriptionContentId === undefined
        ? cur.description_content_id
        : payload.descriptionContentId;
    const startAt =
      (payload.startAt === undefined ? cur.start_at : payload.startAt) ?? null;
    const dueAt =
      (payload.dueAt === undefined ? cur.due_at : payload.dueAt) ?? null;
    const remindBefore =
      (payload.remindBefore === undefined
        ? cur.remind_before
        : payload.remindBefore) ?? null;

    db.prepare(
      `UPDATE todo_item SET title = ?, type = ?, description_content_id = ?, start_at = ?, due_at = ?, remind_before = ?, update_time = ? WHERE id = ?`,
    ).run(
      title,
      type,
      descriptionContentId,
      startAt,
      dueAt,
      remindBefore,
      now,
      payload.id,
    );

    const row = db
      .prepare(
        `SELECT
          ti.*,
          c.content as content_content
        FROM todo_item ti
        LEFT JOIN contents c ON ti.description_content_id = c.id
        WHERE ti.id = ?`,
      )
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
    // 获取 description_content_id
    const item = db
      .prepare(`SELECT description_content_id FROM todo_item WHERE id = ?`)
      .get(id) as { description_content_id: number | null } | undefined;

    // 删除待办项
    const changes = db
      .prepare(`DELETE FROM todo_item WHERE id = ?`)
      .run(id).changes;

    // 如果有关联的 content，删除它（会减少引用计数）
    if (item?.description_content_id) {
      ContentTable.deleteContent(db, item.description_content_id);
    }

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
      type?: TodoItemType;
      description?: string;
      startAt?: number | null;
      dueAt?: number | null;
      remindBefore?: number | null;
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
      type: payload.type,
      description: payload.description,
      startAt: payload.startAt ?? null,
      dueAt: payload.dueAt ?? null,
      remindBefore: payload.remindBefore ?? null,
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

    // 先获取所有要删除的节点的 ID 和 description_content_id
    const descendants = db
      .prepare(
        `
      WITH RECURSIVE descendants(id) AS (
        SELECT id FROM todo_item WHERE id = ?
        UNION ALL
        SELECT ti.id FROM todo_item ti JOIN descendants d ON ti.parent_id = d.id
      )
      SELECT id, description_content_id FROM todo_item WHERE id IN (SELECT id FROM descendants)
    `,
      )
      .all(id) as Array<{ id: number; description_content_id: number | null }>;

    // 清理所有关联的日历事件（在删除待办项之前）
    for (const item of descendants) {
      try {
        TodoCalendarSyncTable.removeTodoItem(db, { todoItemId: item.id });
      } catch (e) {
        // 忽略清理日历事件时的错误
      }
    }

    // 删除待办项
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

    // 删除所有关联的 content（会减少引用计数）
    for (const item of descendants) {
      if (item.description_content_id) {
        ContentTable.deleteContent(db, item.description_content_id);
      }
    }

    return changes;
  }
}
