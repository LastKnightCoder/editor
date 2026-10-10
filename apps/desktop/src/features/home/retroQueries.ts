/**
 * 今日页 · 回顾段数据源（原统计页并入）—— 真实命令接线（并行 + 单项降级）：
 *  totals    快照存量（卡片/文章/项目/日记四分量字数）
 *  trend     getAllStatistic 快照差分（utils/statistic.diffSeries，窗口随 range 参数化）
 *  previous  等长前置窗口同法聚合（环比）；all 无上一窗口为 null
 *  review    flashcard:review-stats（主进程聚合：评分四档 + 7 天到期分桶）
 *  rhythm    listPomodoroSessions 按启动时刻 24h 分桶（渲染端聚合）
 * 全年热力图与卡组不在此处：前者与时间窗无关、后者属「今天 · 复习」，均走 HomeSnapshot。
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getAllStatistic } from "@/commands/statistic";
import { getAllDiaryEntries } from "@/commands/diary";
import {
  buildSnapshotIndex,
  snapshotAt,
  buildDiaryWordsByDate,
  dateStr,
  diffSeries,
  type DailyDelta,
  type SnapshotIndex,
} from "@/utils/statistic";
import type { DiaryEntry } from "@/types/diary";
import type { StatisticData } from "@/types/statistic";
import type { PomodoroSession } from "@/types";
import { listPomodoroSessions } from "@/commands/pomodoro";
import { getAllProjectItems } from "@/commands/project";
import { getFlashcardReviewStats } from "@/commands/flashcard";
import { withSnapshotTimeout } from "./queries";
import type { RetroRange, RetroSnapshot, RetroTotals, RangeSummary, FocusRhythm } from "./types";

const DAY_MS = 86_400_000;

/** 库存总量 = 当日（实时）快照的存量 + 日记全量字数 + 项目轻表字数；把每天快照加总会得到天文数字 */
async function fetchTotals(index: SnapshotIndex, entries: DiaryEntry[]): Promise<RetroTotals> {
  const projectItems = await getAllProjectItems().catch(() => []);
  const today = dateStr(Date.now());
  const card = snapshotAt(index, "card", today);
  const article = snapshotAt(index, "article", today);
  let diaryTotal = 0;
  for (const entry of entries) diaryTotal += entry.wordCount;
  // 项目为全量轻表（无正文，count 即字数）
  const projectWords = (projectItems as { count?: number }[]).reduce(
    (sum, item) => sum + (item.count ?? 0),
    0
  );
  return {
    cards: card.count,
    articles: article.count,
    diaries: entries.filter(d => d.type === "daily").length,
    projects: (projectItems as unknown[]).length,
    wordsTotal: card.wordsCount + article.wordsCount + projectWords + diaryTotal,
    cardWords: card.wordsCount,
    articleWords: article.wordsCount,
    projectWords,
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

export async function fetchRetroSnapshot(range: RetroRange): Promise<RetroSnapshot> {
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

  const [totals, review, sessions] = await Promise.allSettled([
    fetchTotals(index, diaries),
    getFlashcardReviewStats({ since: sinceTs }),
    listPomodoroSessions({ start: sinceTs, limit: 10_000 }),
  ]);
  const value = <T>(r: PromiseSettledResult<T>, fallback: T, label: string): T => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`[home:retro] ${label} 拉取失败：`, r.reason);
    return fallback;
  };

  return {
    totals: value(
      totals,
      {
        cards: 0,
        articles: 0,
        diaries: 0,
        projects: 0,
        wordsTotal: 0,
        cardWords: 0,
        articleWords: 0,
        projectWords: 0,
        diaryWords: 0,
      },
      "总量"
    ),
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

/** 回顾段数据入口：enabled = 回顾段已进入视口（首屏不为它买单）；
 *  key 挂在 ["home"] 下，各域写入后失效 ["home"] 即一并刷新。 */
export function useRetroSnapshot(
  range: RetroRange,
  enabled: boolean
): {
  data: RetroSnapshot | null;
  loading: boolean;
} {
  const query = useQuery({
    queryKey: ["home", "retro", range],
    queryFn: () => withSnapshotTimeout(fetchRetroSnapshot(range), "今日页回顾段"),
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    // 切换窗口时保留上一份数据渲染（不闪整页 Loading），新窗口数据到达后原位更新
    placeholderData: keepPreviousData,
  });
  return { data: query.data ?? null, loading: query.isPending };
}
