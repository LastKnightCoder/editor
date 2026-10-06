/**
 * 安排（calendar_event.todo_item_id）：把待办安排进时段、安排概况、标题跟随、删除待办时的处理、孤儿清理、勾选来源。
 */
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
import CalendarTable from "../tables/calendar";
import CalendarEventTable from "../tables/calendar-event";
import TodoGroupTable from "../tables/todo-group";
import TodoItemTable from "../tables/todo-item";
import TodoCalendarSyncTable from "../tables/todo-calendar-sync";
import TodoCalendarMappingTable from "../tables/todo-calendar-mapping";

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  TodoGroupTable.ensureSystemGroups(db);
  (TodoCalendarSyncTable as unknown as { cachedCalendars: unknown }).cachedCalendars = null;
  TodoCalendarSyncTable.ensureTodoCalendars(db);
  return db;
}

const DAY = new Date(2026, 9, 5).getTime();
const NOW = new Date(2026, 9, 5, 12, 0).getTime();

describe("安排（calendar_event.todo_item_id）", () => {
  let db: Database.Database;
  let groupId: number;
  let calendarId: number;

  beforeEach(() => {
    db = createTestDatabase();
    groupId = TodoGroupTable.createGroup(db, { title: "工作", color: "blue" })!.id;
    calendarId = CalendarTable.createCalendar(db, {
      title: "工作",
      color: "blue" as never,
      descriptionContentId: 0,
      archived: false,
      pinned: false,
      visible: true,
      orderIndex: 0,
    }).id;
  });
  afterEach(() => db.close());

  const schedule = (todoItemId: number, startTime: number, endTime: number, day = DAY) =>
    CalendarEventTable.createEventForTodo(db, { todoItemId, startDate: day, startTime, endTime });
  const linkOf = (id: number) =>
    db.prepare("SELECT todo_item_id FROM calendar_event WHERE id = ?").get(id) as
      { todo_item_id: number | null } | undefined;

  it("安排进默认用户日历：标题取待办、备注不与待办描述共用、关联待办", () => {
    const item = TodoItemTable.createItem(db, { groupId, title: "写报告", description: "大纲" });
    expect(schedule(item.id, 540, 660)).toMatchObject({
      calendarId,
      title: "写报告",
      detailContentId: 0,
      todoItemId: item.id,
      startTime: 540,
      endTime: 660,
    });
  });

  it("整行更新不清关联；没有可用用户日历时报错", () => {
    const item = TodoItemTable.createItem(db, { groupId, title: "写报告" });
    const event = schedule(item.id, 540, 660);
    expect(
      CalendarEventTable.updateEvent(db, { ...event, todoItemId: null, startTime: 600 })
    ).toMatchObject({ startTime: 600, todoItemId: item.id });

    db.prepare("UPDATE calendar SET archived = 1 WHERE id = ?").run(calendarId);
    expect(() => schedule(item.id, 540, 660)).toThrow("NO_USER_CALENDAR");
  });

  it("安排概况：next = 未结束的最早一条（含进行中），last = 已结束的最近一条", () => {
    const item = TodoItemTable.createItem(db, { groupId, title: "写报告" });
    const other = TodoItemTable.createItem(db, { groupId, title: "读书" });
    schedule(item.id, 8 * 60, 9 * 60);
    const past = schedule(item.id, 10 * 60, 11 * 60);
    const live = schedule(item.id, 11 * 60 + 30, 13 * 60);
    schedule(item.id, 15 * 60, 16 * 60);
    const result = CalendarEventTable.getTodoSchedules(db, {
      todoItemIds: [item.id, other.id],
      now: NOW,
    });
    expect(result[item.id]).toMatchObject({
      count: 4,
      next: { id: live.id },
      last: { id: past.id },
    });
    expect(result[other.id]).toBeUndefined();
  });

  it("改待办标题同步到安排", () => {
    const item = TodoItemTable.createItem(db, { groupId, title: "写报告" });
    const event = schedule(item.id, 540, 660);
    TodoItemTable.updateItem(db, { id: item.id, title: "写 Q4 报告" });
    expect(CalendarEventTable.getEventById(db, event.id).title).toBe("写 Q4 报告");
  });

  it("删除待办：未开始的安排删除，已开始 / 已结束的解除关联留作记录", () => {
    const item = TodoItemTable.createItem(db, { groupId, title: "写报告" });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minute = Math.floor((Date.now() - today.getTime()) / 60_000);
    const past = schedule(item.id, 540, 600, today.getTime() - 86_400_000);
    const started = schedule(item.id, Math.max(0, minute - 1), 1439, today.getTime());
    const future = schedule(item.id, 540, 600, today.getTime() + 86_400_000);
    TodoItemTable.deleteItem(db, item.id);
    expect(linkOf(past.id)).toEqual({ todo_item_id: null });
    expect(linkOf(started.id)).toEqual({ todo_item_id: null });
    expect(linkOf(future.id)).toBeUndefined();
  });

  it("级联删除同样处理安排", () => {
    const parent = TodoItemTable.createItem(db, { groupId, title: "项目" });
    const child = TodoItemTable.createItem(db, { groupId, parentId: parent.id, title: "子任务" });
    const future = schedule(child.id, 540, 600, DAY + 365 * 86_400_000);
    TodoItemTable.deleteItemCascade(db, { id: parent.id });
    expect(linkOf(future.id)).toBeUndefined();
  });

  it("孤儿清理解除悬空关联（旧客户端删除待办不处理这一列）", () => {
    const item = TodoItemTable.createItem(db, { groupId, title: "写报告" });
    const event = schedule(item.id, 540, 660);
    db.prepare("DELETE FROM todo_item WHERE id = ?").run(item.id);
    TodoCalendarSyncTable.cleanupOrphanedEvents(db);
    expect(CalendarEventTable.getEventById(db, event.id).todoItemId).toBeNull();
  });

  it("勾选来源包含安排（linked），完成态取待办", () => {
    const item = TodoItemTable.createItem(db, { groupId, title: "写报告" });
    const event = schedule(item.id, 540, 660);
    TodoItemTable.toggleCompleteCascade(db, { id: item.id, isCompleted: true });
    expect(TodoCalendarMappingTable.getEventSources(db, { calendarEventIds: [event.id] })).toEqual({
      [event.id]: {
        calendarEventId: event.id,
        todoItemId: item.id,
        syncType: "linked",
        recurrenceDate: null,
        recurrenceId: null,
        isCompleted: true,
      },
    });
  });

  it("快速添加写了时段：建普通待办并同时安排", () => {
    const { item, event } = TodoItemTable.createWithSchedule(db, {
      groupId,
      title: "读论文",
      schedule: { startDate: DAY, startTime: 600, endTime: 720 },
    });
    expect(item.type).toBe("normal");
    expect(event).toMatchObject({ todoItemId: item.id, title: "读论文", startTime: 600 });
  });
});
