import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CalendarEvent, TodoScheduleSummary } from "@/types";
import type { TodoEntry, TodoSnapshot } from "@/features/todos/types";

const NOW = new Date(2026, 9, 5, 12, 0).getTime();
const mocks = vi.hoisted(() => ({
  setCompleted: vi.fn(),
  snapshot: undefined as TodoSnapshot | undefined,
  schedules: {} as Record<number, TodoScheduleSummary>,
}));

vi.mock("@/components/FadeScroll", () => ({
  FadeScroll: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/features/todos/queries", () => ({
  useTodoSnapshot: () => ({ snapshot: mocks.snapshot, loading: false }),
  useTodoMutations: () => ({ setCompleted: mocks.setCompleted }),
}));
vi.mock("../queries", () => ({ useTodoSchedules: () => mocks.schedules }));

import { TodoPanel } from "../components/TodoPanel";
import { TODO_DRAG_TYPE } from "@/features/todos/model";

const entry = (id: number, patch: Partial<TodoEntry> = {}): TodoEntry =>
  ({
    id,
    groupId: 1,
    parentId: null,
    title: `待办${id}`,
    type: "normal",
    isCompleted: false,
    sortIndex: id,
    isArchived: false,
    createTime: 0,
    updateTime: 0,
    recurrence: null,
    occurrences: new Map(),
    noteLinks: [],
    childIds: [],
    ...patch,
  }) as TodoEntry;

const event = (startDate: number, startTime: number): CalendarEvent =>
  ({ id: 1, startDate, startTime, endTime: startTime + 60, allDay: false }) as CalendarEvent;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.setCompleted.mockReset();
  const entries = [
    entry(1, { title: "写季度报告" }),
    entry(2, { title: "每天读书", type: "recurring" }),
    entry(3, { title: "已完成", isCompleted: true }),
    entry(4, { title: "子任务", parentId: 1 }),
    entry(5, { title: "换灯泡", groupId: 2 }),
    entry(6, { title: "交房租", type: "deadline", dueAt: new Date(2026, 9, 8).getTime() }),
  ];
  mocks.snapshot = {
    groups: [
      { id: 1, title: "工作", color: "blue" },
      { id: 2, title: "生活", color: "green" },
    ],
    archivedGroups: [],
    entries,
    byId: new Map(entries.map(e => [e.id, e])),
  } as unknown as TodoSnapshot;
  mocks.schedules = {
    1: { count: 2, next: event(new Date(2026, 9, 7).getTime(), 540) },
    5: { count: 1, last: event(new Date(2026, 9, 2).getTime(), 600) },
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const rows = () => [...host.querySelectorAll<HTMLElement>("[draggable=true]")];

it("只列未完成的顶层非周期待办，按项目分组，meta 写安排或截止", () => {
  act(() => root.render(<TodoPanel onClose={vi.fn()} />));
  // 组内沿用待办页议程顺序：有日期的在前
  expect(rows().map(r => r.textContent)).toEqual([
    expect.stringContaining("交房租"),
    expect.stringContaining("写季度报告"),
    expect.stringContaining("换灯泡"),
  ]);
  expect(rows()[0].textContent).toContain("截止 · ");
  expect(rows()[1].textContent).toContain("已安排 · ");
  expect(rows()[1].textContent).toContain("09:00");
  expect(rows()[2].textContent).toContain("上次安排 · ");
  expect(host.textContent).toContain("工作");
  expect(host.textContent).toContain("生活");
});

it("拖动写入待办 id；勾选完成", () => {
  act(() => root.render(<TodoPanel onClose={vi.fn()} />));
  const data = new Map<string, string>();
  const dragStart = new Event("dragstart", { bubbles: true }) as DragEvent;
  Object.defineProperty(dragStart, "dataTransfer", {
    value: { setData: (k: string, v: string) => data.set(k, v), effectAllowed: "" },
  });
  act(() => rows()[2].dispatchEvent(dragStart));
  expect(data.get(TODO_DRAG_TYPE)).toBe("5");

  act(() => rows()[1].querySelector<HTMLElement>('[role="checkbox"]')!.click());
  expect(mocks.setCompleted).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), true);
});

it("搜索过滤", () => {
  act(() => root.render(<TodoPanel onClose={vi.fn()} />));
  const input = host.querySelector<HTMLInputElement>('input[aria-label="搜索待办"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, "灯泡");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(rows().map(r => r.textContent)).toEqual([expect.stringContaining("换灯泡")]);
});
