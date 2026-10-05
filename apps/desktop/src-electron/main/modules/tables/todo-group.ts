import Database from "better-sqlite3";
import { TodoGroup, CreateTodoGroup, UpdateTodoGroup, TodoSystemGroupType } from "@/types";
import TodoItemTable from "./todo-item";

// 系统组配置
const SYSTEM_GROUPS: Array<{
  systemType: TodoSystemGroupType;
  title: string;
}> = [
  { systemType: "all", title: "全部任务" },
  { systemType: "normal", title: "普通任务" },
  { systemType: "deadline", title: "截止任务" },
  { systemType: "recurring", title: "周期任务" },
];

export default class TodoGroupTable {
  static upgradeTable(db: Database.Database) {
    // 检查是否存在 is_system 列
    const tableInfo = db.pragma("table_info(todo_group)") as Array<{
      name: string;
    }>;
    const hasIsSystem = tableInfo.some(col => col.name === "is_system");

    if (!hasIsSystem) {
      db.exec(`ALTER TABLE todo_group ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0;`);
      db.exec(`ALTER TABLE todo_group ADD COLUMN system_type TEXT;`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_todo_group_system ON todo_group(is_system);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_todo_group_system_type ON todo_group(system_type);`);
    }

    // 确保系统组存在
    this.ensureSystemGroups(db);
  }

  // 确保系统组存在
  static ensureSystemGroups(db: Database.Database) {
    const now = Date.now();
    const existingSystemTypes = db
      .prepare(`SELECT system_type FROM todo_group WHERE is_system = 1`)
      .all() as Array<{ system_type: string }>;
    const existingSet = new Set(existingSystemTypes.map(r => r.system_type));

    for (let i = 0; i < SYSTEM_GROUPS.length; i++) {
      const { systemType, title } = SYSTEM_GROUPS[i];
      if (!existingSet.has(systemType!)) {
        db.prepare(
          `INSERT INTO todo_group (title, is_system, system_type, sort_index, is_archived, create_time, update_time)
           VALUES (?, 1, ?, ?, 0, ?, ?)`
        ).run(title, systemType, i * 1024, now, now);
      }
    }
  }

  static getListenEvents() {
    return {
      "todo:list-groups": this.listGroups.bind(this),
      "todo:list-archived-groups": this.listArchivedGroups.bind(this),
      "todo:create-group": this.createGroup.bind(this),
      "todo:update-group": this.updateGroup.bind(this),
      "todo:archive-group": this.archiveGroup.bind(this),
      "todo:delete-group": this.deleteGroup.bind(this),
      "todo:reorder-groups": this.reorderGroups.bind(this),
      "todo:get-group-stats": this.getGroupStats.bind(this),
      "todo:get-system-groups": this.getSystemGroups.bind(this),
      "todo:get-system-group-stats": this.getSystemGroupStats.bind(this),
    } as const;
  }

  static parse(row: any): TodoGroup {
    return {
      id: row.id,
      title: row.title,
      color: row.color ?? undefined,
      sortIndex: row.sort_index,
      isArchived: Boolean(row.is_archived),
      isSystem: Boolean(row.is_system),
      systemType: (row.system_type as TodoSystemGroupType) ?? null,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  // 获取系统组列表
  static getSystemGroups(db: Database.Database): TodoGroup[] {
    const stmt = db.prepare(`SELECT * FROM todo_group WHERE is_system = 1 ORDER BY sort_index ASC`);
    return (stmt.all() as any[]).map(this.parse);
  }

  static listGroups(db: Database.Database): TodoGroup[] {
    const stmt = db.prepare(
      `SELECT * FROM todo_group WHERE is_archived = 0 AND is_system = 0 ORDER BY sort_index ASC, create_time ASC`
    );
    return (stmt.all() as any[]).map(this.parse);
  }

  // 已归档的用户分组（新版待办页的「已归档」恢复入口；系统组不参与归档）
  static listArchivedGroups(db: Database.Database): TodoGroup[] {
    const stmt = db.prepare(
      `SELECT * FROM todo_group WHERE is_archived = 1 AND is_system = 0 ORDER BY update_time DESC`
    );
    return (stmt.all() as any[]).map(this.parse);
  }

  static getMaxSortIndex(db: Database.Database): number {
    const row = db.prepare(`SELECT MAX(sort_index) AS max_idx FROM todo_group`).get() as {
      max_idx: number | null;
    };
    return row?.max_idx ?? 0;
  }

  static getGroupById(db: Database.Database, id: number): TodoGroup | null {
    const row = db.prepare(`SELECT * FROM todo_group WHERE id = ?`).get(id);
    return row ? this.parse(row) : null;
  }

  static createGroup(db: Database.Database, payload: CreateTodoGroup): TodoGroup | null {
    const now = Date.now();
    const sortIndex = this.getMaxSortIndex(db) + 1024;
    const insert = db.prepare(
      `INSERT INTO todo_group (title, color, sort_index, is_archived, is_system, system_type, create_time, update_time)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?)`
    );
    const res = insert.run(
      payload.title,
      payload.color ?? null,
      sortIndex,
      payload.isSystem ? 1 : 0,
      payload.systemType ?? null,
      now,
      now
    );
    const id = Number(res.lastInsertRowid);
    return this.getGroupById(db, id);
  }

  static updateGroup(db: Database.Database, payload: UpdateTodoGroup): TodoGroup {
    const now = Date.now();
    const cur = db.prepare(`SELECT * FROM todo_group WHERE id = ?`).get(payload.id) as
      | {
          title: string;
          color: string | null;
          sort_index: number;
          is_archived: number;
          is_system: number;
        }
      | undefined;
    if (!cur) throw new Error("todo_group not found");

    // 系统组只能修改颜色
    if (cur.is_system) {
      const color = (payload.color === undefined ? cur.color : payload.color) ?? null;
      db.prepare(`UPDATE todo_group SET color = ?, update_time = ? WHERE id = ?`).run(
        color,
        now,
        payload.id
      );
    } else {
      const title = payload.title ?? cur.title;
      const color = (payload.color === undefined ? cur.color : payload.color) ?? null;
      const sortIndex = payload.sortIndex ?? cur.sort_index;
      const isArchived = payload.isArchived ?? Boolean(cur.is_archived);
      db.prepare(
        `UPDATE todo_group SET title = ?, color = ?, sort_index = ?, is_archived = ?, update_time = ? WHERE id = ?`
      ).run(title, color, sortIndex, isArchived ? 1 : 0, now, payload.id);
    }

    const row = db.prepare(`SELECT * FROM todo_group WHERE id = ?`).get(payload.id);
    return this.parse(row);
  }

  static archiveGroup(db: Database.Database, params: { id: string; isArchived: boolean }): number {
    // 检查是否为系统组
    const group = this.getGroupById(db, Number(params.id));
    if (group?.isSystem) {
      throw new Error("Cannot archive system group");
    }

    const now = Date.now();
    const res = db
      .prepare(`UPDATE todo_group SET is_archived = ?, update_time = ? WHERE id = ?`)
      .run(params.isArchived ? 1 : 0, now, params.id);
    return res.changes;
  }

  /**
   * 删除用户项目（系统组不可删；前端经二次确认）。
   * 删除范围 = 本项目全部任务 + 它们的子孙（子孙即便挂在别的项目下也一并删，与前端确认弹窗计数同口径）；
   * 关联表清理走 TodoItemTable.deleteItemsWithRelations，事务由 IPC 层统一包裹。返回删除的任务数。
   */
  static deleteGroup(db: Database.Database, params: { id: number }): number {
    const group = this.getGroupById(db, Number(params.id));
    if (!group) return 0;
    if (group.isSystem) throw new Error("Cannot delete system group");

    // UNION 去重：成环 / 断链的脏数据下也能终止，且不会漏掉本项目的任何一行
    const rows = db
      .prepare(
        `WITH RECURSIVE doomed(id) AS (
           SELECT id FROM todo_item WHERE group_id = ?
           UNION
           SELECT ti.id FROM todo_item ti JOIN doomed d ON ti.parent_id = d.id
         )
         SELECT id FROM doomed`
      )
      .all(group.id) as Array<{ id: number }>;
    const removed = TodoItemTable.deleteItemsWithRelations(
      db,
      rows.map(r => r.id)
    );
    db.prepare(`DELETE FROM todo_group WHERE id = ?`).run(group.id);
    return removed;
  }

  static reorderGroups(db: Database.Database, params: { orderedIds: number[] }): number {
    const ids = params.orderedIds;
    const step = 1024;
    const upd = db.prepare(`UPDATE todo_group SET sort_index = ?, update_time = ? WHERE id = ?`);
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
       GROUP BY group_id`
    );
    const rows = stmt.all(now) as any[];
    return rows.map(r => ({
      groupId: Number(r.groupId),
      total: Number(r.total || 0),
      uncompleted: Number(r.uncompleted || 0),
      overdue: Number(r.overdue || 0),
    }));
  }

