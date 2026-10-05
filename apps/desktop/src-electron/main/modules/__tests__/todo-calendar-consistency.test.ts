import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));

// 与 answer-content-shared-mount 同款：切断 tables → database 模块的循环依赖链
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import CalendarGroupTable from "../tables/calendar-group";
import CalendarTable from "../tables/calendar";
import CalendarEventTable from "../tables/calendar-event";
import TodoGroupTable from "../tables/todo-group";
import TodoItemTable from "../tables/todo-item";
import TodoCalendarSyncTable from "../tables/todo-calendar-sync";
import TodoCalendarMappingTable from "../tables/todo-calendar-mapping";

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  CalendarGroupTable.upgradeTable(db);
  CalendarTable.upgradeTable(db);
  CalendarEventTable.upgradeTable(db);
  TodoGroupTable.upgradeTable(db);
  TodoItemTable.upgradeTable(db);
  // 日历分组缓存是静态的，每个库重建
  (TodoCalendarSyncTable as unknown as { cachedCalendars: unknown }).cachedCalendars = null;
  TodoCalendarSyncTable.upgradeTable(db);
  return db;
}

const at = (m: number, d: number, h = 0, mi = 0) => new Date(2026, m - 1, d, h, mi).getTime();

describe("待办增改删的日历一致性", () => {
  let db: Database.Database;
  let groupId: number;

  beforeEach(() => {
    db = createTestDatabase();
    groupId = TodoGroupTable.createGroup(db, { title: "工作", color: "blue" })!.id;
  });

  afterEach(() => {
    db.close();
  });

  const mappings = (todoItemId: number) =>
    TodoCalendarMappingTable.getMappingsByTodoId(db, { todoItemId });

  it("合并数量按日历聚合，只计目标集合并补零，不拉正文", () => {
    const insert = db.prepare(`INSERT INTO calendar_event
      (calendar_id, title, start_date, all_day, create_time, update_time)
      VALUES (?, '日程', ?, 1, 0, 0)`);
    insert.run(101, at(9, 30));
    insert.run(101, at(10, 1));
    insert.run(202, at(9, 30));
    expect(CalendarEventTable.countCalendarEvents(db, [101, 303, 101])).toEqual({ 101: 2, 303: 0 });
    expect(CalendarEventTable.countCalendarEvents(db, [])).toEqual({});
  });
  const eventOf = (todoItemId: number) => {
    const [mapping] = mappings(todoItemId);
    return db.prepare(`SELECT * FROM calendar_event WHERE id = ?`).get(mapping.calendarEventId) as {
      calendar_id: number;
      start_date: number;
      title: string;
    };
  };

  it("新建截止任务即写入「截止任务」日历", () => {
    const item = TodoItemTable.createItem(db, {
      groupId,
      title: "交周报",
      type: "deadline",
      dueAt: at(9, 25, 17),
    });
    const calendars = TodoCalendarSyncTable.getTodoCalendars(db);
    expect(mappings(item.id)).toHaveLength(1);
    expect(mappings(item.id)[0].syncType).toBe("deadline");
    expect(eventOf(item.id).calendar_id).toBe(calendars.deadline);
  });

  it("普通任务不写日历；改成截止后写入，改回普通后清除", () => {
    const item = TodoItemTable.createItem(db, { groupId, title: "买猫粮" });
    expect(mappings(item.id)).toHaveLength(0);

    TodoItemTable.updateItem(db, { id: item.id, type: "deadline", dueAt: at(9, 26) });
    expect(mappings(item.id)).toHaveLength(1);

    TodoItemTable.updateItem(db, { id: item.id, type: "normal" });
    expect(mappings(item.id)).toHaveLength(0);
  });

  it("改时间与标题同步到既有事件；改类型重建映射", () => {
    const item = TodoItemTable.createItem(db, {
      groupId,
      title: "评审",
      type: "deadline",
      dueAt: at(9, 25),
    });
    TodoItemTable.updateItem(db, { id: item.id, title: "设计评审", dueAt: at(9, 28) });
    expect(eventOf(item.id).title).toBe("设计评审");
    expect(eventOf(item.id).start_date).toBe(at(9, 28));

    TodoItemTable.updateItem(db, { id: item.id, type: "normal" });
    expect(mappings(item.id)).toHaveLength(0);
  });

  it("计划任务已退役：拒绝写入 planned", () => {
    expect(() =>
      TodoItemTable.createItem(db, { groupId, title: "x", type: "planned" as never })
    ).toThrow("Unsupported todo type");
    const item = TodoItemTable.createItem(db, { groupId, title: "y" });
    expect(() => TodoItemTable.updateItem(db, { id: item.id, type: "planned" as never })).toThrow(
      "Unsupported todo type"
    );
  });

  it("单条删除同时清理日历映射与事件", () => {
    const item = TodoItemTable.createItem(db, {
      groupId,
      title: "预约牙医",
      type: "deadline",
      dueAt: at(9, 24, 17),
    });
    const eventId = mappings(item.id)[0].calendarEventId;
    TodoItemTable.deleteItem(db, item.id);
    expect(mappings(item.id)).toHaveLength(0);
    expect(db.prepare(`SELECT id FROM calendar_event WHERE id = ?`).get(eventId)).toBeUndefined();
  });

  it("跨项目移动时子任务随父迁移", () => {
    const other = TodoGroupTable.createGroup(db, { title: "生活", color: "green" })!.id;
    const parent = TodoItemTable.createItem(db, { groupId, title: "搬家" });
    const child = TodoItemTable.createItem(db, { groupId, parentId: parent.id, title: "打包" });
    const grandchild = TodoItemTable.createItem(db, {
      groupId,
      parentId: child.id,
      title: "买纸箱",
    });

    TodoItemTable.moveAndReorder(db, { id: parent.id, toGroupId: other, toParentId: null });

    const groupOf = (id: number) =>
      (db.prepare(`SELECT group_id FROM todo_item WHERE id = ?`).get(id) as { group_id: number })
        .group_id;
    expect(groupOf(parent.id)).toBe(other);
    expect(groupOf(child.id)).toBe(other);
    expect(groupOf(grandchild.id)).toBe(other);
  });

  it("已归档项目可单独列出（新版恢复入口）", () => {
    TodoGroupTable.archiveGroup(db, { id: String(groupId), isArchived: true });
    expect(TodoGroupTable.listGroups(db).map(g => g.id)).not.toContain(groupId);
    expect(TodoGroupTable.listArchivedGroups(db).map(g => g.id)).toEqual([groupId]);
  });
});

