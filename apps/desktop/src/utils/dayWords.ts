/**
 * 自然日口径的日期分类（纯函数，显式接收 now）：待办议程与编辑器里的日期胶囊共用。
 * 本周 = 周一至周日。
 */

export const DAY_MS = 86_400_000;

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

/** 日期标签类别；展示语言不参与自然日与周一边界判断。 */
export function dayLabelKind(ts: number, now: number): "relative" | "weekday" | "date" {
  const diff = dayDiff(ts, now);
  if (diff === 0 || diff === 1 || diff === 2 || diff === -1) return "relative";
  return diff > 0 && diff <= daysLeftInWeek(now) ? "weekday" : "date";
}

/** 周一在前、周日在后，保留重复值且不修改原列表。 */
export function mondayFirstWeekdays(days: readonly number[]): number[] {
  return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
}
