/**
 * 统计页数据源 —— 真实命令接线（并行 + 单项降级）：
 *  totals    当日实时快照（累计卡片/文章/字数）+ getAllDiaryEntries + getSystemGroupStats + summaryPomodoroTotal
 *  heatmap   getCalendarHeatmap(今年) 全年
 *  trend     getAllStatistic(近 30 天) 快照差分为每日产出（日记按 date 归属）
 *  decks     listFlashcardDecks（due/learning/new/total）
 */

import { useQuery } from "@tanstack/react-query";
import { getAllStatistic, getCalendarHeatmap } from "@/commands/statistic";
import { getAllDiaryEntries } from "@/commands/diary";
import {
  buildSnapshotIndex,
  snapshotAt,
  buildDiaryWordsByDate,
  dateStr,
  diffSeries,
} from "@/utils/statistic";
import type { DiaryEntry } from "@/types/diary";
import { getSystemGroupStats } from "@/commands/todo";
import { summaryPomodoroTotal } from "@/commands/pomodoro";
import { listFlashcardDecks } from "@/commands/flashcard";
import type { StatisticData } from "@/types/statistic";
import type { StatsSnapshot, TrendDay } from "./types";

const DAY_MS = 86_400_000;

/** 库存总量 = 当日（实时）快照的存量 + 全部日记字数；把每天快照加总会得到天文数字 */
async function fetchTotals() {
  const [stats, diaries, todoStats, focus] = await Promise.all([
    getAllStatistic(),
    getAllDiaryEntries().catch(() => []),
    getSystemGroupStats().catch(() => []),
    summaryPomodoroTotal().catch(() => ({ count: 0, focusMs: 0 })),
  ]);
  const index = buildSnapshotIndex((stats ?? []) as StatisticData[]);
  const entries = (diaries ?? []) as DiaryEntry[];
  const today = dateStr(Date.now());
  const card = snapshotAt(index, "card", today);
  const article = snapshotAt(index, "article", today);
  let diaryTotal = 0;
  for (const entry of entries) diaryTotal += entry.wordCount;
  return {
    cards: card.count,
    articles: article.count,
    diaries: entries.filter(d => d.type === "daily").length,
    todoPending: (todoStats ?? []).reduce((sum, g) => sum + g.uncompleted, 0),
    focusMinutesTotal: Math.round(focus.focusMs / 60_000),
    wordsTotal: card.wordsCount + article.wordsCount + diaryTotal,
  };
}

/** 近 30 天产出趋势：diffSeries 快照差分 + 日记按日归属（与首页同口径）；
 *  用 getAllStatistic 而非 getStatisticByDateRange，因为前者会实时补算今天。 */
async function fetchTrend(): Promise<TrendDay[]> {
  const now = Date.now();
  const since = now - 29 * DAY_MS;
  const [stats, diaries] = await Promise.all([
    getAllStatistic().catch(() => []),
    getAllDiaryEntries().catch(() => []),
  ]);
  return diffSeries(
    buildSnapshotIndex(stats as StatisticData[]),
    buildDiaryWordsByDate(diaries as DiaryEntry[]),
    since,
    now
  );
}

export async function fetchStatsSnapshot(): Promise<StatsSnapshot> {
  const year = new Date().getFullYear();
  const [totals, heat, trend, decks] = await Promise.allSettled([
    fetchTotals(),
    getCalendarHeatmap(year),
    fetchTrend(),
    listFlashcardDecks(),
  ]);
  const value = <T>(r: PromiseSettledResult<T>, fallback: T, label: string): T => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`[stats] ${label} 拉取失败：`, r.reason);
    return fallback;
  };

  return {
    totals: value(
      totals,
      { cards: 0, articles: 0, diaries: 0, todoPending: 0, focusMinutesTotal: 0, wordsTotal: 0 },
      "总量"
    ),
    heatmap: value(heat, [], "活动热力图").map(item => ({
      date: item.time,
      count: Array.isArray(item.operation_list) ? item.operation_list.length : 0,
    })),
    trend: value(trend, [], "产出趋势"),
    decks: value(decks, [], "闪卡牌组").map(deck => ({
      id: deck.id,
      name: deck.name,
      dueCount: deck.stats?.dueCount ?? 0,
      learningCount: deck.stats?.learningCount ?? 0,
      newCount: deck.stats?.newCount ?? 0,
      totalCards: deck.stats?.totalCards ?? 0,
    })),
  };
}

export function useStatsSnapshot(): { data: StatsSnapshot | null; loading: boolean } {
  const query = useQuery({
    queryKey: ["stats", "snapshot"],
    queryFn: fetchStatsSnapshot,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
  return { data: query.data ?? null, loading: query.isPending };
}
