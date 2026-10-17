import { describe, expect, it } from "vitest";
import type { ChapterHighlightReview, Highlight, Review } from "../src/service/types";
import { expandWeReadExcerpts, normalizeWeReadText } from "../src/excerpts";

const highlight = (
  bookmarkId: string,
  range: string,
  extra: Partial<Highlight> = {}
): Highlight => ({
  bookmarkId,
  created: 1_700_000_000,
  createTime: "",
  chapterUid: 7,
  chapterIdx: 2,
  chapterTitle: "第二章",
  markText: "原文",
  style: 1,
  colorStyle: 4,
  range,
  ...extra,
});

const review = (reviewId: string, range: string, extra: Partial<Review> = {}): Review => ({
  reviewId,
  created: 1_700_000_100,
  createTime: "",
  content: "我的想法",
  type: 1,
  range,
  ...extra,
});

const chapter = (extra: Partial<ChapterHighlightReview>): ChapterHighlightReview => ({
  chapterUid: 7,
  chapterIdx: 2,
  chapterTitle: "第二章",
  level: 1,
  isMPChapter: 0,
  ...extra,
});

describe("expandWeReadExcerpts", () => {
  it("还原被加的段首缩进", () => {
    expect(normalizeWeReadText("第一段\n   第二段\n\n   第三段")).toBe("第一段\n第二段\n第三段");
  });

  it("划线：external_id 带书 id，想法、颜色、章节与时间随行", () => {
    const [excerpt] = expandWeReadExcerpts("b1", [
      chapter({
        highlights: [highlight("bm1", "10-20", { markText: "甲\n   乙", reviewContent: "想" })],
      }),
    ]);
    expect(excerpt).toEqual({
      externalId: "b1:bm1",
      quote: "甲\n乙",
      note: "想",
      location: "第二章",
      anchor: { chapterUid: 7, chapterIdx: 2, chapterTitle: "第二章", range: "10-20" },
      color: "4",
      time: 1_700_000_000_000,
    });
  });

  it("同 range 的想法并到划线上；只有想法的以 abstract 作原文；无原文的想法跳过", () => {
    const excerpts = expandWeReadExcerpts("b1", [
      chapter({
        highlights: [highlight("bm1", "10-20")],
        chapterReviews: [
          review("r1", "10-20", { content: "并到划线" }),
          review("r2", "30-40", { abstract: "想法摘录", content: "独立想法" }),
          review("r3", "50-60", { abstract: "" }),
          review("r4", "", { content: "章节想法" }),
        ],
      }),
    ]);
    expect(excerpts.map(e => [e.externalId, e.quote, e.note])).toEqual([
      ["b1:bm1", "原文", "并到划线"],
      ["b1:review:r2", "想法摘录", "独立想法"],
    ]);
  });
});
