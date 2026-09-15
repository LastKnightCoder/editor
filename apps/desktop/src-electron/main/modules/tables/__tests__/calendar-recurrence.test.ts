import { describe, expect, it } from "vitest";
import fixtures from "../../../../../../../packages/shared/src/utils/__fixtures__/calendar-recurrence.json";
import { parseHolidayYearResponse } from "@tau/shared/src/utils/holidayData";
import TodoRecurrenceTable from "../todo-recurrence";
import type { TodoRecurrence } from "@/types";

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe("跨端日历规则契约", () => {
  it.each(fixtures.filter(fixture => fixture.timeZone === zone))("$name", fixture => {
    const rule = {
      ...fixture.rule,
      startDate: Date.parse(fixture.rule.startDate),
    } as TodoRecurrence;
    const holidays = new Set(fixture.holidays?.map(date => Date.parse(date)));
    const result = TodoRecurrenceTable.getOccurrencesInRange(
      rule,
      Date.parse(fixture.start),
      Date.parse(fixture.end),
      holidays
    );
    expect(result).toEqual(fixture.expected.map(date => Date.parse(date)));
  });

  it("将 API 布尔值及 MM-DD 键规范化", () => {
    expect(
      parseHolidayYearResponse({
        code: 0,
        holiday: {
          "10-01": { date: "2026-10-01", holiday: true },
          "10-10": { date: "2026-10-10", holiday: false },
        },
      })
    ).toEqual({ "2026-10-01": 2, "2026-10-10": 3 });
  });
});