describe("moveAndReorder 排序", () => {
  let db: Database.Database;
  let groupId: number;

  beforeEach(() => {
    db = createTestDatabase();
    groupId = TodoGroupTable.createGroup(db, { title: "工作", color: "blue" })!.id;
  });

  afterEach(() => {
    db.close();
  });

  const order = () =>
    TodoItemTable.listSiblings(db, groupId, null)
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map(item => item.title);
  const make = (title: string) => TodoItemTable.createItem(db, { groupId, title });

  it("beforeId = 插到它前面，afterId = 插到它后面，都不给 = 末尾", () => {
    const [a, b, c] = ["A", "B", "C"].map(make);
    TodoItemTable.moveAndReorder(db, {
      id: c.id,
      toGroupId: groupId,
      toParentId: null,
      beforeId: a.id,
    });
    expect(order()).toEqual(["C", "A", "B"]);
    TodoItemTable.moveAndReorder(db, {
      id: c.id,
      toGroupId: groupId,
      toParentId: null,
      afterId: a.id,
    });
    expect(order()).toEqual(["A", "C", "B"]);
    TodoItemTable.moveAndReorder(db, { id: a.id, toGroupId: groupId, toParentId: null });
    expect(order()).toEqual(["C", "B", "A"]);
    void b;
  });

  it("同一对之间反复插入：间隙耗尽后整组重排，顺序始终正确", () => {
    const first = make("首");
    const last = make("尾");
    const inserted: string[] = [];
    for (let i = 0; i < 16; i++) {
      const item = make(`插${i}`);
      // 每次都插到「首」之后 → 新插入的排在最前面
      TodoItemTable.moveAndReorder(db, {
        id: item.id,
        toGroupId: groupId,
        toParentId: null,
        afterId: first.id,
      });
      inserted.unshift(`插${i}`);
    }
    expect(order()).toEqual(["首", ...inserted, "尾"]);
    const indexes = TodoItemTable.listSiblings(db, groupId, null).map(item => item.sortIndex);
    expect(new Set(indexes).size).toBe(indexes.length);
    void last;
  });
});
