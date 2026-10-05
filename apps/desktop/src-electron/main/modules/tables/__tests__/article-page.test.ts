import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import ArticleTable from "../article";

describe("文章分页排序", () => {
  let db: Database.Database;

  const addArticle = (
    title: string,
    {
      created,
      updated,
      words,
      top = false,
    }: { created: number; updated: number; words: number; top?: boolean }
  ) => {
    const contentId = Number(
      db
        .prepare(
          `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (?, ?, '[]', ?, 1)`
        )
        .run(created, updated, words).lastInsertRowid
    );
    db.prepare(
      `INSERT INTO articles (title, create_time, update_time, tags, links, is_top, content_id)
       VALUES (?, ?, ?, '[]', '[]', ?, ?)`
    ).run(title, created, updated, top ? 1 : 0, contentId);
  };

  const titles = (
    ...args: Parameters<typeof ArticleTable.getArticlePage> extends [unknown, ...infer R]
      ? R
      : never
  ) => ArticleTable.getArticlePage(db, ...args).items.map(item => item.title);

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
    addArticle("旧而长", { created: 1, updated: 2, words: 900 });
    addArticle("新而短", { created: 3, updated: 4, words: 100 });
    addArticle("最近改", { created: 2, updated: 9, words: 500 });
    addArticle("置顶", { created: 0, updated: 0, words: 10, top: true });
  });

  it("置顶在任何排序下都排最前，其余按所选列降序", () => {
    expect(titles(0, 10, undefined, undefined, "updated")).toEqual([
      "置顶",
      "最近改",
      "新而短",
      "旧而长",
    ]);
    expect(titles(0, 10, undefined, undefined, "created")).toEqual([
      "置顶",
      "新而短",
      "最近改",
      "旧而长",
    ]);
    expect(titles(0, 10, undefined, undefined, "words")).toEqual([
      "置顶",
      "旧而长",
      "最近改",
      "新而短",
    ]);
  });

  it("排序与分页衔接：offset 按同一顺序续取", () => {
    expect(titles(1, 2, undefined, undefined, "words")).toEqual(["旧而长", "最近改"]);
  });

  it.each([
    ["IPC 包装层追加的命令上下文", { sender: "window" }],
    ["原型链上的键", "constructor"],
  ])("排序位不是白名单值时（%s）回落到更新时间", (_, sort) => {
    expect(titles(0, 10, undefined, undefined, sort as "updated")).toEqual([
      "置顶",
      "最近改",
      "新而短",
      "旧而长",
    ]);
  });
});
