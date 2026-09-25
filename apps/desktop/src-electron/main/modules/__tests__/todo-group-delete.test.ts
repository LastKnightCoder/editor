import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));

// 与 todo-calendar-consistency 同款：切断 tables → database 模块的循环依赖链
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import CalendarGroupTable from "../tables/calendar-group";
import CalendarTable from "../tables/calendar";
import CalendarEventTable from "../tables/calendar-event";
import TodoGroupTable from "../tables/todo-group";
import TodoItemTable from "../tables/todo-item";
import TodoNoteLinkTable from "../tables/todo-note-link";
import TodoRecurrenceTable from "../tables/todo-recurrence";
import TodoRecurrenceCompletionTable from "../tables/todo-recurrence-completion";
import TodoCalendarSyncTable from "../tables/todo-calendar-sync";

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  CalendarGroupTable.upgradeTable(db);
  CalendarTable.upgradeTable(db);
  CalendarEventTable.upgradeTable(db);
  TodoGroupTable.upgradeTable(db);
  TodoItemTable.upgradeTable(db);
  (TodoCalendarSyncTable as unknown as { cachedCalendars: unknown }).cachedCalendars = null;
  TodoCalendarSyncTable.upgradeTable(db);
  return db;
}

const count = (db: Database.Database, sql: string, ...args: unknown[]) =>
  (db.prepare(`SELECT COUNT(*) AS c FROM ${sql}`).get(...args) as { c: number }).c;

describe("删除项目", () => {
  let db: Database.Database;
  let groupId: number;
  let otherId: number;

  beforeEach(() => {
    db = createTestDatabase();
    groupId = TodoGroupTable.createGroup(db, { title: "垃圾项目", color: "red" })!.id;
    otherId = TodoGroupTable.createGroup(db, { title: "保留项目", color: "blue" })!.id;
  });

  afterEach(() => {
    db.close();
  });

  it("系统组拒绝删除", () => {
    const system = TodoGroupTable.getSystemGroups(db)[0];
    expect(() => TodoGroupTable.deleteGroup(db, { id: system.id })).toThrow();
    expect(TodoGroupTable.getGroupById(db, system.id)).not.toBeNull();
  });

  it("连同任务、子任务、周期打卡、笔记链接、日历映射一起删，别的项目不受影响", () => {
    const root = TodoItemTable.createItem(db, { groupId, title: "根" });
    const child = TodoItemTable.createItem(db, { groupId, parentId: root.id, title: "子" });
    const habit = TodoItemTable.createItem(db, { groupId, title: "打卡", type: "recurring" });
    const rule = TodoRecurrenceTable.createRecurrence(db, {
      todoItemId: habit.id,
      type: "daily",
      startDate: Date.now(),
    });
    TodoRecurrenceCompletionTable.completeRecurrence(db, {
      recurrenceId: rule.id,
      scheduledDate: Date.now(),
    });
    const { contentId } = TodoNoteLinkTable.createAndAttach(db, { todoId: child.id });
    TodoItemTable.createItem(db, { groupId, title: "截止", type: "deadline", dueAt: Date.now() });
    const kept = TodoItemTable.createItem(db, { groupId: otherId, title: "保留" });
    // 跨项目挂着的子任务：自身属于本项目，父任务在别的项目
    TodoItemTable.createItem(db, { groupId, parentId: kept.id, title: "跨项目子任务" });

    expect(TodoGroupTable.deleteGroup(db, { id: groupId })).toBe(5);

    expect(TodoGroupTable.getGroupById(db, groupId)).toBeNull();
    expect(count(db, "todo_item WHERE group_id = ?", groupId)).toBe(0);
    expect(count(db, "todo_recurrence")).toBe(0);
    expect(count(db, "todo_recurrence_completion")).toBe(0);
    expect(count(db, "todo_note_link")).toBe(0);
    expect(count(db, "todo_calendar_mapping")).toBe(0);
    expect(count(db, "contents WHERE id = ?", contentId)).toBe(0);
    expect(count(db, "todo_item WHERE id = ?", kept.id)).toBe(1);
  });

  it("异常数据：别的项目的子孙随本项目根删除；parent_id 成环也能删干净", () => {
    const root = TodoItemTable.createItem(db, { groupId, title: "根" });
    const foreign = TodoItemTable.createItem(db, { groupId: otherId, title: "别处子任务" });
    db.prepare(`UPDATE todo_item SET parent_id = ? WHERE id = ?`).run(root.id, foreign.id);
    const a = TodoItemTable.createItem(db, { groupId, title: "环 A" });
    const b = TodoItemTable.createItem(db, { groupId, title: "环 B" });
    db.prepare(`UPDATE todo_item SET parent_id = ? WHERE id = ?`).run(b.id, a.id);
    db.prepare(`UPDATE todo_item SET parent_id = ? WHERE id = ?`).run(a.id, b.id);
    const rule = TodoRecurrenceTable.createRecurrence(db, {
      todoItemId: a.id,
      type: "daily",
      startDate: Date.now(),
    });
    TodoRecurrenceCompletionTable.completeRecurrence(db, {
      recurrenceId: rule.id,
      scheduledDate: Date.now(),
    });

    expect(TodoGroupTable.deleteGroup(db, { id: groupId })).toBe(4);
    expect(count(db, "todo_item")).toBe(0);
    expect(count(db, "todo_recurrence")).toBe(0);
    expect(count(db, "todo_recurrence_completion")).toBe(0);
  });

  it("单条级联删除遇到环也能终止", () => {
    const a = TodoItemTable.createItem(db, { groupId, title: "A" });
    const b = TodoItemTable.createItem(db, { groupId, parentId: a.id, title: "B" });
    db.prepare(`UPDATE todo_item SET parent_id = ? WHERE id = ?`).run(b.id, a.id);
    expect(TodoItemTable.deleteItemCascade(db, { id: a.id })).toBe(2);
  });
});
