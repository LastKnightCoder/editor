import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CalendarEvent, PomodoroPreset, PomodoroSession } from "@/types";
import { usePomodoroTimer } from "../timerStore";
import { PomodoroView } from "../views/PomodoroView";

const MIN = 60_000;
const NOW = new Date(2026, 8, 24, 14, 20).getTime();

const mocks = vi.hoisted(() => ({
  presets: [] as PomodoroPreset[],
  sessions: [] as PomodoroSession[],
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  events: [] as CalendarEvent[],
}));

vi.mock("@/commands/pomodoro", () => ({
  listPomodoroPresets: () => Promise.resolve(mocks.presets),
  listPomodoroSessions: (params: { offset?: number; limit?: number } = {}) =>
    Promise.resolve(
      mocks.sessions.slice(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? Infinity))
    ),
  startPomodoroSession: mocks.start,
  stopPomodoroSession: mocks.stop,
  pausePomodoroSession: mocks.pause,
  resumePomodoroSession: mocks.resume,
  getActivePomodoroSession: () => Promise.resolve(null),
  summaryPomodoroTotal: () => Promise.resolve({ count: mocks.sessions.length, focusMs: 0 }),
  getBackgroundSound: () => Promise.resolve({ backgroundSound: null, backgroundVolume: 50 }),
  setBackgroundSound: vi.fn(),
  createPomodoroPreset: vi.fn(),
  updatePomodoroPreset: vi.fn(),
  archivePomodoroPreset: vi.fn(),
  deletePomodoroPreset: vi.fn(),
  reorderPomodoroPresets: vi.fn(),
  deletePomodoroSession: vi.fn(),
  updatePomodoroSession: vi.fn(),
}));
vi.mock("@/features/schedule/queries", () => ({
  useEventsOfDay: () => mocks.events,
  useCalendarRoles: () => new Map(),
}));
vi.mock("@/features/todos/queries", () => ({
  useTodoSnapshot: () => ({ snapshot: undefined, loading: false }),
}));
vi.mock("@/commands/window", () => ({
  openPomodoroMiniWindow: vi.fn(),
  openPomodoroImmersiveWindow: vi.fn(),
}));
vi.mock("@/page/PageProvider", () => ({
  usePage: () => ({ navigator: { current: () => ({ key: "pomodoro" }) } }),
  useOverlayDismiss: vi.fn(),
}));

const preset = (id: number, name: string, durationMin = 25): PomodoroPreset => ({
  id,
  name,
  mode: durationMin ? "countdown" : "countup",
  durationMin,
  sortOrder: id,
  archived: false,
  createTime: 0,
  updateTime: 0,
});
const record = (
  id: number,
  start: number,
  focusMin: number,
  expectedMin?: number
): PomodoroSession => ({
  id,
  presetId: 1,
  startTime: start,
  endTime: start + focusMin * MIN,
  expectedMs: expectedMin ? expectedMin * MIN : undefined,
  focusMs: focusMin * MIN,
  pauseTotalMs: 0,
  pauseCount: 0,
  pauses: [],
  status: "completed",
  createTime: 0,
  updateTime: 0,
});

let container: HTMLDivElement;
let root: Root;
const text = () => container.textContent ?? "";
const flush = async () => {
  // 查询链（最早记录 = 总数 → 按偏移取一条）需要多轮微任务才落定
  for (let i = 0; i < 5; i++)
    await act(async () => void (await new Promise(r => setTimeout(r, 0))));
};
const render = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <PomodoroView />
      </QueryClientProvider>
    )
  );
  await flush();
  await flush();
};
const buttonByText = (label: string) =>
  [...container.querySelectorAll("button")].find(b => b.textContent?.includes(label));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.presets = [preset(1, "具体数学"), preset(2, "英语听力", 30), preset(3, "编程", 0)];
  mocks.sessions = [
    record(11, NOW - 50 * MIN, 22, 30),
    record(10, NOW - 4 * 60 * MIN, 25, 25),
    record(9, NOW - 40 * 24 * 60 * MIN, 25, 25),
  ];
  for (const fn of [mocks.start, mocks.stop, mocks.pause, mocks.resume]) fn.mockReset();
  mocks.start.mockResolvedValue(null);
  usePomodoroTimer.setState({ session: null, lastResult: null, ready: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
});

it("空闲：左栏列出预设（带数字键），今天摘要来自近期会话；点当天行打开明细抽屉，再点收起", async () => {
  await render();
  const chip = container.querySelector('[data-preset-chip="2"]');
  expect(chip?.textContent).toContain("英语听力");
  expect(chip?.textContent).toContain("30′");
  expect(chip?.querySelector("kbd")?.textContent).toBe("2");
  expect(text()).toContain("今天 2 个");
  expect(text()).toContain("时段分布");
  expect(container.querySelector('[aria-label="当天明细"]')).toBeNull();

  const todayRow = () =>
    [...container.querySelectorAll('[role="button"]')].find(el =>
      el.textContent?.startsWith("今天")
    ) as HTMLElement;
  act(() => todayRow().click());
  await flush();
  const drawer = container.querySelector('[aria-label="当天明细"]') as HTMLElement;
  expect(drawer.textContent).toContain("提前结束");
  expect(todayRow().getAttribute("aria-current")).toBe("true");

  act(() => todayRow().click());
  expect(todayRow().getAttribute("aria-current")).toBeNull();
});

