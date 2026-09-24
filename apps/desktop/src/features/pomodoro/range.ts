/**
 * 账本时间窗口：以「日起点」表示的闭区间 [from, to]（to 不晚于今天）。
 * 快捷区间、翻页、居中跳转、标题文案都是纯函数；日期推算走本地日历，跨夏令时安全。
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
  label: string;
  window: DayWindow;
}

/** 日起点加减 n 天（取中午再归零，避开夏令时 23 / 25 小时的日子） */
export const addDays = (dayStart: number, n: number) =>
  startOfDay(dayStart + n * DAY_MS + DAY_MS / 2);

export const windowDays = (w: DayWindow) => Math.round((w.to - w.from) / DAY_MS) + 1;

export const inWindow = (ts: number, w: DayWindow) => {
  const day = startOfDay(ts);
  return day >= w.from && day <= w.to;
};

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
    { key: "last7", label: "近 7 天", window: lastDays(7, now) },
    { key: "last14", label: "近 14 天", window: lastDays(14, now) },
    { key: "last30", label: "近 30 天", window: lastDays(30, now) },
    { key: "last90", label: "近 90 天", window: lastDays(90, now) },
    "-",
    { key: "thisMonth", label: "本月", window: { from: dayOf(y, m, 1), to: today } },
    { key: "lastMonth", label: "上个月", window: { from: dayOf(y, m - 1, 1), to: dayOf(y, m, 0) } },
    { key: "thisYear", label: "今年", window: { from: dayOf(y, 0, 1), to: today } },
    { key: "pastYear", label: "过去一年", window: lastDays(365, now) },
  ];
  if (earliest != null) {
    const firstYear = new Date(earliest).getFullYear();
    if (firstYear < y) list.push("-");
    for (let yy = y - 1; yy >= firstYear; yy--)
      list.push({
        key: `year-${yy}`,
        label: `${yy}年`,
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

const md = (ts: number) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};
const ymd = (ts: number) => `${new Date(ts).getFullYear()}年${md(ts)}`;

/** 标题：快捷项名，否则具体日期（跨年或非今年时带年份） */
export function windowLabel(
  w: DayWindow,
  key: QuickKey | null,
  now: number,
  earliest: number | null
): string {
  const quick = key ? quickRanges(now, earliest).find(q => q !== "-" && q.key === key) : undefined;
  if (quick && quick !== "-") return quick.label;
  const thisYear = new Date(now).getFullYear();
  const withYear =
    new Date(w.from).getFullYear() !== thisYear || new Date(w.to).getFullYear() !== thisYear;
  const fmt = withYear ? ymd : md;
  return w.from === w.to ? fmt(w.from) : `${fmt(w.from)} – ${fmt(w.to)}`;
}
