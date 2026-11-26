import { describe, expect, it } from "vitest";
import {
  dayDiff,
  dayLabelKind,
  daysLeftInWeek,
  isDateOnlyTs,
  mondayFirstWeekdays,
  startOfDay,
} from "../dayWords";
import { recurrenceText } from "../date-format";
import type { TodoRecurrence } from "@/types";
const at = (day: number, hour = 0, minute = 0) => new Date(2026, 8, day, hour, minute).getTime();

describe("自然日与周界分类", () => {
  it("同日不按时刻分段，全天值仍为本地午夜", () => {
    expect(dayDiff(at(24, 23, 59), at(24, 0, 1))).toBe(0);
    expect(dayDiff(at(25), at(24, 23, 59))).toBe(1);
    expect(startOfDay(at(24, 15))).toBe(at(24));
    expect(isDateOnlyTs(at(24))).toBe(true);
    expect(isDateOnlyTs(at(24, 0, 1))).toBe(false);
  });
  it("相对日优先，随后本周内用星期类，周一越界与较早日期回日期类", () => {
    const now = at(24, 14, 20);
    expect(dayLabelKind(at(23), now)).toBe("relative");
    expect(dayLabelKind(at(24, 23), now)).toBe("relative");
    expect(dayLabelKind(at(25), now)).toBe("relative");
    expect(dayLabelKind(at(26), now)).toBe("relative");
    expect(dayLabelKind(at(27), now)).toBe("weekday");
    expect(dayLabelKind(at(28), now)).toBe("date");
    expect(dayLabelKind(at(22), now)).toBe("date");
    expect(daysLeftInWeek(at(27))).toBe(0);
    expect(daysLeftInWeek(at(28))).toBe(6);
    expect(dayLabelKind(at(29), at(27))).toBe("relative");
  });
});

describe("周期显示的数据边界", () => {
  it("星期排序周一在前、周日在后且不会排序原数组", () => {
    const days = Object.freeze([0, 5, 1, 4, 1]);
    const result = mondayFirstWeekdays(days);
    expect(result).toEqual([1, 1, 4, 5, 0]);
    expect(days).toEqual([0, 5, 1, 4, 1]);
    expect(result).not.toBe(days);
  });
  it("格式化不同语言不改变周期规则或星期顺序", () => {
    const recurrence: TodoRecurrence = {
      id: 1,
      todoItemId: 2,
      type: "weekly",
      interval: 2,
      weekdays: [4, 0, 1],
      excludeHolidays: false,
      startDate: at(1),
      createTime: at(1),
      updateTime: at(1),
    };
    const before = structuredClone(recurrence);
    for (const locale of ["zh-CN", "zh-TW", "en-US"]) recurrenceText(recurrence, locale);
    expect(recurrence).toEqual(before);
  });
});
