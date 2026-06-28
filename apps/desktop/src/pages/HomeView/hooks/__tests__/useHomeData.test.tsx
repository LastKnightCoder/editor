import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useHomeData, { type HomeData } from "../useHomeData";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/commands/components-workbench", () => ({
  listTodoPreview: vi.fn(),
  listQuestionPreview: vi.fn(),
}));

vi.mock("@/commands/flashcard", () => ({
  getFlashcardReviewQueue: vi.fn(),
  listFlashcardDecks: vi.fn(),
}));

vi.mock("@/commands/pomodoro", () => ({
  summaryPomodoroToday: vi.fn(),
  getActivePomodoroSession: vi.fn(),
  listPomodoroPresets: vi.fn(),
  listPomodoroSessions: vi.fn(),
}));

vi.mock("@/commands/rss", () => ({
  countUnreadRssEntries: vi.fn(),
  listUnreadRssEntries: vi.fn(),
  listRssFeeds: vi.fn(),
}));

vi.mock("@/commands/operation", () => ({
  getLatestOperations: vi.fn(),
}));

vi.mock("@/commands/statistic", () => ({
  getCalendarHeatmap: vi.fn(),
  getAllStatistic: vi.fn(),
}));

vi.mock("@/commands/diary", () => ({
  createDiaryEntry: vi.fn(),
  getDiaryEntriesByDateRange: vi.fn(),
  getDiaryEntryByDate: vi.fn(),
  createDiarySegment: vi.fn(),
  updateDiarySegment: vi.fn(),
  deleteDiarySegment: vi.fn(),
  updateDiaryEntry: vi.fn(),
  getAllDiarySegmentsFlat: vi.fn(),
  getAllDiaryTagSettings: vi.fn(),
  upsertDiaryTagSetting: vi.fn(),
  deleteDiaryTagSetting: vi.fn(),
}));

const mockWebsocketClient = vi.hoisted(() => ({
  registerNotificationHandler: vi.fn(),
  unregisterNotificationHandler: vi.fn(),
}));

vi.mock("@/stores/useBackendWebsocketStore", () => ({
  useBackendWebsocketStore: (selector?: (state: unknown) => unknown) => {
    const state = { client: mockWebsocketClient };
    return selector ? selector(state) : state;
  },
}));

const workbenchCommands = await import("@/commands/components-workbench");
const flashcardCommands = await import("@/commands/flashcard");
const pomodoroCommands = await import("@/commands/pomodoro");
const rssCommands = await import("@/commands/rss");
const operationCommands = await import("@/commands/operation");
const statisticCommands = await import("@/commands/statistic");
const diaryCommands = await import("@/commands/diary");

type HookValue = ReturnType<typeof useHomeData>;

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: false,
      },
    },
  });

const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
  });
};

const mountHook = (queryClient: QueryClient) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let current: HookValue | null = null;

  const Harness = () => {
    current = useHomeData();
    return null;
  };

  const render = async (node: ReactNode) => {
    await act(async () => {
      root.render(node);
    });
  };

  return {
    get current() {
      if (!current) {
        throw new Error("Hook has not rendered yet");
      }
      return current;
    },
    render: () =>
      render(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>,
      ),
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
};

