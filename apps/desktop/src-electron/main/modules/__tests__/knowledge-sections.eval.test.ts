import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import type { Descendant } from "slate";
import { expect, it, vi } from "vitest";
import indexSchema from "@tau/db-schema/schema/index.sql?raw";
import { splitSections } from "@/entity/sections";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
import VecDocumentTable from "../tables/vec-document";
import KnowledgeMapTable from "../tables/knowledge-map";

const paragraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});
const summary = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    mean: values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length),
    p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    max: sorted.at(-1) ?? 0,
  };
};

it.skipIf(!process.env.KL_SECTIONS_SCALE)(
  "一万篇十五节的真实 vec0 规模夹具",
  () => {
    const db = new Database(":memory:");
    sqliteVec.load(db);
    db.exec(indexSchema);
    VecDocumentTable.initTableByVecLength(db, 1024);
    try {
      const document: Descendant[] = Array.from({ length: 15 }, (_, index) => [
        {
          type: "header",
          level: 1,
          children: [{ type: "formatted", text: `节 ${index}` }],
        } as Descendant,
        paragraph(
          "一节承载一个完整观点，保留论据、边界条件以及结论，检索后回到对应位置。".repeat(5)
        ),
      ]).flat();
      const start = performance.now();
      let count = 0;
      for (let id = 0; id < 10000; id++) count += splitSections(document, `文档 ${id}`).length;
      expect(count).toBe(150000);
      const chunkMs = performance.now() - start;
      const insert = db.prepare(
        "INSERT INTO vec_documents (prefixed_id, update_time, content, type, chunk_index, vec_embedding) VALUES (?, 1.0, '规模夹具', 'article', ?, ?)"
      );
      let seed = 123456789;
      const embedding = new Float32Array(1024);
      const insertStart = performance.now();
      db.transaction(() => {
        for (let id = 0; id < 10000; id++) {
          for (let chunk = 0; chunk < 15; chunk++) {
            let norm = 0;
            for (let i = 0; i < embedding.length; i++) {
              seed ^= seed << 13;
              seed ^= seed >>> 17;
              seed ^= seed << 5;
              embedding[i] = (seed >>> 0) / 0xffffffff - 0.5;
              norm += embedding[i] ** 2;
            }
            norm = Math.sqrt(norm);
            for (let i = 0; i < embedding.length; i++) embedding[i] /= norm;
            insert.run(`article:${id}`, BigInt(chunk), Buffer.from(embedding.buffer));
          }
        }
      })();
      const insertMs = performance.now() - insertStart;
      const search: number[] = [],
        neighbors: number[] = [];
      for (let attempt = 0; attempt < 7; attempt++) {
        let started = performance.now();
        expect(
          VecDocumentTable.searchVecDocuments(db, Array.from(embedding), 24, ["article"], 1.9)
        ).toHaveLength(24);
        search.push(performance.now() - started);
        started = performance.now();
        expect(
          KnowledgeMapTable.neighborsOf(db, `article:${attempt * 1000}`, 8).length
        ).toBeGreaterThan(0);
        neighbors.push(performance.now() - started);
      }
      console.log(
        "KL_SECTIONS_SCALE",
        JSON.stringify({
          documents: 10000,
          sections: count,
          dimensions: 1024,
          chunkMs,
          insertMs,
          vectorSearchMs: summary(search),
          neighborsOfMs: summary(neighbors),
        })
      );
    } finally {
      db.close();
    }
  },
  180000
);

it.skipIf(!process.env.KL_SECTIONS_MAIN)(
  "真实库副本的节分布",
  async () => {
    const db = new Database(process.env.KL_SECTIONS_MAIN!);
    try {
      const rows = db
        .prepare(
          `SELECT 'card' AS kind, '' AS title, c.content FROM cards e JOIN contents c ON c.id=e.content_id
      UNION ALL SELECT 'article', e.title, c.content FROM articles e JOIN contents c ON c.id=e.content_id WHERE e.is_delete=0
      UNION ALL SELECT 'project-item', e.title, c.content FROM project_item e JOIN contents c ON c.id=e.content_id WHERE e.project_item_type='document'`
        )
        .all() as { kind: string; title: string; content: string }[];
      const started = performance.now();
      const counts: Record<string, number[]> = {},
        lengths: number[] = [];
      for (const row of rows) {
        const content = JSON.parse(row.content || "[]") as Descendant[];
        const sections = splitSections(content, row.title, row.kind === "card");
        (counts[row.kind] ??= []).push(sections.length);
        if (row.kind !== "card") lengths.push(...sections.map(section => section.charCount));
      }
      console.log(
        "KL_SECTIONS_REAL",
        JSON.stringify({
          documents: rows.length,
          chunkMs: performance.now() - started,
          byKind: Object.fromEntries(
            Object.entries(counts).map(([kind, values]) => [kind, summary(values)])
          ),
          sectionChars: summary(lengths),
        })
      );
      const sectionCalibration = [];
      for (const [minLength, maxLength] of [
        [80, 800],
        [80, 1200],
        [80, 1600],
        [40, 1200],
        [120, 1200],
      ]) {
        const lengths: number[] = [];
        for (const row of rows.filter(row => row.kind !== "card")) {
          lengths.push(
            ...splitSections(JSON.parse(row.content || "[]"), row.title, false, {
              minLength,
              maxLength,
            }).map(section => section.charCount)
          );
        }
        sectionCalibration.push({ minLength, maxLength, sectionChars: summary(lengths) });
      }
      console.log("KL_SECTION_LIMITS", JSON.stringify(sectionCalibration));
    } finally {
      db.close();
    }
  },
  180000
);
