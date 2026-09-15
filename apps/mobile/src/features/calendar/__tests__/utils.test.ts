// 日历域纯函数单测：排序/跨天/周起始语义以桌面 apps/desktop/src/utils/calendar.ts
// 与 MonthView 筛选逻辑为金标准（修改任何常量前先同步桌面端）。

import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../types";
import {
  atLocalTime,
  eventOccursOnDay,
  formatTime,
  getMonthGrid,
  getWeekStart,
  sortEventsForDay,
  durationLabel,
  summarizeToday,
} from "../utils";

function event(partial: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 1,
    calendarId: 1,
    title: "事件",
    detailContentId: 0,
    startDate: 1757894400000,
    endDate: null,
    startTime: null,
    endTime: null,
    color: null,
    allDay: true,
    value: null,
    calendarTitle: "工作",
    calendarColor: "blue",
    isInSystemEvent: false,
    ...partial,
  };
}

describe("calendar utils", () => {
  it("按墙钟设置时刻，在夏令时切换日仍保持中午十二点", () => {
    for (const date of [new Date(2026, 2, 8), new Date(2026, 10, 1)]) {
      const result = new Date(atLocalTime(date.getTime(), 720));
      expect(result.getDate()).toBe(date.getDate());
      expect(result.getHours()).toBe(12);
      expect(result.getMinutes()).toBe(0);
    }
  });

  it("formatTime 输出 HH:MM 补零（桌面对照 formatTime）", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(9 * 60 + 5)).toBe("09:05");
    expect(formatTime(23 * 60 + 59)).toBe("23:59");
  });

  it("getWeekStart 周一起始，周日回退到前一周周一（桌面对照 getWeekStart）", () => {
    // 2025-09-15 是周一，2025-09-21 是周日
    const monday = new Date(2025, 8, 15).getTime();
    const sunday = new Date(2025, 8, 21).getTime();
    expect(new Date(getWeekStart(monday)).getDay()).toBe(1);
    expect(getWeekStart(sunday)).toBe(monday);
  });

  it("getMonthGrid 固定 42 格、周一起始、标记锚月内外", () => {
    // 2025-09：9/1 周一，30 天，首行无补位，末行补 11 个 10 月日期
    const anchor = new Date(2025, 8, 15).getTime();
    const grid = getMonthGrid(anchor);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toMatchObject({ dayOfMonth: 1, inAnchorMonth: true });
    expect(grid[29]).toMatchObject({ dayOfMonth: 30, inAnchorMonth: true });
    expect(grid[30]).toMatchObject({ dayOfMonth: 1, inAnchorMonth: false });
  });

  it("eventOccursOnDay 跨天事件在范围内每天出现（桌面对照 MonthView 筛选）", () => {
    const day = (d: number) => new Date(2025, 8, d).getTime();
    const cross = event({ startDate: day(15), endDate: day(17) });
    expect(eventOccursOnDay(cross, day(15))).toBe(true);
    expect(eventOccursOnDay(cross, day(17))).toBe(true);
    expect(eventOccursOnDay(cross, day(18))).toBe(false);
    // endDate 缺省按 startDate 处理
    const single = event({ startDate: day(15), endDate: null });
    expect(eventOccursOnDay(single, day(16))).toBe(false);
  });

  it("sortEventsForDay 全天在前，非全天按开始分钟升序且稳定", () => {
    const timed = (id: number, start: number) =>
      event({ id, allDay: false, startTime: start, endTime: start + 30 });
    const allDay = event({ id: 99, allDay: true });
    const sorted = sortEventsForDay([timed(3, 600), allDay, timed(1, 540), timed(2, 540)]);
    expect(sorted.map(item => item.id)).toEqual([99, 1, 2, 3]);
  });

  it("durationLabel 时长人类可读", () => {
    expect(durationLabel(0, 30)).toBe("30 分钟");
    expect(durationLabel(0, 60)).toBe("1 小时");
    expect(durationLabel(0, 90)).toBe("1.5 小时");
    expect(durationLabel(600, 725)).toBe("2 小时 5 分钟");
  });

  describe("summarizeToday", () => {
    const at = (h: number, m = 0) => h * 60 + m;
    const nowAt = (h: number, m = 0) => new Date(2025, 8, 15, h, m).getTime();
    const timed = (id: number, start: number, end: number | null = null) =>
      event({
        id,
        allDay: false,
        title: `事件${id}`,
        startTime: start,
        endTime: end ?? start + 60,
      });

    it("空列表给空态文案", () => {
      expect(summarizeToday([], nowAt(9))).toEqual({ total: 0, headline: "今天没有日程" });
    });

    it("下一件未结束日程带时间前缀，还有件数不含自身", () => {
      const events = [timed(1, at(8)), timed(2, at(14)), timed(3, at(16))];
      // 9:00 时：8 点那件（8:00-9:00）已结束，下一件是 14:00 事件2，之后还有事件3
      expect(summarizeToday(events, nowAt(9)).headline).toBe("14:00 事件2 · 还有 1 件");
    });

    it("进行中的日程算下一件", () => {
      const events = [timed(1, at(8), at(10)), timed(2, at(14))];
      expect(summarizeToday(events, nowAt(9)).headline).toBe("08:00 事件1 · 还有 1 件");
    });

    it("跨到未来日的定时事件不会被误判已结束", () => {
      // 22:00 开始、次日 02:00 结束：endTime=120 是尾日分钟数，不能与今日 now 比较
      const crossDay = event({
        id: 1,
        allDay: false,
        title: "跨天事",
        startTime: at(22),
        endTime: 120,
        startDate: new Date(2025, 8, 15).getTime(),
        endDate: new Date(2025, 8, 16).getTime(),
      });
      expect(summarizeToday([crossDay], nowAt(23)).headline).toBe("22:00 跨天事");
    });

    it("只剩全天日程时按件数收尾", () => {
      const events = [timed(1, at(8)), event({ id: 2, allDay: true, title: "全天事" })];
      expect(summarizeToday(events, nowAt(12)).headline).toBe("1 件全天日程");
    });

    it("定时日程全部结束给收尾文案", () => {
      expect(summarizeToday([timed(1, at(8))], nowAt(12)).headline).toBe("今日日程已结束");
    });

    it("全天日程计入还有件数", () => {
      const events = [timed(1, at(14)), event({ id: 2, allDay: true, title: "全天事" })];
      expect(summarizeToday(events, nowAt(9)).headline).toBe("14:00 事件1 · 还有 1 件");
    });
  });
});
