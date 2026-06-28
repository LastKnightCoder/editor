import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PomodoroPanel from "../PomodoroPanel";
import type { PomodoroPreset, PomodoroSession } from "@/types/pomodoro";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/useThemeColors", () => ({
  default: () => ({
    textClass: "text-gray-800",
    secondaryTextClass: "text-gray-500",
    activeTextClass: "text-blue-500",
    cardBorderClass: "border-gray-200",
    cardBgClass: "bg-white",
    iconBgClass: "bg-blue-50",
    iconTextClass: "text-blue-500",
    hoverClass: "hover:bg-gray-100",
    accentColor: "rgb(37, 99, 235)",
    accentSoftBg: "rgba(37, 99, 235, 0.2)",
  }),
}));

const openInNewTab = vi.fn();
vi.mock("@/stores/useTabStore", () => ({
  __esModule: true,
  default: (
    selector: (state: { openInNewTab: typeof openInNewTab }) => unknown,
  ) => selector({ openInNewTab }),
}));

const BASE_TIME = new Date("2026-06-21T08:00:00.000Z").getTime();

const presets: PomodoroPreset[] = [
  {
    id: 1,
    name: "专注",
    mode: "countdown",
    durationMin: 25,
    sortOrder: 0,
    archived: false,
    createTime: BASE_TIME,
    updateTime: BASE_TIME,
  },
  {
    id: 2,
    name: "阅读",
    mode: "countdown",
    durationMin: 15,
    sortOrder: 1024,
    archived: false,
    createTime: BASE_TIME,
    updateTime: BASE_TIME,
  },
  {
    id: 3,
    name: "写作",
    mode: "countup",
    durationMin: 25,
    sortOrder: 2048,
    archived: false,
    createTime: BASE_TIME,
    updateTime: BASE_TIME,
  },
  {
    id: 4,
    name: "很少用",
    mode: "countdown",
    durationMin: 45,
    sortOrder: 3072,
    archived: false,
    createTime: BASE_TIME,
    updateTime: BASE_TIME,
  },
];

const createSession = (
  overrides: Partial<PomodoroSession> = {},
): PomodoroSession => ({
  id: 1,
  presetId: 1,
  startTime: BASE_TIME,
  expectedMs: 25 * 60_000,
  focusMs: 0,
  pauseTotalMs: 0,
  pauseCount: 0,
  pauses: [],
  status: "running",
  createTime: BASE_TIME,
  updateTime: BASE_TIME,
  ...overrides,
});

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

const renderPanel = (
  activeSession: PomodoroSession | null,
  handlers: {
    onPauseSession?: () => void;
    onResumeSession?: () => void;
    onStopSession?: () => void;
  } = {},
) => (
  <PomodoroPanel
    todayStats={{ count: 0, focusMs: 0 }}
    activeSession={activeSession}
    presets={presets}
    onPauseSession={handlers.onPauseSession}
    onResumeSession={handlers.onResumeSession}
    onStopSession={handlers.onStopSession}
  />
);

const renderPanelWithRecentSessions = (recentSessions: PomodoroSession[]) => (
  <PomodoroPanel
    todayStats={{ count: 0, focusMs: 0 }}
    activeSession={null}
    presets={presets}
    recentSessions={recentSessions}
  />
);

const renderPanelWithTodaySessions = (todaySessions: PomodoroSession[]) => (
  <PomodoroPanel
    todayStats={{ count: todaySessions.length, focusMs: 45 * 60_000 }}
    activeSession={null}
    presets={presets}
    recentSessions={todaySessions}
    todaySessions={todaySessions}
  />
);

