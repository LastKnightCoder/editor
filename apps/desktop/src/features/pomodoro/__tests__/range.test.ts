import { describe, expect, it } from "vitest";
import {
  addDays,
  lastDays,
  lastDaysKey,
  listDays,
  quickRanges,
  resolveQuick,
  shiftWindow,
  windowAround,
  windowDays,
  windowLabel,
} from "../range";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();
const NOW = new Date(2026, 8, 24, 14, 20).getTime();
const TODAY = day(2026, 9, 24);

describe("窗口推算", () => {
  it("近 N 天截至今天，按天列出新的在前", () => {
    const w = lastDays(7, NOW);
    expect(w).toEqual({ from: day(2026, 9, 18), to: TODAY });
    expect(windowDays(w)).toBe(7);
    expect(listDays(w)[0]).toBe(TODAY);
    expect(listDays(w)).toHaveLength(7);
  });

  it("跨夏令时仍按日历日推算", () => {
    // 无论本机时区是否有夏令时，加减天数都落在当天 0 点
    const d = addDays(day(2026, 3, 1), 30);
    expect(new Date(d).getDate()).toBe(31);
    expect(new Date(d).getHours()).toBe(0);
  });

  it("翻页：往前整段平移；往后不越过今天且保持长度", () => {
    const w = lastDays(14, NOW);
    const prev = shiftWindow(w, -1, NOW);
    expect(prev).toEqual({ from: day(2026, 8, 28), to: day(2026, 9, 10) });
    expect(shiftWindow(prev, 1, NOW)).toEqual(w);
    const nearToday = { from: day(2026, 9, 5), to: day(2026, 9, 18) };
    expect(shiftWindow(nearToday, 1, NOW)).toEqual(w);
  });

  it("跳到某天：尽量居中，不越过今天", () => {
    expect(windowAround(day(2026, 5, 27), 14, NOW)).toEqual({
      from: day(2026, 5, 20),
      to: day(2026, 6, 2),
    });
    expect(windowAround(day(2026, 9, 22), 14, NOW).to).toBe(TODAY);
  });
});

describe("快捷区间", () => {
  it("本月 / 上个月 / 今年 / 过去一年", () => {
    expect(resolveQuick("thisMonth", NOW, null)).toEqual({ from: day(2026, 9, 1), to: TODAY });
    expect(resolveQuick("lastMonth", NOW, null)).toEqual({
      from: day(2026, 8, 1),
      to: day(2026, 8, 31),
    });
    expect(resolveQuick("thisYear", NOW, null)).toEqual({ from: day(2026, 1, 1), to: TODAY });
    expect(windowDays(resolveQuick("pastYear", NOW, null)!)).toBe(365);
  });

  it("往年按最早记录列出，无记录时不出现", () => {
    const keys = (earliest: number | null) =>
      quickRanges(NOW, earliest).flatMap(q => (q === "-" ? [] : [q.key]));
    expect(keys(null)).not.toContain("year-2025");
    expect(keys(day(2024, 11, 3))).toEqual(expect.arrayContaining(["year-2025", "year-2024"]));
    expect(resolveQuick("year-2025", NOW, day(2024, 11, 3))).toEqual({
      from: day(2025, 1, 1),
      to: day(2025, 12, 31),
    });
  });

  it("分段高亮只认截至今天的 7 / 14 / 30 / 90 天", () => {
    expect(lastDaysKey(lastDays(30, NOW), NOW)).toBe("last30");
    expect(lastDaysKey(shiftWindow(lastDays(30, NOW), -1, NOW), NOW)).toBeNull();
    expect(lastDaysKey(lastDays(10, NOW), NOW)).toBeNull();
  });

  it("标题：快捷项名，否则日期范围（非今年带年份）", () => {
    expect(windowLabel(lastDays(14, NOW), "last14", NOW, null)).toBe("近 14 天");
    expect(windowLabel({ from: day(2026, 8, 14), to: day(2026, 8, 27) }, null, NOW, null)).toBe(
      "8月14日 – 8月27日"
    );
    expect(windowLabel({ from: day(2025, 12, 25), to: day(2026, 1, 7) }, null, NOW, null)).toBe(
      "2025年12月25日 – 2026年1月7日"
    );
  });
});
