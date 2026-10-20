import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import EntitySearchTable from "../tables/entity-search";
import PluginDataTable from "../tables/plugin-data";

const scope = { databaseName: ":memory:" };

describe("插件关联：待办与日程候选、引用存在性", () => {
  let db: Database.Database;
  const insert = (sql: string, ...params: unknown[]) =>
    Number(db.prepare(sql).run(...params).lastInsertRowid);

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
  });
  afterEach(() => db.close());

  it("检索独立待办与用户日历的日程，系统分组不出现", () => {
    const group = insert(
      "INSERT INTO todo_group (title, create_time, update_time) VALUES ('工作', 1, 1)"
    );
    const system = insert(
      "INSERT INTO todo_group (title, create_time, update_time, is_system) VALUES ('系统', 1, 1, 1)"
    );
    const todo = insert(
      "INSERT INTO todo_item (group_id, title, create_time, update_time, due_at) VALUES (?, '交周报', 100, 100, ?)",
      group,
      new Date(2026, 9, 23).getTime()
    );
    insert(
      "INSERT INTO todo_item (group_id, title, create_time, update_time) VALUES (?, '交周报（系统）', 1, 1)",
      system
    );
    const userGroup = insert(
      "INSERT INTO calendar_group (name, create_time, update_time) VALUES ('我的', 1, 1)"
    );
    const systemGroup = insert(
      "INSERT INTO calendar_group (name, is_system, create_time, update_time) VALUES ('系统', 1, 1, 1)"
    );
    const calendar = insert(
      "INSERT INTO calendar (title, color, create_time, update_time, group_id) VALUES ('日常', 'blue', 1, 1, ?)",
      userGroup
    );
    const marker = insert(
      "INSERT INTO calendar (title, color, create_time, update_time, group_id) VALUES ('截止', 'red', 1, 1, ?)",
      systemGroup
    );
    const event = insert(
      "INSERT INTO calendar_event (calendar_id, title, create_time, update_time, start_date) VALUES (?, '周会', 200, 200, ?)",
      calendar,
      new Date(2026, 9, 21).getTime()
    );
    insert(
      "INSERT INTO calendar_event (calendar_id, title, create_time, update_time, start_date) VALUES (?, '周会截止', 1, 1, 1)",
      marker
    );

    const todos = EntitySearchTable.search(db, { kind: "todo", keyword: "周报" });
    expect(todos).toEqual([
      expect.objectContaining({
        id: todo,
        createdAt: 100,
        title: "交周报",
        meta: "工作 · 截止 10月23日",
      }),
    ]);
    const events = EntitySearchTable.search(db, { kind: "calendar-event", keyword: "周会" });
    expect(events).toEqual([
      expect.objectContaining({ id: event, createdAt: 200, meta: "日常 · 10月21日" }),
    ]);

    expect(PluginDataTable.exists(db, { ...scope, kind: "todo", id: `todo:${todo}:100` })).toBe(
      true
    );
    expect(PluginDataTable.exists(db, { ...scope, kind: "todo", id: `todo:${todo}:99` })).toBe(
      false
    );
    expect(
      PluginDataTable.exists(db, { ...scope, kind: "event", id: `${event}:200@2026-10-21` })
    ).toBe(true);
  });

  it("文章在回收站、ID 非法或类型未知时视为不存在", () => {
    const article = insert(
      "INSERT INTO articles (create_time, update_time, title, author, tags, links, content_id, is_delete) VALUES (1, 1, '文', '', '[]', '[]', 0, 1)"
    );
    expect(PluginDataTable.exists(db, { ...scope, kind: "article", id: String(article) })).toBe(
      false
    );
    expect(PluginDataTable.exists(db, { ...scope, kind: "card", id: "1 OR 1=1" })).toBe(false);
    expect(PluginDataTable.exists(db, { ...scope, kind: "unknown", id: "1" })).toBe(false);
  });
});
