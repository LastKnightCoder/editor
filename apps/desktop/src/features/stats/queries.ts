/**
 * 统计页数据源（Bento 面板）—— 真实命令接线（并行 + 单项降级）：
 *  totals    快照存量（卡片/文章/日记三分量字数）+ 待办 + summaryPomodoroTotal
 *  trend     getAllStatistic 快照差分（utils/statistic.diffSeries，窗口随 range 参数化）
 *  previous  等长前置窗口同法聚合（环比）；all 无上一窗口为 null
 *  heatmap   getCalendarHeatmap(今年)，streak/活跃天数前端派生
 *  decks     listFlashcardDecks（due/learning/new/total）
 *  review    flashcard:review-stats（主进程聚合：评分四档 + 7 天到期分桶）
 *  rhythm    listPomodoroSessions 按启动时刻 24h 分桶（渲染端聚合）
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getAllStatistic, getCalendarHeatmap } from "@/commands/statistic";
import type { ICalendarHeatmapDataItem } from "@/commands/statistic";
import { getAllDiaryEntries } from "@/commands/diary";
import {
  buildSnapshotIndex,
  snapshotAt,
  buildDiaryWordsByDate,
  dateStr,
  diffSeries,
  type DailyDelta,
} from "@/utils/statistic";
import type { DiaryEntry } from "@/types/diary";
import type { StatisticData } from "@/types/statistic";
import type { PomodoroSession } from "@/types";
import { getSystemGroupStats } from "@/commands/todo";
import { summaryPomodoroTotal, listPomodoroSessions } from "@/commands/pomodoro";
import { getAllDocumentItems } from "@/commands/document";
import { getAllProjectItems } from "@/commands/project";
import { listFlashcardDecks, getFlashcardReviewStats } from "@/commands/flashcard";
import type { StatsRange, StatsSnapshot, RangeSummary, FocusRhythm, HeatmapStats } from "./types";

const DAY_MS = 86_400_000;

/** 库存总量 = 当日（实时）快照的存量 + 日记全量字数 + 知识库/项目轻表字数；把每天快照加总会得到天文数字 */
async function fetchTotals() {
  const [stats, diaries, todoStats, focus, documentItems, projectItems] = await Promise.all([
    getAllStatistic(),
    getAllDiaryEntries().catch(() => []),
    getSystemGroupStats().catch(() => []),
    summaryPomodoroTotal().catch(() => ({ count: 0, focusMs: 0 })),
    getAllDocumentItems().catch(() => []),
    getAllProjectItems().catch(() => []),
  ]);
  const index = buildSnapshotIndex((stats ?? []) as StatisticData[]);
  const entries = (diaries ?? []) as DiaryEntry[];
  const today = dateStr(Date.now());
  const card = snapshotAt(index, "card", today);
  const article = snapshotAt(index, "article", today);
  let diaryTotal = 0;
  for (const entry of entries) diaryTotal += entry.wordCount;
  // 知识库/项目为全量轻表（无正文，count 即字数）
  const documentWords = (documentItems as { count?: number }[]).reduce(
    (sum, item) => sum + (item.count ?? 0),
    0
  );
  const projectWords = (projectItems as { count?: number }[]).reduce(
    (sum, item) => sum + (item.count ?? 0),
    0
  );
  return {
    cards: card.count,
    articles: article.count,
    diaries: entries.filter(d => d.type === "daily").length,
    documents: (documentItems as unknown[]).length,
    projects: (projectItems as unknown[]).length,
    todoPending: (todoStats ?? []).reduce((sum, g) => sum + g.uncompleted, 0),
    focusMinutesTotal: Math.round(focus.focusMs / 60_000),
    focusSessions: focus.count,
    wordsTotal: card.wordsCount + article.wordsCount + projectWords + documentWords + diaryTotal,
    cardWords: card.wordsCount,
    articleWords: article.wordsCount,
    projectWords,
    documentWords,
    diaryWords: diaryTotal,
  };
}

function summarize(series: DailyDelta[]): RangeSummary {
  let words = 0,
    cardsCreated = 0,
    articlesCreated = 0,
    activeDays = 0;
  for (const d of series) {
    words += d.words;
    cardsCreated += d.cardsCreated;
    articlesCreated += d.articlesCreated;
    if (d.words > 0 || d.cardsCreated > 0 || d.articlesCreated > 0) activeDays += 1;
  }
  return {
    words,
    created: cardsCreated + articlesCreated,
    cardsCreated,
    articlesCreated,
    activeDays,
  };
}

/** 热力图派生：每日操作数 + 连续活跃（今天没活动从昨天起算）+ 活跃天数 */
function deriveHeatmapStats(items: ICalendarHeatmapDataItem[]): HeatmapStats {
  const days = (items ?? []).map(item => ({
    date: item.time,
    count: Array.isArray(item.operation_list) ? item.operation_list.length : 0,
  }));
  const countByDate = new Map(days.map(d => [d.date, d.count]));
  const prev = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  let cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  if ((countByDate.get(dateStr(cursor.getTime())) ?? 0) === 0) cursor = prev(cursor);
  let streak = 0;
  while ((countByDate.get(dateStr(cursor.getTime())) ?? 0) > 0) {
    streak += 1;
    cursor = prev(cursor);
  }
  return { days, streak, activeDays: days.filter(d => d.count > 0).length };
}

