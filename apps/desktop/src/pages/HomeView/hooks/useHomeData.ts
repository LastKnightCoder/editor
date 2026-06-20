import { useState, useEffect, useCallback } from "react";
import dayjs from "dayjs";
import type { TodoItem } from "@/types/todo";
import type { IQuestion } from "@/types/question";
import type {
  Flashcard,
  FlashcardDeck,
  PomodoroPreset,
  PomodoroSession,
} from "@/types";
import type {
  WorkbenchTodoPreviewResponse,
  WorkbenchQuestionPreviewResponse,
  WorkbenchQuestionGroupStat,
  WorkbenchTodoGroupStat,
} from "@/types/components-workbench";
import { getLatestOperations } from "@/commands/operation";
import {
  listTodoPreview,
  listQuestionPreview,
} from "@/commands/components-workbench";
import {
  getFlashcardReviewQueue,
  listFlashcardDecks,
} from "@/commands/flashcard";
import {
  summaryPomodoroToday,
  getActivePomodoroSession,
  listPomodoroPresets,
} from "@/commands/pomodoro";
import { countUnreadRssEntries } from "@/commands/rss";
import { getCalendarHeatmap, getAllStatistic } from "@/commands/statistic";
import {
  createDiaryEntry,
  getDiaryEntriesByDateRange,
  updateDiaryEntry,
} from "@/commands/diary";
import { createEmptyDiaryContent } from "@/pages/DiaryView/constants/content";
import type { ICard, IArticle, IDocumentItem, ProjectItem } from "@/types";
import type { DiaryEntry } from "@/types/diary";
import type { IItem } from "@/components/CalendarHeatmap";

// 首页时间轴展示的日记篇数上限与拉取窗口天数
const DIARY_TIMELINE_LIMIT = 3;
const DIARY_FETCH_WINDOW_DAYS = 365;
// 仅展示日常日记，周记/月记属于总结性质，不纳入朋友圈式动态
const DIARY_TIMELINE_TYPE = "daily" as const;

export type HomeTrendType =
  | "card"
  | "article"
  | "project-item"
  | "document-item";

export interface HomeTrendPoint {
  date: string;
  type: HomeTrendType;
  count: number;
  wordsCount: number;
}

export interface HomeData {
  // 今日概要
  summary: {
    pendingTodos: number;
    overdueTodos: number;
    flashcardsDue: number;
    rssUnread: number;
    pomodoroToday: { count: number; focusMs: number };
  };
  // 详情列表
  todoItems: TodoItem[];
  todoGroups: WorkbenchTodoGroupStat[];
  flashcardItems: Flashcard[];
  flashcardDecks: FlashcardDeck[];
  questionItems: IQuestion[];
  questionGroups: WorkbenchQuestionGroupStat[];
  // 番茄钟
  activeSession: PomodoroSession | null;
  pomodoroPresets: PomodoroPreset[];
  // 最近动态
  recentActivity: {
    cards: ICard[];
    articles: IArticle[];
    projectItems: ProjectItem[];
    documentItems: IDocumentItem[];
  };
  activityHeatmap: IItem[];
  // 最近创作趋势
  contentTrend: HomeTrendPoint[];
  // 最近若干篇日记（朋友圈式时间轴展示）
  recentDiaries: DiaryEntry[];
  // 今天是否已有日记（决定是否显示"添加今日日记"入口）
  todayDiaryExists: boolean;
  // 状态
  loading: boolean;
  errors: Record<string, Error | null>;
}

const INITIAL_DATA: HomeData = {
  summary: {
    pendingTodos: 0,
    overdueTodos: 0,
    flashcardsDue: 0,
    rssUnread: 0,
    pomodoroToday: { count: 0, focusMs: 0 },
  },
  todoItems: [],
  todoGroups: [],
  flashcardItems: [],
  flashcardDecks: [],
  questionItems: [],
  questionGroups: [],
  activeSession: null,
  pomodoroPresets: [],
  recentActivity: {
    cards: [],
    articles: [],
    projectItems: [],
    documentItems: [],
  },
  activityHeatmap: [],
  contentTrend: [],
  recentDiaries: [],
  todayDiaryExists: false,
  loading: true,
  errors: {},
};

const formatDate = (date: Date) => dayjs(date).format("YYYY-MM-DD");
const TREND_TYPES: HomeTrendType[] = [
  "card",
  "article",
  "project-item",
  "document-item",
];

