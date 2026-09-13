import { useCallback, useEffect, useMemo } from "react";
import {
  useQueries,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import dayjs from "dayjs";
import type { TodoItem } from "@/types/todo";
import type { IQuestion } from "@/types/question";
import type { Flashcard, FlashcardDeck, PomodoroPreset, PomodoroSession } from "@/types";
import type {
  WorkbenchTodoGroupStat,
  WorkbenchQuestionGroupStat,
} from "@/types/components-workbench";
import { getLatestOperations } from "@/commands/operation";
import { listTodoPreview, listQuestionPreview } from "@/commands/components-workbench";
import { getFlashcardReviewQueue, listFlashcardDecks } from "@/commands/flashcard";
import {
  summaryPomodoroToday,
  getActivePomodoroSession,
  listPomodoroPresets,
  listPomodoroSessions,
} from "@/commands/pomodoro";
import { countUnreadRssEntries, listUnreadRssEntries, listRssFeeds } from "@/commands/rss";
import { getCalendarHeatmap, getAllStatistic } from "@/commands/statistic";
import {
  createDiaryEntry,
  getDiaryEntriesByDateRange,
  getDiaryEntryByDate,
  createDiarySegment,
  updateDiarySegment,
  deleteDiarySegment,
  getAllDiarySegmentsFlat,
  getAllDiaryTagSettings,
  upsertDiaryTagSetting,
  deleteDiaryTagSetting,
} from "@/commands/diary";
import { createEmptyDiaryContent } from "@/pages/DiaryView/constants/content";
import type { ICard, IArticle, IDocumentItem, ProjectItem } from "@/types";
import type { DiaryEntry, DiarySegment, DiaryTagSetting } from "@/types/diary";
import type { RssEntry, RssFeed } from "@/types/rss";
import type { IItem } from "@/components/CalendarHeatmap";
import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";

const HOME_QUERY_KEY = ["home"] as const;
const TODO_QUERY_KEY = [...HOME_QUERY_KEY, "todo"] as const;
const QUESTION_QUERY_KEY = [...HOME_QUERY_KEY, "question"] as const;
const FLASHCARD_QUERY_KEY = [...HOME_QUERY_KEY, "flashcard"] as const;
const RSS_QUERY_KEY = [...HOME_QUERY_KEY, "rss"] as const;
const POMODORO_QUERY_KEY = [...HOME_QUERY_KEY, "pomodoro"] as const;
const ACTIVITY_QUERY_KEY = [...HOME_QUERY_KEY, "activity"] as const;
const DIARY_QUERY_KEY = [...HOME_QUERY_KEY, "diary"] as const;

const RSS_PREVIEW_LIMIT = 5;
const SEGMENT_LIMIT = 3;
const DIARY_FETCH_WINDOW_DAYS = 365;
const POMODORO_RECENT_SESSION_LIMIT = 30;
const DIARY_TIMELINE_TYPE = "daily" as const;

export interface RecentSegmentItem {
  segment: DiarySegment;
  diary: DiaryEntry;
}

interface RecentDiaryResult {
  segments: RecentSegmentItem[];
  tagUsageCounts: Map<string, number>;
}

export type HomeTrendType = "card" | "article" | "project-item" | "document-item";

export interface HomeTrendPoint {
  date: string;
  type: HomeTrendType;
  count: number;
  wordsCount: number;
}

export interface HomeData {
  summary: {
    pendingTodos: number;
    overdueTodos: number;
    flashcardsDue: number;
    rssUnread: number;
    pomodoroToday: { count: number; focusMs: number };
  };
  todoItems: TodoItem[];
  todoGroups: WorkbenchTodoGroupStat[];
  flashcardItems: Flashcard[];
  flashcardDecks: FlashcardDeck[];
  questionItems: IQuestion[];
  questionGroups: WorkbenchQuestionGroupStat[];
  rssItems: RssEntry[];
  rssFeeds: RssFeed[];
  activeSession: PomodoroSession | null;
  pomodoroPresets: PomodoroPreset[];
  pomodoroRecentSessions: PomodoroSession[];
  pomodoroTodaySessions: PomodoroSession[];
  recentActivity: {
    cards: ICard[];
    articles: IArticle[];
    projectItems: ProjectItem[];
    documentItems: IDocumentItem[];
  };
  activityHeatmap: IItem[];
  contentTrend: HomeTrendPoint[];
  recentSegments: RecentSegmentItem[];
  tagSettings: DiaryTagSetting[];
  tagUsageCounts: Map<string, number>;
  loading: boolean;
  flashcardsLoading: boolean;
  rssLoading: boolean;
  errors: Record<string, Error | null>;
}

interface HomeTodoData {
  pendingTodos: number;
  overdueTodos: number;
  todoItems: TodoItem[];
  todoGroups: WorkbenchTodoGroupStat[];
}

interface HomeQuestionData {
  questionItems: IQuestion[];
  questionGroups: WorkbenchQuestionGroupStat[];
}

interface HomeFlashcardData {
  flashcardsDue: number;
  flashcardItems: Flashcard[];
  flashcardDecks: FlashcardDeck[];
}

interface HomeRssData {
  rssUnread: number;
  rssItems: RssEntry[];
  rssFeeds: RssFeed[];
}

interface HomePomodoroData {
  pomodoroToday: { count: number; focusMs: number };
  activeSession: PomodoroSession | null;
  pomodoroPresets: PomodoroPreset[];
  pomodoroRecentSessions: PomodoroSession[];
  pomodoroTodaySessions: PomodoroSession[];
}

interface HomeActivityData {
  recentActivity: HomeData["recentActivity"];
  activityHeatmap: IItem[];
  contentTrend: HomeTrendPoint[];
}

interface HomeDiaryData {
  recentSegments: RecentSegmentItem[];
  tagSettings: DiaryTagSetting[];
  tagUsageCounts: Map<string, number>;
}

const EMPTY_RECENT_ACTIVITY: HomeData["recentActivity"] = {
  cards: [],
  articles: [],
  projectItems: [],
  documentItems: [],
};

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
  rssItems: [],
  rssFeeds: [],
  activeSession: null,
  pomodoroPresets: [],
  pomodoroRecentSessions: [],
  pomodoroTodaySessions: [],
  recentActivity: EMPTY_RECENT_ACTIVITY,
  activityHeatmap: [],
  contentTrend: [],
  recentSegments: [],
  tagSettings: [],
  tagUsageCounts: new Map(),
  loading: true,
  flashcardsLoading: false,
  rssLoading: false,
  errors: {},
};

