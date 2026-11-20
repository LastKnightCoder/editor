import dayjs from "dayjs";
import { TodoRecurrence } from "@/types";
import { taskOccurrencesInRange } from "@tau/shared/task-assistant";

/**
 * Check if a specific date is scheduled for a recurrence pattern
 */
export const isDateScheduledForRecurrence = (
  recurrence: TodoRecurrence,
  day: dayjs.Dayjs
): boolean => {
  if (recurrence.segments?.length)
    return taskOccurrencesInRange(
      recurrence.segments,
      recurrence.occurrenceState ?? {},
      day.format("YYYY-MM-DD"),
      day.format("YYYY-MM-DD")
    ).some(entry => !entry.state.skipped);
  const date = day.startOf("day");
  const start = dayjs(recurrence.startDate).startOf("day");
  const end = recurrence.endDate ? dayjs(recurrence.endDate).startOf("day") : null;

  if (date.isBefore(start)) return false;
  if (end && date.isAfter(end)) return false;

  const interval = Math.max(1, recurrence.interval || 1);

  switch (recurrence.type) {
    case "daily": {
      const diffDays = date.diff(start, "day");
      return diffDays % interval === 0;
    }
    case "weekdays": {
      const weekday = date.day();
      if (weekday === 0 || weekday === 6) return false;
      const diffDays = date.diff(start, "day");
      return diffDays % interval === 0;
    }
    case "weekly": {
      const weekDiff = date.startOf("week").diff(start.startOf("week"), "week");
      if (weekDiff % interval !== 0) return false;
      const allowed =
        recurrence.weekdays && recurrence.weekdays.length > 0 ? recurrence.weekdays : [start.day()];
      return allowed.includes(date.day());
    }
    case "monthly": {
      const monthDiff = date.startOf("month").diff(start.startOf("month"), "month");
      if (monthDiff % interval !== 0) return false;
      const targetDay = recurrence.monthDay ?? start.date();
      return date.date() === targetDay;
    }
    case "yearly": {
      const yearDiff = date.year() - start.year();
      if (yearDiff % interval !== 0) return false;
      const targetMonth = recurrence.yearMonth ?? start.month() + 1;
      const targetDay = recurrence.yearDay ?? start.date();
      return date.month() + 1 === targetMonth && date.date() === targetDay;
    }
    default: {
      const diffDays = date.diff(start, "day");
      return diffDays % interval === 0;
    }
  }
};
