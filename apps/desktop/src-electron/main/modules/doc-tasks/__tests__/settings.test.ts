import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import { minimalTextEdit } from "../../collaboration/content-sessions";
import { reindexDocTasks } from "../indexer";
import { getDocTaskSnapshot, getDocTasksOf } from "../query";
import {
  detectGroupRenames,
  promoteDocTask,
  renameGroupTokens,
  replaceGroupToken,
  setContentExcluded,
} from "../settings";

const SCHEMA_DIR = resolve(__dirname, "../../../../../../../packages/db-schema/schema");
const MAIN_SQL = readFileSync(resolve(SCHEMA_DIR, "main.sql"), "utf8");
const INDEX_SQL = readFileSync(resolve(SCHEMA_DIR, "index.sql"), "utf8");

const p = (t: string) => ({ type: "paragraph", children: [{ type: "formatted", text: t }] });
const item = (taskId: string, t: string, checked = false, nested?: unknown[]) => ({
  type: "check-list-item",
  checked,
  taskId,
  children: nested ? [p(t), { type: "check-list", children: nested }] : [p(t)],
});
const list = (...children: unknown[]) => ({ type: "check-list", children });

let mainDb: Database.Database;
let indexDb: Database.Database;

const insertCardContent = (nodes: unknown[]) => {
  const id = Number(
    mainDb
      .prepare(
        `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (1, 1, ?, 0, 1)`
      )
      .run(JSON.stringify(nodes)).lastInsertRowid
  );
  mainDb
    .prepare(
      `INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (0, 0, '[]', '[]', ?)`
    )
    .run(id);
  return id;
};
const addGroup = (title: string) =>
  Number(
    mainDb
      .prepare(
        `INSERT INTO todo_group (title, sort_index, is_archived, is_system, create_time, update_time)
         VALUES (?, 0, 0, 0, 0, 0)`
      )
      .run(title).lastInsertRowid
  );
const contentText = (id: number) =>
  (mainDb.prepare(`SELECT content FROM contents WHERE id = ?`).get(id) as { content: string })
    .content;

beforeEach(() => {
  mainDb = new Database(":memory:");
  mainDb.exec(MAIN_SQL);
  indexDb = new Database(":memory:");
  indexDb.exec(INDEX_SQL);
});

afterEach(() => {
  mainDb.close();
  indexDb.close();
});

describe("本文不收集", () => {
  it("排除后快照里不出现，恢复后回来", () => {
    const id = insertCardContent([list(item("a", "甲"))]);
    reindexDocTasks(mainDb, indexDb, [id]);
    setContentExcluded(mainDb, id, true);
    expect(getDocTaskSnapshot(mainDb, indexDb)).toEqual({ sources: [], open: [] });
    setContentExcluded(mainDb, id, false);
    expect(getDocTaskSnapshot(mainDb, indexDb).open.map(t => t.taskId)).toEqual(["a"]);
  });
});

describe("转为独立待办", () => {
  it("按原文项目与日期建待办，子项成为子任务，关联原文；镜像隐藏、原文不变", () => {
    const groupId = addGroup("发布");
    const id = insertCardContent([
      list(
        item("root", "回归测试 #发布 2026年10月10日", false, [
          item("c1", "日历拖拽", true),
          item("c2", "卸载保存"),
        ])
      ),
    ]);
    reindexDocTasks(mainDb, indexDb, [id]);
    const before = contentText(id);

    const result = promoteDocTask(mainDb, indexDb, id, "root", null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const items = mainDb
      .prepare(
        `SELECT id, title, parent_id, group_id, type, due_at, is_completed FROM todo_item ORDER BY id`
      )
      .all() as Array<Record<string, unknown>>;
    expect(items).toEqual([
      {
        id: result.todoId,
        title: "回归测试",
        parent_id: null,
        group_id: groupId,
        type: "deadline",
        due_at: new Date(2026, 9, 10).getTime(),
        is_completed: 0,
      },
      expect.objectContaining({ title: "日历拖拽", parent_id: result.todoId, is_completed: 1 }),
      expect.objectContaining({ title: "卸载保存", parent_id: result.todoId, is_completed: 0 }),
    ]);
    expect(mainDb.prepare(`SELECT todo_id, content_id, type FROM todo_note_link`).all()).toEqual([
      { todo_id: result.todoId, content_id: id, type: "card" },
    ]);

    expect(getDocTaskSnapshot(mainDb, indexDb).open).toEqual([]);
    expect(getDocTasksOf(mainDb, indexDb, id).every(t => t.promoted)).toBe(true);
    expect(contentText(id)).toBe(before);
  });

  it("原文没写项目时用兜底项目；都没有则拒绝", () => {
    const groupId = addGroup("生活");
    const id = insertCardContent([list(item("a", "交电费"))]);
    reindexDocTasks(mainDb, indexDb, [id]);
    expect(promoteDocTask(mainDb, indexDb, id, "a", null)).toEqual({
      ok: false,
      reason: "no-group",
    });
    const result = promoteDocTask(mainDb, indexDb, id, "a", groupId);
    expect(result.ok).toBe(true);
    expect(promoteDocTask(mainDb, indexDb, id, "missing", groupId)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

describe("项目改名同步正文", () => {
  it("只改指向该项目的 #词，长名不被短名截胡", () => {
    const groups = [
      { id: 1, title: "笔记" },
      { id: 2, title: "笔记软件开发" },
    ];
    expect(replaceGroupToken("A #笔记 B #笔记软件开发 C #笔记", groups, 1, "随笔")).toBe(
      "A #随笔 B #笔记软件开发 C #随笔"
    );
    expect(replaceGroupToken("#笔记软件开发", groups, 2, "Tau")).toBe("#Tau");
  });

  it("从镜像推断改名并改写正文，镜像随后重建出新归属", () => {
    const groupId = addGroup("发布");
    const id = insertCardContent([list(item("a", "整理 #发布 文档"))]);
    reindexDocTasks(mainDb, indexDb, [id]);

    mainDb.prepare(`UPDATE todo_group SET title = '版本发布' WHERE id = ?`).run(groupId);
    expect(detectGroupRenames(mainDb, indexDb)).toEqual([
      { groupId, oldTitle: "发布", newTitle: "版本发布" },
    ]);
    expect(renameGroupTokens(mainDb, indexDb, groupId, "发布", "版本发布")).toBe(1);
    expect(contentText(id)).toContain("整理 #版本发布 文档");

    reindexDocTasks(mainDb, indexDb, [id]);
    expect(detectGroupRenames(mainDb, indexDb)).toEqual([]);
    expect(getDocTaskSnapshot(mainDb, indexDb).open[0]).toMatchObject({
      groupId,
      title: "整理 文档",
    });
  });
});

describe("minimalTextEdit", () => {
  it("只替换差异的一段", () => {
    expect(minimalTextEdit("整理 #发布 文档", "整理 #版本发布 文档")).toEqual({
      index: 4,
      remove: 0,
      insert: "版本",
    });
    expect(minimalTextEdit("abc", "abc")).toBeNull();
    expect(minimalTextEdit("aXc", "aYYc")).toEqual({ index: 1, remove: 1, insert: "YY" });
  });
});
