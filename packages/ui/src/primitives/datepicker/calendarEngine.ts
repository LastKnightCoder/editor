/**
 * 日历引擎 —— DatePicker / DateRangePicker 共享的纯函数层。
 *
 * 值协议（string，不外泄 Date 对象）：
 *  - precision="day"     → "YYYY-MM-DD"
 *  - precision="minute"  → "YYYY-MM-DD HH:mm"
 * 解析一律本地时区并做回读校验（"2026-02-31" 这类越界串返回 null，不静默滚动）。
 * 六周固定 42 格：面板高度不随月跳变，界外日参与导航与点选（跨月自动接管视图）。
 */

export const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"] as const;
export const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"] as const;

export type DatePrecision = "day" | "minute";

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "YYYY-MM-DD" → 本地 Date（当天 00:00）；格式不符或日历上不存在的日期返回 null */
export function parseDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d
    ? date
    : null;
}

export function formatValue(date: Date, precision: DatePrecision): string {
  const day = toDateKey(date);
  return precision === "minute" ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
}

/** 接受两种精度的值串；带无效时刻的 minute 串按 day 落（时刻归一化见 normalizeTimeInput） */
export function parseValue(value: string): Date | null {
  const [day, time] = value.trim().split(/\s+/);
  const date = parseDateKey(day ?? "");
  if (!date) return null;
  if (time !== undefined) {
    const normalized = normalizeTimeInput(time);
    if (!normalized) return null;
    const [h, mi] = normalized.split(":").map(Number);
    date.setHours(h, mi, 0, 0);
  }
  return date;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function addDays(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

export function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

/** 周一起始的当周周一 */
export function startOfWeekMonday(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7));
}

/** 某月的六周固定网格（周一起始；首尾补界外日，inMonth 标记界内） */
export function monthCells(
  year: number,
  monthIndex: number
): { date: Date; key: string; inMonth: boolean }[] {
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const base = new Date(year, monthIndex, 1 - offset);
  const cells: { date: Date; key: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    cells.push({ date, key: toDateKey(date), inMonth: date.getMonth() === monthIndex });
  }
  return cells;
}

/**
 * 时刻归一化："9" → "09:00"、"9:5" → "09:05"、"09:05" 直映（中文冒号兼容）；
 * 越界（时 >23 / 分 >59）或非数字返回 null。
 */
export function normalizeTimeInput(text: string): string | null {
  const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(text.trim().replace(/：/g, ":"));
  if (!m) return null;
  const h = Number(m[1]);
  const minute = m[2] === undefined ? 0 : Number(m[2]);
  if (h > 23 || minute > 59) return null;
  return `${pad(h)}:${pad(minute)}`;
}

/** 一天的时刻网格刻度（step 分钟，默认 15）："00:00"、"00:15" … "23:45" */
export function timeGridValues(step = 15): string[] {
  const values: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += step) values.push(`${pad(h)}:${pad(m)}`);
  }
  return values;
}

/** 时刻 → 网格最近刻度（"10:37" 步长 15 → "10:30"）；值不在步长上时网格无命中格 */
export function nearestStep(time: string, step = 15): string {
  const [h, m] = time.split(":").map(Number);
  return `${pad(h)}:${pad(Math.floor(m / step) * step)}`;
}

/** 触发器显示格式："2026年9月19日"（minute 追加 " 15:00"） */
export function formatDisplay(value: string): string {
  const date = parseValue(value);
  if (!date) return value;
  const day = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  return value.includes(" ") ? `${day} ${value.slice(11)}` : day;
}

/**
 * 范围显示格式：同年省年份（"9月12日 – 9月19日"），跨年两端补全；
 * minute 值追加时刻，同日只写一次日期（"9月12日 09:00 – 18:00"）
 */
export function formatRangeDisplay(start: string, end: string): string {
  const s = parseValue(start);
  const e = parseValue(end);
  if (!s || !e) return `${start} – ${end}`;
  const timeOf = (value: string, date: Date) =>
    /\s/.test(value.trim()) ? ` ${formatValue(date, "minute").slice(11)}` : "";
  const startTime = timeOf(start, s);
  const endTime = timeOf(end, e);
  const md = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`;
  if (sameDay(s, e) && startTime && endTime) return `${md(s)}${startTime} –${endTime}`;
  return s.getFullYear() === e.getFullYear()
    ? `${md(s)}${startTime} – ${md(e)}${endTime}`
    : `${s.getFullYear()}年${md(s)}${startTime} – ${e.getFullYear()}年${md(e)}${endTime}`;
}
