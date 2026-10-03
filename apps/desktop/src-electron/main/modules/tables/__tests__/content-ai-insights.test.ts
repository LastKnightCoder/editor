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

import type { ContentInsightsResult, InsightMark } from "@/types/content-insights";
import ContentAiInsightsTable from "../content-ai-insights";
import ContentTable from "../content";

const target = (contentId: number) => ({
  ref: { kind: "card" as const, id: contentId },
  contentId,
  title: "对方",
  heading: "",
  block: 0,
  excerpt: "",
});
const mark = (id: string, anchor: string, extra: Partial<InsightMark> = {}): InsightMark => ({
  id,
  kind: "link",
  block: 0,
  anchor,
  text: "可以连接",
  why: "理由",
  target: target(9),
  status: "open",
  ...extra,
});
const result = (marks: InsightMark[]): ContentInsightsResult => ({
  lead: "位置",
  marks,
  asks: [{ id: "q1", text: "为什么？", status: "open" }],
  candidates: 12,
});

describe("content_ai_insights", () => {
  let db: Database.Database;
  let contentId: number;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
    contentId = ContentTable.createContent(db, { content: [] });
  });
  afterEach(() => db.close());

  it("保存后改状态；重新分析继承已处理的状态，新出现的为 open", () => {
    ContentAiInsightsTable.save(
      db,
      {
        contentId,
        textDigest: "d1",
        result: result([mark("m1", "强制同步布局"), mark("m2", "合成线程")]),
        model: "p/m",
      },
      100
    );
    expect(ContentAiInsightsTable.setStatus(db, contentId, "m1", "dismissed")).toBe(true);
    expect(ContentAiInsightsTable.setStatus(db, contentId, "q1", "questioned")).toBe(true);
    expect(ContentAiInsightsTable.setStatus(db, contentId, "nope", "linked")).toBe(false);
    expect(ContentAiInsightsTable.get(db, contentId)!.updateTime).toBe(100);

    const row = ContentAiInsightsTable.save(
      db,
      {
        contentId,
        textDigest: "d2",
        result: result([mark("x1", "强制同步布局"), mark("x2", "关键渲染路径")]),
        model: "p/n",
      },
      200
    );
    expect(row.result.marks.map(m => [m.anchor, m.status])).toEqual([
      ["强制同步布局", "dismissed"],
      ["关键渲染路径", "open"],
    ]);
    expect(row.result.asks[0].status).toBe("questioned");
    expect(row).toMatchObject({ createTime: 100, updateTime: 200, textDigest: "d2", model: "p/n" });
  });

  it("同一片段指向不同对方算两条", () => {
    ContentAiInsightsTable.save(db, {
      contentId,
      textDigest: "d",
      result: result([mark("m1", "布局")]),
      model: "p/m",
    });
    ContentAiInsightsTable.setStatus(db, contentId, "m1", "dismissed");
    const row = ContentAiInsightsTable.save(db, {
      contentId,
      textDigest: "d",
      result: result([mark("m1", "布局", { target: target(10) })]),
      model: "p/m",
    });
    expect(row.result.marks[0].status).toBe("open");
  });

  it("正文删除时同事务删除；对账清孤儿", () => {
    ContentAiInsightsTable.save(db, {
      contentId,
      textDigest: "d",
      result: result([]),
      model: "p/m",
    });
    ContentTable.deleteContent(db, contentId);
    expect(ContentAiInsightsTable.get(db, contentId)).toBeNull();
    ContentAiInsightsTable.save(db, {
      contentId: 999,
      textDigest: "d",
      result: result([]),
      model: "p/m",
    });
    expect(ContentAiInsightsTable.removeOrphans(db)).toBe(1);
  });

  it("未知状态拒绝写入", () => {
    ContentAiInsightsTable.save(db, {
      contentId,
      textDigest: "d",
      result: result([mark("m1", "a")]),
      model: "p/m",
    });
    expect(() => ContentAiInsightsTable.setStatus(db, contentId, "m1", "bad" as never)).toThrow();
  });
});
