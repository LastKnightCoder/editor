import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Descendant } from "slate";

const conversion = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("../../services/content-conversion", () => ({
  parseMarkdownNodes: conversion.parse,
  getMarkdownText: async () => "",
  mapContentSnapshots: async <T, R>(items: T[], convert: (item: T) => Promise<R>) =>
    Promise.all(items.map(convert)),
}));
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import schema from "../../../../../../packages/db-schema/schema/main.sql?raw";
import PluginDataTable from "../tables/plugin-data";
import { executeDatabaseCommand } from "../database-command";

let db: Database.Database;
const scope = { databaseName: ":memory:", pluginId: "test.backend" };
const context = { broadcastAll: vi.fn(), broadcastOthers: vi.fn() };
const nodes: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "已转换正文" }] },
];
const handlers = PluginDataTable.getListenEvents();
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(schema);
  db.exec("CREATE TABLE transaction_probe(value TEXT)");
  conversion.parse.mockReset().mockResolvedValue(nodes);
  context.broadcastAll.mockClear();
});
afterEach(() => db.close());

it("正式命令分发等待内容转换时不持有事务，并发命令失败不影响待写正文", async () => {
  let finish!: (nodes: Descendant[]) => void;
  conversion.parse.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const pending = executeDatabaseCommand(
    db,
    handlers["plugin-data:create"],
    db,
    { ...scope, entity: "card", input: { content: { markdown: "正文" } } },
    context
  );
  expect(db.inTransaction).toBe(false);
  expect(
    executeDatabaseCommand(db, () => db.prepare("SELECT COUNT(*) AS n FROM cards").get())
  ).toEqual({ n: 0 });
  expect(() =>
    executeDatabaseCommand(db, () => {
      db.prepare("INSERT INTO transaction_probe VALUES ('应回滚')").run();
      throw new Error("独立请求失败");
    })
  ).toThrow("独立请求失败");
  finish(nodes);
  const card = await pending;
  expect(db.prepare("SELECT id FROM cards").all()).toEqual([{ id: card.id }]);
  expect(db.prepare("SELECT * FROM transaction_probe").all()).toEqual([]);
  expect(db.inTransaction).toBe(false);
});

it("异步转换后的同步写入失败时，正文、卡片和操作记录共同回滚", async () => {
  db.exec(
    "CREATE TEMP TRIGGER reject_card BEFORE INSERT ON cards BEGIN SELECT RAISE(ABORT, '拒绝卡片写入'); END"
  );
  const before = db.prepare("SELECT COUNT(*) AS n FROM contents").get();
  await expect(
    executeDatabaseCommand(
      db,
      handlers["plugin-data:create"],
      db,
      { ...scope, entity: "card", input: { content: { markdown: "正文" } } },
      context
    )
  ).rejects.toThrow("拒绝卡片写入");
  expect(db.prepare("SELECT COUNT(*) AS n FROM contents").get()).toEqual(before);
  expect(db.prepare("SELECT COUNT(*) AS n FROM cards").get()).toEqual({ n: 0 });
  expect(context.broadcastAll).not.toHaveBeenCalled();
  expect(db.inTransaction).toBe(false);
});

it("转换期间另一个命令修改正文时拒绝旧修订，不覆盖已经提交的修改", async () => {
  const card = await executeDatabaseCommand(
    db,
    handlers["plugin-data:create"],
    db,
    { ...scope, entity: "card", input: { content: { markdown: "原文" } } },
    context
  );
  const row = db.prepare("SELECT create_time FROM contents WHERE id=?").get(card.contentId) as {
    create_time: number;
  };
  const target = { ...scope, contentId: card.contentId!, createdAt: row.create_time };
  const snapshot = await executeDatabaseCommand(db, handlers["plugin-data:content"], db, {
    ...target,
    format: "nodes",
  });
  let finish!: (nodes: Descendant[]) => void;
  conversion.parse.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const pending = executeDatabaseCommand(
    db,
    handlers["plugin-data:edit-content"],
    db,
    {
      ...target,
      edit: { op: "append", content: { markdown: "迟到转换" } },
      expectedRevision: snapshot!.revision,
    },
    context
  );
  const rejected = expect(pending).rejects.toThrow("转换期间正文已变化");
  expect(db.inTransaction).toBe(false);
  executeDatabaseCommand(db, () => {
    db.prepare("UPDATE contents SET update_time=update_time+1000, content=? WHERE id=?").run(
      JSON.stringify([{ type: "paragraph", children: [{ text: "另一个请求" }] }]),
      card.contentId
    );
  });
  finish(nodes);
  await rejected;
  expect(
    (
      db.prepare("SELECT content FROM contents WHERE id=?").get(card.contentId) as {
        content: string;
      }
    ).content
  ).toContain("另一个请求");
});

it("命令自身失败仅回滚自己的保存点，不回滚调用方已有事务", () => {
  db.exec("BEGIN");
  db.prepare("INSERT INTO transaction_probe VALUES ('外层写入')").run();
  expect(() =>
    executeDatabaseCommand(db, () => {
      db.prepare("INSERT INTO transaction_probe VALUES ('内层写入')").run();
      throw new Error("内层失败");
    })
  ).toThrow("内层失败");
  expect(db.inTransaction).toBe(true);
  db.exec("COMMIT");
  expect(db.prepare("SELECT value FROM transaction_probe").all()).toEqual([{ value: "外层写入" }]);
});
