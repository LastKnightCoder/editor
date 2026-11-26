/**
 * 账本时间窗口：以「日起点」表示的闭区间 [from, to]（to 不晚于今天）。
 * 快捷区间、翻页与居中跳转都是纯函数；日期推算走本地日历，跨夏令时安全。
 */

import { DAY_MS, startOfDay } from "./model";

export interface DayWindow {
  from: number;
  to: number;
}

export type QuickKey =
  | "last7"
  | "last14"
  | "last30"
  | "last90"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "pastYear"
  | `year-${number}`;

export interface QuickRange {
  key: QuickKey;
  window: DayWindow;
}

/** 日起点加减 n 天（取中午再归零，避开夏令时 23 / 25 小时的日子） */
export const addDays = (dayStart: number, n: number) =>
  startOfDay(dayStart + n * DAY_MS + DAY_MS / 2);

export const windowDays = (w: DayWindow) => Math.round((w.to - w.from) / DAY_MS) + 1;

/** 窗口内每一天，新的在前 */
export function listDays(w: DayWindow): number[] {
  const out: number[] = [];
  for (let d = w.to; d >= w.from; d = addDays(d, -1)) out.push(d);
  return out;
}

const dayOf = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

/** 截至今天的近 n 天 */
export const lastDays = (n: number, now: number): DayWindow => {
  const today = startOfDay(now);
  return { from: addDays(today, -(n - 1)), to: today };
};

/** earliest：最早一条记录所在日（无记录为 null），决定往年快捷项 */
export function quickRanges(now: number, earliest: number | null): (QuickRange | "-")[] {
  const today = startOfDay(now);
  const d = new Date(now);
  const y = d.getFullYear();
  const m = d.getMonth();
  const list: (QuickRange | "-")[] = [
    { key: "last7", window: lastDays(7, now) },
    { key: "last14", window: lastDays(14, now) },
    { key: "last30", window: lastDays(30, now) },
    { key: "last90", window: lastDays(90, now) },
    "-",
    { key: "thisMonth", window: { from: dayOf(y, m, 1), to: today } },
    { key: "lastMonth", window: { from: dayOf(y, m - 1, 1), to: dayOf(y, m, 0) } },
    { key: "thisYear", window: { from: dayOf(y, 0, 1), to: today } },
    { key: "pastYear", window: lastDays(365, now) },
  ];
  if (earliest != null) {
    const firstYear = new Date(earliest).getFullYear();
    if (firstYear < y) list.push("-");
    for (let yy = y - 1; yy >= firstYear; yy--)
      list.push({
        key: `year-${yy}`,
        window: { from: dayOf(yy, 0, 1), to: dayOf(yy, 11, 31) },
      });
  }
  return list;
}

export function resolveQuick(
  key: QuickKey,
  now: number,
  earliest: number | null
): DayWindow | null {
  const found = quickRanges(now, earliest).find(q => q !== "-" && q.key === key);
  return found && found !== "-" ? found.window : null;
}

/** 保持长度、尽量让 day 居中（不越过今天） */
export function windowAround(day: number, length: number, now: number): DayWindow {
  const today = startOfDay(now);
  let to = addDays(day, Math.floor((length - 1) / 2));
  if (to > today) to = today;
  return { from: addDays(to, -(length - 1)), to };
}

/** 按窗口长度前后翻页；往后不越过今天（贴到今天时保持原长度） */
export function shiftWindow(w: DayWindow, dir: -1 | 1, now: number): DayWindow {
  const length = windowDays(w);
  const today = startOfDay(now);
  if (dir < 0) return { from: addDays(w.from, -length), to: addDays(w.from, -1) };
  const to = Math.min(today, addDays(w.to, length));
  return { from: addDays(to, -(length - 1)), to };
}

export function monthWindow(year: number, month: number, now: number): DayWindow {
  return { from: dayOf(year, month, 1), to: Math.min(startOfDay(now), dayOf(year, month + 1, 0)) };
}

/** 截至今天的近 7 / 14 / 30 天窗口对应的快捷键（顶部分段据此高亮） */
export function lastDaysKey(w: DayWindow, now: number): QuickKey | null {
  if (w.to !== startOfDay(now)) return null;
  const n = windowDays(w);
  return n === 7 ? "last7" : n === 14 ? "last14" : n === 30 ? "last30" : n === 90 ? "last90" : null;
}
