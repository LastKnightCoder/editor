/**
 * 今日页数据源 v4（今天 / 继续 / 热力图）—— 真实命令接线（并行 + 单项降级）。
 * 回顾段的窗口化统计见 retroQueries.ts（滚到回顾段才拉取）。
 * 分工提醒：专注 = pomodoro 命令（summaryPomodoroToday）；
 *          日程 = calendar 命令（getEventsForDay），两者互不相干。
 */

import { useQuery } from "@tanstack/react-query";
import { listFlashcardDecks } from "@/commands/flashcard";
import { getEventsForDay } from "@/commands/calendar";
import { getCardsByDateRange } from "@/commands/card";
import { getArticlesByDateRange } from "@/commands/article";
import { getAllDiaryEntries } from "@/commands/diary";
import { getAllProjectItems } from "@/commands/project";
import { summaryPomodoroToday } from "@/commands/pomodoro";
import { getCalendarHeatmap, getAllStatistic } from "@/commands/statistic";
import type { ICalendarHeatmapDataItem } from "@/commands/statistic";
import {
  buildSnapshotIndex,
  deltaBetween,
  buildDiaryWordsByDate,
  dateStr,
  type SnapshotIndex,
} from "@/utils/statistic";
import type { ICard, IArticle } from "@/types";
import type { DiaryEntry } from "@/types/diary";
import type { StatisticData } from "@/types/statistic";
import type { CalendarEvent } from "@/types/calendar";
import { ensureTodoSnapshot } from "@/features/todos/queries";
import {
  dateTimeWord,
  isOverdue,
  liveEntries,
  nextOccurrence,
  openRoots,
} from "@/features/todos/model";
import type { HeatmapStats, HomeSnapshot, RecentEdit, TodoTodayItem, TodayEvent } from "./types";

const DAY_MS = 86_400_000;

/* ---------- 工具 ---------- */

function todayStr(): string {
  return dateStr(Date.now());
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function relativeDays(ts: number): string {
  const days = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY_MS);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  return `${Math.floor(days / 30)} 个月前`;
}

export function minutesToHM(min: number): string {
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  return h >= 10 ? `${h}h` : `${h}h ${min % 60}m`;
}

function slateToPlain(nodes: unknown): string {
  if (!Array.isArray(nodes)) return "";
  let out = "";
  const walk = (node: unknown) => {
    if (typeof node === "object" && node !== null) {
      const n = node as { text?: unknown; children?: unknown[] };
      if (typeof n.text === "string") out += n.text;
      if (Array.isArray(n.children)) n.children.forEach(walk);
    }
  };
  nodes.forEach(walk);
  return out.replace(/\s+/g, " ").trim();
}