const useHomeData = () => {
  const [data, setData] = useState<HomeData>(INITIAL_DATA);

  const fetchAllData = useCallback(async () => {
    setData((prev) => ({ ...prev, loading: true }));

    const results = await Promise.allSettled([
      // 0: 待办详情
      listTodoPreview({ status: "pending", limit: 6 }),
      // 1: 闪卡复习队列
      getFlashcardReviewQueue({ limit: 6 }),
      // 2: 闪卡卡组（用于显示卡组名）
      listFlashcardDecks(),
      // 3: 问题详情
      listQuestionPreview({
        statuses: ["not_started", "in_progress"],
        limit: 6,
      }),
      // 4: 番茄钟今日
      summaryPomodoroToday(),
      // 5: 活跃 session
      getActivePomodoroSession(),
      // 6: 番茄钟预设
      listPomodoroPresets(),
      // 7: RSS 未读
      countUnreadRssEntries(),
      // 8: 最近动态
      getLatestOperations(30),
      // 9: 操作热力图
      getCalendarHeatmap(dayjs().year()),
      // 10: 全量创作统计，前端按视图聚合（增量/累计/占比）
      getAllStatistic(),
      // 11: 最近若干篇日记（时间轴展示），按日期倒序取最近三篇
      // 显式传 diaryType：后端 IPC 会在末尾追加 win 对象顶替可选参数位置
      (async () => {
        const today = dayjs();
        const startDate = today
          .subtract(DIARY_FETCH_WINDOW_DAYS, "day")
          .format("YYYY-MM-DD");
        const endDate = today.format("YYYY-MM-DD");
        const entries = await getDiaryEntriesByDateRange(
          startDate,
          endDate,
          DIARY_TIMELINE_TYPE,
        );
        return entries
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, DIARY_TIMELINE_LIMIT)
          .reverse();
      })(),
    ]);

    const errors: Record<string, Error | null> = {};

    // 解构结果
    const [
      todoResult,
      flashcardResult,
      decksResult,
      questionResult,
      pomodoroTodayResult,
      activeSessionResult,
      presetsResult,
      rssUnreadResult,
      recentActivityResult,
      heatmapResult,
      dailyStatsResult,
      recentDiariesResult,
    ] = results;

    // 待办
    let todoResponse: WorkbenchTodoPreviewResponse | null = null;
    if (todoResult.status === "fulfilled") {
      todoResponse = todoResult.value;
    } else {
      errors.todo = todoResult.reason;
    }

    // 闪卡
    let flashcardItems: Flashcard[] = [];
    if (flashcardResult.status === "fulfilled") {
      flashcardItems = flashcardResult.value;
    } else {
      errors.flashcard = flashcardResult.reason;
    }

    // 卡组
    let flashcardDecks: FlashcardDeck[] = [];
    if (decksResult.status === "fulfilled") {
      flashcardDecks = decksResult.value;
    } else {
      errors.decks = decksResult.reason;
    }

    // 问题
    let questionResponse: WorkbenchQuestionPreviewResponse | null = null;
    if (questionResult.status === "fulfilled") {
      questionResponse = questionResult.value;
    } else {
      errors.question = questionResult.reason;
    }

    // 番茄钟今日
    let pomodoroToday = { count: 0, focusMs: 0 };
    if (pomodoroTodayResult.status === "fulfilled") {
      pomodoroToday = pomodoroTodayResult.value;
    } else {
      errors.pomodoroToday = pomodoroTodayResult.reason;
    }

    // 活跃 session
    let activeSession: PomodoroSession | null = null;
    if (activeSessionResult.status === "fulfilled") {
      activeSession = activeSessionResult.value;
    } else {
      errors.activeSession = activeSessionResult.reason;
    }

    // 预设
    let pomodoroPresets: PomodoroPreset[] = [];
    if (presetsResult.status === "fulfilled") {
      pomodoroPresets = presetsResult.value;
    } else {
      errors.presets = presetsResult.reason;
    }

    // RSS
    let rssUnread = 0;
    if (rssUnreadResult.status === "fulfilled") {
      rssUnread = rssUnreadResult.value;
    } else {
      errors.rss = rssUnreadResult.reason;
    }

    // 最近动态
    let recentActivity: HomeData["recentActivity"] = {
      cards: [],
      articles: [],
      projectItems: [],
      documentItems: [],
    };
    if (recentActivityResult.status === "fulfilled") {
      recentActivity = recentActivityResult.value;
    } else {
      errors.recentActivity = recentActivityResult.reason;
    }

    let activityHeatmap: IItem[] = [];
    if (heatmapResult.status === "fulfilled") {
      activityHeatmap = heatmapResult.value.map((item) => ({
        date: item.time,
        count: item.operation_list.length,
        operationList: item.operation_list,
      }));
    } else {
      errors.heatmap = heatmapResult.reason;
    }

    let contentTrend: HomeTrendPoint[] = [];
    if (dailyStatsResult.status === "fulfilled") {
      const statsByKey = new Map<
        string,
        { count: number; wordsCount: number }
      >();
      dailyStatsResult.value.forEach((item) => {
        if (!TREND_TYPES.includes(item.statisticType as HomeTrendType)) return;
        const key = `${item.date}:${item.statisticType}`;
        // 后端 content 为截至当日的累计总量快照，同一天多条记录取最大值（最新快照）
        const prev = statsByKey.get(key) ?? { count: 0, wordsCount: 0 };
        statsByKey.set(key, {
          count: Math.max(prev.count, item.content.count),
          wordsCount: Math.max(prev.wordsCount, item.content.wordsCount),
        });
      });

      // 从最早统计数据到今天，生成完整时间序列（用于增量/累计/占比视图）
      const end = dayjs();
      let start = end;
      for (const key of statsByKey.keys()) {
        const d = dayjs(key.split(":")[0]);
        if (d.isBefore(start)) start = d;
      }
      const days = end.diff(start, "day") + 1;
      contentTrend = Array.from({ length: days }, (_, index) => {
        const date = start.add(index, "day").format("YYYY-MM-DD");
        return TREND_TYPES.map((type) => {
          const stats = statsByKey.get(`${date}:${type}`) ?? {
            count: 0,
            wordsCount: 0,
          };
          return { date, type, ...stats };
        });
      }).flat();
    } else {
      errors.dailyStats = dailyStatsResult.reason;
    }

    let recentDiaries: DiaryEntry[] = [];
    if (recentDiariesResult.status === "fulfilled") {
      recentDiaries = recentDiariesResult.value;
    } else {
      errors.recentDiaries = recentDiariesResult.reason;
    }

    // 判断今天是否已有日记（决定是否显示"添加今日日记"入口）
    const todayKey = formatDate(new Date());
    const todayDiaryExists = recentDiaries.some(
      (entry) => entry.date === todayKey,
    );

    // 计算闪卡到期数量（queue 返回的就是 due 的）
    const flashcardsDue = flashcardItems.length;

    // 从 deck stats 中获取全部 due 数量（更准确）
    const totalDueFromDecks = flashcardDecks.reduce(
      (sum, d) => sum + (d.stats?.dueCount || 0),
      0,
    );

    setData({
      summary: {
        pendingTodos: todoResponse?.pendingTotal || 0,
        overdueTodos: todoResponse?.overdueTotal || 0,
        flashcardsDue: totalDueFromDecks || flashcardsDue,
        rssUnread,
        pomodoroToday,
      },
      todoItems: todoResponse?.items || [],
      todoGroups: todoResponse?.groups || [],
      flashcardItems,
      flashcardDecks,
      questionItems: questionResponse?.items || [],
      questionGroups: questionResponse?.groups || [],
      activeSession,
      pomodoroPresets,
      recentActivity,
      activityHeatmap,
      contentTrend,
      recentDiaries,
      todayDiaryExists,
      loading: false,
      errors,
    });
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const saveDiary = useCallback(
    async (
      id: number,
      content: DiaryEntry["content"],
    ): Promise<DiaryEntry | null> => {
      try {
        const updated = await updateDiaryEntry({ id, content });
        setData((prev) => ({
          ...prev,
          recentDiaries: prev.recentDiaries.map((entry) =>
            entry.id === id ? updated : entry,
          ),
        }));
        return updated;
      } catch (error) {
        console.error("Failed to save diary:", error);
        return null;
      }
    },
    [],
  );

  const createTodayDiary = useCallback(async (): Promise<DiaryEntry | null> => {
    const today = formatDate(new Date());
    try {
      const created = await createDiaryEntry({
        type: DIARY_TIMELINE_TYPE,
        date: today,
        weather: null,
        mood: null,
        content: createEmptyDiaryContent(),
      });
      setData((prev) => ({
        ...prev,
        // 新建日记插入到时间轴最前，并保持篇数上限
        recentDiaries: [created, ...prev.recentDiaries].slice(
          0,
          DIARY_TIMELINE_LIMIT,
        ),
        todayDiaryExists: true,
      }));
      return created;
    } catch (error) {
      console.error("Failed to create today diary:", error);
      return null;
    }
  }, []);

  return {
    data,
    refresh: fetchAllData,
    saveDiary,
    createTodayDiary,
  };
};

export default useHomeData;
