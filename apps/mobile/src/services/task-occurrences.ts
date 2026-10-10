import type { TodoRecurrence, TodoRecurrenceCompletion } from "../types";

const dayKey = (time: number) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const atDay = (value: string) => {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export function occurrenceDateMap(recurrence: TodoRecurrence | null): Map<string, number> {
  const result = new Map<string, number>();
  for (const [key, state] of Object.entries(recurrence?.occurrenceState ?? {})) {
    if (!state.scheduledAt) continue;
    const split = key.lastIndexOf("/"),
      date = key.slice(split + 1),
      seriesId = key.slice(0, split);
    const segment = [...(recurrence?.segments ?? [])]
      .reverse()
      .find(value => value.effectiveDate <= date);
    if (segment?.seriesId === seriesId) result.set(date, atDay(state.scheduledAt));
  }
  return result;
}

export function projectCompletions(
  records: TodoRecurrenceCompletion[],
  dates: Map<string, number>,
  start?: number,
  end?: number
) {
  return records
    .map(record => ({
      ...record,
      scheduledDate: dates.get(dayKey(record.scheduledDate)) ?? record.scheduledDate,
      originalScheduledDate: record.scheduledDate,
    }))
    .filter(
      record =>
        (start === undefined || record.scheduledDate >= start) &&
        (end === undefined || record.scheduledDate <= end)
    );
}

export function originalOccurrenceDate(date: number, dates: Map<string, number>): number {
  const matches = [...dates].filter(([, value]) => dayKey(value) === dayKey(date));
  if (matches.length > 1) throw new Error("当天有多个改期实例，请通过待办助理指定原始实例");
  return matches.length ? atDay(matches[0][0]) : date;
}
