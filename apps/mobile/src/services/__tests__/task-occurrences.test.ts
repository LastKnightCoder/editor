import { describe, expect, it } from "vitest";
import { occurrenceDateMap, projectCompletions, originalOccurrenceDate } from "../task-occurrences";
import type { TodoRecurrence, TodoRecurrenceCompletion } from "../../types";
const day = (value: string) => new Date(`${value}T00:00:00`).getTime();
describe("周期实例完成记录投影", () => {
  it("改期后的完成状态显示在安排日，读写仍能定位原始实例", () => {
    const recurrence = {
      segments: [{ seriesId: "s", effectiveDate: "2026-10-01", rule: null }],
      occurrenceState: { "s/2026-10-01": { scheduledAt: "2026-10-10" } },
    } as unknown as TodoRecurrence;
    const dates = occurrenceDateMap(recurrence);
    const records = [
      { id: 1, scheduledDate: day("2026-10-01"), completedAt: 100 },
    ] as TodoRecurrenceCompletion[];
    expect(projectCompletions(records, dates, day("2026-10-10"), day("2026-10-10"))).toMatchObject([
      {
        scheduledDate: day("2026-10-10"),
        originalScheduledDate: day("2026-10-01"),
        completedAt: 100,
      },
    ]);
    expect(originalOccurrenceDate(day("2026-10-10"), dates)).toBe(day("2026-10-01"));
  });
});
