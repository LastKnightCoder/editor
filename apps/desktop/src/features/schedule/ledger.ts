/**
 * 时间账本的纯函数（当日时间线与周视图共用）。
 *
 * - 计划 / 记录：按「现在」推断，已结束 = 记录，未开始 = 计划，跨过现在 = 进行中（不存状态）；
 * - 标记：全天日程与截止 / 周期任务不占时间，不进时间轴；
 * - 当日时间线条目：日程、过去空隙（补记）、未来空档（点击安排）、现在。
 */

import type { CalendarEvent } from "@/types";
import type { CalendarRole } from "./eventTone";

export type LedgerPhase =
  | { kind: "record" }
  | { kind: "plan" }
  /** split ∈ (0, 1)：已过去部分的比例 */
  | { kind: "live"; split: number };

const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;

/** 未来空档只在白天提示 */
export const DAY_FROM = 8 * 60;
export const DAY_TO = 22 * 60;
export const PLAN_GAP_MIN = 60;
export const RECORD_GAP_MIN = 15;

/** 定时日程的结束分钟：无结束时间按 1 小时 */
export const eventEndMinutes = (event: CalendarEvent) =>
  event.endTime ?? (event.startTime ?? 0) + 60;

export function eventPhase(event: CalendarEvent, nowMs: number): LedgerPhase {
  const startMs = event.startDate + (event.startTime ?? 0) * MINUTE;
  const endMs = (event.endDate ?? event.startDate) + eventEndMinutes(event) * MINUTE;
  if (endMs <= nowMs) return { kind: "record" };
  if (startMs >= nowMs || endMs <= startMs) return { kind: "plan" };
  return { kind: "live", split: (nowMs - startMs) / (endMs - startMs) };
}

export function isMarker(event: CalendarEvent, roles: Map<number, CalendarRole>): boolean {
  if (event.allDay) return true;
  const role = roles.get(event.calendarId);
  return role === "deadline" || role === "recurring";
}

export type TimelineItem =
  | { kind: "event"; event: CalendarEvent; start: number; end: number; phase: LedgerPhase }
  | { kind: "record-gap"; start: number; end: number }
  | { kind: "plan-gap"; start: number; end: number }
  | { kind: "now"; at: number };

const RANK: Record<TimelineItem["kind"], number> = {
  event: 0,
  "record-gap": 0,
  now: 1,
  "plan-gap": 2,
};

const minutesOf = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * @param day 选中日 0 点
 * @param events 当天的定时日程（调用方已排除标记）
 */
export function buildDayTimeline({
  day,
  events,
  nowMs,
}: {
  day: number;
  events: CalendarEvent[];
  nowMs: number;
}): TimelineItem[] {
  const next = new Date(day);
  next.setDate(next.getDate() + 1);
  const isToday = nowMs >= day && nowMs < next.getTime();
  const isPast = nowMs >= next.getTime();
  const nowMin = isToday ? minutesOf(nowMs) : isPast ? DAY_MINUTES : 0;
  // 今天已过去的时段不再提示安排：空档从当前时间（向上取整到 15 分）起算
  const planFrom = isToday ? Math.ceil(nowMin / 15) * 15 : 0;

  const timed = events
    .flatMap(e =>
      e.allDay || e.startTime === null
        ? []
        : [{ event: e, start: e.startTime, end: eventEndMinutes(e) }]
    )
    .sort((a, b) => a.start - b.start);

  const items: TimelineItem[] = timed.map(t => ({
    kind: "event",
    ...t,
    phase: eventPhase(t.event, nowMs),
  }));

  /** from 为 null 表示第一条日程之前：不算空白（睡眠等），只可能有未来空档 */
  const fillGap = (from: number | null, to: number, recordable: boolean) => {
    // 过去空隙：前后两条都已开始，才能确定这段确实空着
    if (from !== null && recordable && to - from >= RECORD_GAP_MIN) {
      items.push({ kind: "record-gap", start: from, end: to });
    }
    if (isPast) return;
    const start = Math.max(from ?? 0, DAY_FROM, planFrom);
    const end = Math.min(to, DAY_TO);
    if (end - start >= PLAN_GAP_MIN) items.push({ kind: "plan-gap", start, end });
  };

  let cursor: number | null = null;
  for (const t of timed) {
    if (cursor === null || t.start > cursor) fillGap(cursor, t.start, t.start < nowMin);
    cursor = Math.max(cursor ?? 0, t.end);
  }
  fillGap(cursor, DAY_MINUTES, false);
  if (isToday) items.push({ kind: "now", at: nowMin });

  const position = (item: TimelineItem) => (item.kind === "now" ? item.at : item.start);
  return items.sort((a, b) => position(a) - position(b) || RANK[a.kind] - RANK[b.kind]);
}
