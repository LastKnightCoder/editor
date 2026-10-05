import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/index.sql?raw";
import { splitSections } from "@/entity/sections";
import { readContentSection } from "../content-sections";

vi.mock("electron", () => ({ app: { getPath: () => "/tmp" }, ipcMain: { handle: vi.fn() } }));
vi.mock("../video-note-index-queue", () => ({ default: {} }));
vi.mock("../local-inference", () => ({
  default: { embedTexts: async (texts: string[]) => ({ embeddings: texts.map(() => [1, 0, 0]) }) },
}));
import VecDocumentTable from "../tables/vec-document";
import FTSTable from "../tables/fts";
import * as searchDetails from "../search-details";

const opened: Database.Database[] = [];
afterEach(() => {
  opened.splice(0).forEach(db => db.close());
  vi.restoreAllMocks();
});

describe("节级索引持久化", () => {
  it.each(["excerpt", "pdf-annotation"] as const)("长材料 %s 命中尾部时仍返回整条证据", type => {
    const db = new Database(":memory:");
    opened.push(db);
    db.exec(schema);
    const text = "正文".repeat(750) + "唯一尾部证据";
    vi.spyOn(searchDetails, "searchResultDetails").mockReturnValue({
      contentId: 0,
      title: "来源",
      content: [{ type: "paragraph", children: [{ type: "formatted", text }] }],
    });
    expect(FTSTable.indexContent(db, { id: 1, type, content: text, updateTime: 1 })).toBe(true);
    const [result] = FTSTable.getSearchResultDetails(
      db,
      [{ id: 1, type, source: "fts", updateTime: 1, chunkIndex: 0 }],
      db
    );
    expect(result.section?.text).toContain("唯一尾部证据");
    expect(result.section?.text.length).toBeGreaterThan(1500);
  });
  it("向量与全文各按自己的正文版本存节位置，全文重建不删向量", async () => {
    const db = new Database(":memory:");
    opened.push(db);
    sqliteVec.load(db);
    db.exec(schema);
    VecDocumentTable.initTableByVecLength(db, 3);
    const sections = splitSections(
      [
        { type: "header", level: 1, children: [{ type: "formatted", text: "甲节" }] },
        { type: "paragraph", children: [{ type: "formatted", text: "共同观点".repeat(30) }] },
        { type: "header", level: 1, children: [{ type: "formatted", text: "乙节" }] },
        { type: "paragraph", children: [{ type: "formatted", text: "第二观点".repeat(30) }] },
      ],
      "文章"
    );
    const params = {
      id: 1,
      type: "article" as const,
      content: "正文",
      title: "文章",
      sections,
      updateTime: 1,
    };
    expect(
      await VecDocumentTable.indexContent(db, {
        ...params,
        modelInfo: { providerType: "local_python", model: "fixture", dimensions: 3 },
      })
    ).toBe(true);
    expect(FTSTable.indexContent(db, params)).toBe(true);
    expect(db.prepare("SELECT chunk_index FROM vec_documents ORDER BY chunk_index").all()).toEqual([
      { chunk_index: 0 },
      { chunk_index: 1 },
    ]);
    expect(readContentSection(db, "article:1", 1, 1)).toMatchObject({
      headingPath: "乙节",
      blockStart: 2,
      blockEnd: 3,
      text: sections[1].text,
    });

    // 正文改了：全文先重建到新版本，向量仍停在旧版本，两边的节各自可读
    expect(
      FTSTable.indexContent(db, { id: 1, type: "article", content: "新正文", updateTime: 2 })
    ).toBe(true);
    expect(db.prepare("SELECT COUNT(*) AS n FROM vec_documents").get()).toEqual({ n: 2 });
    expect(readContentSection(db, "article:1", 1, 1)?.headingPath).toBe("乙节");
    expect(readContentSection(db, "article:1", 2, 0)?.text).toBe("新正文");

    // 向量也重建后，旧版本节位置被清理
    await VecDocumentTable.indexContent(db, {
      id: 1,
      type: "article",
      content: "新正文",
      updateTime: 2,
      modelInfo: { providerType: "local_python", model: "fixture", dimensions: 3 },
    });
    expect(db.prepare("SELECT DISTINCT update_time FROM content_sections").all()).toEqual([
      { update_time: 2 },
    ]);
  });

  it("超长卡片整篇一节但按长度切块，单块不超过上限", () => {
    const text = Array.from({ length: 40 }, (_, i) => `第${i}段`.padEnd(300, "字")).join("\n\n");
    const sections = splitSections(
      [{ type: "paragraph", children: [{ type: "formatted", text }] }],
      "",
      true
    );
    expect(sections.length).toBeGreaterThan(1);
    expect(Math.max(...sections.map(section => section.charCount))).toBeLessThanOrEqual(2600);
    expect(sections.every(section => section.headingPath === "")).toBe(true);
  });
});
