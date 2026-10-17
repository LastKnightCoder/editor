import { describe, expect, it } from "vitest";
import type { Metadata, Notebook } from "../src/service/types";
import {
  buildBookNotes,
  countNotes,
  filterNotes,
  formatReadDay,
  matchStatus,
  notesToMarkdown,
  planNoteSync,
  preferNonEmpty,
  rankArchives,
  readingNow,
  resolveStatus,
  sortBooks,
  toBook,
} from "../src/model";

const meta = (bookId: string, extra: Partial<Metadata> = {}): Metadata => ({
  bookId,
  author: "作者",
  title: `书${bookId}`,
  cover: "",
  bookType: 0,
  publishTime: "",
  noteCount: 0,
  reviewCount: 0,
  lastReadDate: "",
  ...extra,
});

const notebook = (m: Metadata, extra: Partial<Notebook> = {}): Notebook => ({
  metaData: m,
  chapterHighlights: [],
  bookReview: { chapterReviews: [], bookReviews: [] },
  ...extra,
});

describe("书架", () => {
  it("阅读状态：完成日期或 100% 为读完，有进度/时长为在读", () => {
    expect(
      resolveStatus({ readingProgress: 100, readingTime: 0, readingBookDate: 0, finishedDate: 0 })
    ).toBe("finished");
    expect(
      resolveStatus({ readingProgress: 3, readingTime: 0, readingBookDate: 0, finishedDate: 1 })
    ).toBe("finished");
    expect(
      resolveStatus({ readingProgress: 0, readingTime: 60, readingBookDate: 0, finishedDate: 0 })
    ).toBe("reading");
    expect(resolveStatus(undefined)).toBe("unread");
  });

  it("toBook：秒转分钟、进度夹在 0–100、分类去空白", () => {
    const book = toBook(
      notebook(
        meta("a", {
          archiveName: " 小说 ",
          readInfo: {
            readingProgress: 130,
            readingTime: 3599,
            readingBookDate: 0,
            finishedDate: 0,
          },
        })
      )
    );
    expect(book).toMatchObject({ archive: "小说", progress: 100, minutes: 60, status: "finished" });
  });

  const books = [
    toBook(
      notebook(
        meta("a", {
          archiveName: "小说",
          noteCount: 3,
          lastReadDate: "2026-09-01",
          readInfo: { readingProgress: 40, readingTime: 600, readingBookDate: 0, finishedDate: 0 },
        })
      )
    ),
    toBook(
      notebook(
        meta("b", {
          archiveName: "历史",
          lastReadDate: "2026-09-20",
          readInfo: { readingProgress: 10, readingTime: 60, readingBookDate: 0, finishedDate: 0 },
        })
      )
    ),
    toBook(
      notebook(
        meta("c", {
          archiveName: "小说",
          lastReadDate: "2026-08-01",
          readInfo: {
            readingProgress: 100,
            readingTime: 6000,
            readingBookDate: 0,
            finishedDate: 0,
          },
        })
      )
    ),
    toBook(notebook(meta("d"))),
  ];

  it("分类按书数降序，未分类不计", () => {
    expect(rankArchives(books)).toEqual([
      { name: "小说", count: 2 },
      { name: "历史", count: 1 },
    ]);
  });

  it("排序：最近阅读 / 数值降序并以最近阅读兜底", () => {
    expect(sortBooks(books, "last").map(b => b.id)).toEqual(["b", "a", "c", "d"]);
    expect(sortBooks(books, "minutes").map(b => b.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("状态筛选与在读行", () => {
    expect(books.filter(b => matchStatus(b, "notes")).map(b => b.id)).toEqual(["a"]);
    expect(readingNow(books).map(b => b.id)).toEqual(["b", "a"]);
  });
});

describe("笔记", () => {
  const nb = notebook(meta("x"), {
    chapterHighlights: [
      {
        chapterUid: 2,
        chapterTitle: "第二章",
        level: 1,
        isMPChapter: 0,
        highlights: [
          {
            bookmarkId: "h2",
            created: 2,
            createTime: "",
            chapterUid: 2,
            chapterIdx: 2,
            chapterTitle: "",
            markText: "后一句",
            style: 2,
            colorStyle: 3,
            range: "50-60",
          },
          {
            bookmarkId: "h1",
            created: 1,
            createTime: "",
            chapterUid: 2,
            chapterIdx: 2,
            chapterTitle: "",
            markText: "前一句\n   第二段",
            style: 1,
            colorStyle: 9,
            range: "10-20",
          },
        ],
        chapterReviews: [
          {
            reviewId: "r1",
            created: 3,
            createTime: "",
            content: "对前一句的想法",
            range: "10-20",
            type: 1,
          },
          {
            reviewId: "r2",
            created: 4,
            createTime: "",
            content: "只有想法",
            abstract: "被想法引用的原文",
            range: "30-40",
            type: 1,
          },
          { reviewId: "r3", created: 5, createTime: "", content: "章节感想", type: 1 },
        ],
      },
      { chapterUid: 3, chapterTitle: "空章", level: 1, isMPChapter: 0, highlights: [] },
    ],
    bookReview: {
      chapterReviews: [],
      bookReviews: [
        { reviewId: "br", created: 6, createTime: "", content: "整本书的书评", type: 4 },
      ],
    },
  });

  const notes = buildBookNotes(nb);

  it("按 range 排序，想法并到同 range 划线上，缺划线的想法用摘录补原文", () => {
    expect(notes.chapters).toHaveLength(1);
    const [ch] = notes.chapters;
    expect(ch.notes.map(n => n.id)).toEqual(["h1", "r2", "h2"]);
    expect(ch.notes[0]).toMatchObject({
      paragraphs: ["前一句", "第二段"],
      review: ["对前一句的想法"],
      color: 5,
      style: 1,
    });
    expect(ch.notes[1]).toMatchObject({ paragraphs: ["被想法引用的原文"], review: ["只有想法"] });
    expect(ch.thoughts).toEqual([["章节感想"]]);
    expect(notes.bookReviews.map(r => r.paragraphs)).toEqual([["整本书的书评"]]);
  });

  it("过滤与计数", () => {
    expect(countNotes(notes.chapters)).toEqual({ highlights: 3, reviews: 3 });
    expect(filterNotes(notes, 3)[0].notes.map(n => n.id)).toEqual(["h2"]);
    expect(filterNotes(notes, "review")[0].notes.map(n => n.id)).toEqual(["h1", "r2"]);
    expect(filterNotes(notes, 1)).toEqual([]);
  });

  it("网关返回空详情时保留缓存笔记，但采用新元数据", () => {
    const empty = notebook(meta("x", { title: "新书名" }));
    const kept = preferNonEmpty(nb, empty);
    expect(kept.chapterHighlights).toBe(nb.chapterHighlights);
    expect(kept.metaData.title).toBe("新书名");
  });

  it("Markdown 导出", () => {
    const md = notesToMarkdown(toBook(nb), notes);
    expect(md).toContain("## 第二章");
    expect(md).toContain("> 前一句\n> 第二段");
    expect(md).toContain("整本书的书评");
  });
});

describe("格式", () => {
  const now = new Date(2026, 8, 26, 10);
  it("最近阅读日", () => {
    expect(formatReadDay("2026-09-26", now)).toBe("今天");
    expect(formatReadDay("2026-09-25", now)).toBe("昨天");
    expect(formatReadDay("2026-09-22", now)).toBe("4 天前");
    expect(formatReadDay("2026-03-04", now)).toBe("3/4");
    expect(formatReadDay("2025-03-04", now)).toBe("2025/3/4");
    expect(formatReadDay("", now)).toBe("—");
  });
});

describe("书架同步拉划线（planNoteSync）", () => {
  const withKeys = (bookId: string, highlights?: number, reviews?: number) =>
    notebook(meta(bookId, { synckeys: { highlights, reviews } }));

  it("指纹变了或从未拉过的有笔记书拉取；没变的跳过；full 全部重拉", () => {
    const books = [
      withKeys("a", 100, 3),
      withKeys("b", 100, 3),
      withKeys("c"),
      withKeys("d", 9, 1),
    ];
    const fingerprints = {
      a: { sort: 100, count: 3 },
      b: { sort: 100, count: 4 },
      c: { sort: 50, count: 1 },
    };
    expect(planNoteSync(books, fingerprints)).toEqual({ fetch: ["b", "c"], clear: ["d"] });
    expect(planNoteSync(books, fingerprints, true).fetch).toEqual(["a", "b", "c"]);
  });

  it("从没拉到过笔记的书不在概览里时不清空", () => {
    expect(planNoteSync([withKeys("x", 0, 0), withKeys("y")], {})).toEqual({
      fetch: [],
      clear: [],
    });
  });
});
