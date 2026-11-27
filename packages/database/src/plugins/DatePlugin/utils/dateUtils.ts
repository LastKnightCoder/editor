import type { DateValue } from "../index";
import { databaseFallbackT, type DatabaseMessageKey, type DatabaseT } from "../../../i18n";

const DAY_MS = 86_400_000;

export interface DateDisplayOptions {
  showTime?: boolean;
  isRange?: boolean;
}

/** 单日期相对「现在」的色调：已过去降灰、今天强调 */
export type DateTone = "past" | "today" | "future";

/** 范围相对「现在」的状态；open 为只有开始日期、尚未结束 */
export type RangeStatus = "upcoming" | "live" | "done" | "open";

export interface SingleDateDisplay {
  kind: "single";
  /** 今天 / 明天 / 昨天 / 10月12日 / 2027年1月8日 */
  label: string;
  time: string | null;
  /** 相对提示（3 天后 / 4 周前），label 已是相对词时为 null */
  hint: string | null;
  tone: DateTone;
  /** 完整绝对时间，供悬停提示 */
  title: string;
}

export interface RangeDateDisplay {
  kind: "range";
  start: string;
  /** 同日范围或只有开始日期时为 null */
  end: string | null;
  startTime: string | null;
  endTime: string | null;
  status: RangeStatus;
  /** 已过去的比例 0~1，轨道填充宽度 */
  progress: number;
  /** 剩 9 天 / 5 天后开始 / 26 天（已结束显示时长）/ 已 2 周 */
  hint: string;
  title: string;
}

export type DateDisplay = SingleDateDisplay | RangeDateDisplay;

const pad = (value: number) => String(value).padStart(2, "0");