/** 专注节律：会话按启动时刻分 24 桶 + 时长/中断聚合（渲染端） */
function aggregateRhythm(sessions: PomodoroSession[]): FocusRhythm {
  const hourBuckets = new Array<number>(24).fill(0);
  let focusMs = 0;
  let paused = 0;
  let peakHour: number | null = null;
  let peakN = 0;
  for (const s of sessions) {
    const h = new Date(s.startTime).getHours();
    hourBuckets[h] += 1;
    if (hourBuckets[h] > peakN) {
      peakN = hourBuckets[h];
      peakHour = h;
    }
    focusMs += s.focusMs ?? 0;
    if ((s.pauseCount ?? 0) > 0) paused += 1;
  }
  const n = sessions.length;
  return {
    hourBuckets,
    sessionCount: n,
    focusMinutes: Math.round(focusMs / 60_000),
    avgSessionMinutes: n > 0 ? Math.round(focusMs / n / 60_000) : 0,
    interruptRate: n > 0 ? paused / n : null,
    peakHour: n > 0 ? peakHour : null,
  };
}

export async function fetchStatsSnapshot(range: StatsRange): Promise<StatsSnapshot> {
  const year = new Date().getFullYear();
  const now = Date.now();

  // statistic/diary 是趋势与总量的共同底座，先并行拉齐
  const [statsRes, diariesRes] = await Promise.allSettled([
    getAllStatistic(),
    getAllDiaryEntries(),
  ]);
  const stats = (statsRes.status === "fulfilled" ? statsRes.value : []) as StatisticData[];
  const diaries = (diariesRes.status === "fulfilled" ? diariesRes.value : []) as DiaryEntry[];
  const index = buildSnapshotIndex(stats);
  const diaryWords = buildDiaryWordsByDate(diaries);

  // range → 窗口
  let sinceTs: number;
  if (range === "d30") sinceTs = now - 29 * DAY_MS;
  else if (range === "d90") sinceTs = now - 89 * DAY_MS;
  else if (range === "year") sinceTs = new Date(year, 0, 1).getTime();
  else {
    const earliest = stats.reduce((min, s) => (s.date < min ? s.date : min), "9999-12-31");
    sinceTs = earliest === "9999-12-31" ? now : new Date(`${earliest}T00:00:00`).getTime() - DAY_MS;
  }

  const trend = diffSeries(index, diaryWords, sinceTs, now);
  // 环比：等长前置窗口（all 无上一窗口）
  let previous: RangeSummary | null = null;
  if (range !== "all" && sinceTs > 0) {
    const length = now - sinceTs;
    previous = summarize(diffSeries(index, diaryWords, sinceTs - length, sinceTs - 1));
  }

  const [totals, heat, decks, review, sessions] = await Promise.allSettled([
    fetchTotals(),
    getCalendarHeatmap(year),
    listFlashcardDecks(),
    getFlashcardReviewStats({ since: sinceTs }),
    listPomodoroSessions({ start: sinceTs, limit: 10_000 }),
  ]);
  const value = <T>(r: PromiseSettledResult<T>, fallback: T, label: string): T => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`[stats] ${label} 拉取失败：`, r.reason);
    return fallback;
  };

  return {
    totals: value(
      totals,
      {
        cards: 0,
        articles: 0,
        diaries: 0,
        documents: 0,
        projects: 0,
        todoPending: 0,
        focusMinutesTotal: 0,
        focusSessions: 0,
        wordsTotal: 0,
        cardWords: 0,
        articleWords: 0,
        projectWords: 0,
        documentWords: 0,
        diaryWords: 0,
      },
      "总量"
    ),
    heatmap: deriveHeatmapStats(value(heat, [] as ICalendarHeatmapDataItem[], "活动热力图")),
    decks: value(decks, [], "闪卡牌组").map(deck => ({
      id: deck.id,
      name: deck.name,
      dueCount: deck.stats?.dueCount ?? 0,
      learningCount: deck.stats?.learningCount ?? 0,
      newCount: deck.stats?.newCount ?? 0,
      totalCards: deck.stats?.totalCards ?? 0,
    })),
    trend,
    previous,
    review:
      review.status === "fulfilled"
        ? {
            ratings: review.value.ratings,
            total: review.value.total,
            dueBuckets: review.value.dueBuckets,
          }
        : null,
    rhythm: sessions.status === "fulfilled" ? aggregateRhythm(sessions.value ?? []) : null,
  };
}

export function useStatsSnapshot(range: StatsRange): {
  data: StatsSnapshot | null;
  loading: boolean;
} {
  const query = useQuery({
    queryKey: ["stats", "snapshot", range],
    queryFn: () => fetchStatsSnapshot(range),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    // 切换窗口时保留上一份数据渲染（不闪整页 Loading），新窗口数据到达后原位更新
    placeholderData: keepPreviousData,
  });
  return { data: query.data ?? null, loading: query.isPending };
}