it("点行尾 ▶ 即开始：倒计时带预期时长，正计时不带", async () => {
  await render();
  act(() => (container.querySelector('[data-preset-start="1"]') as HTMLElement).click());
  expect(mocks.start).toHaveBeenCalledWith({
    presetId: 1,
    expectedMs: 25 * MIN,
    target: undefined,
  });
  act(() => (container.querySelector('[data-preset-start="3"]') as HTMLElement).click());
  expect(mocks.start).toHaveBeenLastCalledWith({
    presetId: 3,
    expectedMs: undefined,
    target: undefined,
  });
});

it("点预设行打开详情抽屉（不开始），抽屉内开始；再点同一行收起", async () => {
  await render();
  const row = () => container.querySelector('[data-preset-chip="1"]') as HTMLElement;
  act(() => row().click());
  await flush();
  expect(mocks.start).not.toHaveBeenCalled();
  const drawer = container.querySelector('[aria-label="预设详情"]') as HTMLElement;
  expect(drawer.textContent).toContain("倒计时 25 分钟");
  expect(drawer.textContent).toContain("近 90 天3 个");
  expect(row().getAttribute("aria-current")).toBe("true");
  const startBtn = [...drawer.querySelectorAll("button")].find(b =>
    b.textContent?.includes("开始专注")
  );
  act(() => startBtn!.click());
  expect(mocks.start).toHaveBeenCalledWith({
    presetId: 1,
    expectedMs: 25 * MIN,
    target: undefined,
  });
  act(() => row().click());
  expect(row().getAttribute("aria-current")).toBeNull();
});

it("数字键开始第 N 个预设（空闲时）", async () => {
  await render();
  act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" })));
  expect(mocks.start).toHaveBeenCalledWith({
    presetId: 2,
    expectedMs: 30 * MIN,
    target: undefined,
  });
});

it("专注中：播放器显示剩余；不足 5 分钟结束先弹确认，确认后按未到点结束", async () => {
  await render();
  act(() =>
    usePomodoroTimer.setState({
      session: { ...record(99, NOW - 3 * MIN, 0, 25), endTime: undefined, status: "running" },
    })
  );
  expect(text()).toContain("22:00");
  expect(text()).toContain("剩余");
  act(() => (container.querySelector('button[aria-label="结束"]') as HTMLElement).click());
  expect(mocks.stop).not.toHaveBeenCalled();
  // 确认对话框经 Portal 渲染在 body 下，不在页面容器里
  const dialog = document.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement;
  expect(dialog.textContent).toContain("不足 5 分钟");
  const confirm = [...dialog.querySelectorAll("button")].find(b =>
    b.textContent?.includes("仍然结束")
  );
  act(() => confirm!.click());
  expect(mocks.stop).toHaveBeenCalledWith(false);
});

it("专注中：空格暂停继续，焦点在输入框时不接管", async () => {
  await render();
  act(() =>
    usePomodoroTimer.setState({
      session: { ...record(99, NOW - 10 * MIN, 0, 25), endTime: undefined, status: "running" },
    })
  );
  act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: " " })));
  expect(mocks.pause).toHaveBeenCalledTimes(1);
  const input = document.createElement("input");
  document.body.appendChild(input);
  act(() => void input.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
  expect(mocks.pause).toHaveBeenCalledTimes(1);
});

it("账本：时间面板选「全部」显示概览，再选近 7 天回到按天账本", async () => {
  await render();
  expect(text()).toContain("近 14 天");
  const pick = async (label: string) => {
    const trigger = (buttonByText("近 14 天") ?? buttonByText("全部")) as HTMLElement;
    act(() => trigger.click());
    await flush();
    const item = [...document.querySelectorAll("[data-float-card] button")].find(b =>
      b.textContent?.startsWith(label)
    ) as HTMLElement;
    act(() => item.click());
    await flush();
  };
  await pick("全部");
  expect(text()).toContain("累计专注");
  expect(container.querySelector('button[aria-label="往前 14 天"]')).toBeNull();
  await pick("近 7 天");
  expect(text()).toContain("7 天 ·");
  expect(container.querySelector('button[aria-label="往前 7 天"]')).not.toBeNull();
});

it("账本：往前翻页后标题变为日期范围并出现「回到今天」", async () => {
  await render();
  act(() => (container.querySelector('button[aria-label="往前 14 天"]') as HTMLElement).click());
  await flush();
  expect(text()).toContain("8月28日 – 9月10日");
  act(() => buttonByText("回到今天")!.click());
  await flush();
  expect(text()).toContain("近 14 天");
});

it("开始前选「专注于…」，▶ 与数字键都带上；开始后清空", async () => {
  mocks.events = [
    {
      id: 40,
      createTime: 0,
      updateTime: 0,
      calendarId: 1,
      title: "写季度报告",
      detailContentId: 0,
      startDate: new Date(2026, 8, 24).getTime(),
      endDate: null,
      startTime: 14 * 60,
      endTime: 16 * 60,
      color: null,
      allDay: false,
    },
  ];
  await render();
  act(() => (container.querySelector('[aria-label="选择专注于什么"]') as HTMLElement).click());
  await flush();
  const option = [...document.querySelectorAll('[role="option"]')].find(el =>
    el.textContent?.includes("写季度报告")
  ) as HTMLElement;
  expect(option.textContent).toContain("进行中");
  act(() => option.click());
  expect(container.textContent).toContain("写季度报告");

  await act(async () =>
    (container.querySelector('[data-preset-start="1"]') as HTMLElement).click()
  );
  expect(mocks.start).toHaveBeenCalledWith({
    presetId: 1,
    expectedMs: 25 * MIN,
    target: { kind: "event", eventId: 40 },
  });
  expect(container.querySelector('[aria-label="选择专注于什么"]')).not.toBeNull();
  mocks.events = [];
});
