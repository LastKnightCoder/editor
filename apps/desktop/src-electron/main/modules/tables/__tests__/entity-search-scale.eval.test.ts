/**
 * 「关联已有」材料搜索的规模实测（KL-029：按结构推导的量级，不按本机数据）。设环境变量才跑：
 *   KL_PICKER_SCALE=1 ELECTRON_RUN_AS_NODE=1 npx electron ../../node_modules/vitest/vitest.mjs run \
 *     src-electron/main/modules/tables/__tests__/entity-search-scale.eval.test.ts
 */

import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import EntitySearchTable from "../entity-search";

const EXCERPTS = 50_000;
const ANNOTATIONS = 5_000;

const time = <T>(fn: () => T) => {
  const start = performance.now();
  const result = fn();
  return { ms: performance.now() - start, result };
};

describe.skipIf(!process.env.KL_PICKER_SCALE)("材料搜索规模", () => {
  it(`${EXCERPTS} 条摘录、${ANNOTATIONS} 条 PDF 标注`, () => {
    const db = new Database(":memory:");
    db.exec(schema);
    const now = Date.now();
    const insertExcerpt = db.prepare(
      `INSERT INTO excerpt (source_type, source_key, source_title, external_id, quote, note,
         create_time, update_time) VALUES ('weread', ?, ?, ?, ?, ?, ?, ?)`
    );
    db.prepare(
      `INSERT INTO pdfs (id, create_time, update_time, file_name, file_path, tags, is_local)
       VALUES (1, 1, 1, '大论文.pdf', '/x', '[]', 1)`
    ).run();
    const insertAnnotation = db.prepare(
      `INSERT INTO pdf_annotations (create_time, update_time, pdf_id, page_num, annotation_payload, notes, type)
       VALUES (?, ?, 1, ?, ?, '[]', 'highlight')`
    );
    db.transaction(() => {
      for (let i = 0; i < EXCERPTS; i++) {
        const book = `b${i % 1000}`;
        insertExcerpt.run(
          book,
          `书 ${i % 1000}`,
          `${book}:bm_${i}`,
          `第 ${i} 条划线，讲的是财政与${i % 97 === 0 ? "土地" : "产业"}的关系。`.repeat(3),
          i % 5 === 0 ? "一点想法" : "",
          now - i,
          now - i
        );
      }
      for (let i = 0; i < ANNOTATIONS; i++) {
        insertAnnotation.run(
          now - i,
          now - i,
          i % 300,
          JSON.stringify({ custom: { text: `标注 ${i}：${i % 53 === 0 ? "土地" : "利率"}` } })
        );
      }
    })();

    const recent = time(() => EntitySearchTable.search(db, { kind: "excerpt" }));
    const hit = time(() => EntitySearchTable.search(db, { kind: "excerpt", keyword: "土地" }));
    const miss = time(() => EntitySearchTable.search(db, { kind: "excerpt", keyword: "不存在" }));
    const pdf = time(() =>
      EntitySearchTable.search(db, { kind: "pdf-annotation", keyword: "土地" })
    );
    console.log(
      `[picker-scale] 摘录最近 ${recent.ms.toFixed(1)} ms、命中 ${hit.ms.toFixed(1)} ms、` +
        `未命中（全表扫）${miss.ms.toFixed(1)} ms；PDF 标注命中 ${pdf.ms.toFixed(1)} ms`
    );
    expect(recent.result).toHaveLength(40);
    expect(hit.result.length).toBeGreaterThan(0);
    expect(miss.result).toHaveLength(0);
    expect(pdf.result.length).toBeGreaterThan(0);
    db.close();
  });
});