function shortTitle(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function minutesToClock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/* ---------- 分项拉取 ---------- */

async function fetchReview() {
  const decks = await listFlashcardDecks();
  const due = decks.reduce((sum, deck) => sum + (deck.stats?.dueCount ?? 0), 0);
  const lite = decks
    .map(deck => ({
      id: deck.id,
      name: deck.name,
      dueCount: deck.stats?.dueCount ?? 0,
      learningCount: deck.stats?.learningCount ?? 0,
      newCount: deck.stats?.newCount ?? 0,
      totalCards: deck.stats?.totalCards ?? 0,
    }))
    .sort((a, b) => b.dueCount - a.dueCount)
    .slice(0, 4);
  return { reviewDueCount: due, reviewDecks: lite };
}

async function fetchTodos(): Promise<{ todos: TodoTodayItem[]; remaining: number }> {
  // 与待办页同一份快照（共享缓存）+ 同一套派生：只看进行中项目的顶层任务，排序同议程
  const snapshot = await ensureTodoSnapshot();
  const now = Date.now();
  const open = openRoots(liveEntries(snapshot), now);
  return {
    // 今天三卡高度对齐：待办只取 4 条（汇总数在卡片标题里），避免撑高整行
    todos: open.slice(0, 4).map(t => {
      // 周期任务无 dueAt：显示下一个计划打卡日
      const at =
        t.type === "recurring"
          ? t.recurrence && nextOccurrence(t.recurrence, now)
          : (t.dueAt ?? t.startAt);
      return {
        id: t.id,
        title: shortTitle(t.title || "待办", 32),
        overdue: isOverdue(t, now),
        dueText: at == null ? undefined : dateTimeWord(at, now),
      };
    }),
    remaining: open.length,
  };
}

async function fetchEvents(): Promise<TodayEvent[]> {
  const events = await getEventsForDay(Date.now());
  return events
    .slice()
    .sort((a, b) => Number(a.allDay) - Number(b.allDay) || (a.startTime ?? 0) - (b.startTime ?? 0))
    .slice(0, 5)
    .map((e: CalendarEvent) => ({
      id: e.id,
      title: shortTitle(e.title || "日程", 24),
      timeText: e.allDay
        ? "全天"
        : `${minutesToClock(e.startTime ?? 0)}${e.endTime != null ? `-${minutesToClock(e.endTime)}` : ""}`,
    }));
}

/** 最近编辑：渐进窗口（14→30→90→365 天），凑满目标条数即停——
 *  避免为 12 条展示拉整年数据（卡片/文章查询带全文，窗口越大 IPC 越重）。
 *  放宽窗口时旧窗口会被重复拉取，以 seen 去重。 */
const RECENT_EDIT_WINDOWS = [14, 30, 90, 365];
const RECENT_EDIT_TARGET = 12;

async function fetchRecentEdits(diaries: DiaryEntry[]): Promise<RecentEdit[]> {
  const now = Date.now();
  // 项目文档为全量轻表（无正文），一次拉取后按窗口过滤
  const projectItems = await getAllProjectItems().catch(() => []);

  type Timed = RecentEdit & { updateTs: number };
  const edits: Timed[] = [];
  const seen = new Set<string>();
  const add = (edit: Timed) => {
    if (seen.has(edit.id)) return;
    seen.add(edit.id);
    edits.push(edit);
  };

  // 最新一篇日记（全量 diaries 已在汇总层拉取）；weekly 的 "YYYY-Www" 字符串排在 daily 之前，需过滤
  const latestDiary = diaries.find(d => d.type === "daily");
  if (latestDiary) {
    add({
      id: `diary-${latestDiary.id}`,
      kind: "diary",
      date: latestDiary.date,
      title: `日记 · ${latestDiary.date}`,
      updatedText: relativeDays(latestDiary.updateTime),
      wordsCount: latestDiary.wordCount,
      updateTs: latestDiary.updateTime,
    });
  }

  for (const windowDays of RECENT_EDIT_WINDOWS) {
    const since = now - windowDays * DAY_MS;
    const [cardsByDay, articlesByDay] = await Promise.all([
      getCardsByDateRange(dateStr(since), dateStr(now)),
      getArticlesByDateRange(dateStr(since), dateStr(now)),
    ]);
    for (const list of Object.values(cardsByDay ?? {})) {
      for (const card of list as ICard[]) {
        add({
          id: `card-${card.id}`,
          kind: "card",
          targetId: card.id,
          title: shortTitle(slateToPlain(card.content) || "卡片"),
          updatedText: relativeDays(card.update_time),
          wordsCount: card.count ?? 0,
          updateTs: card.update_time,
        });
      }
    }
    for (const list of Object.values(articlesByDay ?? {})) {
      for (const article of list as IArticle[]) {
        add({
          id: `article-${article.id}`,
          kind: "article",
          targetId: article.id,
          title: shortTitle(article.title || "文章"),
          updatedText: relativeDays(article.update_time),
          wordsCount: article.count ?? 0,
          updateTs: article.update_time,
        });
      }
    }
    for (const item of projectItems as {
      id: number;
      title: string;
      updateTime: number;
      count: number;
      projects: number[];
    }[]) {
      if (item.updateTime < since) continue;
      add({
        id: `project-${item.id}`,
        kind: "project",
        projectId: item.projects[0],
        itemId: item.id,
        title: shortTitle(item.title || "项目文档"),
        updatedText: relativeDays(item.updateTime),
        wordsCount: item.count ?? 0,
        updateTs: item.updateTime,
      });
    }
    if (edits.length >= RECENT_EDIT_TARGET) break;
  }

  return edits
    .sort((a, b) => b.updateTs - a.updateTs)
    .slice(0, RECENT_EDIT_TARGET)
    .map(({ updateTs: _updateTs, ...rest }) => rest as RecentEdit);
}

/** 今日产出 = 今日快照 − 昨日快照（getAllStatistic 已实时补算今天）+ 今日日记字数 */
function fetchTodayStats(index: SnapshotIndex, diaryWords: Map<string, number>) {
  const delta = deltaBetween(index, dateStr(Date.now() - DAY_MS), todayStr());
  return {
    cardsCreated: delta.cards,
    articlesCreated: delta.articles,
    wordsWritten: delta.words + (diaryWords.get(todayStr()) ?? 0),
  };
}

/** 热力图派生：每日操作数 + 连续活跃（今天没活动从昨天起算）+ 活跃天数 */
export function deriveHeatmapStats(items: ICalendarHeatmapDataItem[]): HeatmapStats {
  const days = (items ?? []).map(item => ({
    date: item.time,
    count: item.count ?? 0,
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

async function fetchHeatmap(): Promise<HeatmapStats> {
  return deriveHeatmapStats(await getCalendarHeatmap(new Date().getFullYear()));
}

/* ---------- 汇总 ---------- */

/** 快照查询兜底超时：IPC 挂起（主进程阻塞/响应丢失）时把"永远 loading"变成显式失败并落日志 */
const SNAPSHOT_TIMEOUT_MS = 30_000;

export function withSnapshotTimeout<T>(
  promise: Promise<T>,
  label: string,
  ms = SNAPSHOT_TIMEOUT_MS
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        console.error(`[home] ${label} ${ms}ms 未返回，疑似 IPC 挂起`);
        reject(new Error(`${label} 超时（${ms}ms）`));
      }, ms);
    }),
  ]).finally(() => clearTimeout(timeoutId));
}

