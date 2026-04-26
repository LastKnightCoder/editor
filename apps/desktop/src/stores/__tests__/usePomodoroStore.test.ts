import { beforeEach, describe, expect, it, vi } from "vitest";

const mockContext = vi.hoisted(() => {
  const client = {
    sendRequest: vi.fn(),
    registerNotificationHandler: vi.fn(),
    unregisterNotificationHandler: vi.fn(),
  };

  return {
    client,
    getActivePomodoroSession: vi.fn(),
    listPomodoroPresets: vi.fn(),
    listPomodoroSessions: vi.fn(),
    summaryPomodoroToday: vi.fn(),
    summaryPomodoroTotal: vi.fn(),
    setBackgroundSound: vi.fn(),
  };
});

vi.mock("@/stores/useBackendWebsocketStore", () => ({
  useBackendWebsocketStore: {
    getState: () => ({
      client: mockContext.client,
    }),
  },
}));

vi.mock("@/commands", () => ({
  getActivePomodoroSession: mockContext.getActivePomodoroSession,
  listPomodoroPresets: mockContext.listPomodoroPresets,
  listPomodoroSessions: mockContext.listPomodoroSessions,
  summaryPomodoroToday: mockContext.summaryPomodoroToday,
  summaryPomodoroTotal: mockContext.summaryPomodoroTotal,
  setBackgroundSound: mockContext.setBackgroundSound,
}));

import { usePomodoroStore } from "../usePomodoroStore";

describe("stores/usePomodoroStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    mockContext.client.sendRequest.mockResolvedValue(null);
    mockContext.getActivePomodoroSession.mockResolvedValue(null);
    mockContext.listPomodoroPresets.mockResolvedValue([]);
    mockContext.listPomodoroSessions.mockResolvedValue([]);
    mockContext.summaryPomodoroToday.mockResolvedValue({
      count: 0,
      focusMs: 0,
    });
    mockContext.summaryPomodoroTotal.mockResolvedValue({
      count: 0,
      focusMs: 0,
    });
    mockContext.setBackgroundSound.mockResolvedValue({
      backgroundSound: null,
      backgroundVolume: 50,
    });

    usePomodoroStore.setState(
      {
        inited: false,
        presets: [],
        sessions: [],
        hasMoreSessions: false,
        loadingMoreSessions: false,
        selectedPreset: null,
        activeSession: null,
        elapsedMs: 0,
        remainMs: undefined,
        rightSidebarWidth: 350,
        backgroundSound: null,
        backgroundVolume: 50,
        today: { count: 0, focusMs: 0 },
        total: { count: 0, focusMs: 0 },
      },
      false,
    );
  });

  it("重复 initPomodoro 不会重复绑定通知 handler", async () => {
    await usePomodoroStore.getState().initPomodoro();
    await usePomodoroStore.getState().initPomodoro();

    expect(
      mockContext.client.registerNotificationHandler,
    ).toHaveBeenCalledTimes(4);
  });

  it("syncActiveSession 会主动刷新当前会话与计时", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    mockContext.getActivePomodoroSession.mockResolvedValue({
      id: 1,
      presetId: 2,
      startTime: now - 30_000,
      expectedMs: 60_000,
      focusMs: 0,
      pauseTotalMs: 0,
      pauseCount: 0,
      pauses: [],
      status: "running",
      createTime: now - 30_000,
      updateTime: now,
    });

    await usePomodoroStore.getState().syncActiveSession();

    const state = usePomodoroStore.getState();
    expect(state.activeSession?.id).toBe(1);
    expect(state.elapsedMs).toBe(30_000);
    expect(state.remainMs).toBe(30_000);
  });
});
