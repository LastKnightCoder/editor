import type { TaskOccurrenceRef, TaskRecurrenceSegment } from "@tau/shared/task-assistant";
import holidayService from "../holiday-service";
import { dateTime } from "./common";
import { assertOccurrence } from "./recurrence";

export function assertTaskOccurrence(
  segments: TaskRecurrenceSegment[],
  occurrence: TaskOccurrenceRef
) {
  const holidays = segments.some(segment => segment.rule?.excludeHolidays)
    ? holidayService.cachedHolidayWindow(
        dateTime(occurrence.occurrenceDate) - 366 * 86_400_000,
        dateTime(occurrence.occurrenceDate)
      )
    : undefined;
  assertOccurrence(segments, occurrence, holidays);
}
