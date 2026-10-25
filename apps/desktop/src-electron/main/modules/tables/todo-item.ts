import Database from "better-sqlite3";
import {
  TodoItem,
  CreateTodoItem,
  UpdateTodoItem,
  MoveAndReorderPayload,
  TodoItemType,
  CalendarEvent,
} from "@/types";
import ContentTable from "./content";
import TodoCalendarSyncTable from "./todo-calendar-sync";
import CalendarEventTable from "./calendar-event";
import TodoNoteLinkTable from "./todo-note-link";
import { Descendant } from "slate";
import { prepareTaskNodes } from "../content-task-patches";
import { getNextTaskEntityId } from "./module-entity-id";

export default class TodoItemTable {
  static getListenEvents() {
    return {
      "todo:list-items": this.listItems.bind(this),
      "todo:list-items-by-type": this.listItemsByType.bind(this),
      "todo:create-item": (db: Database.Database, payload: CreateTodoItem) =>
        this.createItem(db, payload),
      "todo:create-item-relative": this.createItemRelative.bind(this),
      "todo:create-with-schedule": this.createWithSchedule.bind(this),
      "todo:update-item": this.updateItem.bind(this),
      "todo:toggle-complete-cascade": this.toggleCompleteCascade.bind(this),
      "todo:move-and-reorder": this.moveAndReorder.bind(this),
      "todo:archive-item": this.archiveItem.bind(this),
      "todo:delete-item": this.deleteItem.bind(this),
      "todo:delete-item-cascade": this.deleteItemCascade.bind(this),
    } as const;
  }

  /** 「计划任务」已退役（D-114）：计划时段改由关联待办的日历事件表达，拒绝再写入 planned */
  static assertType(type: string | undefined) {
    if (type !== undefined && !["normal", "deadline", "recurring"].includes(type)) {
      throw new Error(`Unsupported todo type: ${type}`);
    }
  }

  /**
   * 删除待办时处理它的安排（calendar_event.todo_item_id）：尚未开始的随待办删除，
   * 已开始 / 已结束的解除关联、留作时间记录。
   */
  static releaseSchedules(db: Database.Database, todoItemId: number, now = Date.now()) {
    const events = db
      .prepare(
        `SELECT id, start_date, start_time, all_day, detail_content_id FROM calendar_event WHERE todo_item_id = ?`
      )
      .all(todoItemId) as Array<{
      id: number;
      start_date: number;
      start_time: number | null;
      all_day: number;
      detail_content_id: number | null;
    }>;
    for (const event of events) {
      db.prepare("DELETE FROM todo_schedule_occurrence WHERE calendar_event_id=?").run(event.id);
      const startMs = event.start_date + (event.all_day ? 0 : (event.start_time ?? 0)) * 60_000;
      if (startMs > now) CalendarEventTable.deleteEvent(db, event.id);
      else db.prepare(`UPDATE calendar_event SET todo_item_id = NULL WHERE id = ?`).run(event.id);
    }
  }

  /** 快速添加写了时段：建普通待办并同时把它安排进该时段（同一事务） */
  static createWithSchedule(
    db: Database.Database,
    payload: CreateTodoItem & {
      schedule: { startDate: number; startTime: number; endTime: number };
    }
  ): { item: TodoItem; event: CalendarEvent } {
    const { schedule, ...item } = payload;
    const created = this.createItem(db, { ...item, type: "normal", startAt: null, dueAt: null });
    const event = CalendarEventTable.createEventForTodo(db, {
      todoItemId: created.id,
      ...schedule,
    });
    return { item: created, event };
  }

