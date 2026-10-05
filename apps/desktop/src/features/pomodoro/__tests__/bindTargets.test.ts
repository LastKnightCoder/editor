import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/types";
import type { CalendarRole } from "@/features/schedule/eventTone";
import type { TodoEntry } from "@/features/todos/types";
import {
  TODO_LIMIT,
  eventCandidates,
  filterCandidates,
  sameTarget,
  todoCandidates,
} from "../bindTargets";

const DAY = new Date(2026, 9, 5).getTime();
const at = (h: number, m = 0) => DAY + (h * 60 + m) * 60_000;
const roles = new Map<number, CalendarRole>([
  [9, "pomodoro"],
  [11, "deadline"],
  [12, "planned"],
]);

let seq = 0;
const ev = (start: number | null, end: number | null, calendarId = 1, title = `e${++seq}`) =>
  ({
    id: ++seq,
    createTime: 0,
    updateTime: 0,
    calendarId,
    title,
    detailContentId: 0,
    startDate: DAY,
    endDate: null,
    startTime: start,
    endTime: end,
    color: null,
    allDay: start === null,
  }) satisfies CalendarEvent;

describe("eventCandidates", () => {
  it("排除番茄、标记与全天；按 进行中 → 即将开始 → 已过去（越近越前）", () => {
    const list = eventCandidates(
      [
        ev(8 * 60, 9 * 60, 1, "晨读"),
        ev(16 * 60, 17 * 60, 1, "健身"),
        ev(10 * 60, 11 * 60, 1, "站会"),
        ev(13 * 60, 15 * 60, 12, "写季度报告"),
        ev(14 * 60, 14 * 60 + 25, 9, "🍅 深度工作"),
        ev(18 * 60, null, 11, "提交报告"),
        ev(null, null, 1, "全天"),
        ev(19 * 60, 20 * 60, 1, "读书会"),
      ],
      roles,
      at(14, 30)
    );
    expect(list.map(c => c.title)).toEqual(["写季度报告", "健身", "读书会", "站会", "晨读"]);
    expect(list[0]).toMatchObject({ meta: "进行中 · 13:00–15:00", group: "event" });
    expect(list[1].meta).toBe("16:00–17:00");
  });
});

describe("filterCandidates", () => {
  const todos = todoCandidates(
    Array.from({ length: 10 }, (_, i) => ({ id: i + 1, title: `待办 ${i + 1}` }) as TodoEntry)
  );
  const events = eventCandidates([ev(9 * 60, 10 * 60, 1, "Rust 读书会")], roles, at(8));

  it("无搜索词：日程全留，待办取前 TODO_LIMIT 条", () => {
    const list = filterCandidates([...events, ...todos], "");
    expect(list.filter(c => c.group === "todo")).toHaveLength(TODO_LIMIT);
    expect(list.filter(c => c.group === "event")).toHaveLength(1);
  });
  it("搜索：标题包含、不区分大小写，待办不再截断", () => {
    expect(filterCandidates([...events, ...todos], "rust").map(c => c.title)).toEqual([
      "Rust 读书会",
    ]);
    expect(filterCandidates(todos, "待办 1").map(c => c.title)).toEqual(["待办 1", "待办 10"]);
  });
});

it("sameTarget 按种类与 id 比较", () => {
  expect(sameTarget({ kind: "event", eventId: 1 }, { kind: "event", eventId: 1 })).toBe(true);
  expect(sameTarget({ kind: "event", eventId: 1 }, { kind: "todo", todoId: 1 })).toBe(false);
  expect(sameTarget(null, null)).toBe(true);
  expect(sameTarget({ kind: "todo", todoId: 2 }, null)).toBe(false);
});
