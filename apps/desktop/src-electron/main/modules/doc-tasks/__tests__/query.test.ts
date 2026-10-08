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

import { reindexDocTasks } from "../indexer";
import {
  getDocTaskContentStatus,
  getDocTaskSnapshot,
  getDocTasksOf,
  toggleDocTask,
} from "../query";

const SCHEMA_DIR = resolve(__dirname, "../../../../../../../packages/db-schema/schema");
const MAIN_SQL = readFileSync(resolve(SCHEMA_DIR, "main.sql"), "utf8");
const INDEX_SQL = readFileSync(resolve(SCHEMA_DIR, "index.sql"), "utf8");

const p = (t: string) => ({ type: "paragraph", children: [{ type: "formatted", text: t }] });
const item = (taskId: string, t: string, checked = false) => ({
  type: "check-list-item",
  checked,
  taskId,
  children: [p(t)],
});
const list = (...children: unknown[]) => ({ type: "check-list", children });

let mainDb: Database.Database;
let indexDb: Database.Database;

const insertContent = (nodes: unknown[], time = 1_000) =>
  Number(
    mainDb
      .prepare(
        `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (?, ?, ?, 0, 1)`
      )
      .run(time, time, JSON.stringify(nodes)).lastInsertRowid
  );
const insertCard = (contentId: number) =>
  mainDb
    .prepare(
      `INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (0, 0, '[]', '[]', ?)`
    )
    .run(contentId);
const insertArticle = (contentId: number, title: string, isDelete = 0) =>
  mainDb
    .prepare(
      `INSERT INTO articles (create_time, update_time, title, author, tags, links, content_id, is_delete)
       VALUES (0, 0, ?, '', '[]', '[]', ?, ?)`
    )
    .run(title, contentId, isDelete);

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

describe("getDocTaskSnapshot", () => {
  it("按文档汇总；只列未完成条目；不属于实体的正文与已删文章不出现", () => {
    const a = insertContent([list(item("a1", "甲"), item("a2", "乙", true))], 2_000);
    insertArticle(a, "Q4 发布准备");
    const c = insertContent([list(item("c1", "丙"))], 3_000);
    insertCard(c);
    const orphan = insertContent([list(item("o1", "无主"))]);
    const deleted = insertContent([list(item("d1", "已删"))]);
    insertArticle(deleted, "删掉的", 1);
    reindexDocTasks(mainDb, indexDb, [a, c, orphan, deleted]);

    const snapshot = getDocTaskSnapshot(mainDb, indexDb);
    expect(snapshot.sources.map(s => [s.contentId, s.ref.kind, s.openCount, s.doneCount])).toEqual([
      [c, "card", 1, 0],
      [a, "article", 1, 1],
    ]);
    expect(snapshot.sources[1].title).toBe("Q4 发布准备");
    expect(snapshot.open.map(t => t.taskId).sort()).toEqual(["a1", "c1"]);
  });
});

describe("toggleDocTask", () => {
  it("写回正文并更新镜像；正文 update_time 前进", () => {
    const id = insertContent([list(item("t", "任务"))]);
    insertCard(id);
    reindexDocTasks(mainDb, indexDb, [id]);

    expect(toggleDocTask(mainDb, indexDb, id, "t", true)).toBe("ok");

    const row = mainDb
      .prepare(`SELECT content, update_time FROM contents WHERE id = ?`)
      .get(id) as {
      content: string;
      update_time: number;
    };
    expect(JSON.parse(row.content)[0].children[0].checked).toBe(true);
    expect(row.update_time).toBeGreaterThan(1_000);
    expect(getDocTasksOf(mainDb, indexDb, id)[0].checked).toBe(true);
  });

  it("原文里已没有这一项时返回 not-found 并重建索引", () => {
    const id = insertContent([list(item("t", "任务"))]);
    reindexDocTasks(mainDb, indexDb, [id]);
    mainDb
      .prepare(`UPDATE contents SET content = ?, update_time = 2000 WHERE id = ?`)
      .run(JSON.stringify([p("删光了")]), id);

    expect(toggleDocTask(mainDb, indexDb, id, "t", true)).toBe("not-found");
    expect(getDocTasksOf(mainDb, indexDb, id)).toEqual([]);
  });

  it("内容层拒绝写入（共享内容）时返回 readonly，正文不变", () => {
    const id = insertContent([list(item("t", "任务"))]);
    reindexDocTasks(mainDb, indexDb, [id]);
    mainDb
      .prepare(
        `INSERT INTO collaboration_bindings (content_id, content_created_at, server_url, document_id)
         VALUES (?, 0, '', 'doc')`
      )
      .run(id);

    expect(toggleDocTask(mainDb, indexDb, id, "t", true)).toBe("readonly");
    const row = mainDb.prepare(`SELECT content FROM contents WHERE id = ?`).get(id) as {
      content: string;
    };
    expect(JSON.parse(row.content)[0].children[0].checked).toBe(false);
  });
});

describe("getDocTaskContentStatus", () => {
  it("给编辑器状态条：未完成数与是否排除", () => {
    const id = insertContent([list(item("a", "甲"), item("b", "乙", true))]);
    reindexDocTasks(mainDb, indexDb, [id]);
    expect(getDocTaskContentStatus(mainDb, indexDb, id)).toEqual({
      excluded: false,
      openCount: 1,
    });
  });
});
