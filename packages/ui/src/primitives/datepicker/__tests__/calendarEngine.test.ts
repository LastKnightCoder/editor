/**
 * 日历引擎单测：值协议解析/格式化（越界拒绝）· 月份网格（六周固定 42 格、
 * 周一起始）· 时刻归一化（宽松写法与越界）· 网格刻度与就近步长。
 */

import { describe, expect, it } from "vitest";
import {
  addMonths,
  formatDisplay,
  formatValue,
  monthCells,
  nearestStep,
  normalizeTimeInput,
  parseDateKey,
  parseValue,
  sameDay,
  startOfWeekMonday,
  timeGridValues,
  toDateKey,
} from "../calendarEngine";

describe("calendarEngine 值协议", () => {
  it("parseDateKey：合法日期 → 当天 00:00；日历不存在的日期拒绝", () => {
    const d = parseDateKey("2026-09-19")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      2026, 8, 19, 0, 0,
    ]);
    expect(parseDateKey("2026-02-30")).toBeNull();
    expect(parseDateKey("2026-13-01")).toBeNull();
    expect(parseDateKey("20260919")).toBeNull();
    expect(parseDateKey("")).toBeNull();
  });

  it("formatValue / parseValue 双向：day 与 minute 两种精度", () => {
    const day = parseDateKey("2026-09-19")!;
    expect(formatValue(day, "day")).toBe("2026-09-19");
    expect(formatValue(day, "minute")).toMatch(/^2026-09-19 \d{2}:\d{2}$/);
    const minute = parseValue("2026-09-19 15:07");
    expect(minute && `${minute.getHours()}:${minute.getMinutes()}`).toBe("15:7");
    expect(parseValue("2026-09-19")).not.toBeNull();
    expect(parseValue("2026-09-19 25:00")).toBeNull(); // 无效时刻连 day 也不认
    expect(parseValue("abc")).toBeNull();
  });

  it("formatDisplay：触发器显示格式（minute 追加时刻）", () => {
    expect(formatDisplay("2026-09-19")).toBe("2026年9月19日");
    expect(formatDisplay("2026-09-19 15:00")).toBe("2026年9月19日 15:00");
  });
});

describe("calendarEngine 网格与日期算术", () => {
  it("monthCells：固定 42 格、周一起始、inMonth 计数正确", () => {
    const cells = monthCells(2026, 8); // 2026-09：9/1 周二
    expect(cells).toHaveLength(42);
    expect(cells[0].key).toBe("2026-08-31"); // 首格为周一 8/31
    expect(cells.filter(c => c.inMonth)).toHaveLength(30);
    expect(cells[41].key).toBe("2026-10-11");
  });

  it("sameDay / addMonths / startOfWeekMonday", () => {
    expect(sameDay(parseDateKey("2026-09-19")!, parseDateKey("2026-09-19")!)).toBe(true);
    expect(sameDay(parseDateKey("2026-09-19")!, parseDateKey("2026-09-20")!)).toBe(false);
    expect(toDateKey(addMonths(new Date(2026, 11, 1), 1))).toBe("2027-01-01");
    expect(toDateKey(startOfWeekMonday(new Date(2026, 8, 19)))).toBe("2026-09-14"); // 周六 → 本周一
  });
});

describe("calendarEngine 时刻", () => {
  it("normalizeTimeInput：宽松写法归一化、越界与非数字拒绝", () => {
    expect(normalizeTimeInput("9")).toBe("09:00");
    expect(normalizeTimeInput("9:5")).toBe("09:05");
    expect(normalizeTimeInput("09:05")).toBe("09:05");
    expect(normalizeTimeInput("23:59")).toBe("23:59");
    expect(normalizeTimeInput("9：05")).toBe("09:05"); // 中文冒号
    expect(normalizeTimeInput("24:00")).toBeNull();
    expect(normalizeTimeInput("09:60")).toBeNull();
    expect(normalizeTimeInput("abc")).toBeNull();
    expect(normalizeTimeInput("1037")).toBeNull();
  });

  it("timeGridValues / nearestStep", () => {
    expect(timeGridValues(15)).toHaveLength(96);
    expect(timeGridValues(30)[0]).toBe("00:00");
    expect(timeGridValues(30).at(-1)).toBe("23:30");
    expect(nearestStep("10:37", 15)).toBe("10:30");
    expect(nearestStep("10:45", 15)).toBe("10:45"); // 落在步长上原样返回
  });
});