const TREND_TYPES: HomeTrendType[] = ["card", "article", "project-item", "document-item"];

const formatDate = (date: Date) => dayjs(date).format("YYYY-MM-DD");

const toError = (error: unknown): Error | null => {
  if (!error) return null;
  return error instanceof Error ? error : new Error(String(error));
};

const fetchRecentDiaryData = async (): Promise<RecentDiaryResult> => {
  const today = dayjs();
  const startDate = today.subtract(DIARY_FETCH_WINDOW_DAYS, "day").format("YYYY-MM-DD");
  const endDate = today.format("YYYY-MM-DD");
  const [entries, allSegments] = await Promise.all([
    getDiaryEntriesByDateRange(startDate, endDate, DIARY_TIMELINE_TYPE),
    getAllDiarySegmentsFlat(),
  ]);
  const entryById = new Map(entries.map(entry => [entry.id, entry]));
  // 标签使用计数按片段统计（标签绑 segment，一天多条日记各算各的）
  const tagUsageCounts = new Map<string, number>();
  allSegments.forEach(item => {
    item.tags.forEach(tag => {
      tagUsageCounts.set(tag, (tagUsageCounts.get(tag) ?? 0) + 1);
    });
  });

  return {
    segments: allSegments
      .filter(item => entryById.has(item.diaryId))
      .slice(0, SEGMENT_LIMIT)
      .map(item => ({
        segment: {
          id: item.id,
          diaryId: item.diaryId,
          contentId: item.contentId,
          wordCount: item.wordCount,
          createTime: item.createTime,
          updateTime: item.updateTime,
          content: item.content,
          tags: item.tags,
        },
        diary: entryById.get(item.diaryId)!,
      })),
    tagUsageCounts,
  };
};

