import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { Node, type Descendant } from "slate";
import { expect, it, vi } from "vitest";
import indexSchema from "@tau/db-schema/schema/index.sql?raw";
import { splitSections } from "@/entity/sections";
import { buildQuoteAnchor, resolveQuoteAnchor } from "@/entity/quote-anchor";

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
import QuestionLinkTable from "../tables/question-link";

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
  "真实库副本的节分布与编辑样本",
  async () => {
    const db = new Database(process.env.KL_SECTIONS_MAIN!);
    try {
      QuestionLinkTable.upgradeTable(db);
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
      const samples: { content: Descendant[]; block: number; text: string }[] = [];
      for (const row of rows) {
        const content = JSON.parse(row.content || "[]") as Descendant[];
        const sections = splitSections(content, row.title, row.kind === "card");
        (counts[row.kind] ??= []).push(sections.length);
        if (row.kind !== "card") lengths.push(...sections.map(section => section.charCount));
        if (samples.length < 80 && row.kind !== "card") {
          const block = content.findIndex(node => {
            const length = Node.string(node).length;
            return length >= 40 && length <= 500;
          });
          if (block >= 0) samples.push({ content, block, text: Node.string(content[block]) });
        }
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
          samples: samples.length,
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
      const contextCalibration = [16, 32, 64].map(contextLength => {
        let correct = 0;
        for (const sample of samples) {
          const blocks = sample.content.map(node => Node.string(node));
          const before = blocks.slice(0, sample.block).join("\n") + (sample.block > 0 ? "\n" : "");
          const after =
            sample.block + 1 < blocks.length
              ? "\n" + blocks.slice(sample.block + 1).join("\n")
              : "";
          const anchor = {
            exact: sample.text,
            prefix: before.slice(-contextLength),
            suffix: after.slice(0, contextLength),
          };
          const duplicated = [
            paragraph(sample.text),
            paragraph("重复引文之间的分隔段落。"),
            ...sample.content,
          ];
          if (resolveQuoteAnchor(duplicated, anchor).blockStart === sample.block + 2) correct++;
        }
        return { contextLength, correct, total: samples.length };
      });
      console.log("KL_QUOTE_CONTEXT", JSON.stringify(contextCalibration));
      const calibration = [];
      for (const threshold of [0.65, 0.7, 0.75, 0.8, 0.85, 0.9]) {
        let recovered = 0,
          positives = 0,
          falsePositive = 0,
          negatives = 0;
        const times: number[] = [];
        for (const sample of samples) {
          await new Promise<void>(resolve => setImmediate(resolve));
          const leaves = [...Node.texts(sample.content[sample.block])];
          const first = leaves[0],
            last = leaves.at(-1)!;
          const anchor = buildQuoteAnchor(sample.content, {
            start: { path: [sample.block, ...first[1]], offset: 0 },
            end: { path: [sample.block, ...last[1]], offset: last[0].text.length },
          });
          const mid = Math.floor(sample.text.length / 2);
          for (const [text, expected] of [
            [sample.text, true],
            [sample.text.slice(0, mid) + "改" + sample.text.slice(mid + 1), true],
            [sample.text.slice(0, mid) + "这是补充说明。" + sample.text.slice(mid), true],
            [
              sample.text.slice(0, mid) +
                sample.text.slice(mid + Math.max(1, Math.floor(sample.text.length * 0.15))),
              true,
            ],
            ["天气晴朗，下午去公园散步，傍晚返回住所休息。", false],
            [null, false],
          ] as const) {
            const edited = [...sample.content];
            if (text === null) edited.splice(sample.block, 1);
            else edited[sample.block] = paragraph(text);
            const start = performance.now();
            const found = resolveQuoteAnchor(edited, anchor, threshold);
            times.push(performance.now() - start);
            if (expected) {
              positives++;
              if (found.status !== "lost" && found.blockStart === sample.block) recovered++;
            } else {
              negatives++;
              if (found.status !== "lost") falsePositive++;
            }
          }
        }
        calibration.push({
          threshold,
          recovered,
          positives,
          falsePositive,
          negatives,
          resolveMs: summary(times),
        });
      }
      console.log("KL_ANCHOR_REAL", JSON.stringify(calibration));
    } finally {
      db.close();
    }
  },
  180000
);
