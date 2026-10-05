import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import type { Highlight, Notebook } from "@/types/weread";
import WeReadConfigTable from "../weread-config";
import { backfillWeReadExcerpts, WEREAD_EXCERPT_VERSION } from "../weread-excerpts";
import WeReadNotebookTable from "../weread-notebook";

const highlight = (bookmarkId: string, markText: string): Highlight => ({
  bookmarkId,
  created: 1,
  createTime: "",
  chapterUid: 1,
  chapterIdx: 1,
  chapterTitle: "一",
  markText,
  style: 0,
  colorStyle: 1,
  range: `${bookmarkId}-0`,
});

const notebook = (bookId: string, highlights: Highlight[], title = "书"): Notebook => ({
  metaData: {
    bookId,
    title,
    author: "",
    cover: "",
    bookType: 0,
    publishTime: "",
    noteCount: 0,
    reviewCount: 0,
    lastReadDate: "",
  },
  chapterHighlights: [
    { chapterUid: 1, chapterIdx: 1, chapterTitle: "一", level: 1, isMPChapter: 0, highlights },
  ],
  bookReview: { chapterReviews: [], bookReviews: [] },
});

describe("微信读书 → 摘录", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
  });
  afterEach(() => db.close());

  const active = () =>
    db
      .prepare(
        "SELECT external_id, quote, source_title FROM excerpt WHERE is_deleted = 0 ORDER BY external_id"
      )
      .all();

  it("保存时同步摘录；划线文本不变时不重新展开；源端删除软删除", () => {
    expect(
      WeReadNotebookTable.save(db, notebook("b1", [highlight("1", "甲"), highlight("2", "乙")]))
    ).toEqual({ inserted: 2, updated: 0, deleted: 0 });
    expect(
      WeReadNotebookTable.save(db, notebook("b1", [highlight("1", "甲"), highlight("2", "乙")]))
    ).toBeNull();

    WeReadNotebookTable.save(db, notebook("b1", [highlight("1", "甲")], "新书名"));
    expect(active()).toEqual([{ external_id: "b1:1", quote: "甲", source_title: "新书名" }]);
  });

  it("书移出书架：摘录全部软删除", () => {
    WeReadNotebookTable.save(db, notebook("b1", [highlight("1", "甲")]));
    expect(WeReadNotebookTable.delete(db, "b1")).toBe(1);
    expect(active()).toEqual([]);
  });

  it("连库回填：按版本号只跑一次，展开已缓存的划线", () => {
    // 模拟升级前写入的缓存：直接写行，不经 save
    WeReadNotebookTable.save(db, notebook("b1", [highlight("1", "甲")]));
    db.exec("DELETE FROM excerpt");
    expect(backfillWeReadExcerpts(db)).toBe(true);
    expect(active()).toEqual([{ external_id: "b1:1", quote: "甲", source_title: "书" }]);
    expect(WeReadConfigTable.getNumber(db, "excerpt_expand_version")).toBe(WEREAD_EXCERPT_VERSION);

    db.exec("DELETE FROM excerpt");
    expect(backfillWeReadExcerpts(db)).toBe(false);
    expect(active()).toEqual([]);
  });
});