const fetchHomeTodoData = async (): Promise<HomeTodoData> => {
  const response = await listTodoPreview({ status: "pending", limit: 6 });
  return {
    pendingTodos: response.pendingTotal || 0,
    overdueTodos: response.overdueTotal || 0,
    todoItems: response.items || [],
    todoGroups: response.groups || [],
  };
};

const fetchHomeQuestionData = async (): Promise<HomeQuestionData> => {
  const response = await listQuestionPreview({
    statuses: ["not_started", "in_progress"],
    limit: 6,
  });
  return {
    questionItems: response.items || [],
    questionGroups: response.groups || [],
  };
};

const fetchHomeFlashcardData = async (): Promise<HomeFlashcardData> => {
  const [flashcardItems, flashcardDecks] = await Promise.all([
    getFlashcardReviewQueue({ limit: 30 }),
    listFlashcardDecks(),
  ]);
  const totalDueFromDecks = flashcardDecks.reduce(
    (sum, deck) => sum + (deck.stats?.dueCount || 0),
    0
  );

  return {
    flashcardsDue: totalDueFromDecks || flashcardItems.length,
    flashcardItems,
    flashcardDecks,
  };
};

const fetchHomeRssData = async (): Promise<HomeRssData> => {
  const [rssItems, rssFeeds, rssUnread] = await Promise.all([
    listUnreadRssEntries(RSS_PREVIEW_LIMIT, 0, ""),
    listRssFeeds(),
    countUnreadRssEntries(),
  ]);

  return {
    rssUnread,
    rssItems,
    rssFeeds,
  };
};

const fetchHomePomodoroData = async (): Promise<HomePomodoroData> => {
  const todayStart = dayjs().startOf("day").valueOf();
  const todayEnd = dayjs().endOf("day").valueOf();
  const [
    pomodoroToday,
    activeSession,
    pomodoroPresets,
    pomodoroRecentSessions,
    pomodoroTodaySessions,
  ] = await Promise.all([
    summaryPomodoroToday(),
    getActivePomodoroSession(),
    listPomodoroPresets(),
    listPomodoroSessions({ limit: POMODORO_RECENT_SESSION_LIMIT }),
    listPomodoroSessions({
      start: todayStart,
      end: todayEnd,
      limit: POMODORO_RECENT_SESSION_LIMIT,
    }),
  ]);

  return {
    pomodoroToday,
    activeSession,
    pomodoroPresets,
    pomodoroRecentSessions,
    pomodoroTodaySessions,
  };
};

const buildContentTrend = (
  stats: Awaited<ReturnType<typeof getAllStatistic>>
): HomeTrendPoint[] => {
  const statsByKey = new Map<string, { count: number; wordsCount: number }>();
  stats.forEach(item => {
    if (!TREND_TYPES.includes(item.statisticType as HomeTrendType)) return;
    const key = `${item.date}:${item.statisticType}`;
    const prev = statsByKey.get(key) ?? { count: 0, wordsCount: 0 };
    statsByKey.set(key, {
      count: Math.max(prev.count, item.content.count),
      wordsCount: Math.max(prev.wordsCount, item.content.wordsCount),
    });
  });

  const end = dayjs();
  let start = end;
  for (const key of statsByKey.keys()) {
    const d = dayjs(key.split(":")[0]);
    if (d.isBefore(start)) start = d;
  }
  const days = end.diff(start, "day") + 1;
  return Array.from({ length: days }, (_, index) => {
    const date = start.add(index, "day").format("YYYY-MM-DD");
    return TREND_TYPES.map(type => {
      const typeStats = statsByKey.get(`${date}:${type}`) ?? {
        count: 0,
        wordsCount: 0,
      };
      return { date, type, ...typeStats };
    });
  }).flat();
};

