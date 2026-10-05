/**
 * 摘录写入与索引候选的规模实测（KL-029：按结构推导的量级，不按本机数据）。设环境变量才跑：
 *   KL_EXCERPT_SCALE=1 ELECTRON_RUN_AS_NODE=1 npx electron ../../node_modules/vitest/vitest.mjs run \
 *     src-electron/main/modules/tables/__tests__/excerpt-scale.eval.test.ts
 */

import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import type { Highlight, Notebook } from "@/types/weread";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import { listMaterialIndexDocs } from "../../material-index";
import ExcerptTable from "../excerpt";
import { backfillWeReadExcerpts } from "../weread-excerpts";
import WeReadNotebookTable from "../weread-notebook";

const BOOKS = 1000;
const PER_BOOK = 50;
const WEB_PAGE = 2000;

const notebook = (bookId: string, count: number, salt = ""): Notebook => {
  const highlights: Highlight[] = Array.from({ length: count }, (_, i) => ({
    bookmarkId: `bm${i}`,
    created: 1_700_000_000 + i,
    createTime: "",
    chapterUid: i % 20,
    chapterIdx: i % 20,
    chapterTitle: `第 ${i % 20} 章`,
    markText: `第 ${i} 条划线的原文，长度接近真实的一两句话。${salt}\n   第二段`,
    style: 1,
    colorStyle: (i % 5) + 1,
    reviewContent: i % 4 === 0 ? `想法 ${i}` : undefined,
    range: `${i * 100}-${i * 100 + 60}`,
  }));
  return {
    metaData: {
      bookId,
      title: `书 ${bookId}`,
      author: "",
      cover: "",
      bookType: 0,
      publishTime: "",
      noteCount: count,
      reviewCount: 0,
      lastReadDate: "",
    },
    chapterHighlights: Array.from({ length: 20 }, (_, c) => ({
      chapterUid: c,
      chapterIdx: c,
      chapterTitle: `第 ${c} 章`,
      level: 1,
      isMPChapter: 0,
      highlights: highlights.filter(h => h.chapterUid === c),
    })),
    bookReview: { chapterReviews: [], bookReviews: [] },
  };
};

const time = <T>(label: string, fn: () => T): T => {
  const start = performance.now();
  const result = fn();
  console.log(`[excerpt-scale] ${label}: ${(performance.now() - start).toFixed(0)} ms`);
  return result;
};

describe.skipIf(!process.env.KL_EXCERPT_SCALE)("摘录规模实测", () => {
  it(`${BOOKS} 本书 × ${PER_BOOK} 条划线；单页 ${WEB_PAGE} 条插件划线`, () => {
    const db = new Database(":memory:");
    db.exec(schema);
    const books = Array.from({ length: BOOKS }, (_, i) => notebook(`b${i}`, PER_BOOK));

    time("首次保存（含展开与写摘录）", () => WeReadNotebookTable.saveMany(db, books));
    time("书架同步原样写回（划线文本不变，跳过展开）", () =>
      WeReadNotebookTable.saveMany(db, books)
    );
    time("单本书重新拉取、每条都变", () =>
      WeReadNotebookTable.save(db, notebook("b0", PER_BOOK, "改"))
    );

    db.exec("DELETE FROM excerpt; DELETE FROM weread_config;");
    time("连库回填全部", () => backfillWeReadExcerpts(db));
    expect(db.prepare("SELECT COUNT(*) AS n FROM excerpt").get()).toEqual({ n: BOOKS * PER_BOOK });

    const page = Array.from({ length: WEB_PAGE }, (_, i) => ({
      id: `u${i}`,
      text: `网页划线 ${i}`,
      note: "",
      color: "pink",
      createdAt: i,
      anchor: { startXPath: "/p", startOffset: 0, endXPath: "/p", endOffset: 4 },
    }));
    time("插件单页首次同步", () =>
      ExcerptTable.syncWebPage(db, { url: "https://a.com/x", title: "A", highlights: page })
    );
    time("插件单页删一条后重发", () =>
      ExcerptTable.syncWebPage(db, {
        url: "https://a.com/x",
        title: "A",
        highlights: page.slice(1),
      })
    );

    const docs = time("索引候选（全部材料）", () => listMaterialIndexDocs(db));
    expect(docs.length).toBe(BOOKS * PER_BOOK + WEB_PAGE - 1);
    db.close();
  });
});
