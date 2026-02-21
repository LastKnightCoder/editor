import { describe, expect, it } from "vitest";
import type { TodoRecurrence } from "../../../types";
import {
  getStartOfDayTimestamp,
  isDateScheduledForRecurrence,
} from "../recurrence";

function createRecurrence(patch?: Partial<TodoRecurrence>): TodoRecurrence {
  const now = Date.now();
  return {
    id: 1,
    todoItemId: 101,
    type: "daily",
    interval: 1,
    weekdays: null,
    monthDay: null,
    yearMonth: null,
    yearDay: null,
    excludeHolidays: false,
    startDate: now,
    endDate: null,
    maxOccurrences: null,
    createTime: now,
    updateTime: now,
    ...patch,
  };
}

describe("todo/recurrence", () => {
  it("daily 类型应按 interval 命中日期", () => {
    const start = getStartOfDayTimestamp(new Date("2026-02-01T09:00:00"));
    const recurrence = createRecurrence({
      type: "daily",
      interval: 2,
      startDate: start,
    });

    expect(
      isDateScheduledForRecurrence(
        recurrence,
        getStartOfDayTimestamp(new Date("2026-02-01T12:00:00")),
      ),
    ).toBe(true);
    expect(
      isDateScheduledForRecurrence(
        recurrence,
        getStartOfDayTimestamp(new Date("2026-02-02T12:00:00")),
      ),
    ).toBe(false);
    expect(
      isDateScheduledForRecurrence(
        recurrence,
        getStartOfDayTimestamp(new Date("2026-02-03T12:00:00")),
      ),
    ).toBe(true);
  });

  it("weekly 类型应按 weekday 与 interval 命中", () => {
    const start = getStartOfDayTimestamp(new Date("2026-02-02T09:00:00"));
    const recurrence = createRecurrence({
      type: "weekly",
      interval: 1,
      startDate: start,
      weekdays: [1, 3, 5],
    });

    expect(
      isDateScheduledForRecurrence(
        recurrence,
        getStartOfDayTimestamp(new Date("2026-02-04T12:00:00")),
      ),
    ).toBe(true);
    expect(
      isDateScheduledForRecurrence(
        recurrence,
        getStartOfDayTimestamp(new Date("2026-02-05T12:00:00")),
      ),
    ).toBe(false);
  });
});
