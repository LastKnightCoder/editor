/**
 * 「专注于…」候选（纯函数）：今天的定时日程（排除番茄与标记）+ 未完成的顶层待办。
 * 日程按 进行中 → 即将开始 → 已过去 排序；待办沿用待办页议程口径（调用方传 openRoots 结果）。
 */

import type { CalendarEvent, PomodoroBindTarget } from "@/types";
import type { CalendarRole } from "@/features/schedule/eventTone";
import { eventEndMinutes, eventPhase, isMarker } from "@/features/schedule/ledger";
import type { TodoEntry } from "@/features/todos/types";
import { formatTime } from "@/utils/calendar";

export interface BindCandidate {
  key: string;
  group: "event" | "todo";
  target: PomodoroBindTarget;
  title: string;
  meta: string;
}

const PHASE_RANK = { live: 0, plan: 1, record: 2 } as const;
/** 无搜索词时的待办条数上限；搜索时全量过滤 */
export const TODO_LIMIT = 8;

export const sameTarget = (a: PomodoroBindTarget | null, b: PomodoroBindTarget | null) =>
  a === b ||
  (!!a &&
    !!b &&
    (a.kind === "event"
      ? b.kind === "event" && a.eventId === b.eventId
      : b.kind === "todo" && a.todoId === b.todoId));

export function eventCandidates(
  events: CalendarEvent[],
  roles: Map<number, CalendarRole>,
  nowMs: number
): BindCandidate[] {
  return events
    .filter(
      e => e.startTime !== null && !isMarker(e, roles) && roles.get(e.calendarId) !== "pomodoro"
    )
    .map(e => ({ event: e, phase: eventPhase(e, nowMs).kind }))
    .sort(
      (a, b) =>
        PHASE_RANK[a.phase] - PHASE_RANK[b.phase] ||
        // 已过去的越近越前，其余按开始时刻
        (a.phase === "record" ? -1 : 1) * ((a.event.startTime ?? 0) - (b.event.startTime ?? 0))
    )
    .map(({ event, phase }) => {
      const range = `${formatTime(event.startTime ?? 0)}–${formatTime(eventEndMinutes(event))}`;
      return {
        key: `event:${event.id}`,
        group: "event" as const,
        target: { kind: "event" as const, eventId: event.id },
        title: event.title,
        meta: phase === "live" ? `进行中 · ${range}` : range,
      };
    });
}

export function todoCandidates(roots: TodoEntry[]): BindCandidate[] {
  return roots.map(todo => ({
    key: `todo:${todo.id}`,
    group: "todo",
    target: { kind: "todo", todoId: todo.id },
    title: todo.title,
    meta: "待办",
  }));
}

/** 搜索：标题包含（不区分大小写）；无搜索词时待办只取前 TODO_LIMIT 条 */
export function filterCandidates(list: BindCandidate[], query: string): BindCandidate[] {
  const q = query.trim().toLowerCase();
  if (q) return list.filter(c => c.title.toLowerCase().includes(q));
  let todos = 0;
  return list.filter(c => c.group === "event" || ++todos <= TODO_LIMIT);
}
