import { describe, expect, it } from "vitest";
import type { Calendar, CalendarEvent, CalendarGroup } from "@/types";
import { buildCalendarKinds, buildCalendarRoles, type CalendarRole } from "../eventTone";
import {
  absorbFocus,
  buildDayTimeline,
  focusLabel,
  spanPercent,
  eventPhase,
  isMarker,
  type TimelineItem,
} from "../ledger";

const DAY = new Date(2026, 9, 5).getTime();
const at = (h: number, m = 0, day = DAY) => day + (h * 60 + m) * 60_000;
const hm = (h: number, m = 0) => h * 60 + m;

let seq = 0;
function ev(start: number | null, end: number | null, patch: Partial<CalendarEvent> = {}) {
  return {
    id: ++seq,
    createTime: 0,
    updateTime: 0,
    calendarId: 1,
    title: `e${seq}`,
    detailContentId: 0,
    startDate: DAY,
    endDate: DAY,
    startTime: start,
    endTime: end,
    color: null,
    allDay: start === null,
    ...patch,
  } satisfies CalendarEvent;
}

const brief = (items: TimelineItem[]) =>
  items.map(item =>
    item.kind === "now"
      ? `now@${item.at}`
      : item.kind === "event"
        ? `${item.phase.kind}:${item.start}-${item.end}`
        : `${item.kind}:${item.start}-${item.end}`
  );

describe("eventPhase", () => {
  const e = ev(hm(9), hm(11));
  it("已结束是记录，未开始是计划", () => {
    expect(eventPhase(e, at(11))).toEqual({ kind: "record" });
    expect(eventPhase(e, at(12))).toEqual({ kind: "record" });
    expect(eventPhase(e, at(9))).toEqual({ kind: "plan" });
    expect(eventPhase(e, at(8))).toEqual({ kind: "plan" });
  });
  it("进行中给出已过去比例", () => {
    expect(eventPhase(e, at(9, 30))).toEqual({ kind: "live", split: 0.25 });
  });
  it("无结束时间按 1 小时", () => {
    expect(eventPhase(ev(hm(9), null), at(9, 30))).toEqual({ kind: "live", split: 0.5 });
  });
  it("跨天日程按绝对时刻判定", () => {
    const next = new Date(2026, 9, 6).getTime();
    const overnight = ev(hm(22), hm(2), { endDate: next });
    expect(eventPhase(overnight, at(23))).toEqual({ kind: "live", split: 0.25 });
    expect(eventPhase(overnight, at(3, 0, next))).toEqual({ kind: "record" });
  });
});

describe("buildCalendarRoles / isMarker", () => {
  const groups = [
    { id: 1, name: "系统", isSystem: true, parentGroupId: null },
    { id: 2, name: "待办清单", isSystem: true, parentGroupId: 1 },
  ] as CalendarGroup[];
  const calendars = [
    { id: 10, title: "番茄钟", groupId: 1 },
    { id: 11, title: "截止任务", groupId: 2 },
    { id: 12, title: "计划任务", groupId: 2 },
    { id: 13, title: "周期任务", groupId: 2 },
    { id: 20, title: "工作", groupId: undefined },
  ] as Calendar[];
  const roles = buildCalendarRoles(calendars, groups);

  it("细分系统日历角色，普通日历不在表内", () => {
    expect([...roles]).toEqual([
      [10, "pomodoro"],
      [11, "deadline"],
      [12, "planned"],
      [13, "recurring"],
    ]);
  });
  it("来源类型由角色归并", () => {
    expect([...buildCalendarKinds(calendars, groups)]).toEqual([
      [10, "pomodoro"],
      [11, "todo"],
      [12, "todo"],
      [13, "todo"],
    ]);
  });
  it("全天、截止、周期是标记；计划、番茄、普通定时日程不是", () => {
    expect(isMarker(ev(null, null, { calendarId: 20 }), roles)).toBe(true);
    expect(isMarker(ev(hm(18), null, { calendarId: 11 }), roles)).toBe(true);
    expect(isMarker(ev(null, null, { calendarId: 13 }), roles)).toBe(true);
    expect(isMarker(ev(hm(9), hm(10), { calendarId: 12 }), roles)).toBe(false);
    expect(isMarker(ev(hm(9), hm(10), { calendarId: 10 }), roles)).toBe(false);
    expect(isMarker(ev(hm(9), hm(10), { calendarId: 20 }), roles)).toBe(false);
  });
  it("找不到系统分组时没有角色", () => {
    expect(buildCalendarRoles(calendars, []).size).toBe(0);
  });
});

