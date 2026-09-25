import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PomodoroPreset, PomodoroSession } from "@/types";
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
vi.mock("@/commands/window", () => ({
  openPomodoroMiniWindow: vi.fn(),
  openPomodoroImmersiveWindow: vi.fn(),
}));
vi.mock("@/page/PageProvider", () => ({
  usePage: () => ({ navigator: { current: () => ({ key: "pomodoro" }) } }),
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

it("空闲：控制条列出预设（带数字键），今天摘要与明细来自近期会话", async () => {
  await render();
  const chip = container.querySelector('[data-preset-chip="2"]');
  expect(chip?.textContent).toContain("英语听力");
  expect(chip?.textContent).toContain("30′");
  expect(chip?.querySelector("kbd")?.textContent).toBe("2");
  expect(text()).toContain("今天 2 个");
  expect(text()).toContain("提前结束");
  expect(text()).toContain("时段分布");
});

it("点预设即开始：倒计时带预期时长，正计时不带", async () => {
  await render();
  act(() => (container.querySelector('[data-preset-chip="1"]') as HTMLElement).click());
  expect(mocks.start).toHaveBeenCalledWith(1, 25 * MIN);
  act(() => (container.querySelector('[data-preset-chip="3"]') as HTMLElement).click());
  expect(mocks.start).toHaveBeenLastCalledWith(3, undefined);
});

it("数字键开始第 N 个预设（空闲时）", async () => {
  await render();
  act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" })));
  expect(mocks.start).toHaveBeenCalledWith(2, 30 * MIN);
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
