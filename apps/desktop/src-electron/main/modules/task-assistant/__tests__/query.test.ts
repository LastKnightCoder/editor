import Database from "better-sqlite3";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("electron");
vi.mock("../../video-note-index-queue");
import MAIN_SCHEMA_SQL from "../../../../../../../packages/db-schema/schema/main.sql?raw";
import INDEX_SCHEMA_SQL from "../../../../../../../packages/db-schema/schema/index.sql?raw";
import TodoGroupTable from "../../tables/todo-group";
import TodoCalendarSyncTable from "../../tables/todo-calendar-sync";
import { reindexDocTasks } from "../../doc-tasks/indexer";
import { TaskAssistantEngine } from "../engine";
import CalendarTable from "../../tables/calendar";
import { requireCalendar } from "../directory-access";
import { readDirectory, queryDirectories } from "../catalog";
import { queryTasks, queryEvents } from "../query";
import { must } from "../../../test-support";
describe("统一只读查询", () => {
  let db: Database.Database, index: Database.Database, engine: TaskAssistantEngine, groupId: number;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
    index = new Database(":memory:");
    index.exec(INDEX_SCHEMA_SQL);
    TodoGroupTable.ensureSystemGroups(db);
    TodoCalendarSyncTable.ensureTodoCalendars(db);
    groupId = must(
      TodoGroupTable.createGroup(db, { title: "工作" }),
      "TodoGroupTable.createGroup(db, { title: '工作' })"
    ).id;
    engine = new TaskAssistantEngine(db);
  });
  afterEach(() => {
    db.close();
    index.close();
  });
  it("小页跨来源稳定分页，不漏已完成正文待办", () => {
    for (let i = 0; i < 3; i++)
      engine.execute("create_todo", { requestId: `t${i}`, title: `任务${i}`, groupId }, "b");
    db.prepare(
      "INSERT INTO contents(id,create_time,update_time,content,ref_count) VALUES(1,100,100,?,1)"
    ).run(
      JSON.stringify([
        {
          type: "check-list",
          children: [
            {
              type: "check-list-item",
              taskId: "d",
              checked: true,
              children: [{ type: "paragraph", children: [{ text: "正文待办" }] }],
            },
          ],
        },
      ])
    );
    db.prepare(
      "INSERT INTO articles(title,content_id,create_time,update_time) VALUES('文档',1,100,100)"
    ).run();
    reindexDocTasks(db, index, [1]);
    const found: string[] = [];
    let cursor: string | undefined;
    do {
      const result = queryTasks(db, index, "test", { pageSize: 1, ...(cursor ? { cursor } : {}) });
      found.push(...result.items.map(item => item.title));
      cursor = result.nextCursor ?? undefined;
    } while (cursor);
    expect(found.sort()).toEqual(["任务0", "任务1", "任务2", "正文待办"]);
    expect(
      queryTasks(db, index, "test", { completed: true }).items.map(item => item.title)
    ).toEqual(["正文待办"]);
  });
  it("日程查询动态投影周期实例，不增加物化事件", () => {
    engine.execute(
      "create_todo",
      {
        requestId: "r",
        title: "每天",
        groupId,
        recurrence: { type: "daily", interval: 1, startDate: "2026-10-01" },
      },
      "b"
    );
    const before = db.prepare("SELECT count(*) n FROM calendar_event").get();
    const result = queryEvents(db, "test", { start: "2026-10-10", end: "2026-10-12" }, index);
    expect(result.items).toHaveLength(3);
    expect(result.items.every(item => !item.writable && !!item.occurrence)).toBe(true);
    expect(db.prepare("SELECT count(*) n FROM calendar_event").get()).toEqual(before);
  });
  it("目录分页游标绑定归档条件，避免混用时漏掉目录", () => {
    const first = queryDirectories(db, "todo-list", { limit: 1 });
    expect(first.items[0]).toMatchObject({ writable: true, archived: false });
    expect(first.cursor).toEqual(expect.any(String));
    const second = queryDirectories(db, "todo-list", { limit: 1, cursor: first.cursor });
    expect(second.items[0].id).not.toBe(first.items[0].id);
    expect(() =>
      queryDirectories(db, "todo-list", { archived: true, cursor: first.cursor })
    ).toThrow("游标");
  });
  it("目录单项、分页和写入资格一致，隐藏日历仍可写，系统后代不可写", () => {
    const calendar = CalendarTable.createCalendar(db, {
      title: "隐藏但可写",
      color: "blue",
      descriptionContentId: 0,
      archived: false,
      pinned: false,
      visible: false,
      orderIndex: 0,
    });
    const id = String(calendar.id);
    const first = readDirectory(db, "calendar", calendar.id);
    expect(first).toMatchObject({ id, writable: true, visible: false });
    expect(queryDirectories(db, "calendar", {}).items.find(item => item.id === id)).toEqual(first);
    expect(requireCalendar(db, calendar.id)).toBe(calendar.id);
    const root = db
      .prepare(
        "INSERT INTO calendar_group(name,is_system,create_time,update_time) VALUES('系统',1,1,1)"
      )
      .run().lastInsertRowid;
    const parent = db
      .prepare(
        "INSERT INTO calendar_group(name,parent_group_id,create_time,update_time) VALUES('子组',?,1,1)"
      )
      .run(root).lastInsertRowid;
    const child = db
      .prepare(
        "INSERT INTO calendar_group(name,parent_group_id,create_time,update_time) VALUES('后代',?,1,1)"
      )
      .run(parent).lastInsertRowid;
    db.prepare("UPDATE calendar SET group_id=? WHERE id=?").run(child, calendar.id);
    const changed = readDirectory(db, "calendar", calendar.id);
    expect(changed).toMatchObject({ id, writable: false, visible: false });
    expect(queryDirectories(db, "calendar", {}).items.find(item => item.id === id)).toEqual(
      changed
    );
    expect(() => requireCalendar(db, calendar.id)).toThrow("可写");
    db.prepare("UPDATE calendar SET group_id=NULL,archived=1 WHERE id=?").run(calendar.id);
    expect(
      queryDirectories(db, "calendar", { archived: false }).items.find(item => item.id === id)
    ).toBeUndefined();
    expect(
      queryDirectories(db, "calendar", { archived: true }).items.find(item => item.id === id)
    ).toMatchObject({ archived: true, writable: false });
  });

  it("持久日程按身份分页，不因日期顺序漏掉不同年份的安排", () => {
    const calendar = CalendarTable.createCalendar(db, {
      title: "工作日历",
      color: "blue",
      descriptionContentId: 0,
      archived: false,
      pinned: false,
      visible: true,
      orderIndex: 0,
    });
    const expected = new Set<number>();
    for (const start of ["2027-01-01", "2025-01-01"]) {
      const result = engine.execute(
        "create_calendar_event",
        {
          requestId: start,
          title: start,
          calendarId: calendar.id,
          start,
          end: `${start.slice(0, 8)}02`,
          allDay: true,
        },
        "b"
      );
      expect(result.status).toBe("succeeded");
      expected.add((result.result as { eventId: number }).eventId);
    }
    const actual = new Set<number>();
    let cursor: string | undefined;
    do {
      const page = queryEvents(db, "test", {
        view: "stored",
        calendarIds: [calendar.id],
        pageSize: 1,
        cursor,
      });
      page.items.forEach(event => actual.add(event.eventId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(actual).toEqual(expected);
  });
});