describe("buildDayTimeline", () => {
  it("今天：过去空隙 ≥15 分钟可补记，未来空档 ≥60 分钟可安排", () => {
    const events = [
      ev(hm(9), hm(11)),
      ev(hm(11, 40), hm(12, 30)),
      ev(hm(12, 40), hm(13)), // 与上一条只隔 10 分钟
      ev(hm(15), hm(16, 30)), // 跨过现在
      ev(hm(19), hm(20)),
    ];
    expect(brief(buildDayTimeline({ day: DAY, events, nowMs: at(15, 20) }))).toEqual([
      "record:540-660",
      "record-gap:660-700",
      "record:700-750",
      "record:760-780",
      "record-gap:780-900",
      "live:900-990",
      "now@920",
      "plan-gap:990-1140",
      "plan:1140-1200",
      "plan-gap:1200-1320",
    ]);
  });

  it("第一条之前、最后一条已开始的日程之后都不算空白", () => {
    const events = [ev(hm(9), hm(10)), ev(hm(17), hm(18))];
    expect(brief(buildDayTimeline({ day: DAY, events, nowMs: at(14) }))).toEqual([
      "record:540-600",
      "now@840",
      "plan-gap:840-1020",
      "plan:1020-1080",
      "plan-gap:1080-1320",
    ]);
  });

  it("重叠日程不产生假空隙", () => {
    const events = [ev(hm(9), hm(12)), ev(hm(10), hm(11)), ev(hm(12, 10), hm(13))];
    const items = buildDayTimeline({ day: DAY, events, nowMs: at(20) });
    expect(items.filter(i => i.kind === "record-gap")).toEqual([]);
  });

  it("过去的日子全部可补记，不再提示安排", () => {
    const yesterday = new Date(2026, 9, 4).getTime();
    const events = [
      ev(hm(9), hm(10), { startDate: yesterday, endDate: yesterday }),
      ev(hm(11), hm(12), { startDate: yesterday, endDate: yesterday }),
    ];
    expect(brief(buildDayTimeline({ day: yesterday, events, nowMs: at(15) }))).toEqual([
      "record:540-600",
      "record-gap:600-660",
      "record:660-720",
    ]);
  });

  it("未来的日子只有空档，与原有规则一致（08–22 点、≥60 分钟）", () => {
    const tomorrow = new Date(2026, 9, 6).getTime();
    const events = [
      ev(hm(9), hm(10), { startDate: tomorrow, endDate: tomorrow }),
      ev(hm(10, 30), hm(11), { startDate: tomorrow, endDate: tomorrow }),
    ];
    expect(brief(buildDayTimeline({ day: tomorrow, events, nowMs: at(15) }))).toEqual([
      "plan-gap:480-540",
      "plan:540-600",
      "plan:630-660",
      "plan-gap:660-1320",
    ]);
  });

  it("空白的今天：从现在取整到 15 分起提示安排", () => {
    expect(brief(buildDayTimeline({ day: DAY, events: [], nowMs: at(9, 7) }))).toEqual([
      "now@547",
      "plan-gap:555-1320",
    ]);
  });
});

describe("absorbFocus", () => {
  const roles = new Map<number, CalendarRole>([[9, "pomodoro"]]);
  const host = ev(hm(9), hm(11), { id: 500 });
  const pomo = (start: number, end: number, id: number) => ev(start, end, { id, calendarId: 9 });

  it("完整落在绑定事件内的番茄收进事件，多段按时间排序", () => {
    const blocks = [host, pomo(hm(10), hm(10, 50), 2), pomo(hm(9, 5), hm(9, 55), 1)];
    const bindings = { 1: { boundEventId: 500 }, 2: { boundEventId: 500 } };
    const { blocks: kept, focus } = absorbFocus(blocks, bindings, roles);
    expect(kept.map(b => b.id)).toEqual([500]);
    expect(focus.get(500)).toEqual([
      { start: hm(9, 5), end: hm(9, 55) },
      { start: hm(10), end: hm(10, 50) },
    ]);
  });

  it("诚实展示：超出一点、未绑定、绑定的事件不在这批里，都独立成块", () => {
    const blocks = [
      host,
      pomo(hm(10, 40), hm(11, 5), 3),
      pomo(hm(9), hm(9, 30), 4),
      pomo(hm(9), hm(9, 30), 5),
    ];
    const bindings = {
      3: { boundEventId: 500 },
      4: { boundEventId: null },
      5: { boundEventId: 999 },
    };
    const { blocks: kept, focus } = absorbFocus(blocks, bindings, roles);
    expect(kept.map(b => b.id)).toEqual([500, 3, 4, 5]);
    expect(focus.size).toBe(0);
  });

  it("非番茄块原样保留", () => {
    const other = ev(hm(9, 10), hm(9, 40), { id: 6 });
    expect(absorbFocus([host, other], { 6: { boundEventId: 500 } }, roles).blocks).toHaveLength(2);
  });
});

it("focusLabel / spanPercent", () => {
  expect(focusLabel([{ start: 0, end: 45 }])).toBe("专注 45m");
  expect(
    focusLabel([
      { start: 0, end: 50 },
      { start: 60, end: 90 },
    ])
  ).toBe("专注 1h20m");
  expect(focusLabel([{ start: 0, end: 120 }])).toBe("专注 2h");
  expect(spanPercent({ start: 570, end: 600 }, 540, 660)).toEqual({ offset: 25, size: 25 });
  expect(spanPercent({ start: 500, end: 560 }, 540, 660).offset).toBe(0);
});
