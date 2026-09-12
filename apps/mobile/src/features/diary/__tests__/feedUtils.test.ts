import { describe, expect, it } from "vitest";
import type { DiaryEntry, DiarySegment } from "../../../types";
import { collectDailyDates, hasDiaryContent } from "../feedUtils";

function makeEntry(params: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: params.id ?? 1,
    type: params.type ?? "daily",
    date: params.date ?? "2026-09-12",
    contentId: null,
    weather: null,
    mood: null,
    wordCount: params.wordCount ?? 0,
    createTime: 1,
    updateTime: 1,
    content: [],
    segments: params.segments ?? [],
    tags: [],
  };
}

const segment: DiarySegment = {
  id: 1,
  diaryId: 1,
  contentId: 11,
  createTime: 1,
  updateTime: 1,
  wordCount: 3,
  content: [],
};

describe("diary/feedUtils", () => {
  it("片段删光的空壳 entry 不算有内容", () => {
    expect(hasDiaryContent(makeEntry())).toBe(false);
    expect(hasDiaryContent(makeEntry({ segments: [segment] }))).toBe(true);
  });

  it("日历与连续天数统计忽略空壳 entry", () => {
    const dates = collectDailyDates([
      makeEntry({ id: 1, date: "2026-09-11" }),
      makeEntry({ id: 2, date: "2026-09-12", segments: [segment] }),
      makeEntry({ id: 3, type: "monthly", date: "2026-09", segments: [segment] }),
    ]);
    expect([...dates]).toEqual(["2026-09-12"]);
  });
});
