import { describe, expect, it } from "vitest";
import { buildSnapshotIndex, snapshotAt, deltaBetween, buildDiaryWordsByDate } from "../statistic";
import type { StatisticData } from "@/types/statistic";

function rows(...items: [string, string, number, number][]): StatisticData[] {
  return items.map(([date, type, count, wordsCount], i) => ({
    id: i + 1,
    date,
    statisticType: type,
    content: { count, wordsCount },
  }));
}

describe("statistic 快照差分口径", () => {
  it("区间产出 = 两端快照差，按 card/article 汇总", () => {
    const index = buildSnapshotIndex(
      rows(
        ["2026-09-11", "card", 10, 1000],
        ["2026-09-12", "card", 12, 1300],
        ["2026-09-13", "card", 12, 1500],
        ["2026-09-11", "article", 2, 500],
        ["2026-09-13", "article", 3, 900]
      )
    );
    // (2026-09-11, 2026-09-13]：card +2 条 +500 字，article +1 条 +400 字
    expect(deltaBetween(index, "2026-09-11", "2026-09-13")).toEqual({
      cards: 2,
      articles: 1,
      words: 900,
    });
  });

  it("当天无快照时回溯最近一天（App 未启动的日期不落快照）", () => {
    const index = buildSnapshotIndex(
      rows(["2026-09-10", "card", 8, 800], ["2026-09-13", "card", 9, 900])
    );
    expect(snapshotAt(index, "card", "2026-09-12")).toEqual({ count: 8, wordsCount: 800 });
    // 缺失期间的变化归入重新有快照的那天
    expect(deltaBetween(index, "2026-09-11", "2026-09-13")).toEqual({
      cards: 1,
      articles: 0,
      words: 100,
    });
  });

  it("删除内容导致快照回落时截为 0", () => {
    const index = buildSnapshotIndex(
      rows(["2026-09-12", "card", 10, 1000], ["2026-09-13", "card", 9, 900])
    );
    expect(deltaBetween(index, "2026-09-12", "2026-09-13")).toEqual({
      cards: 0,
      articles: 0,
      words: 0,
    });
  });

  it("类型无记录或索引为空时返回 0", () => {
    const index = buildSnapshotIndex(rows(["2026-09-13", "card", 5, 500]));
    expect(snapshotAt(index, "article", "2026-09-13")).toEqual({ count: 0, wordsCount: 0 });
    expect(snapshotAt(buildSnapshotIndex([]), "card", "2026-09-13")).toEqual({
      count: 0,
      wordsCount: 0,
    });
  });
});

describe("日记字数按日归属", () => {
  it("每天的日记字数 = 当天各条 wordCount 之和", () => {
    const diaries = [
      { type: "daily", date: "2026-09-13", wordCount: 552 },
      { type: "daily", date: "2026-09-13", wordCount: 106 },
      { type: "daily", date: "2026-09-14", wordCount: 80 },
    ];
    expect(buildDiaryWordsByDate(diaries)).toEqual(
      new Map([
        ["2026-09-13", 658],
        ["2026-09-14", 80],
      ])
    );
  });

  it("weekly/monthly 的 date 不是 YYYY-MM-DD，不进每日序列", () => {
    const diaries = [
      { type: "weekly", date: "2026-W37", wordCount: 1000 },
      { type: "monthly", date: "2026-09", wordCount: 2000 },
      { type: "daily", date: "2026-09-14", wordCount: 80 },
    ];
    expect(buildDiaryWordsByDate(diaries)).toEqual(new Map([["2026-09-14", 80]]));
  });
});