const setupSuccessfulCommands = () => {
  vi.mocked(workbenchCommands.listTodoPreview).mockResolvedValue({
    pendingTotal: 2,
    overdueTotal: 1,
    total: 2,
    nextCursor: null,
    items: [{ id: 1, content: "todo" }] as any,
    groups: [{ groupId: 1, name: "待办", count: 2 }] as any,
  });
  vi.mocked(workbenchCommands.listQuestionPreview).mockResolvedValue({
    total: 1,
    nextCursor: null,
    notStartedTotal: 1,
    inProgressTotal: 0,
    items: [{ id: 1, title: "question" }] as any,
    groups: [{ status: "not_started", count: 1 }] as any,
  });
  vi.mocked(flashcardCommands.getFlashcardReviewQueue).mockResolvedValue([
    { id: 1, deckId: 1 } as any,
  ]);
  vi.mocked(flashcardCommands.listFlashcardDecks).mockResolvedValue([
    { id: 1, name: "deck", stats: { dueCount: 3 } } as any,
  ]);
  vi.mocked(pomodoroCommands.summaryPomodoroToday).mockResolvedValue({
    count: 1,
    focusMs: 60_000,
  });
  vi.mocked(pomodoroCommands.getActivePomodoroSession).mockResolvedValue(null);
  vi.mocked(pomodoroCommands.listPomodoroPresets).mockResolvedValue([
    { id: 1, name: "专注" } as any,
  ]);
  vi.mocked(pomodoroCommands.listPomodoroSessions).mockResolvedValue([]);
  vi.mocked(rssCommands.countUnreadRssEntries).mockResolvedValue(4);
  vi.mocked(rssCommands.listUnreadRssEntries).mockResolvedValue([
    { id: 1, title: "rss" } as any,
  ]);
  vi.mocked(rssCommands.listRssFeeds).mockResolvedValue([
    { id: 1, title: "feed" } as any,
  ]);
  vi.mocked(operationCommands.getLatestOperations).mockResolvedValue({
    cards: [{ id: 1 }] as any,
    articles: [],
    projectItems: [],
    documentItems: [],
  });
  vi.mocked(statisticCommands.getCalendarHeatmap).mockResolvedValue([
    { time: "2026-06-21", operation_list: [{ id: 1 }] } as any,
  ]);
  vi.mocked(statisticCommands.getAllStatistic).mockResolvedValue([]);
  vi.mocked(diaryCommands.getDiaryEntriesByDateRange).mockResolvedValue([]);
  vi.mocked(diaryCommands.getAllDiarySegmentsFlat).mockResolvedValue([]);
  vi.mocked(diaryCommands.getAllDiaryTagSettings).mockResolvedValue([]);
};

const createPomodoroSession = (
  overrides: Partial<{
    id: number;
    presetId: number;
    startTime: number;
    endTime?: number;
    expectedMs?: number;
    focusMs: number;
    pauseTotalMs: number;
    pauseCount: number;
    pauses: { start: number; end?: number }[];
    status: "running" | "paused" | "completed" | "stopped";
    createTime: number;
    updateTime: number;
  }> = {},
) => {
  const now = Date.now();
  return {
    id: 1,
    presetId: 1,
    startTime: now - 60_000,
    endTime: undefined,
    expectedMs: 25 * 60_000,
    focusMs: 0,
    pauseTotalMs: 0,
    pauseCount: 0,
    pauses: [],
    status: "running" as const,
    createTime: now - 60_000,
    updateTime: now,
    ...overrides,
  };
};

const getRegisteredNotificationHandler = (method: string) => {
  const call = mockWebsocketClient.registerNotificationHandler.mock.calls.find(
    ([registeredMethod]) => registeredMethod === method,
  );
  if (!call) {
    throw new Error(`Notification handler not registered: ${method}`);
  }
  return call[1] as (payload: unknown) => void;
};

const waitForLoaded = async (hook: { current: HookValue }) => {
  for (let index = 0; index < 10; index += 1) {
    await flushPromises();
    if (!hook.current.data.loading) {
      return;
    }
  }
  throw new Error(
    `Home data did not finish loading: ${JSON.stringify({
      loading: hook.current.data.loading,
      pendingTodos: hook.current.data.summary.pendingTodos,
      todoCalls: vi.mocked(workbenchCommands.listTodoPreview).mock.calls.length,
      rssError: hook.current.data.errors.rss?.message,
    })}`,
  );
};

