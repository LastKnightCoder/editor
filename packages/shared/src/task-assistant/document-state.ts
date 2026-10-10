import { calendarOccurrencesInRange } from "../utils/calendarRecurrence";
import {
  occurrenceKey,
  type DocumentTaskAttributes,
  type TaskOccurrenceRef,
  type TaskOccurrenceState,
  type TaskRecurrenceSegment,
} from "./contracts";

const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const midnight = (day: string) => new Date(`${day}T00:00:00`).getTime();

export function taskOccurrencesInRange(
  segments: TaskRecurrenceSegment[],
  states: Record<string, TaskOccurrenceState>,
  start: string,
  end: string,
  holidays?: Set<number>
) {
  const result: Array<{
    occurrence: TaskOccurrenceRef;
    scheduledAt: string;
    state: TaskOccurrenceState;
  }> = [];
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index],
      rule = segment.rule,
      next = segments[index + 1]?.effectiveDate;
    if (!rule) continue;
    const dates = calendarOccurrencesInRange(
      {
        ...rule,
        startDate: midnight(rule.startDate),
        endDate: rule.endDate ? midnight(rule.endDate) : null,
      },
      midnight(start),
      midnight(end),
      holidays
    );
    const candidates = new Set(dates.map(time => localDay(new Date(time))));
    for (const key of Object.keys(states))
      if (key.startsWith(`${segment.seriesId}/`))
        candidates.add(key.slice(segment.seriesId.length + 1));
    for (const day of candidates) {
      if (day < segment.effectiveDate || (next && day >= next)) continue;
      const occurrence = { seriesId: segment.seriesId, occurrenceDate: day };
      const state = states[occurrenceKey(occurrence)] ?? {};
      const scheduledAt = state.scheduledAt ?? day;
      const scheduledDate = localDay(
        new Date(scheduledAt.length === 10 ? `${scheduledAt}T00:00:00` : scheduledAt)
      );
      if (scheduledDate >= start && scheduledDate <= end)
        result.push({ occurrence, scheduledAt, state });
    }
  }
  return result;
}

/** 正文勾选只改变当天实例；没有当天实例时不能把整个周期标为完成。 */
export function documentTaskOccurrence(
  attributes: DocumentTaskAttributes,
  now = new Date()
): TaskOccurrenceRef | null {
  const day = localDay(now);
  const segments = attributes.taskRecurrence?.segments ?? [];
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index],
      next = segments[index + 1];
    if (!segment.rule) continue;
    for (const [key, state] of Object.entries(attributes.taskOccurrenceState ?? {})) {
      if (
        key.startsWith(`${segment.seriesId}/`) &&
        state.scheduledAt?.slice(0, 10) === day &&
        !state.skipped
      )
        return {
          seriesId: segment.seriesId,
          occurrenceDate: key.slice(segment.seriesId.length + 1),
        };
    }
    if (day < segment.effectiveDate || (next && day >= next.effectiveDate)) continue;
    const rule = segment.rule;
    // 正文渲染没有法定节假日数据，交给能够解析实例的业务入口完成。
    if (rule.excludeHolidays) continue;
    const matches = calendarOccurrencesInRange(
      {
        ...rule,
        startDate: midnight(rule.startDate),
        endDate: rule.endDate ? midnight(rule.endDate) : null,
      },
      midnight(day),
      midnight(day)
    );
    if (matches.length) {
      const ref = { seriesId: segment.seriesId, occurrenceDate: day };
      const state = attributes.taskOccurrenceState?.[occurrenceKey(ref)];
      if (!state?.skipped && (!state?.scheduledAt || state.scheduledAt.slice(0, 10) === day))
        return ref;
    }
  }
  return null;
}

export function documentTaskCheck(
  attributes: DocumentTaskAttributes & { checked?: boolean },
  checked: boolean,
  now = Date.now()
): Record<string, unknown> | null {
  if (!attributes.taskRecurrence?.segments.length)
    return { checked, taskCompletedAt: checked ? now : null };
  const occurrence = documentTaskOccurrence(attributes, new Date(now));
  if (!occurrence) return null;
  const key = occurrenceKey(occurrence);
  return {
    taskOccurrenceState: {
      ...attributes.taskOccurrenceState,
      [key]: {
        ...attributes.taskOccurrenceState?.[key],
        completedAt: checked ? now : null,
        skipped: false,
      },
    },
  };
}

export function documentTaskIsChecked(
  attributes: DocumentTaskAttributes & { checked?: boolean },
  now = new Date()
): boolean {
  if (!attributes.taskRecurrence?.segments.length) return attributes.checked === true;
  const occurrence = documentTaskOccurrence(attributes, now);
  return occurrence
    ? attributes.taskOccurrenceState?.[occurrenceKey(occurrence)]?.completedAt != null
    : false;
}
