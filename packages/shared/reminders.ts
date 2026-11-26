import {
  getReminderTranslator,
  type ReminderMessageKey,
  type ReminderTranslator,
} from "./reminders.i18n.ts";
export {
  reminderMessages,
  getReminderTranslator,
  type ReminderMessageKey,
  type ReminderTranslator,
} from "./reminders.i18n.ts";

/**
 * 待办与日程提醒的共享口径：预设、文案与「首个 + 追加」的拆合。
 *
 * offset 为「基准时刻 - 提醒时刻」的毫秒数：截止任务的基准是截止时间，定时日程是开始时间，
 * 全天日程是当天零点（所以「当天 9:00」是负数）。存储上待办首个提醒在 todo_item.remind_before，
 * 其余在 item_reminder；日程全部在 item_reminder。
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const TWO_DAYS_BEFORE_AT_NINE = 39 * HOUR;
const WEEK_BEFORE_AT_NINE = 6 * DAY + 15 * HOUR;

export const MAX_REMINDERS = 3;

export type ReminderOpenTarget = { databaseName: string } & (
  | { page: "todos"; params: { selectedId: number } }
  | { page: "schedule"; params: { eventId: number } }
  | { documentTask: { contentId: number; taskId: string } }
);

export interface ReminderPreset {
  offset: number;
}

/** 截止任务与定时日程 */
export const TIMED_REMINDER_PRESETS: ReminderPreset[] = [
  { offset: 0 },
  { offset: 5 * MINUTE },
  { offset: 15 * MINUTE },
  { offset: 30 * MINUTE },
  { offset: HOUR },
  { offset: 2 * HOUR },
  { offset: DAY },
  { offset: 2 * DAY },
];

/** 全天日程：以当天零点为基准 */
export const ALL_DAY_REMINDER_PRESETS: ReminderPreset[] = [
  { offset: -9 * HOUR },
  { offset: 15 * HOUR },
  { offset: 4 * HOUR },
  { offset: TWO_DAYS_BEFORE_AT_NINE },
  { offset: WEEK_BEFORE_AT_NINE },
];

export function reminderPresets(allDay = false): ReminderPreset[] {
  return allDay ? ALL_DAY_REMINDER_PRESETS : TIMED_REMINDER_PRESETS;
}

export interface ReminderFormatOptions {
  locale?: string;
  t?: ReminderTranslator["t"];
  /** 只改变提前量展示，不改 offset 或全天时刻。 */
  compact?: boolean;
}

function formatOptions(options: ReminderFormatOptions) {
  const locale = options.locale ?? "zh-CN";
  const numbers = new Intl.NumberFormat(locale, { useGrouping: false });
  return {
    locale,
    t: options.t ?? getReminderTranslator(locale).t,
    number: (value: number) => numbers.format(value),
  };
}

export function reminderLabel(
  offset: number,
  allDay = false,
  options: ReminderFormatOptions = {}
): string {
  const { locale, t, number } = formatOptions(options);
  if (allDay) {
    const days = Math.max(0, Math.ceil(offset / DAY));
    const value = days * DAY - offset;
    const hour = Math.floor(value / HOUR);
    const minute = Math.floor((value % HOUR) / MINUTE);
    const time = `${number(hour)}:${new Intl.NumberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false }).format(minute)}`;
    const key: ReminderMessageKey =
      days === 0
        ? "allDay.today"
        : days === 1
          ? "allDay.previousDay"
          : offset === TWO_DAYS_BEFORE_AT_NINE
            ? "allDay.previousTwo"
            : offset === WEEK_BEFORE_AT_NINE
              ? "allDay.previousWeek"
              : "allDay.previousDays";
    return t(key, { time, count: days, amount: number(days) });
  }
  if (offset <= 0) return t("timed.onTime");
  const unit = offset % DAY === 0 ? "days" : offset % HOUR === 0 ? "hours" : "minutes";
  const count =
    unit === "days" ? offset / DAY : unit === "hours" ? offset / HOUR : Math.round(offset / MINUTE);
  return t(`offset.${unit}${options.compact ? "Compact" : ""}`, { count, amount: number(count) });
}

/** 去重、升序、截断到上限；首个即最靠近基准的提醒 */
export function normalizeReminders(offsets: readonly number[]): number[] {
  return [...new Set(offsets.filter(Number.isFinite))]
    .sort((a, b) => a - b)
    .slice(0, MAX_REMINDERS);
}

