import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createDragDropManager } from "dnd-core";
import { HTML5Backend } from "react-dnd-html5-backend";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { scheduleTodo } = vi.hoisted(() => ({ scheduleTodo: vi.fn() }));
vi.mock("../queries", () => ({
  useCalendarCatalog: () => ({ calendars: [] }),
  useCalendarEvents: () => ({ events: [] }),
  useCalendarRoles: () => new Map(),
  useCalendarKinds: () => new Map(),
  useTodoEventSources: () => ({}),
  useToggleTodoEvent: () => vi.fn(),
  usePomodoroBindings: () => ({}),
  useScheduleMutations: () => ({ scheduleTodo, deleteEvent: vi.fn() }),
}));

import WeekView from "../components/WeekView";
import { useScheduleStore } from "../uiStore";
import { TODO_DRAG_TYPE } from "@/features/todos/model";

const DAY = new Date(2026, 9, 5).getTime();
const backend = createDragDropManager(HTML5Backend, window).getBackend();
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  backend.setup();
  scheduleTodo.mockReset().mockResolvedValue({ id: 99, title: "写报告" });
  useScheduleStore.setState({ currentDate: DAY, editingEvent: null });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<WeekView />));
});

afterEach(() => {
  backend.teardown();
  act(() => root.unmount());
  host.remove();
});

it("全局拖拽启用时待办仍可落入周视图的指定日期和时间", async () => {
  // 全局 HTML5 backend 曾在冒泡阶段把日历的 copy 改成 none，导致无法放下。
  const column = host.querySelectorAll<HTMLElement>("[data-week-col]")[2];
  if (!column) throw new Error("周视图日期列未挂载");
  vi.spyOn(column, "getBoundingClientRect").mockReturnValue({
    top: 20,
    left: 0,
    width: 100,
    height: 1152,
    bottom: 1172,
    right: 100,
    x: 0,
    y: 20,
    toJSON: () => ({}),
  });
  const dataTransfer = {
    types: [TODO_DRAG_TYPE],
    getData: (type: string) => (type === TODO_DRAG_TYPE ? "5" : ""),
    dropEffect: "none",
  };
  const fire = (type: string) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientY: 20 + 9.5 * 48,
    });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    column.dispatchEvent(event);
    return event;
  };

  act(() => {
    expect(fire("dragover").defaultPrevented).toBe(true);
  });
  expect(dataTransfer.dropEffect).toBe("copy");
  await act(async () => {
    fire("drop");
  });
  expect(scheduleTodo).toHaveBeenCalledExactlyOnceWith({
    todoItemId: 5,
    startDate: new Date(2026, 9, 7).getTime(),
    startTime: 570,
    endTime: 630,
  });
});
