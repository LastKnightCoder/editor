import type { ToolDisplayContext } from "../tools.messages";
// 工具展示用的纯函数：解析输入输出、把工具里的本地时间串写成手机上的说法。

/** JSON 对象解析；不是对象时返回 null */
export function parseObject(raw: string | undefined): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export const str = (value: unknown) => (typeof value === "string" ? value : undefined);
export const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
export const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(item => item && typeof item === "object") : [];

/** 工具层的结构化失败（success:false），返回它的说明 */
export function softFailure(
  output: Record<string, unknown> | null,
  t: ToolDisplayContext["t"]
): string | null {
  if (!output || output.success !== false) return null;
  return str(output.message) ?? str(output.error) ?? t("failure.default");
}

export function prettyJson(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

const DAY_MS = 86_400_000;
export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

type DateDisplayContext = ToolDisplayContext & { now?: Date };
function dateLabel(date: Date, locale: string, year = false) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" as const } : {}),
  }).format(date);
}

export function dayLabel(
  date: Date,
  {
    now = new Date(),
    weekday = true,
    relative = true,
    ...context
  }: DateDisplayContext & { weekday?: boolean; relative?: boolean }
) {
  const diff = Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
  if (relative && diff === 0) return context.t("date.today");
  if (relative && diff === 1) return context.t("date.tomorrow");
  if (relative && diff === -1) return context.t("date.yesterday");
  const label = dateLabel(date, context.locale, date.getFullYear() !== now.getFullYear());
  return weekday
    ? context.t("date.weekday", {
        date: label,
        weekday: new Intl.DateTimeFormat(context.locale, { weekday: "short" }).format(date),
      })
    : label;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;

/** 解析工具里的 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm（本地时间） */
export function parseLocalText(value: unknown): { date: Date; time: string | null } | null {
  const match = typeof value === "string" ? LOCAL.exec(value) : null;
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  return {
    date: new Date(Number(y), Number(m) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0)),
    time: hh === undefined ? null : `${hh}:${mm}`,
  };
}

/** 截止时间；无效时返回 null。 */
export function formatDue(value: unknown, context: DateDisplayContext) {
  const parsed = parseLocalText(value);
  if (!parsed) return null;
  return parsed.time
    ? `${dayLabel(parsed.date, context)} ${parsed.time}`
    : dayLabel(parsed.date, context);
}

/** 已过截止时间（未完成待办标红用） */
export function isOverdue(value: unknown, now = new Date()) {
  const parsed = parseLocalText(value);
  if (!parsed) return false;
  return parsed.time
    ? parsed.date.getTime() < now.getTime()
    : parsed.date.getTime() < startOfDay(now);
}

/** endExclusive 只用于全天日程的输入，查询结果的结束日包含当天。 */
export function formatEventRange(
  start: unknown,
  end: unknown,
  allDay: boolean,
  {
    endExclusive = false,
    now = new Date(),
    ...context
  }: DateDisplayContext & { endExclusive?: boolean }
) {
  const from = parseLocalText(start);
  if (!from) return null;
  const to = parseLocalText(end);
  const display = { ...context, now };
  if (allDay || !from.time) {
    let last = to?.date ?? from.date;
    if (endExclusive && to && startOfDay(to.date) > startOfDay(from.date))
      last = new Date(startOfDay(to.date) - DAY_MS);
    return startOfDay(last) > startOfDay(from.date)
      ? context.t("date.until", { from: dayLabel(from.date, display), to: dayLabel(last, display) })
      : context.t("date.dayAllDay", { date: dayLabel(from.date, display) });
  }
  const head = `${dayLabel(from.date, display)} ${from.time}`;
  if (!to?.time) return head;
  return startOfDay(to.date) === startOfDay(from.date)
    ? `${head}–${to.time}`
    : context.t("date.until", { from: head, to: `${dayLabel(to.date, display)} ${to.time}` });
}

export function formatDayRange(start: unknown, end: unknown, context: DateDisplayContext) {
  const from = parseLocalText(start)?.date;
  const to = parseLocalText(end)?.date;
  if (!from) return null;
  if (!to || startOfDay(to) === startOfDay(from))
    return dayLabel(from, { ...context, weekday: false });
  const head = dateLabel(from, context.locale);
  return from.getMonth() === to.getMonth()
    ? context.t("date.sameMonth", { from: head, day: formatCount(to.getDate(), context.locale) })
    : context.t("date.range", { from: head, to: dateLabel(to, context.locale) });
}

/** 插件 / MCP 工具名转成可读叫法：plugin_ns__search-bookmarks → search bookmarks */
export function humanizeToolName(name: string) {
  const tail = name.split("__").at(-1) ?? name;
  const words = tail
    .replace(/^plugin_[0-9a-f]{16}_/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return words || name;
}

export const formatCount = (value: number, locale: string) => value.toLocaleString(locale);