/** 待办：首个缺失即视为没有提醒（追加提醒不单独生效） */
export function joinTodoReminders(
  first: number | null | undefined,
  extras: readonly number[]
): number[] {
  return first == null ? [] : normalizeReminders([first, ...extras]);
}

export function splitTodoReminders(offsets: readonly number[]): {
  first: number | null;
  extras: number[];
} {
  const [first = null, ...extras] = normalizeReminders(offsets);
  return { first, extras };
}

export function summarizeReminders(
  offsets: readonly number[],
  allDay = false,
  options: ReminderFormatOptions = {}
): string {
  const { t, number } = formatOptions(options);
  const list = normalizeReminders(offsets);
  if (!list.length) return t("none");
  const labels = list.map(offset => reminderLabel(offset, allDay, options));
  return labels.length > 2
    ? t("summary.more", { first: labels[0], amount: number(labels.length - 1) })
    : labels.join(" · ");
}

function clock(time: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(time);
}

function dayDifference(time: number, now: number) {
  const start = (value: number) => new Date(value).setHours(0, 0, 0, 0);
  return Math.round((start(time) - start(now)) / DAY);
}

function dayWord(time: number, now: number, options: ReminderFormatOptions) {
  const { locale, t } = formatOptions(options);
  const days = dayDifference(time, now);
  if (days === 0) return t("day.today");
  if (days === 1) return t("day.tomorrow");
  if (days === 2) return t("day.afterTomorrow");
  return t("day.date", {
    date: new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(time),
    weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }).format(time),
  });
}

export interface ReminderText {
  kind: "todo" | "event";
  /** 截止时间 / 开始时间；全天为当天零点；没有截止时间的待办为 null */
  anchor: number | null;
  allDay?: boolean;
  end?: number | null;
}

/** 不含倒计时的时间描述，供「稍后提醒」重写正文：「明天 18:00 截止」「14:00 – 15:30」「明天 · 全天」 */
export function reminderDetail(
  input: ReminderText & { now: number },
  options: ReminderFormatOptions = {}
): string {
  const { kind, anchor, now } = input;
  if (anchor == null) return "";
  const { locale, t } = formatOptions(options);
  const day = dayWord(anchor, now, options);
  if (input.allDay) return t(kind === "todo" ? "detail.todoDate" : "detail.eventDate", { day });
  const range =
    kind === "event" && input.end != null && input.end > anchor
      ? `${clock(anchor, locale)} – ${clock(input.end, locale)}`
      : clock(anchor, locale);
  const today = dayDifference(anchor, now) === 0;
  if (kind === "event" && today) return range;
  return t(kind === "todo" ? (today ? "detail.todoToday" : "detail.todoAt") : "detail.eventAt", {
    day,
    range,
  });
}

/** 通知文案以送达时刻为准，内容语言由调用方显式选择。 */
export function reminderBody(
  input: ReminderText & { remindAt: number },
  options: ReminderFormatOptions = {}
): string {
  const { kind, anchor, remindAt } = input;
  const { locale, t, number } = formatOptions(options);
  if (anchor == null) return t("body.todo");
  if (input.allDay) return reminderDetail({ ...input, now: remindAt }, options);
  const range =
    kind === "event" && input.end != null && input.end > anchor
      ? `${clock(anchor, locale)} – ${clock(input.end, locale)}`
      : clock(anchor, locale);
  const diff = anchor - remindAt;
  if (diff < 0) {
    const late = Math.max(1, Math.round(-diff / MINUTE));
    return t(kind === "todo" ? "body.todoLate" : "body.eventStarted", {
      count: late,
      amount: number(late),
      range,
    });
  }
  if (diff < MINUTE) return t(kind === "todo" ? "body.todoNow" : "body.eventNow", { range });
  if (diff < HOUR) {
    const minutes = Math.round(diff / MINUTE);
    return t(kind === "todo" ? "body.todoSoon" : "body.eventSoon", {
      count: minutes,
      amount: number(minutes),
      range,
    });
  }
  const day = dayWord(anchor, remindAt, options);
  return t(kind === "todo" ? "detail.todoAt" : "detail.eventAt", { day, range });
}