const fetchHomeActivityData = async (): Promise<HomeActivityData> => {
  const [recentActivity, heatmap, dailyStats] = await Promise.all([
    getLatestOperations(30),
    getCalendarHeatmap(dayjs().year()),
    getAllStatistic(),
  ]);

  return {
    recentActivity,
    activityHeatmap: heatmap.map(item => ({
      date: item.time,
      count: item.operation_list.length,
      operationList: item.operation_list,
    })),
    contentTrend: buildContentTrend(dailyStats),
  };
};

const fetchHomeDiaryData = async (): Promise<HomeDiaryData> => {
  const [recentDiaryData, tagSettings] = await Promise.all([
    fetchRecentDiaryData(),
    getAllDiaryTagSettings(),
  ]);

  return {
    recentSegments: recentDiaryData.segments,
    tagSettings,
    tagUsageCounts: recentDiaryData.tagUsageCounts,
  };
};

const buildHomeData = ({
  todo,
  question,
  flashcard,
  rss,
  pomodoro,
  activity,
  diary,
  loading,
  flashcardsLoading,
  rssLoading,
  errors,
}: {
  todo?: HomeTodoData;
  question?: HomeQuestionData;
  flashcard?: HomeFlashcardData;
  rss?: HomeRssData;
  pomodoro?: HomePomodoroData;
  activity?: HomeActivityData;
  diary?: HomeDiaryData;
  loading: boolean;
  flashcardsLoading: boolean;
  rssLoading: boolean;
  errors: Record<string, Error | null>;
}): HomeData => ({
  summary: {
    pendingTodos: todo?.pendingTodos ?? INITIAL_DATA.summary.pendingTodos,
    overdueTodos: todo?.overdueTodos ?? INITIAL_DATA.summary.overdueTodos,
    flashcardsDue: flashcard?.flashcardsDue ?? INITIAL_DATA.summary.flashcardsDue,
    rssUnread: rss?.rssUnread ?? INITIAL_DATA.summary.rssUnread,
    pomodoroToday: pomodoro?.pomodoroToday ?? INITIAL_DATA.summary.pomodoroToday,
  },
  todoItems: todo?.todoItems ?? INITIAL_DATA.todoItems,
  todoGroups: todo?.todoGroups ?? INITIAL_DATA.todoGroups,
  flashcardItems: flashcard?.flashcardItems ?? INITIAL_DATA.flashcardItems,
  flashcardDecks: flashcard?.flashcardDecks ?? INITIAL_DATA.flashcardDecks,
  questionItems: question?.questionItems ?? INITIAL_DATA.questionItems,
  questionGroups: question?.questionGroups ?? INITIAL_DATA.questionGroups,
  rssItems: rss?.rssItems ?? INITIAL_DATA.rssItems,
  rssFeeds: rss?.rssFeeds ?? INITIAL_DATA.rssFeeds,
  activeSession: pomodoro?.activeSession ?? INITIAL_DATA.activeSession,
  pomodoroPresets: pomodoro?.pomodoroPresets ?? INITIAL_DATA.pomodoroPresets,
  pomodoroRecentSessions: pomodoro?.pomodoroRecentSessions ?? INITIAL_DATA.pomodoroRecentSessions,
  pomodoroTodaySessions: pomodoro?.pomodoroTodaySessions ?? INITIAL_DATA.pomodoroTodaySessions,
  recentActivity: activity?.recentActivity ?? INITIAL_DATA.recentActivity,
  activityHeatmap: activity?.activityHeatmap ?? INITIAL_DATA.activityHeatmap,
  contentTrend: activity?.contentTrend ?? INITIAL_DATA.contentTrend,
  recentSegments: diary?.recentSegments ?? INITIAL_DATA.recentSegments,
  tagSettings: diary?.tagSettings ?? INITIAL_DATA.tagSettings,
  tagUsageCounts: diary?.tagUsageCounts ?? INITIAL_DATA.tagUsageCounts,
  loading,
  flashcardsLoading,
  rssLoading,
  errors,
});