const startOfDay = (ts: number) => {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** 自然日差 a - b；Math.round 吸收夏令时造成的 ±1 小时 */
const dayDiff = (a: number, b: number) => Math.round((startOfDay(a) - startOfDay(b)) / DAY_MS);

const yearOf = (ts: number) => new Date(ts).getFullYear();

const formatTime = (ts: number) => {
  const date = new Date(ts);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatMonthDay = (t: DatabaseT, ts: number, withYear: boolean) => {
  const date = new Date(ts);
  const values = { month: date.getMonth() + 1, day: date.getDate(), year: date.getFullYear() };
  return withYear ? t("date.yearMonthDay", values) : t("date.monthDay", values);
};

const weekdayKeyOf = (ts: number) =>
  `date.weekday.${new Date(ts).getDay()}` as DatabaseMessageKey;

const formatFull = (t: DatabaseT, ts: number, showTime: boolean) =>
  `${formatMonthDay(t, ts, true)} ${t(weekdayKeyOf(ts))}${showTime ? ` ${formatTime(ts)}` : ""}`;

/** 天数口语化：两周内按天，两个月内按周，一年内按月，其余按年 */
const formatSpan = (t: DatabaseT, days: number) => {
  if (days < 14) return t("date.span.day", { count: days });
  if (days < 60) return t("date.span.week", { count: Math.round(days / 7) });
  if (days < 365) return t("date.span.month", { count: Math.round(days / 30) });
  return t("date.span.year", { count: Math.round(days / 365) });
};

const formatDuration = (t: DatabaseT, ms: number) => {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return t("date.duration.minute", { count: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24)
    return rest
      ? t("date.duration.hourMinute", { hours, minutes: rest })
      : t("date.duration.hour", { count: hours });
  return t("date.span.day", { count: Math.round(hours / 24) });
};

/** 单日主文案：±1 天用相对词，本年省略年份 */
const formatDayWord = (t: DatabaseT, ts: number, now: number) => {
  const diff = dayDiff(ts, now);
  if (diff === 0) return t("date.today");
  if (diff === 1) return t("date.tomorrow");
  if (diff === -1) return t("date.yesterday");
  return formatMonthDay(t, ts, yearOf(ts) !== yearOf(now));
};

const formatRelative = (t: DatabaseT, ts: number, now: number) => {
  const diff = dayDiff(ts, now);
  if (diff === 0) return t("date.today");
  if (diff === 1) return t("date.tomorrow");
  if (diff === -1) return t("date.yesterday");
  return diff > 0
    ? t("date.inSpan", { span: formatSpan(t, diff) })
    : t("date.agoSpan", { span: formatSpan(t, -diff) });
};

const describeSingle = (t: DatabaseT, ts: number, showTime: boolean, now: number): SingleDateDisplay => {
  const diff = dayDiff(ts, now);
  const isPast = diff < 0 || (showTime && diff === 0 && ts < now);
  return {
    kind: "single",
    label: formatDayWord(t, ts, now),
    time: showTime ? formatTime(ts) : null,
    hint: Math.abs(diff) <= 1 ? null : formatRelative(t, ts, now),
    tone: isPast ? "past" : diff === 0 ? "today" : "future",
    title: formatFull(t, ts, showTime),
  };
};

const describeRange = (
  t: DatabaseT,
  start: number,
  end: number,
  showTime: boolean,
  now: number
): RangeDateDisplay => {
  const sameDay = dayDiff(start, end) === 0;
  const crossYear = yearOf(start) !== yearOf(end);
  const sameMonth = !crossYear && new Date(start).getMonth() === new Date(end).getMonth();

  // 跨年才写两次年份，同月（不含时间）省略结束月份
  let startLabel = formatDayWord(t, start, now);
  let endLabel: string | null = null;
  if (!sameDay) {
    startLabel = formatMonthDay(t, start, crossYear || yearOf(start) !== yearOf(now));
    endLabel = crossYear
      ? formatMonthDay(t, end, true)
      : sameMonth && !showTime
        ? t("date.dayOnly", { day: new Date(end).getDate() })
        : formatMonthDay(t, end, false);
  }

  // 不含时间时按自然日计算，结束日当天整天算在范围内
  const rangeStart = showTime ? start : startOfDay(start);
  const rangeEnd = showTime ? end : startOfDay(end) + DAY_MS;

  let status: RangeStatus;
  let progress: number;
  let hint: string;
  if (now < rangeStart) {
    status = "upcoming";
    progress = 0;
    hint =
      showTime && dayDiff(start, now) === 0
        ? t("date.startsIn", { span: formatDuration(t, rangeStart - now) })
        : t("date.startsOn", { span: formatRelative(t, start, now) });
  } else if (now >= rangeEnd) {
    status = "done";
    progress = 1;
    hint = showTime
      ? formatDuration(t, end - start)
      : t("date.span.day", { count: dayDiff(end, start) + 1 });
  } else {
    status = "live";
    progress = (now - rangeStart) / (rangeEnd - rangeStart);
    const daysLeft = dayDiff(end, now);
    hint = showTime
      ? t("date.left", { span: formatDuration(t, end - now) })
      : daysLeft === 0
        ? t("date.endsToday")
        : t("date.left", { span: formatSpan(t, daysLeft) });
  }

  return {
    kind: "range",
    start: startLabel,
    end: endLabel,
    startTime: showTime ? formatTime(start) : null,
    endTime: showTime ? formatTime(end) : null,
    status,
    progress,
    hint,
    title: `${formatFull(t, start, showTime)} → ${formatFull(t, end, showTime)}`,
  };
};

const describeOpenRange = (
  t: DatabaseT,
  start: number,
  showTime: boolean,
  now: number
): RangeDateDisplay => ({
  kind: "range",
  start: formatMonthDay(t, start, yearOf(start) !== yearOf(now)),
  end: null,
  startTime: showTime ? formatTime(start) : null,
  endTime: null,
  status: "open",
  progress: 1,
  hint:
    now < start
      ? t("date.startsOn", { span: formatRelative(t, start, now) })
      : t("date.since", { span: formatSpan(t, dayDiff(now, start)) }),
  title: t("date.sinceTitle", { full: formatFull(t, start, showTime) }),
});

export const isEmptyDateValue = (value: DateValue | null | undefined) =>
  !value || (value.start === null && value.end === null);

/**
 * 把日期值转换为单元格展示模型（文案 + 相对「现在」的状态），空值返回 null。
 * 非范围列只看 start；范围列的同日（不含时间）或首尾相同按单日期展示。
 * 文案经词典翻译；未传 t 时用包内中文兜底（独立渲染 / 旧测试口径）。
 */
export const describeDate = (
  value: DateValue | null | undefined,
  { showTime = false, isRange = false }: DateDisplayOptions,
  now: number,
  t: DatabaseT = databaseFallbackT
): DateDisplay | null => {
  if (!value || isEmptyDateValue(value)) return null;
  const { start, end } = value;

  if (!isRange) {
    return start === null ? null : describeSingle(t, start, showTime, now);
  }
  if (start === null) {
    return end === null ? null : describeSingle(t, end, showTime, now);
  }
  if (end === null) return describeOpenRange(t, start, showTime, now);
  if (start === end || (!showTime && dayDiff(start, end) === 0)) {
    return describeSingle(t, start, showTime, now);
  }
  return start < end
    ? describeRange(t, start, end, showTime, now)
    : describeRange(t, end, start, showTime, now);
};
