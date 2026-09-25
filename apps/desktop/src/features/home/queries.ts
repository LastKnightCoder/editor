/**
 * 今日页数据源 v3 —— 真实命令接线（并行 + 单项降级）。
 * 分工提醒：专注 = pomodoro 命令（summaryPomodoroToday/listPomodoroSessions）；
 *          日程 = calendar 命令（getEventsForDay），两者互不相干。
 */

import { useQuery } from "@tanstack/react-query";
import { listFlashcardDecks } from "@/commands/flashcard";
import { listActiveQuestions } from "@/commands/question";
import { getEventsForDay } from "@/commands/calendar";
import { getCardsByDateRange } from "@/commands/card";
import { getArticlesByDateRange } from "@/commands/article";
import { getAllDiaryEntries } from "@/commands/diary";
import { getAllProjectItems } from "@/commands/project";
import { summaryPomodoroToday, listPomodoroSessions } from "@/commands/pomodoro";
import { getCalendarHeatmap, getAllStatistic } from "@/commands/statistic";
import {
  buildSnapshotIndex,
  snapshotAt,
  deltaBetween,
  buildDiaryWordsByDate,
  dateStr,
  diffSeries,
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
import type { HomeSnapshot, RecentEdit, TodoTodayItem, TodayEvent } from "./types";

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
      totalCards: deck.stats?.totalCards ?? 0,
    }))
    .sort((a, b) => b.dueCount - a.dueCount)
    .slice(0, 3);
  return { reviewDueCount: due, reviewDecks: lite };
}

async function fetchTodos(): Promise<{ todos: TodoTodayItem[]; remaining: number }> {
  // 与待办页同一份快照（共享缓存）+ 同一套派生：只看进行中项目的顶层任务，排序同议程
  const snapshot = await ensureTodoSnapshot();
  const now = Date.now();
  const open = openRoots(liveEntries(snapshot), now);
  return {
    // 首页三卡高度对齐：待办只取 3 条（汇总数在卡片标题里），避免撑高整行
    todos: open.slice(0, 3).map(t => {
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
      id: String(e.id),
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

  const edits: (RecentEdit & { updateTs: number })[] = [];
  const seen = new Set<string>();
  const add = (edit: RecentEdit & { updateTs: number }) => {
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
    .map(({ updateTs: _updateTs, ...rest }) => rest);
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

/** 本周产出 = 今日快照 − 上周日快照 + 本周各天日记字数之和；专注分钟走 pomodoro 今日汇总 */
async function fetchWeekly(index: SnapshotIndex, diaryWords: Map<string, number>) {
  const now = new Date();
  const monday = startOfDay(now.getTime() - ((now.getDay() + 6) % 7) * DAY_MS);
  const mondayStr = dateStr(monday);
  const today = todayStr();
  const delta = deltaBetween(index, dateStr(monday - DAY_MS), today);
  let diarySum = 0;
  for (const [day, words] of diaryWords) {
    if (day >= mondayStr && day <= today) diarySum += words;
  }
  const focus = await summaryPomodoroToday().catch(() => ({ count: 0, focusMs: 0 }));
  return {
    cardsCreated: delta.cards,
    articlesCreated: delta.articles,
    wordsWritten: delta.words + diarySum,
    focusMinutes: Math.round(focus.focusMs / 60_000),
  };
}

/** 库存总量 = 当日（实时）快照的存量；把每天快照加总会得到天文数字 */
function fetchTotals(index: SnapshotIndex, diaries: DiaryEntry[]) {
  const today = todayStr();
  return {
    cards: snapshotAt(index, "card", today).count,
    articles: snapshotAt(index, "article", today).count,
    diaries: diaries.filter(d => d.type === "daily").length,
  };
}

/** 近 30 天走势：字数 / 新建数量走快照差分（diffSeries，与统计页同口径）；
 *  专注分钟由 pomodoro 会话按日聚合后叠加。 */
async function fetchTrend(index: SnapshotIndex, diaryWords: Map<string, number>) {
  const now = Date.now();
  const since = now - 29 * DAY_MS;
  const sessions = await listPomodoroSessions({
    start: since,
    end: now,
    status: "completed",
  }).catch(() => []);

  const focusByDate = new Map<string, number>();
  for (const session of sessions as { startTime: number; focusMs: number }[]) {
    const key = dateStr(session.startTime);
    focusByDate.set(key, (focusByDate.get(key) ?? 0) + Math.round(session.focusMs / 60_000));
  }

  const days = diffSeries(index, diaryWords, since, now);
  return {
    dates: days.map(d => d.date.slice(5)),
    words: days.map(d => d.words),
    created: days.map(d => d.cardsCreated + d.articlesCreated),
    focusMinutes: days.map(d => focusByDate.get(d.date) ?? 0),
  };
}

async function fetchHeatmapItems() {
  const items = await getCalendarHeatmap(new Date().getFullYear());
  return (items ?? []).map(item => ({
    date: item.time,
    count: Array.isArray(item.operation_list) ? item.operation_list.length : 0,
    operationList: item.operation_list ?? [],
  }));
}

/* ---------- 汇总 ---------- */

export async function fetchHomeSnapshot(): Promise<HomeSnapshot> {
  // statistic 表为每日全量快照，一次拉全量（getAllStatistic 会实时补算今天），
  // todayStats / weekly / totals / trend 均由同一份快照差分派生；
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

  const [
    review,
    todos,
    events,
    questions,
    recentEdits,
    focus,
    todayStats,
    weekly,
    totals,
    trend,
    heatmap,
  ] = await Promise.allSettled([
    fetchReview(),
    fetchTodos(),
    fetchEvents(),
    listActiveQuestions(5),
    fetchRecentEdits(diaries),
    summaryPomodoroToday(),
    fetchTodayStats(index, diaryWords),
    fetchWeekly(index, diaryWords),
    fetchTotals(index, diaries),
    fetchTrend(index, diaryWords),
    fetchHeatmapItems(),
  ]);

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
    activeQuestions: value(questions, [], "探究中的问题"),
    recentEdits: value(recentEdits, [], "最近编辑"),
    focus: { sessionCount: focusRaw.count, focusMinutes: Math.round(focusRaw.focusMs / 60_000) },
    todayStats: value(
      todayStats,
      { cardsCreated: 0, articlesCreated: 0, wordsWritten: 0 },
      "今日统计"
    ),
    weekly: value(
      weekly,
      { cardsCreated: 0, articlesCreated: 0, wordsWritten: 0, focusMinutes: 0 },
      "本周统计"
    ),
    totals: value(totals, { cards: 0, articles: 0, diaries: 0 }, "库存总量"),
    trend: value(trend, { dates: [], words: [], created: [], focusMinutes: [] }, "30 天走势"),
    heatmapItems: value(heatmap, [], "活动热力图"),
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
    queryFn: fetchHomeSnapshot,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return {
    data: query.data ?? null,
    loading: query.isPending,
    refresh: () => void query.refetch(),
  };
}
