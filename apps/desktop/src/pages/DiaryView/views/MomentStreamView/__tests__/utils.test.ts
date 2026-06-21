import { describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import type { DiarySegmentItem } from "@/types/diary";

import {
  buildDiarySearchRankMap,
  filterAndSortSegmentsBySearchRank,
} from "../utils";

const createSegment = (
  id: number,
  diaryId: number,
  overrides: Partial<DiarySegmentItem> = {},
): DiarySegmentItem => ({
  id,
  diaryId,
  contentId: id + 100,
  wordCount: 1,
  createTime: id,
  updateTime: id,
  content: [
    { type: "paragraph", children: [{ text: `segment-${id}` }] },
  ] as Descendant[],
  entryDate: "2026-06-21",
  entryDateMs: new Date("2026-06-21T00:00:00").getTime(),
  weather: null,
  mood: null,
  tags: [],
  ...overrides,
});

describe("MomentStreamView search ordering", () => {
  it("按搜索结果相关度排序，而不是保留原始日期顺序", () => {
    const segments = [
      createSegment(1, 10, { entryDate: "2026-06-21", entryDateMs: 3 }),
      createSegment(2, 20, { entryDate: "2026-06-20", entryDateMs: 2 }),
      createSegment(3, 30, { entryDate: "2026-06-19", entryDateMs: 1 }),
    ];
    const rankMap = buildDiarySearchRankMap([30, 10]);

    const result = filterAndSortSegmentsBySearchRank(segments, rankMap);

    expect(result.map((segment) => segment.diaryId)).toEqual([30, 10]);
  });

  it("过滤后的标签/日期结果仍按搜索相关度排序", () => {
    const filteredByOtherConditions = [
      createSegment(1, 10, { tags: ["工作"] }),
      createSegment(2, 20, { tags: ["生活"] }),
      createSegment(3, 30, { tags: ["工作"] }),
    ].filter((segment) => segment.tags.includes("工作"));
    const rankMap = buildDiarySearchRankMap([30, 20, 10]);

    const result = filterAndSortSegmentsBySearchRank(
      filteredByOtherConditions,
      rankMap,
    );

    expect(result.map((segment) => segment.diaryId)).toEqual([30, 10]);
  });

  it("同一日记多个 segment 保持原始相对顺序", () => {
    const segments = [
      createSegment(1, 10),
      createSegment(2, 20),
      createSegment(3, 10),
      createSegment(4, 30),
    ];
    const rankMap = buildDiarySearchRankMap([10, 30]);

    const result = filterAndSortSegmentsBySearchRank(segments, rankMap);

    expect(result.map((segment) => segment.id)).toEqual([1, 3, 4]);
  });

  it("重复搜索结果只使用第一次出现的位置", () => {
    const rankMap = buildDiarySearchRankMap([20, 10, 20, 30]);

    expect(Array.from(rankMap.entries())).toEqual([
      [20, 0],
      [10, 1],
      [30, 2],
    ]);
  });
});
