import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Calendar, CalendarEvent } from "@/types";
import type { CalendarRole } from "../eventTone";

const DAY = new Date(2026, 9, 5).getTime();
const { createEvent, state } = vi.hoisted(() => ({
  createEvent: vi.fn(),
  state: { events: [] as CalendarEvent[] },
}));

const calendars = [
  { id: 1, title: "工作", color: "blue", archived: false, isInSystemGroup: false },
  { id: 2, title: "生活", color: "green", archived: false, isInSystemGroup: false },
  { id: 9, title: "截止任务", color: "red", archived: false, isInSystemGroup: true },
] as Calendar[];

vi.mock("@/components/FadeScroll", () => ({
  FadeScroll: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("../queries", () => ({
  useCalendarCatalog: () => ({ calendars, calendarGroups: [] }),
  useCalendarEvents: () => ({ events: state.events }),
  useCalendarRoles: () => new Map<number, CalendarRole>([[9, "deadline"]]),
  useCalendarKinds: () => new Map([[9, "todo"]]),
  useTodoEventSources: () => ({}),
  useToggleTodoEvent: () => () => undefined,
  usePomodoroBindings: () => ({}),
  useScheduleMutations: () => ({ createEvent }),
}));

import { useScheduleStore } from "../uiStore";
import { DayColumn } from "../components/DayColumn";

let seq = 0;
function ev(start: number, end: number | null, calendarId = 1): CalendarEvent {
  return {
    id: ++seq,
    createTime: 0,
    updateTime: 0,
    calendarId,
    title: `日程${seq}`,
    detailContentId: 0,
    startDate: DAY,
    endDate: DAY,
    startTime: start,
    endTime: end,
    color: null,
    allDay: false,
  };
}

let root: Root | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 5, 15, 0));
  createEvent.mockReset();
  createEvent.mockResolvedValue(1);
  useScheduleStore.setState({ currentDate: DAY });
  state.events = [ev(9 * 60, 10 * 60), ev(10 * 60 + 30, null, 9), ev(11 * 60, 12 * 60)];
});
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  host?.remove();
  vi.useRealTimers();
});

async function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<DayColumn />));
}

const gapButton = () =>
  [...host.querySelectorAll("button")].find(b => b.textContent?.includes("补记 10:00–11:00"));
const gapInput = () => host.querySelector<HTMLInputElement>('input[aria-label^="补记"]');
function openGap() {
  const button = gapButton();
  if (!button) throw new Error("未找到补记空隙");
  button.click();
}
function input() {
  const el = gapInput();
  if (!el) throw new Error("未找到补记输入框");
  return el;
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
const key = (input: HTMLInputElement, name: string) =>
  input.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));

describe("当日时间线补记", () => {
  it("截止标记不切断空隙；回车按空隙起止创建，#日历 摘出后其余原样作标题", async () => {
    await mount();
    expect(gapButton()).toBeDefined();
    await act(async () => openGap());
    await act(async () => type(input(), "和老王 3点 对需求 #生活"));
    await act(async () => key(input(), "Enter"));
    expect(createEvent).toHaveBeenCalledWith({
      title: "和老王 3点 对需求",
      calendarId: 2,
      detailContentId: 0,
      startDate: DAY,
      endDate: DAY,
      startTime: 600,
      endTime: 660,
      color: null,
      allDay: false,
    });
    expect(gapInput()).toBeNull();
  });

  it("没有 #日历 落默认日历；创建失败保留输入", async () => {
    createEvent.mockRejectedValueOnce(new Error("写入失败"));
    await mount();
    await act(async () => openGap());
    await act(async () => type(input(), "通勤"));
    await act(async () => key(input(), "Enter"));
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ calendarId: 1 }));
    expect(gapInput()?.value).toBe("通勤");
  });

  it("Esc 取消且不冒泡；空内容失焦收起，有内容失焦保留", async () => {
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    await mount();
    await act(async () => openGap());
    await act(async () => key(input(), "Escape"));
    expect(gapInput()).toBeNull();
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener("keydown", outer);

    await act(async () => openGap());
    await act(async () => input().blur());
    expect(gapInput()).toBeNull();

    await act(async () => openGap());
    await act(async () => type(input(), "读书"));
    await act(async () => input().blur());
    expect(gapInput()?.value).toBe("读书");
    expect(createEvent).not.toHaveBeenCalled();
  });
});