export async function fetchHomeSnapshot(): Promise<HomeSnapshot> {
  // statistic 表为每日全量快照，一次拉全量（getAllStatistic 会实时补算今天），todayStats 由快照差分派生；
  // 日记走 diary_entries（word_count 即当天字数），与 diaries 相关的分项共用一次全量拉取
  const [stats, diaries] = await Promise.all([
    getAllStatistic().catch(reason => {
      console.warn("[home] 统计快照拉取失败：", reason);
      return [] as StatisticData[];
    }),
    getAllDiaryEntries().catch(() => [] as DiaryEntry[]),
  ]);
  const index = buildSnapshotIndex(stats);
  const diaryWords = buildDiaryWordsByDate(diaries);

  const [review, todos, events, recentEdits, focus, todayStats, heatmap] = await Promise.allSettled(
    [
      fetchReview(),
      fetchTodos(),
      fetchEvents(),
      fetchRecentEdits(diaries),
      summaryPomodoroToday(),
      fetchTodayStats(index, diaryWords),
      fetchHeatmap(),
    ]
  );

  const value = <T>(r: PromiseSettledResult<T>, fallback: T, label: string): T => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`[home] ${label} 拉取失败：`, r.reason);
    return fallback;
  };

  const focusRaw = value(focus, { count: 0, focusMs: 0 }, "番茄今日汇总");
  const todoRaw = value(todos, { todos: [], remaining: 0 }, "待办");
  const reviewRaw = value(review, { reviewDueCount: 0, reviewDecks: [] }, "闪卡复习");

  return {
    reviewDueCount: reviewRaw.reviewDueCount,
    reviewDecks: reviewRaw.reviewDecks,
    todos: todoRaw.todos,
    todoRemainingCount: todoRaw.remaining,
    events: value(events, [], "今日日程"),
    recentEdits: value(recentEdits, [], "最近编辑"),
    focus: { sessionCount: focusRaw.count, focusMinutes: Math.round(focusRaw.focusMs / 60_000) },
    todayStats: value(
      todayStats,
      { cardsCreated: 0, articlesCreated: 0, wordsWritten: 0 },
      "今日统计"
    ),
    heatmap: value(heatmap, { days: [], streak: 0, activeDays: 0 }, "活动热力图"),
  };
}

/** 今日页数据入口：react-query 承载（缓存/窗口聚焦刷新/手动刷新）。
 *  「今日」数据时效要求高，覆盖全局默认开启窗口聚焦刷新。 */
export function useHomeSnapshot(): {
  data: HomeSnapshot | null;
  loading: boolean;
  refresh(): void;
} {
  const query = useQuery({
    queryKey: ["home", "snapshot"],
    queryFn: () => withSnapshotTimeout(fetchHomeSnapshot(), "今日页快照"),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return {
    data: query.data ?? null,
    loading: query.isPending,
    refresh: () => void query.refetch(),
  };
}
