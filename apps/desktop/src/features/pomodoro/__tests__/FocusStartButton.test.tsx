import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PomodoroPreset, PomodoroSession } from "@/types";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  bind: vi.fn(),
  push: vi.fn(),
  active: null as PomodoroSession | null,
  presets: [] as PomodoroPreset[],
}));

vi.mock("@/commands/pomodoro", () => ({
  listPomodoroPresets: () => Promise.resolve(mocks.presets),
  startPomodoroSession: mocks.start,
  updatePomodoroBinding: mocks.bind,
  getActivePomodoroSession: () => Promise.resolve(null),
  getBackgroundSound: () => Promise.resolve({ backgroundSound: null, backgroundVolume: 50 }),
}));
vi.mock("@/hooks/useActivePomodoro", () => ({ useActivePomodoro: () => mocks.active }));
vi.mock("@/page/PageProvider", () => ({ usePage: () => ({ navigator: { push: mocks.push } }) }));
vi.mock("@/commands/window", () => ({ openPomodoroMiniWindow: vi.fn() }));

import { FocusStartButton } from "../components/FocusStartButton";

const preset = (id: number, name: string, archived = false): PomodoroPreset => ({
  id,
  name,
  mode: "countdown",
  durationMin: 25,
  sortOrder: id,
  archived,
  createTime: 0,
  updateTime: 0,
});
const session = (patch: Partial<PomodoroSession>): PomodoroSession => ({
  id: 1,
  presetId: 1,
  startTime: 0,
  focusMs: 0,
  pauseTotalMs: 0,
  pauseCount: 0,
  pauses: [],
  status: "running",
  createTime: 0,
  updateTime: 0,
  ...patch,
});

let root: Root;
let host: HTMLDivElement;
const flush = () => act(async () => void (await new Promise(r => setTimeout(r, 0))));

beforeEach(() => {
  mocks.start.mockReset().mockResolvedValue(null);
  mocks.bind.mockReset().mockResolvedValue(null);
  mocks.push.mockReset();
  mocks.active = null;
  mocks.presets = [preset(1, "深度工作"), preset(2, "阅读"), preset(3, "旧预设", true)];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

async function mount(target = { kind: "event" as const, eventId: 40 }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <FocusStartButton target={target} title="写季度报告" />
      </QueryClientProvider>
    )
  );
  await flush();
}
const button = () => host.querySelector("button") as HTMLButtonElement;
const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];

it("没有进行中的番茄：先选预设（只列未归档），选中才开始并带上关联", async () => {
  await mount();
  expect(button().textContent).toBe("开始专注");
  act(() => button().click());
  await flush();
  expect(items().map(el => el.textContent?.replace(/\d+.*$/, ""))).toEqual(["深度工作", "阅读"]);
  expect(mocks.start).not.toHaveBeenCalled();
  await act(async () => items()[1].click());
  expect(mocks.start).toHaveBeenCalledWith({
    presetId: 2,
    target: { kind: "event", eventId: 40 },
  });
});

it("没有预设：菜单只给去番茄页新建", async () => {
  mocks.presets = [];
  await mount();
  act(() => button().click());
  await flush();
  expect(items().map(el => el.textContent)).toEqual(["去番茄页新建预设"]);
  act(() => items()[0].click());
  expect(mocks.push).toHaveBeenCalledWith("pomodoro", {});
});

it("有进行中的番茄：专注于此 = 改关联；已关联到这里时禁用", async () => {
  mocks.active = session({ boundTodoId: 9 });
  await mount();
  expect(button().textContent).toBe("专注于此");
  await act(async () => button().click());
  expect(mocks.bind).toHaveBeenCalledWith({ kind: "event", eventId: 40 });
  expect(mocks.start).not.toHaveBeenCalled();

  mocks.active = session({ boundEventId: 40, boundTodoId: 9 });
  await mount();
  expect(button().textContent).toBe("专注中");
  expect(button().disabled).toBe(true);
});
