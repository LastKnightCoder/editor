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

const opened: Database.Database[] = [];
afterEach(() => opened.splice(0).forEach(db => db.close()));

describe("节级索引持久化", () => {
  it("向量和全文使用相同块序号，嵌入完成后原子替换", async () => {
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
    expect(
      await VecDocumentTable.indexContent(db, {
        id: 1,
        type: "article",
        content: "正文",
        title: "文章",
        sections,
        updateTime: 1,
        modelInfo: { providerType: "local_python", model: "fixture", dimensions: 3 },
      })
    ).toBe(true);
    expect(db.prepare("SELECT chunk_index FROM vec_documents ORDER BY chunk_index").all()).toEqual([
      { chunk_index: 0 },
      { chunk_index: 1 },
    ]);
    expect(db.prepare("SELECT chunk_index FROM content_fts ORDER BY chunk_index").all()).toEqual([
      { chunk_index: 0 },
      { chunk_index: 1 },
    ]);
    expect(readContentSection(db, "article:1", 1, sections[1].text)).toMatchObject({
      headingPath: "乙节",
      blockStart: 2,
      blockEnd: 3,
    });
    expect(
      FTSTable.indexContent(db, { id: 1, type: "article", content: "新正文", updateTime: 2 })
    ).toBe(true);
    expect(db.prepare("SELECT COUNT(*) AS n FROM content_sections").get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM vec_documents").get()).toEqual({ n: 0 });
  });
});
