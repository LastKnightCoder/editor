import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";

// 内容表间接加载到 electron 与视频笔记队列
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import ContentAiMetaTable, { parseContentAiMeta } from "../content-ai-meta";
import ContentTable from "../content";

const META = {
  title: "卡片是连接的枢纽",
  summary: "观点要能被单独引用",
  concepts: ["卡片"],
  claims: [],
};

describe("content_ai_meta", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
  });
  afterEach(() => db.close());

  const addContent = () => ContentTable.createContent(db, { content: [] });

  it("首次写入记 create_time，重算只改 update_time 与内容", () => {
    const id = addContent();
    ContentAiMetaTable.upsert(
      db,
      { contentId: id, textDigest: "d1", meta: META, model: "p/m" },
      100
    );
    ContentAiMetaTable.upsert(
      db,
      { contentId: id, textDigest: "d2", meta: { ...META, title: "新标题" }, model: "p/n" },
      200
    );
    const row = ContentAiMetaTable.get(db, id)!;
    expect(row).toMatchObject({ createTime: 100, updateTime: 200, textDigest: "d2", model: "p/n" });
    expect(row.meta.title).toBe("新标题");
    ContentAiMetaTable.touch(db, id, 300);
    expect(ContentAiMetaTable.get(db, id)).toMatchObject({ updateTime: 300, textDigest: "d2" });
  });

  it("正文引用计数归零时同事务删除元信息，未归零时保留", () => {
    const id = addContent();
    ContentTable.incrementRefCount(db, id);
    ContentAiMetaTable.upsert(db, { contentId: id, textDigest: "d", meta: META, model: "p/m" });
    ContentTable.deleteContent(db, id);
    expect(ContentAiMetaTable.get(db, id)).not.toBeNull();
    ContentTable.deleteContent(db, id);
    expect(ContentAiMetaTable.get(db, id)).toBeNull();
    expect(ContentTable.getContentById(db, id)).toBeNull();
  });

  it("对账清理正文已不存在的孤儿行", () => {
    const kept = addContent();
    ContentAiMetaTable.upsert(db, { contentId: kept, textDigest: "d", meta: META, model: "p/m" });
    ContentAiMetaTable.upsert(db, { contentId: 999, textDigest: "d", meta: META, model: "p/m" });
    expect(ContentAiMetaTable.removeOrphans(db)).toBe(1);
    expect([...ContentAiMetaTable.getMany(db, [kept, 999]).keys()]).toEqual([kept]);
  });

  it("坏数据解析为空值或 null", () => {
    expect(parseContentAiMeta("{")).toBeNull();
    expect(parseContentAiMeta(JSON.stringify({ title: 1, concepts: ["a", 2, " "] }))).toEqual({
      title: "",
      summary: "",
      concepts: ["a"],
      claims: [],
    });
  });
});
