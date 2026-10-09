import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import ComposeBoardTable from "../compose-board";
import ContentTable from "../content";

const refCount = (db: Database.Database, pageId: number) =>
  (
    db.prepare(`SELECT ref_count FROM white_board_contents WHERE id = ?`).get(pageId) as {
      ref_count: number;
    }
  ).ref_count;

describe("compose_boards", () => {
  let db: Database.Database;
  let contentId: number;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
    contentId = ContentTable.createContent(db, { content: [] });
  });
  afterEach(() => db.close());

  it("懒创建一页画布且不建白板行；重复 ensure 返回同一块、不覆盖意图", () => {
    expect(ComposeBoardTable.get(db, contentId)).toBeNull();
    const board = ComposeBoardTable.ensure(db, contentId, "  写间隔重复  ");
    expect(board).toMatchObject({ contentId, intent: "写间隔重复", dismissed: [] });
    expect(refCount(db, board.pageId)).toBe(1);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM white_boards`).get()).toEqual({ n: 0 });

    const again = ComposeBoardTable.ensure(db, contentId, "别的");
    expect(again.pageId).toBe(board.pageId);
    expect(again.intent).toBe("写间隔重复");
    expect(ComposeBoardTable.setIntent(db, contentId, "新意图")!.intent).toBe("新意图");
  });

  it("正文不存在时拒绝建板", () => {
    expect(() => ComposeBoardTable.ensure(db, 999)).toThrow();
  });

  it("移走的资料去重累积", () => {
    ComposeBoardTable.ensure(db, contentId);
    ComposeBoardTable.dismiss(db, contentId, ["card:1", "article:2"]);
    const board = ComposeBoardTable.dismiss(db, contentId, ["card:1", "card:3"]);
    expect(board!.dismissed).toEqual(["card:1", "article:2", "card:3"]);
  });

  it("正文删除时释放绑定并对页减计数；对账清孤儿", () => {
    const { pageId } = ComposeBoardTable.ensure(db, contentId);
    expect(ComposeBoardTable.contentIdsOfPages(db, [pageId]).get(pageId)).toBe(contentId);
    ContentTable.deleteContent(db, contentId);
    expect(ComposeBoardTable.get(db, contentId)).toBeNull();
    expect(refCount(db, pageId)).toBe(0);

    const other = ContentTable.createContent(db, { content: [] });
    const orphan = ComposeBoardTable.ensure(db, other);
    db.prepare(`DELETE FROM contents WHERE id = ?`).run(other);
    expect(ComposeBoardTable.removeOrphans(db)).toBe(1);
    expect(refCount(db, orphan.pageId)).toBe(0);
  });
});
