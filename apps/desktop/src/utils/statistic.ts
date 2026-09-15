/**
 * statistic 表口径工具：表里存的是每日全量快照（累计到当天的存量），
 * "当日产出"必须用相邻两天的快照差分得到。getAllStatistic 会实时补算今天，
 * 而 getStatisticByDateRange 只能查到昨天，涉及今天的数据应走 getAllStatistic。
 */

import dayjs from "dayjs";
import type { StatisticData } from "@/types/statistic";

/** 统计覆盖的内容类型中，产出趋势关心的两类（与旧版首页 TREND_TYPES 的口径对齐） */
export const TREND_CONTENT_TYPES = ["card", "article"] as const;

/** 本地时区 YYYY-MM-DD（热力图/差分/日记共用的日期键格式） */
export function dateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface Snapshot {
  count: number;
  wordsCount: number;
}

export type SnapshotIndex = Map<string, Map<string, Snapshot>>;

/** (类型, 日期) -> 累计快照 */
export function buildSnapshotIndex(stats: StatisticData[]): SnapshotIndex {
  const index = new Map<string, Map<string, Snapshot>>();
  for (const item of stats) {
    const byDate = index.get(item.statisticType) ?? new Map<string, Snapshot>();
    byDate.set(item.date, { count: item.content.count, wordsCount: item.content.wordsCount });
    index.set(item.statisticType, byDate);
  }
  return index;
}

/** 某类型在某日期的累计快照；当天无记录时向前回溯最近一天（App 未启动的日期不会落快照） */
export function snapshotAt(index: SnapshotIndex, type: string, date: string): Snapshot {
  const byDate = index.get(type);
  if (!byDate) return { count: 0, wordsCount: 0 };
  let cur = dayjs(date);
  for (let i = 0; i < 400; i++) {
    const snap = byDate.get(cur.format("YYYY-MM-DD"));
    if (snap) return snap;
    cur = cur.subtract(1, "day");
  }
  return { count: 0, wordsCount: 0 };
}

export interface SnapshotDelta {
  cards: number;
  articles: number;
  words: number;
}

/** (exclusiveStart, inclusiveEnd] 期间的产出 = 两端快照差；删除内容导致的回落截为 0 */
export function deltaBetween(
  index: SnapshotIndex,
  exclusiveStart: string,
  inclusiveEnd: string
): SnapshotDelta {
  const pick = (type: string) => {
    const end = snapshotAt(index, type, inclusiveEnd);
    const start = snapshotAt(index, type, exclusiveStart);
    return {
      count: Math.max(0, end.count - start.count),
      words: Math.max(0, end.wordsCount - start.wordsCount),
    };
  };
  const card = pick("card");
  const article = pick("article");
  return { cards: card.count, articles: article.count, words: card.words + article.words };
}

/* ---------- 日记：不走 statistic 快照，diary_entries.word_count 即当天各条之和 ---------- */

/** 每日日记字数：仅 daily 类型参与（weekly/monthly 的 date 不是 YYYY-MM-DD，不进每日序列） */
export function buildDiaryWordsByDate(
  diaries: { type: string; date: string; wordCount: number }[]
): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const diary of diaries) {
    if (diary.type !== "daily") continue;
    byDate.set(diary.date, (byDate.get(diary.date) ?? 0) + diary.wordCount);
  }
  return byDate;
}

export interface DailyDelta {
  /** YYYY-MM-DD */
  date: string;
  /** 卡片/文章快照字数差 + 当天日记字数 */
  words: number;
  cardsCreated: number;
  articlesCreated: number;
}

/**
 * 近 N 天逐日产出序列（首页趋势与统计页共用口径）：
 * 快照差分 + 日记按日归属；差分为负（删除导致回落）截为 0。
 * 从窗口前一日开始遍历为首日提供基准；snapshotAt 自带回溯，
 * 缺快照的日期沿用最近值（增量为 0）。dayjs 按日步进，DST 切日不出错。
 */
export function diffSeries(
  index: SnapshotIndex,
  diaryWords: Map<string, number>,
  sinceTs: number,
  nowTs: number
): DailyDelta[] {
  const out: DailyDelta[] = [];
  const prev = new Map<string, Snapshot>();
  for (
    let cur = dayjs(sinceTs).subtract(1, "day");
    cur.valueOf() <= nowTs;
    cur = cur.add(1, "day")
  ) {
    const key = cur.format("YYYY-MM-DD");
    let words = 0;
    let cardsCreated = 0;
    let articlesCreated = 0;
    for (const type of TREND_CONTENT_TYPES) {
      const snap = snapshotAt(index, type, key);
      const before = prev.get(type) ?? snap;
      words += Math.max(0, snap.wordsCount - before.wordsCount);
      if (type === "card") cardsCreated = Math.max(0, snap.count - before.count);
      else articlesCreated = Math.max(0, snap.count - before.count);
      prev.set(type, snap);
    }
    if (cur.valueOf() < sinceTs) continue;
    out.push({
      date: key,
      words: words + (diaryWords.get(key) ?? 0),
      cardsCreated,
      articlesCreated,
    });
  }
  return out;
}