describe("PomodoroPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME + 30_000);
    openInNewTab.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("运行中的倒计时应显示秒级时间并每秒刷新", async () => {
    const { root, container } = await mount(renderPanel(createSession()));

    expect(container.textContent).toContain("24:30");

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });

    expect(container.textContent).toContain("24:29");

    await unmount(root, container);
  });

  it("暂停态应显示暂停瞬间的剩余时间，时间推进后不继续倒扣", async () => {
    const pauseStart = BASE_TIME + 30_000;
    const session = createSession({
      status: "paused",
      pauses: [{ start: pauseStart }],
      pauseCount: 1,
      updateTime: pauseStart,
    });

    const { root, container } = await mount(renderPanel(session));

    expect(container.textContent).toContain("24:30");

    await act(async () => {
      vi.advanceTimersByTime(10 * 60_000);
    });

    expect(container.textContent).toContain("24:30");

    await unmount(root, container);
  });

  it("正计时运行中应显示当前已专注时长并每秒刷新", async () => {
    const { root, container } = await mount(
      renderPanel(
        createSession({
          expectedMs: undefined,
          focusMs: 0,
        }),
      ),
    );

    expect(container.textContent).toContain("00:30");

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(container.textContent).toContain("00:35");

    await unmount(root, container);
  });

  it("进行中应显示当前预设名称", async () => {
    const { root, container } = await mount(renderPanel(createSession()));

    expect(container.textContent).toContain("专注");

    await unmount(root, container);
  });

  it("运行中点击暂停按钮应触发 onPauseSession", async () => {
    const onPauseSession = vi.fn();
    const { root, container } = await mount(
      renderPanel(createSession(), { onPauseSession }),
    );

    const pauseBtn = container.querySelector(
      'button[title="暂停"]',
    ) as HTMLButtonElement;
    expect(pauseBtn).toBeTruthy();

    await act(async () => {
      pauseBtn.click();
    });

    expect(onPauseSession).toHaveBeenCalledTimes(1);

    await unmount(root, container);
  });

  it("暂停态点击继续按钮应触发 onResumeSession", async () => {
    const onResumeSession = vi.fn();
    const pauseStart = BASE_TIME + 30_000;
    const session = createSession({
      status: "paused",
      pauses: [{ start: pauseStart }],
      pauseCount: 1,
      updateTime: pauseStart,
    });

    const { root, container } = await mount(
      renderPanel(session, { onResumeSession }),
    );

    const resumeBtn = container.querySelector(
      'button[title="继续"]',
    ) as HTMLButtonElement;
    expect(resumeBtn).toBeTruthy();

    await act(async () => {
      resumeBtn.click();
    });

    expect(onResumeSession).toHaveBeenCalledTimes(1);

    await unmount(root, container);
  });

  it("进行中点击停止按钮应触发 onStopSession", async () => {
    const onStopSession = vi.fn();
    const { root, container } = await mount(
      renderPanel(createSession(), { onStopSession }),
    );

    const stopBtn = container.querySelector(
      'button[title="停止"]',
    ) as HTMLButtonElement;
    expect(stopBtn).toBeTruthy();

    await act(async () => {
      stopBtn.click();
    });

    expect(onStopSession).toHaveBeenCalledTimes(1);

    await unmount(root, container);
  });

  it("点击查看全部应通过 openInNewTab 跳转番茄钟 Tab", async () => {
    const { root, container } = await mount(renderPanel(null));

    const viewAllBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("查看全部"),
    ) as HTMLButtonElement;
    expect(viewAllBtn).toBeTruthy();

    await act(async () => {
      viewAllBtn.click();
    });

    expect(openInNewTab).toHaveBeenCalledTimes(1);

    await unmount(root, container);
  });

  it("快捷开始应优先展示最近使用过的预设", async () => {
    const recentSessions = [
      createSession({
        id: 11,
        presetId: 3,
        startTime: BASE_TIME + 3_000,
      }),
      createSession({
        id: 10,
        presetId: 2,
        startTime: BASE_TIME + 2_000,
      }),
      createSession({
        id: 9,
        presetId: 1,
        startTime: BASE_TIME + 1_000,
      }),
    ];
    const { root, container } = await mount(
      renderPanelWithRecentSessions(recentSessions),
    );

    const buttons = Array.from(container.querySelectorAll("button"))
      .map((button) => button.textContent)
      .filter((text) => text && text !== "查看全部");
    expect(buttons).toEqual(["写作", "阅读15m", "专注25m"]);
    expect(container.textContent).not.toContain("很少用");

    await unmount(root, container);
  });

  it("没有使用历史时快捷开始应回退到预设顺序", async () => {
    const { root, container } = await mount(renderPanelWithRecentSessions([]));

    const buttons = Array.from(container.querySelectorAll("button"))
      .map((button) => button.textContent)
      .filter((text) => text && text !== "查看全部");
    expect(buttons).toEqual(["专注25m", "阅读15m", "写作"]);

    await unmount(root, container);
  });

  it("显示今日已完成的专注记录", async () => {
    const todaySessions = [
      createSession({
        id: 21,
        presetId: 2,
        endTime: BASE_TIME + 45 * 60_000,
        focusMs: 15 * 60_000,
        status: "completed",
        updateTime: BASE_TIME + 45 * 60_000,
      }),
      createSession({
        id: 22,
        presetId: 3,
        endTime: BASE_TIME + 90 * 60_000,
        focusMs: 30 * 60_000,
        status: "completed",
        updateTime: BASE_TIME + 90 * 60_000,
      }),
    ];

    const { root, container } = await mount(
      renderPanelWithTodaySessions(todaySessions),
    );

    expect(container.textContent).toContain("今日记录");
    expect(container.textContent).toContain("写作");
    expect(container.textContent).toContain("阅读");
    expect(container.textContent).toContain("30分钟");
    expect(container.textContent).toContain("15分钟");

    await unmount(root, container);
  });
});