describe("useHomeData", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T08:00:00.000Z"));
    mockWebsocketClient.registerNotificationHandler.mockClear();
    mockWebsocketClient.unregisterNotificationHandler.mockClear();
    setupSuccessfulCommands();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("首次没有缓存时显示首屏 loading，并加载首页数据", async () => {
    const queryClient = createQueryClient();
    const hook = mountHook(queryClient);

    await hook.render();

    expect(hook.current.data.loading).toBe(true);

    await waitForLoaded(hook);

    expect(hook.current.data.loading).toBe(false);
    expect(hook.current.data.summary.pendingTodos).toBe(2);
    expect(hook.current.data.summary.flashcardsDue).toBe(3);
    expect(hook.current.data.summary.rssUnread).toBe(4);
    expect(pomodoroCommands.listPomodoroSessions).toHaveBeenCalledWith({
      start: new Date(2026, 5, 21, 0, 0, 0, 0).getTime(),
      end: new Date(2026, 5, 21, 23, 59, 59, 999).getTime(),
      limit: 30,
    });

    await hook.unmount();
  });

  it("5 分钟内重新挂载时立即显示缓存数据，不出现整页 loading", async () => {
    const queryClient = createQueryClient();
    const firstHook = mountHook(queryClient);

    await firstHook.render();
    await waitForLoaded(firstHook);
    await firstHook.unmount();

    const secondHook = mountHook(queryClient);
    await secondHook.render();

    expect(secondHook.current.data.loading).toBe(false);
    expect(secondHook.current.data.summary.pendingTodos).toBe(2);
    expect(workbenchCommands.listTodoPreview).toHaveBeenCalledTimes(1);

    await secondHook.unmount();
  });

  it("缓存 stale 后重新挂载时先显示旧数据，同时后台刷新", async () => {
    const queryClient = createQueryClient();
    const firstHook = mountHook(queryClient);

    await firstHook.render();
    await waitForLoaded(firstHook);
    await firstHook.unmount();

    vi.mocked(workbenchCommands.listTodoPreview).mockResolvedValue({
      pendingTotal: 9,
      overdueTotal: 0,
      total: 9,
      nextCursor: null,
      items: [] as any,
      groups: [] as any,
    });
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    });

    const secondHook = mountHook(queryClient);
    await secondHook.render();

    expect(secondHook.current.data.loading).toBe(false);
    expect(secondHook.current.data.summary.pendingTodos).toBe(2);

    await waitForLoaded(secondHook);

    expect(secondHook.current.data.summary.pendingTodos).toBe(9);
    expect(workbenchCommands.listTodoPreview).toHaveBeenCalledTimes(2);

    await secondHook.unmount();
  });

  it("局部刷新 RSS 时只刷新 RSS query", async () => {
    const queryClient = createQueryClient();
    const hook = mountHook(queryClient);

    await hook.render();
    await waitForLoaded(hook);

    vi.mocked(rssCommands.countUnreadRssEntries).mockResolvedValue(7);

    await act(async () => {
      await hook.current.refreshRss();
    });
    await flushPromises();

    expect(hook.current.data.summary.rssUnread).toBe(7);
    expect(rssCommands.countUnreadRssEntries).toHaveBeenCalledTimes(2);
    expect(workbenchCommands.listTodoPreview).toHaveBeenCalledTimes(1);
    expect(flashcardCommands.getFlashcardReviewQueue).toHaveBeenCalledTimes(1);

    await hook.unmount();
  });

  it("局部刷新闪卡时只刷新 flashcard query", async () => {
    const queryClient = createQueryClient();
    const hook = mountHook(queryClient);

    await hook.render();
    await waitForLoaded(hook);

    vi.mocked(flashcardCommands.listFlashcardDecks).mockResolvedValue([
      { id: 1, name: "deck", stats: { dueCount: 8 } } as any,
    ]);

    await act(async () => {
      await hook.current.refreshFlashcards();
    });
    await flushPromises();

    expect(hook.current.data.summary.flashcardsDue).toBe(8);
    expect(flashcardCommands.getFlashcardReviewQueue).toHaveBeenCalledTimes(2);
    expect(workbenchCommands.listTodoPreview).toHaveBeenCalledTimes(1);
    expect(rssCommands.countUnreadRssEntries).toHaveBeenCalledTimes(1);

    await hook.unmount();
  });

  it("收到番茄钟主进程事件时实时同步首页活动会话和统计", async () => {
    const runningSession = createPomodoroSession();
    vi.mocked(pomodoroCommands.getActivePomodoroSession).mockResolvedValue(
      runningSession,
    );

    const queryClient = createQueryClient();
    const hook = mountHook(queryClient);

    await hook.render();
    await waitForLoaded(hook);

    const handleActiveSessionChanged = getRegisteredNotificationHandler(
      "pomodoro:active-session-changed",
    );
    const pausedSession = createPomodoroSession({
      status: "paused",
      pauseCount: 1,
      pauses: [{ start: Date.now() }],
      updateTime: Date.now(),
    });

    await act(async () => {
      handleActiveSessionChanged(pausedSession);
    });
    await flushPromises();

    expect(hook.current.data.activeSession?.status).toBe("paused");
    expect(hook.current.data.activeSession?.pauseCount).toBe(1);

    vi.mocked(pomodoroCommands.summaryPomodoroToday).mockResolvedValue({
      count: 2,
      focusMs: 20 * 60_000,
    });
    vi.mocked(pomodoroCommands.getActivePomodoroSession).mockResolvedValue(
      null,
    );
    vi.mocked(pomodoroCommands.listPomodoroSessions).mockResolvedValue([
      createPomodoroSession({
        id: 2,
        status: "completed",
        endTime: Date.now(),
        focusMs: 19 * 60_000,
      }),
    ]);

    await act(async () => {
      handleActiveSessionChanged(null);
    });
    await flushPromises();

    expect(hook.current.data.activeSession).toBeNull();
    expect(hook.current.data.summary.pomodoroToday).toEqual({
      count: 2,
      focusMs: 20 * 60_000,
    });
    expect(hook.current.data.pomodoroRecentSessions).toHaveLength(1);

    await hook.unmount();
  });

  it("某个 query 失败时保留其他分组数据并暴露错误", async () => {
    vi.mocked(rssCommands.countUnreadRssEntries).mockRejectedValue(
      new Error("rss failed"),
    );
    const queryClient = createQueryClient();
    const hook = mountHook(queryClient);

    await hook.render();
    await waitForLoaded(hook);

    const data: HomeData = hook.current.data;
    expect(data.summary.pendingTodos).toBe(2);
    expect(data.summary.flashcardsDue).toBe(3);
    expect(data.errors.rss?.message).toBe("rss failed");

    await hook.unmount();
  });

  it("首页日记顺序跟随 DiaryView 的最新 segment 排序", async () => {
    const olderSegment = {
      id: 10,
      diaryId: 1,
      contentId: 101,
      wordCount: 1,
      createTime: 1000,
      updateTime: 1000,
      content: [{ type: "paragraph", children: [{ text: "旧记录" }] }],
    };
    const newerSegment = {
      id: 11,
      diaryId: 1,
      contentId: 102,
      wordCount: 1,
      createTime: 1000,
      updateTime: 1000,
      content: [{ type: "paragraph", children: [{ text: "新记录" }] }],
    };
    const diaryEntry = {
      id: 1,
      type: "daily",
      date: "2026-06-21",
      contentId: null,
      weather: null,
      mood: null,
      tags: [],
      wordCount: 2,
      createTime: 1000,
      updateTime: 1000,
      segments: [olderSegment, newerSegment],
      content: [],
    };

    vi.mocked(diaryCommands.getDiaryEntriesByDateRange).mockResolvedValue([
      diaryEntry as any,
    ]);
    vi.mocked(diaryCommands.getAllDiarySegmentsFlat).mockResolvedValue([
      {
        ...newerSegment,
        entryDate: "2026-06-21",
        entryDateMs: 1_783_536_000_000,
        weather: null,
        mood: null,
        tags: [],
      } as any,
      {
        ...olderSegment,
        entryDate: "2026-06-21",
        entryDateMs: 1_783_536_000_000,
        weather: null,
        mood: null,
        tags: [],
      } as any,
    ]);

    const queryClient = createQueryClient();
    const hook = mountHook(queryClient);

    await hook.render();
    await waitForLoaded(hook);

    expect(
      hook.current.data.recentSegments.map((item) => item.segment.id),
    ).toEqual([11, 10]);

    await hook.unmount();
  });
});
