/**
 * 自然日口径的日期文案（纯函数，显式接收 now）：待办议程与编辑器里的日期胶囊共用。
 * 本周 = 周一至周日。
 */

export const DAY_MS = 86_400_000;
export const WEEKDAY_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 时间部分为 0 = 只到日期（全天） */
export function isDateOnlyTs(ts: number): boolean {
  return ts === startOfDay(ts);
}

/** ts 所在自然日相对 now 的天数差（今天 0、明天 1、昨天 -1） */
export function dayDiff(ts: number, now: number): number {
  return Math.round((startOfDay(ts) - startOfDay(now)) / DAY_MS);
}

/** 今天距本周日还有几天（周一起算的一周；周日为 0） */
export function daysLeftInWeek(now: number): number {
  const wd = new Date(now).getDay();
  return wd === 0 ? 0 : 7 - wd;
}

export function monthDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 相对日期词：今天 / 明天 / 后天 / 昨天 / 本周内用周几 / 其余用月日 */
export function dayWord(ts: number, now: number): string {
  const diff = dayDiff(ts, now);
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  if (diff === -1) return "昨天";
  if (diff > 0 && diff <= daysLeftInWeek(now)) return WEEKDAY_CN[new Date(ts).getDay()];
  return monthDay(ts);
}