  // 获取系统组的统计信息（按任务类型）
  static getSystemGroupStats(db: Database.Database): {
    groupId: number;
    total: number;
    uncompleted: number;
    overdue: number;
  }[] {
    const now = Date.now();

    // 获取所有系统组
    const systemGroups = this.getSystemGroups(db);
    const typeToGroupId = new Map(systemGroups.map(g => [g.systemType, g.id]));

    // 全部任务统计
    const allStats = db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN is_completed = 0 THEN 1 ELSE 0 END) as uncompleted,
           SUM(CASE WHEN is_completed = 0 AND due_at IS NOT NULL AND due_at < ? THEN 1 ELSE 0 END) as overdue
         FROM todo_item
         WHERE is_archived = 0`
      )
      .get(now) as any;

    // 按类型统计
    const typeStats = db
      .prepare(
        `SELECT
           type,
           COUNT(*) as total,
           SUM(CASE WHEN is_completed = 0 THEN 1 ELSE 0 END) as uncompleted,
           SUM(CASE WHEN is_completed = 0 AND due_at IS NOT NULL AND due_at < ? THEN 1 ELSE 0 END) as overdue
         FROM todo_item
         WHERE is_archived = 0
         GROUP BY type`
      )
      .all(now) as any[];

    const typeMap = new Map(
      typeStats.map(r => [
        r.type,
        {
          total: Number(r.total || 0),
          uncompleted: Number(r.uncompleted || 0),
          overdue: Number(r.overdue || 0),
        },
      ])
    );

    const result: {
      groupId: number;
      total: number;
      uncompleted: number;
      overdue: number;
    }[] = [];

    // 全部任务
    const allGroupId = typeToGroupId.get("all" as TodoSystemGroupType);
    if (allGroupId) {
      result.push({
        groupId: allGroupId,
        total: Number(allStats?.total || 0),
        uncompleted: Number(allStats?.uncompleted || 0),
        overdue: Number(allStats?.overdue || 0),
      });
    }

    // 各类型任务
    const types: TodoSystemGroupType[] = ["normal", "deadline", "recurring"];
    for (const type of types) {
      const groupId = typeToGroupId.get(type);
      if (groupId) {
        result.push({
          groupId,
          total: typeMap.get(type)?.total || 0,
          uncompleted: typeMap.get(type)?.uncompleted || 0,
          overdue: typeMap.get(type)?.overdue || 0,
        });
      }
    }

    return result;
  }
}