  /**
   * 日历一致性：截止任务在增改后写入「待办清单」日历；类型变更先清旧映射再按新类型重建。
   * 周期任务的日历事件由日历读取时按规则即时生成（calendar-event.getEventsByDateRange），这里不写。
   * 必要同步失败向事务调用方传播，避免提交不一致的待办与标记。
   */
  static syncCalendar(db: Database.Database, item: TodoItem, previousType?: TodoItemType) {
    if (previousType && previousType !== item.type) {
      TodoCalendarSyncTable.removeTodoItem(db, { todoItemId: item.id });
    }
    if (item.type === "deadline") {
      TodoCalendarSyncTable.syncTodoItem(db, { todoItem: item });
    }
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

  static listItems(db: Database.Database, params: { groupId: number }): TodoItem[] {
    const stmt = db.prepare(
      `SELECT
        ti.*,
        c.content as content_content
      FROM todo_item ti
      LEFT JOIN contents c ON ti.description_content_id = c.id
      WHERE ti.group_id = ? AND ti.is_archived = 0
      ORDER BY ti.parent_id IS NOT NULL, ti.parent_id, ti.sort_index`
    );
    return (stmt.all(params.groupId) as any[]).map(this.parse);
  }

  // 按任务类型列出所有任务（用于系统组）
  static listItemsByType(
    db: Database.Database,
    params: { type: TodoItemType | "all" }
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
    groupId: number
  ): number {
    const stmt = parentId
      ? db.prepare(
          `SELECT MAX(sort_index) AS max_idx FROM todo_item WHERE parent_id = ? AND group_id = ?`
        )
      : db.prepare(
          `SELECT MAX(sort_index) AS max_idx FROM todo_item WHERE parent_id IS NULL AND group_id = ?`
        );
    const row = parentId ? (stmt.get(parentId, groupId) as any) : (stmt.get(groupId) as any);
    return row?.max_idx ?? 0;
  }

  static createItem(
    db: Database.Database,
    payload: CreateTodoItem,
    options: { syncCalendar?: boolean } = {}
  ): TodoItem {
    const now = Date.now();
    const sortIndex =
      this.getMaxSortIndexInParent(db, payload.parentId ?? null, payload.groupId) + 1024;

    // 如果提供了 description，创建 content 记录
    let descriptionContentId: number | null = null;
    if (payload.description) {
      const content = [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: payload.description }],
        },
      ] satisfies Descendant[];
      const document = prepareTaskNodes(content);
      descriptionContentId = ContentTable.createContent(db, {
        content: document.content as Descendant[],
        contracts: document.contracts,
      });
    }

    // 确定任务类型
    this.assertType(payload.type);
    const type = payload.type || "normal";

    const insert = db.prepare(
      `INSERT INTO todo_item (id, group_id, parent_id, title, type, description_content_id, is_completed, start_at, due_at, remind_before, completed_at, sort_index, is_archived, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, ?, 0, ?, ?)`
    );
    const res = insert.run(
      getNextTaskEntityId(db, "todo_item"),
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
      now
    );
    const id = Number(res.lastInsertRowid);
    const row = db
      .prepare(
        `SELECT
          ti.*,
          c.content as content_content
        FROM todo_item ti
        LEFT JOIN contents c ON ti.description_content_id = c.id
        WHERE ti.id = ?`
      )
      .get(id);
    const created = this.parse(row);
    if (options.syncCalendar !== false) this.syncCalendar(db, created);
    return created;
  }

  static updateItem(db: Database.Database, payload: UpdateTodoItem): TodoItem {
    const now = Date.now();
    const cur = db.prepare(`SELECT * FROM todo_item WHERE id = ?`).get(payload.id) as
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

    this.assertType(payload.type);
    const title = payload.title ?? cur.title;
    const type = payload.type ?? cur.type;
    const descriptionContentId =
      payload.descriptionContentId === undefined
        ? cur.description_content_id
        : payload.descriptionContentId;
    const startAt = (payload.startAt === undefined ? cur.start_at : payload.startAt) ?? null;
    const dueAt = (payload.dueAt === undefined ? cur.due_at : payload.dueAt) ?? null;
    const remindBefore =
      (payload.remindBefore === undefined ? cur.remind_before : payload.remindBefore) ?? null;

    db.prepare(
      `UPDATE todo_item SET title = ?, type = ?, description_content_id = ?, start_at = ?, due_at = ?, remind_before = ?, update_time = ? WHERE id = ?`
    ).run(title, type, descriptionContentId, startAt, dueAt, remindBefore, now, payload.id);
    // 安排的标题跟随待办
    if (title !== cur.title) {
      db.prepare(`UPDATE calendar_event SET title = ?, update_time = ? WHERE todo_item_id = ?`).run(
        title,
        now,
        payload.id
      );
    }

    const row = db
      .prepare(
        `SELECT
          ti.*,
          c.content as content_content
        FROM todo_item ti
        LEFT JOIN contents c ON ti.description_content_id = c.id
        WHERE ti.id = ?`
      )
      .get(payload.id);
    const updated = this.parse(row);
    this.syncCalendar(db, updated, cur.type as TodoItemType);
    return updated;
  }

  static archiveItem(db: Database.Database, params: { id: number; isArchived: boolean }): number {
    const now = Date.now();
    const res = db
      .prepare(`UPDATE todo_item SET is_archived = ?, update_time = ? WHERE id = ?`)
      .run(params.isArchived ? 1 : 0, now, params.id);
    return res.changes;
  }

  static deleteItem(db: Database.Database, id: number): number {
    // 先清日历映射与事件（映射表无外键，不清会残留到下次启动的孤儿清理）
    TodoCalendarSyncTable.removeTodoItem(db, { todoItemId: id });
    this.releaseSchedules(db, id);

    // 获取 description_content_id
    const item = db.prepare(`SELECT description_content_id FROM todo_item WHERE id = ?`).get(id) as
      | { description_content_id: number | null }
      | undefined;

    // 删除待办项
    const changes = db.prepare(`DELETE FROM todo_item WHERE id = ?`).run(id).changes;

    // 如果有关联的 content，删除它（会减少引用计数）
    if (item?.description_content_id) {
      ContentTable.deleteContent(db, item.description_content_id);
    }

    return changes;
  }

  static toggleCompleteCascade(
    db: Database.Database,
    params: { id: number; isCompleted: boolean }
  ): number {
    const now = Date.now();
    const isCompleted = params.isCompleted ? 1 : 0;
    db.exec(
      `WITH RECURSIVE descendants(id) AS (
        SELECT id FROM todo_item WHERE id = ${params.id}
        UNION
        SELECT ti.id FROM todo_item ti JOIN descendants d ON ti.parent_id = d.id
      )
      UPDATE todo_item
      SET is_completed = ${isCompleted},
          completed_at = CASE WHEN ${isCompleted} = 1 THEN ${now} ELSE NULL END,
          update_time = ${now}
      WHERE id IN (SELECT id FROM descendants);`
    );
    const res = db.prepare(`SELECT changes() AS c`).get() as { c: number };
    return res.c;
  }

  /**
   * 移动 / 排序。位置语义（与 legacy SortableItem、MCP move_todo 一致）：
   *  - beforeId = 插到它「前面」（落位后的下一个兄弟）；afterId = 插到它「后面」（落位后的上一个兄弟）；
   *  - 两者都给时以 beforeId 定位（两者本应相邻）；都不给 = 追加到末尾。
   * sort_index 取前后邻居的中点；间隙耗尽（相邻整数）时整组按 1024 步长重排并把目标放进正确位置——
   * 旧实现两参分支不校验碰撞（反复插入同一对之间会撞值乱序），单参分支碰撞时把目标兜底扔到末尾。
   */
  static moveAndReorder(db: Database.Database, payload: MoveAndReorderPayload): TodoItem {
    const now = Date.now();
    const STEP = 1024;

    const siblings = this.listSiblings(db, payload.toGroupId, payload.toParentId ?? null)
      .filter(s => s.id !== payload.id)
      .sort((a, b) => a.sortIndex - b.sortIndex);
    const indexOf = (id?: number) => (id == null ? -1 : siblings.findIndex(s => s.id === id));

    let position = siblings.length;
    if (indexOf(payload.beforeId) >= 0) position = indexOf(payload.beforeId);
    else if (indexOf(payload.afterId) >= 0) position = indexOf(payload.afterId) + 1;

    const lower = position > 0 ? siblings[position - 1].sortIndex : 0;
    const upper = position < siblings.length ? siblings[position].sortIndex : lower + 2 * STEP;
    let newIndex = Math.floor((lower + upper) / 2);

    if (!Number.isFinite(newIndex) || newIndex <= lower || newIndex >= upper) {
      const update = db.prepare(
        `UPDATE todo_item SET sort_index = ?, update_time = ? WHERE id = ?`
      );
      siblings.forEach((sibling, i) => {
        update.run((i < position ? i + 1 : i + 2) * STEP, now, sibling.id);
      });
      newIndex = (position + 1) * STEP;
    }

    db.prepare(
      `UPDATE todo_item SET group_id = ?, parent_id = ?, sort_index = ?, update_time = ? WHERE id = ?`
    ).run(payload.toGroupId, payload.toParentId ?? null, newIndex, now, payload.id);

    // 跨项目移动时子任务随父迁移（子树 group_id 与根保持一致，否则子任务留在原项目成孤儿）
    db.prepare(
      `WITH RECURSIVE descendants(id) AS (
        SELECT id FROM todo_item WHERE parent_id = ?
        UNION
        SELECT ti.id FROM todo_item ti JOIN descendants d ON ti.parent_id = d.id
      )
      UPDATE todo_item SET group_id = ?, update_time = ?
      WHERE id IN (SELECT id FROM descendants) AND group_id != ?`
    ).run(payload.id, payload.toGroupId, now, payload.toGroupId);

    const row = db.prepare(`SELECT * FROM todo_item WHERE id = ?`).get(payload.id);
    return this.parse(row);
  }

  static listSiblings(db: Database.Database, groupId: number, parentId: number | null): TodoItem[] {
    const stmt =
      parentId !== null
        ? db.prepare(
            `SELECT * FROM todo_item WHERE group_id = ? AND parent_id = ? ORDER BY sort_index`
          )
        : db.prepare(
            `SELECT * FROM todo_item WHERE group_id = ? AND parent_id IS NULL ORDER BY sort_index`
          );
    const rows =
      parentId !== null ? (stmt.all(groupId, parentId) as any[]) : (stmt.all(groupId) as any[]);
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
    }
  ): TodoItem {
    const ref = db.prepare(`SELECT * FROM todo_item WHERE id = ?`).get(payload.refId) as any;
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
      const idx = siblings.findIndex(s => s.id === refItem.id);
      const prev = idx > 0 ? siblings[idx - 1] : undefined;
      beforeId = prev?.id;
      afterId = refItem.id;
    } else if (payload.position === "below") {
      // 插到 ref 下方 => between(ref, nextSibling)
      const siblings = this.listSiblings(db, refItem.groupId, refItem.parentId);
      const idx = siblings.findIndex(s => s.id === refItem.id);
      const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : undefined;
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
  static deleteItemCascade(db: Database.Database, params: { id: number }): number {
    const id = typeof params === "object" ? (params as any).id : (params as unknown as number);
    // UNION（非 UNION ALL）去重：parent_id 成环的脏数据下递归也能终止
    const rows = db
      .prepare(
        `
      WITH RECURSIVE descendants(id) AS (
        SELECT id FROM todo_item WHERE id = ?
        UNION
        SELECT ti.id FROM todo_item ti JOIN descendants d ON ti.parent_id = d.id
      )
      SELECT id FROM descendants
    `
      )
      .all(id) as Array<{ id: number }>;
    return this.deleteItemsWithRelations(
      db,
      rows.map(r => r.id)
    );
  }

  /**
   * 按 id 集合删除任务及其全部关联：日历映射 / 周期规则 + 打卡 / 笔记链接（按 detach 口径减引用）/ 描述内容。
   * 这些表无外键级联，需显式清理；调用方负责算好集合（含子孙）。返回删除的任务数。
   */
  static deleteItemsWithRelations(db: Database.Database, ids: number[]): number {
    let changes = 0;
    for (const id of ids) {
      const row = db
        .prepare(`SELECT description_content_id FROM todo_item WHERE id = ?`)
        .get(id) as { description_content_id: number | null } | undefined;
      if (!row) continue;

      TodoCalendarSyncTable.removeTodoItem(db, { todoItemId: id });
      this.releaseSchedules(db, id);
      db.prepare(
        `DELETE FROM todo_recurrence_completion
         WHERE recurrence_id IN (SELECT id FROM todo_recurrence WHERE todo_item_id = ?)`
      ).run(id);
      db.prepare(`DELETE FROM todo_recurrence WHERE todo_item_id = ?`).run(id);
      db.prepare("DELETE FROM todo_recurrence_history WHERE todo_item_id=?").run(id);
      db.prepare("DELETE FROM todo_occurrence_override WHERE todo_item_id=?").run(id);
      const links = db.prepare(`SELECT id FROM todo_note_link WHERE todo_id = ?`).all(id) as Array<{
        id: number;
      }>;
      for (const link of links) TodoNoteLinkTable.detach(db, { linkId: link.id });

      changes += db.prepare(`DELETE FROM todo_item WHERE id = ?`).run(id).changes;
      // 删除关联的 content（会减少引用计数）
      if (row.description_content_id) {
        ContentTable.deleteContent(db, row.description_content_id);
      }
    }
    return changes;
  }
}
