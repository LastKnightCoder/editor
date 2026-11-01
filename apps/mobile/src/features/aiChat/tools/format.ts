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
export function softFailure(output: Record<string, unknown> | null): string | null {
  if (!output || output.success !== false) return null;
  return str(output.message) ?? str(output.error) ?? "执行没有成功";
}

export function prettyJson(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const DAY_MS = 86_400_000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 「今天」「明天」「11月7日 周五」，跨年补年份 */
export function dayLabel(date: Date, now = new Date()) {
  const diff = Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === -1) return "昨天";
  const base = `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${date.getFullYear()}年${base}`;
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

/** 截止时间：「周五 18:00」；无效时返回 null */
export function formatDue(value: unknown, now = new Date()) {
  const parsed = parseLocalText(value);
  if (!parsed) return null;
  return parsed.time ? `${dayLabel(parsed.date, now)} ${parsed.time}` : dayLabel(parsed.date, now);
}

/** 已过截止时间（未完成待办标红用） */
export function isOverdue(value: unknown, now = new Date()) {
  const parsed = parseLocalText(value);
  if (!parsed) return false;
  return parsed.time
    ? parsed.date.getTime() < now.getTime()
    : parsed.date.getTime() < startOfDay(now);
}

/**
 * 日程起止：「周四 15:00–16:00」「11月5日 全天」。
 * endExclusive：全天日程的 end 是否不含当天（新建/修改的入参如此，查询结果的 end 含当天）。
 */
export function formatEventRange(
  start: unknown,
  end: unknown,
  allDay: boolean,
  { endExclusive = false, now = new Date() } = {}
) {
  const from = parseLocalText(start);
  if (!from) return null;
  const to = parseLocalText(end);
  if (allDay || !from.time) {
    let last = to?.date ?? from.date;
    if (endExclusive && to && startOfDay(to.date) > startOfDay(from.date))
      last = new Date(startOfDay(to.date) - DAY_MS);
    return startOfDay(last) > startOfDay(from.date)
      ? `${dayLabel(from.date, now)} 至 ${dayLabel(last, now)}`
      : `${dayLabel(from.date, now)} 全天`;
  }
  const head = `${dayLabel(from.date, now)} ${from.time}`;
  if (!to?.time) return head;
  return startOfDay(to.date) === startOfDay(from.date)
    ? `${head}–${to.time}`
    : `${head} 至 ${dayLabel(to.date, now)} ${to.time}`;
}

/** 查询窗口：「11月3日–9日」「今天」 */
export function formatDayRange(start: unknown, end: unknown, now = new Date()) {
  const from = parseLocalText(start)?.date;
  const to = parseLocalText(end)?.date;
  if (!from) return null;
  if (!to || startOfDay(to) === startOfDay(from)) return dayLabel(from, now).split(" ")[0];
  const head = `${from.getMonth() + 1}月${from.getDate()}日`;
  return from.getMonth() === to.getMonth()
    ? `${head}–${to.getDate()}日`
    : `${head}–${to.getMonth() + 1}月${to.getDate()}日`;
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

export const formatCount = (value: number) => value.toLocaleString("en-US");
