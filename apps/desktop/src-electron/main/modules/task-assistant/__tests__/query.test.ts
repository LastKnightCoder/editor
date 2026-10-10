import Database from "better-sqlite3";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
import MAIN_SCHEMA_SQL from "../../../../../../../packages/db-schema/schema/main.sql?raw";
import INDEX_SCHEMA_SQL from "../../../../../../../packages/db-schema/schema/index.sql?raw";
import TodoGroupTable from "../../tables/todo-group";
import TodoCalendarSyncTable from "../../tables/todo-calendar-sync";
import { reindexDocTasks } from "../../doc-tasks/indexer";
import { TaskAssistantEngine } from "../engine";
import { queryTasks, queryEvents } from "../query";
describe("统一只读查询", () => {
  let db: Database.Database, index: Database.Database, engine: TaskAssistantEngine, groupId: number;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
    index = new Database(":memory:");
    index.exec(INDEX_SCHEMA_SQL);
    TodoGroupTable.ensureSystemGroups(db);
    TodoCalendarSyncTable.ensureTodoCalendars(db);
    groupId = TodoGroupTable.createGroup(db, { title: "工作" })!.id;
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
});
