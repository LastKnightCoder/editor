import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@/types";

const mocks = vi.hoisted(() => ({ scheduleTodo: vi.fn(), events: [] as CalendarEvent[] }));
vi.mock("../uiStore", async () => {
  const { create } = await import("zustand");
  return {
    useScheduleStore: create<{
      currentDate: number;
      editingEvent: CalendarEvent | null;
      setCurrentDate(day: number): void;
      setEditingEvent(event: CalendarEvent | null): void;
    }>(set => ({
      currentDate: 0,
      editingEvent: null,
      setCurrentDate: currentDate => set({ currentDate }),
      setEditingEvent: editingEvent => set({ editingEvent }),
    })),
  };
});
vi.mock("../queries", () => ({
  useCalendarCatalog: () => ({ calendars: [{ id: 1, title: "工作", color: "blue" }] }),
  useCalendarEvents: () => ({ events: mocks.events }),
}));
vi.mock("../components/EventTitle", () => ({
  useEventDecor: () => () => ({}),
  EventTitle: ({ event }: { event: CalendarEvent }) => <span>{event.title}</span>,
}));
vi.mock("../todoDrop", async importOriginal => ({
  ...(await importOriginal<typeof import("../todoDrop")>()),
  useScheduleTodo: () => mocks.scheduleTodo,
}));

import MonthView from "../components/MonthView";
import { useScheduleStore } from "../uiStore";
import { TODO_DRAG_TYPE } from "@/features/todos/model";

const day = (date: number) => new Date(2026, 9, date).getTime();
let host: HTMLDivElement;
let root: Root;
let grid: HTMLElement;
const cells = () => [...host.querySelectorAll<HTMLElement>("[data-month-day]")];
const cell = (date: number) => host.querySelector<HTMLElement>(`[data-month-day="${date}"]`)!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
  useScheduleStore.setState({ currentDate: day(8), editingEvent: null });
  mocks.events = [
    {
      id: 7,
      calendarId: 1,
      title: "跨天安排",
      startDate: day(7),
      endDate: day(9),
      startTime: null,
      endTime: null,
      allDay: true,
      color: null,
      detailContentId: 0,
      createTime: 0,
      updateTime: 0,
    },
  ];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<MonthView />));
  grid = host.querySelector<HTMLElement>("[data-month-grid]")!;
  vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({
    left: 20,
    top: 30,
    width: 700,
    height: 500,
    right: 720,
    bottom: 530,
    x: 20,
    y: 30,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function drag(
  type: string,
  target: Element | Document,
  date: number,
  options: {
    id?: string;
    types?: string[];
    clientX?: number;
    clientY?: number;
    relatedTarget?: EventTarget | null;
  } = {}
) {
  const index = cells().findIndex(element => Number(element.dataset.monthDay) === date);
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: options.clientX ?? 20 + (index % 7) * 100 + 50,
    clientY: options.clientY ?? 30 + Math.floor(index / 7) * (500 / (cells().length / 7)) + 40,
    relatedTarget: options.relatedTarget,
  });
  const dataTransfer = {
    types: options.types ?? [TODO_DRAG_TYPE],
    getData: (key: string) => (key === TODO_DRAG_TYPE ? (options.id ?? "3") : ""),
    dropEffect: "none",
  };
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  act(() => target.dispatchEvent(event));
  return { event, dataTransfer };
}

it("空白格与日期文字接受待办，松手一次只建一条全天安排", () => {
  const target = cell(day(12));
  const blank = target.querySelector<HTMLElement>(".flex-1")!;
  const { event, dataTransfer } = drag("dragover", blank, day(12));
  expect(event.defaultPrevented).toBe(true);
  expect(dataTransfer.dropEffect).toBe("copy");
  expect(target.classList.contains("bg-accent-soft")).toBe(true);
  drag("drop", target.querySelector("span")!, day(12));
  expect(mocks.scheduleTodo).toHaveBeenCalledExactlyOnceWith(3, day(12), null);
  expect(target.classList.contains("bg-accent-soft")).toBe(false);
  expect(useScheduleStore.getState()).toMatchObject({ currentDate: day(8), editingEvent: null });
});

it("跨天日程覆盖层按指针所在日期落下，而非事件起始日", () => {
  const bar = host.querySelector<HTMLElement>('[title="跨天安排"]')!;
  drag("dragover", bar.querySelector("span")!, day(8));
  expect(cell(day(8)).classList.contains("bg-accent-soft")).toBe(true);
  drag("drop", bar, day(8));
  expect(mocks.scheduleTodo).toHaveBeenCalledExactlyOnceWith(3, day(8), null);
});

it.each([new Date(2026, 8, 28).getTime(), new Date(2026, 10, 1).getTime()])(
  "邻月日期 %s 可落下且不切换月份",
  date => {
    drag("drop", cell(date), date);
    expect(mocks.scheduleTodo).toHaveBeenCalledExactlyOnceWith(3, date, null);
    expect(useScheduleStore.getState().currentDate).toBe(day(8));
  }
);

it.each(["", "0", "-1", "1.5", "abc"])("非法待办 ID %s 不创建", id => {
  drag("dragover", grid, day(8));
  drag("drop", grid, day(8), { id });
  expect(mocks.scheduleTodo).not.toHaveBeenCalled();
  expect(cell(day(8)).classList.contains("bg-accent-soft")).toBe(false);
});

it("非待办拖拽不接收、不创建", () => {
  const { event } = drag("dragover", grid, day(8), { types: ["text/plain"] });
  expect(event.defaultPrevented).toBe(false);
  drag("drop", grid, day(8), { types: ["text/plain"] });
  expect(mocks.scheduleTodo).not.toHaveBeenCalled();
});

it.each([{ clientX: 19 }, { clientX: 720 }, { clientY: 29 }, { clientY: 530 }])(
  "网格外落点 %j 不创建",
  coordinates => {
    const { event } = drag("dragover", grid, day(8), coordinates);
    expect(event.defaultPrevented).toBe(false);
    drag("drop", grid, day(8), coordinates);
    expect(mocks.scheduleTodo).not.toHaveBeenCalled();
  }
);

it("进入子元素不清高亮，换格移动高亮；离开及取消拖拽清除", () => {
  drag("dragover", grid, day(8));
  drag("dragleave", grid, day(8), { relatedTarget: cell(day(8)).querySelector("span") });
  expect(cell(day(8)).classList.contains("bg-accent-soft")).toBe(true);
  drag("dragover", grid, day(12));
  expect(cell(day(8)).classList.contains("bg-accent-soft")).toBe(false);
  expect(cell(day(12)).classList.contains("bg-accent-soft")).toBe(true);
  drag("dragleave", grid, day(12));
  expect(cell(day(12)).classList.contains("bg-accent-soft")).toBe(false);
  drag("dragover", grid, day(8));
  drag("dragend", document, day(8));
  expect(cell(day(8)).classList.contains("bg-accent-soft")).toBe(false);
  expect(mocks.scheduleTodo).not.toHaveBeenCalled();
});

it("保留日期点击与双击创建全天日程", () => {
  act(() => cell(day(12)).click());
  expect(useScheduleStore.getState().currentDate).toBe(day(12));
  act(() => cell(day(12)).dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
  expect(useScheduleStore.getState().editingEvent).toMatchObject({
    startDate: day(12),
    allDay: true,
  });
  expect(useScheduleStore.getState().editingEvent?.todoItemId).toBeUndefined();
  expect(mocks.scheduleTodo).not.toHaveBeenCalled();
});
