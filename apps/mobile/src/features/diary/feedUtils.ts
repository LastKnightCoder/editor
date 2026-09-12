// 日记信息流共享工具：连续天数、周点阵等日期聚合。

import type { DiaryEntry } from "../../types";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDailyKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 今天的 YYYY-MM-DD */
export function getTodayDateKey(): string {
  return formatDailyKey(new Date());
}

/** 日记连续天数：今天没写不算断（从昨天起算）；昨天也没写则归零 */
export function computeDailyStreak(dailyDates: Set<string>, now: Date): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayKey = formatDailyKey(today);
  const cursor = dailyDates.has(todayKey) ? today : new Date(today.getTime() - DAY_MS);
  if (!dailyDates.has(formatDailyKey(cursor))) return 0;

  let streak = 0;
  const day = new Date(cursor.getTime());
  while (dailyDates.has(formatDailyKey(day))) {
    streak += 1;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

/** 本周 7 天（周一至周日）的记录点阵 */
export function computeWeekDots(
  dailyDates: Set<string>,
  now: Date
): Array<{ hit: boolean; future: boolean; today: boolean }> {
  const weekday = (now.getDay() + 6) % 7;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  weekStart.setDate(weekStart.getDate() - weekday);

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart.getTime() + index * DAY_MS);
    return {
      hit: dailyDates.has(formatDailyKey(day)),
      future: day.getTime() > now.getTime(),
      today: index === weekday,
    };
  });
}

/** 片段被删光后残留的空壳 entry 不算一篇日记：展示与统计都应忽略 */
export function hasDiaryContent(entry: DiaryEntry): boolean {
  return (entry.segments?.length ?? 0) > 0;
}

/** 从日记集合提取「日记」类型的有记录日期 */
export function collectDailyDates(entries: DiaryEntry[] | undefined): Set<string> {
  const keys = new Set<string>();
  (entries ?? []).forEach(entry => {
    if (entry.type === "daily" && hasDiaryContent(entry)) keys.add(entry.date);
  });
  return keys;
}
