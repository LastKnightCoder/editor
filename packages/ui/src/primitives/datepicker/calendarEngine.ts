/**
 * 日历引擎 —— DatePicker / DateRangePicker 共享的纯函数层。
 *
 * 值协议（string，不外泄 Date 对象）：
 *  - precision="day"     → "YYYY-MM-DD"
 *  - precision="minute"  → "YYYY-MM-DD HH:mm"
 * 解析一律本地时区并做回读校验（"2026-02-31" 这类越界串返回 null，不静默滚动）。
 * 六周固定 42 格：面板高度不随月跳变，界外日参与导航与点选（跨月自动接管视图）。
 */

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

/** 周一起始的标题，身份使用星期数字而非译文。 */
export function weekdayLabels(locale: string): { day: number; label: string }[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  return [1, 2, 3, 4, 5, 6, 0].map(day => ({
    day,
    label: formatter.format(new Date(2023, 0, day + 1)),
  }));
}

const displayDate = (date: Date, locale: string, includeYear: boolean) =>
  new Intl.DateTimeFormat(locale, {
    year: includeYear ? "numeric" : undefined,
    month: "long",
    day: "numeric",
  }).format(date);
const displayTime = (date: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    date
  );

/** 只格式化显示，不改写原值；无效值原样保留。 */
export function formatDisplay(value: string, locale: string): string {
  const date = parseValue(value);
  if (!date) return value;
  const day = displayDate(date, locale, true);
  return value.includes(" ") ? `${day} ${value.slice(11)}` : day;
}

/** 同年省年份，跨年补全；同日 minute 范围只写一次日期。 */
export function formatRangeDisplay(start: string, end: string, locale: string): string {
  const s = parseValue(start);
  const e = parseValue(end);
  if (!s || !e) return `${start} – ${end}`;
  const startTime = /\s/.test(start.trim()) ? ` ${displayTime(s, locale)}` : "";
  const endTime = /\s/.test(end.trim()) ? ` ${displayTime(e, locale)}` : "";
  const includeYear = s.getFullYear() !== e.getFullYear();
  const from = displayDate(s, locale, includeYear);
  if (sameDay(s, e) && startTime && endTime) return `${from}${startTime} –${endTime}`;
  return `${from}${startTime} – ${displayDate(e, locale, includeYear)}${endTime}`;
}