const buildErrors = (results: {
  todo: UseQueryResult<HomeTodoData>;
  question: UseQueryResult<HomeQuestionData>;
  flashcard: UseQueryResult<HomeFlashcardData>;
  rss: UseQueryResult<HomeRssData>;
  pomodoro: UseQueryResult<HomePomodoroData>;
  activity: UseQueryResult<HomeActivityData>;
  diary: UseQueryResult<HomeDiaryData>;
}): Record<string, Error | null> => ({
  todo: toError(results.todo.error),
  question: toError(results.question.error),
  flashcard: toError(results.flashcard.error),
  rss: toError(results.rss.error),
  pomodoro: toError(results.pomodoro.error),
  activity: toError(results.activity.error),
  diary: toError(results.diary.error),
});

const updateDiaryCache = (
  queryClient: QueryClient,
  updater: (prev: HomeDiaryData) => HomeDiaryData
) => {
  queryClient.setQueryData<HomeDiaryData>(DIARY_QUERY_KEY, prev => {
    if (!prev) {
      return prev;
    }
    return updater(prev);
  });
};

const useHomeData = () => {
  const queryClient = useQueryClient();
  const websocketClient = useBackendWebsocketStore(state => state.client);
  const [
    todoQuery,
    questionQuery,
    flashcardQuery,
    rssQuery,
    pomodoroQuery,
    activityQuery,
    diaryQuery,
  ] = useQueries({
    queries: [
      { queryKey: TODO_QUERY_KEY, queryFn: fetchHomeTodoData },
      { queryKey: QUESTION_QUERY_KEY, queryFn: fetchHomeQuestionData },
      { queryKey: FLASHCARD_QUERY_KEY, queryFn: fetchHomeFlashcardData },
      { queryKey: RSS_QUERY_KEY, queryFn: fetchHomeRssData },
      { queryKey: POMODORO_QUERY_KEY, queryFn: fetchHomePomodoroData },
      { queryKey: ACTIVITY_QUERY_KEY, queryFn: fetchHomeActivityData },
      { queryKey: DIARY_QUERY_KEY, queryFn: fetchHomeDiaryData },
    ],
  });

  const queries = useMemo(
    () => ({
      todo: todoQuery,
      question: questionQuery,
      flashcard: flashcardQuery,
      rss: rssQuery,
      pomodoro: pomodoroQuery,
      activity: activityQuery,
      diary: diaryQuery,
    }),
    [todoQuery, questionQuery, flashcardQuery, rssQuery, pomodoroQuery, activityQuery, diaryQuery]
  );

  const hasAnyData = Object.values(queries).some(query => !!query.data);
  const loading = !hasAnyData && Object.values(queries).some(query => query.isLoading);
  const data = useMemo(
    () =>
      buildHomeData({
        todo: todoQuery.data,
        question: questionQuery.data,
        flashcard: flashcardQuery.data,
        rss: rssQuery.data,
        pomodoro: pomodoroQuery.data,
        activity: activityQuery.data,
        diary: diaryQuery.data,
        loading,
        flashcardsLoading: flashcardQuery.isFetching && !!flashcardQuery.data,
        rssLoading: rssQuery.isFetching && !!rssQuery.data,
        errors: buildErrors(queries),
      }),
    [
      todoQuery.data,
      questionQuery.data,
      flashcardQuery.data,
      rssQuery.data,
      pomodoroQuery.data,
      activityQuery.data,
      diaryQuery.data,
      loading,
      flashcardQuery.isFetching,
      rssQuery.isFetching,
      queries,
    ]
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: HOME_QUERY_KEY });
  }, [queryClient]);

  const refreshFlashcards = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: FLASHCARD_QUERY_KEY });
  }, [queryClient]);

  const refreshRss = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: RSS_QUERY_KEY });
  }, [queryClient]);

  const refreshPomodoro = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: POMODORO_QUERY_KEY });
  }, [queryClient]);

  useEffect(() => {
    if (!websocketClient) return;

    const updatePomodoroCache = (updater: (prev: HomePomodoroData) => HomePomodoroData) => {
      queryClient.setQueryData<HomePomodoroData>(POMODORO_QUERY_KEY, prev => {
        if (!prev) return prev;
        return updater(prev);
      });
    };

    const handleActiveSessionChanged = (payload: unknown) => {
      const activeSession = payload as PomodoroSession | null;
      updatePomodoroCache(prev => ({ ...prev, activeSession }));

      if (!activeSession) {
        void queryClient.invalidateQueries({ queryKey: POMODORO_QUERY_KEY });
      }
    };

    const handleTick = (payload: unknown) => {
      const tick = payload as { session?: PomodoroSession | null };
      if (!tick.session) return;
      updatePomodoroCache(prev => ({
        ...prev,
        activeSession: tick.session ?? prev.activeSession,
      }));
    };

    websocketClient.registerNotificationHandler(
      "pomodoro:active-session-changed",
      handleActiveSessionChanged
    );
    websocketClient.registerNotificationHandler("pomodoro:tick", handleTick);

    return () => {
      websocketClient.unregisterNotificationHandler(
        "pomodoro:active-session-changed",
        handleActiveSessionChanged
      );
      websocketClient.unregisterNotificationHandler("pomodoro:tick", handleTick);
    };
  }, [queryClient, websocketClient]);

  // 乐观更新当前活动会话，避免等待完整查询刷新导致的卡顿
  const setActiveSession = useCallback(
    (session: PomodoroSession | null) => {
      queryClient.setQueryData<HomePomodoroData>(POMODORO_QUERY_KEY, prev => {
        if (!prev) return prev;
        return { ...prev, activeSession: session };
      });
    },
    [queryClient]
  );

  const createSegmentNow = useCallback(async (): Promise<void> => {
    const today = formatDate(new Date());
    try {
      const existing = await getDiaryEntryByDate(today);
      if (existing) {
        const created = await createDiarySegment({
          diaryId: existing.id,
          content: createEmptyDiaryContent(),
        });
        const newItem: RecentSegmentItem = {
          segment: created,
          diary: existing,
        };
        updateDiaryCache(queryClient, prev => ({
          ...prev,
          recentSegments: [newItem, ...prev.recentSegments].slice(0, SEGMENT_LIMIT),
        }));
      } else {
        const createdEntry = await createDiaryEntry({
          type: DIARY_TIMELINE_TYPE,
          date: today,
          weather: null,
          mood: null,
          tags: [],
          content: createEmptyDiaryContent(),
        });
        const newSegment = createdEntry.segments[0];
        if (newSegment) {
          const newItem: RecentSegmentItem = {
            segment: newSegment,
            diary: createdEntry,
          };
          updateDiaryCache(queryClient, prev => ({
            ...prev,
            recentSegments: [newItem, ...prev.recentSegments].slice(0, SEGMENT_LIMIT),
          }));
        }
      }
    } catch (error) {
      console.error("Failed to create segment now:", error);
    }
  }, [queryClient]);

  const updateSegment = useCallback(
    async (segmentId: number, content: DiaryEntry["content"]): Promise<void> => {
      try {
        const updated = await updateDiarySegment({ segmentId, content });
        if (!updated) return;
        updateDiaryCache(queryClient, prev => ({
          ...prev,
          recentSegments: prev.recentSegments.map(item =>
            item.segment.id === segmentId ? { ...item, segment: updated } : item
          ),
        }));
      } catch (error) {
        console.error("Failed to update diary segment:", error);
      }
    },
    [queryClient]
  );

  const deleteSegment = useCallback(
    async (segmentId: number): Promise<void> => {
      try {
        await deleteDiarySegment(segmentId);
        const recentDiaryData = await fetchRecentDiaryData();
        updateDiaryCache(queryClient, prev => ({
          ...prev,
          recentSegments: recentDiaryData.segments,
          tagUsageCounts: recentDiaryData.tagUsageCounts,
        }));
      } catch (error) {
        console.error("Failed to delete diary segment:", error);
      }
    },
    [queryClient]
  );

  // 标签与片段绑定：按 segmentId 落库并更新该片段的标签缓存
  const updateDiaryTags = useCallback(
    async (segmentId: number, tags: string[]): Promise<void> => {
      try {
        const updated = await updateDiarySegment({ segmentId, tags });
        if (!updated) return;
        updateDiaryCache(queryClient, prev => {
          const previousTags =
            prev.recentSegments.find(item => item.segment.id === segmentId)?.segment.tags ?? [];
          const nextUsageCounts = new Map(prev.tagUsageCounts);

          previousTags.forEach(tag => {
            if (tags.includes(tag)) return;
            const nextCount = (nextUsageCounts.get(tag) ?? 0) - 1;
            if (nextCount > 0) {
              nextUsageCounts.set(tag, nextCount);
            } else {
              nextUsageCounts.delete(tag);
            }
          });

          tags.forEach(tag => {
            if (previousTags.includes(tag)) return;
            nextUsageCounts.set(tag, (nextUsageCounts.get(tag) ?? 0) + 1);
          });

          return {
            ...prev,
            recentSegments: prev.recentSegments.map(item =>
              item.segment.id === segmentId
                ? { ...item, segment: { ...item.segment, tags: updated.tags } }
                : item
            ),
            tagUsageCounts: nextUsageCounts,
          };
        });
      } catch (error) {
        console.error("Failed to update diary tags:", error);
      }
    },
    [queryClient]
  );

  const upsertTagSetting = useCallback(
    async (setting: { name: string; color: string; sort?: number }): Promise<void> => {
      try {
        const result = await upsertDiaryTagSetting(setting);
        updateDiaryCache(queryClient, prev => {
          const existing = prev.tagSettings.findIndex(item => item.name === result.name);
          const tagSettings =
            existing >= 0
              ? prev.tagSettings.map((item, index) => (index === existing ? result : item))
              : [...prev.tagSettings, result];
          return { ...prev, tagSettings };
        });
      } catch (error) {
        console.error("Failed to upsert diary tag setting:", error);
      }
    },
    [queryClient]
  );

  const deleteTagSetting = useCallback(
    async (name: string): Promise<void> => {
      try {
        await deleteDiaryTagSetting(name);
        const recentDiaryData = await fetchRecentDiaryData();
        updateDiaryCache(queryClient, prev => ({
          ...prev,
          tagSettings: prev.tagSettings.filter(item => item.name !== name),
          recentSegments: recentDiaryData.segments,
          tagUsageCounts: recentDiaryData.tagUsageCounts,
        }));
      } catch (error) {
        console.error("Failed to delete tag setting:", error);
      }
    },
    [queryClient]
  );

  return {
    data,
    refresh,
    refreshFlashcards,
    refreshRss,
    refreshPomodoro,
    setActiveSession,
    createSegmentNow,
    updateSegment,
    deleteSegment,
    updateDiaryTags,
    upsertTagSetting,
    deleteTagSetting,
  };
};

export default useHomeData;
