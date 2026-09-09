import type { DiaryEntry, DiaryType } from "../../types";

const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function startOfDay(date: Date): Date {
  const normalized = new Date(date.getTime());
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function parseDateInput(input: Date | string | number): Date {
  if (input instanceof Date) {
    return startOfDay(input);
  }
  if (typeof input === "number") {
    return startOfDay(new Date(input));
  }
  if (typeof input === "string") {
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
    }
    return startOfDay(new Date(input));
  }
  return startOfDay(new Date());
}

function formatDailyDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getWeekStart(date: Date): Date {
  const normalized = startOfDay(date);
  const weekday = (normalized.getDay() + 6) % 7;
  normalized.setDate(normalized.getDate() - weekday);
  return normalized;
}

function getISOWeekNumber(date: Date): number {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil(((utcDate.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}

function getWeeklyYearByWeekEnd(date: Date): number {
  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart.getTime());
  weekEnd.setDate(weekStart.getDate() + 6);
  return weekEnd.getFullYear();
}

function findDateByWeeklyKey(weeklyKey: string): Date {
  const yearRaw = Number(weeklyKey.slice(0, 4));
  const weekRaw = Number(weeklyKey.slice(6, 8));
  if (!Number.isFinite(yearRaw) || !Number.isFinite(weekRaw)) {
    return startOfDay(new Date());
  }

  const cursor = new Date(yearRaw - 1, 11, 15, 0, 0, 0, 0);
  for (let offset = 0; offset < 430; offset += 1) {
    const candidate = new Date(cursor.getTime());
    candidate.setDate(cursor.getDate() + offset);
    if (getDiaryDateKey("weekly", candidate) === weeklyKey) {
      return getWeekStart(candidate);
    }
  }
  return startOfDay(new Date(yearRaw, 0, 1));
}

export function getDiaryDateKey(mode: DiaryType, baseDate: Date | string | number): string {
  const date = parseDateInput(baseDate);
  if (mode === "daily") {
    return formatDailyDate(date);
  }
  if (mode === "weekly") {
    const weekNo = getISOWeekNumber(date);
    const weekYear = getWeeklyYearByWeekEnd(date);
    return `${weekYear}-W${pad2(weekNo)}`;
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function shiftDiaryBaseDate(
  mode: DiaryType,
  baseDate: Date | string | number,
  delta: number
): string {
  const date = parseDateInput(baseDate);
  if (mode === "daily") {
    date.setDate(date.getDate() + delta);
    return formatDailyDate(date);
  }
  if (mode === "weekly") {
    date.setDate(date.getDate() + delta * 7);
    return formatDailyDate(date);
  }
  const day = date.getDate();
  const month = date.getMonth() + delta;
  const target = new Date(date.getFullYear(), month, 1, 0, 0, 0, 0);
  const maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, maxDay));
  return formatDailyDate(target);
}

export function formatDiaryPeriodLabel(mode: DiaryType, baseDate: Date | string | number): string {
  const date = parseDateInput(baseDate);
  if (mode === "daily") {
    const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
    return `${date.getFullYear()}年${pad2(date.getMonth() + 1)}月${pad2(date.getDate())}日 ${weekday}`;
  }
  if (mode === "weekly") {
    const weekNo = getISOWeekNumber(date);
    const weekStart = getWeekStart(date);
    const weekEnd = new Date(weekStart.getTime());
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekYear = weekEnd.getFullYear();
    return `${weekYear}年 第${weekNo}周 · ${pad2(weekStart.getMonth() + 1)}/${pad2(
      weekStart.getDate()
    )} - ${pad2(weekEnd.getMonth() + 1)}/${pad2(weekEnd.getDate())}`;
  }
  return `${date.getFullYear()}年${pad2(date.getMonth() + 1)}月`;
}

export function getBaseDateFromDiaryKey(type: DiaryType, key: string): string {
  if (type === "daily") {
    return key;
  }
  if (type === "weekly") {
    return formatDailyDate(findDateByWeeklyKey(key));
  }
  const match = key.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return formatDailyDate(new Date());
  }
  return `${match[1]}-${match[2]}-01`;
}

export function getDiaryComparableDate(type: DiaryType, key: string): string {
  if (type === "daily") {
    return key;
  }
  if (type === "weekly") {
    return getBaseDateFromDiaryKey(type, key);
  }
  return getBaseDateFromDiaryKey(type, key);
}

export function getDiaryComparableTimestamp(type: DiaryType, key: string): number {
  return parseDateInput(getDiaryComparableDate(type, key)).getTime();
}

export function sortDiaryEntriesDesc(entries: DiaryEntry[]): DiaryEntry[] {
  return [...entries].sort(
    (a, b) =>
      getDiaryComparableTimestamp(b.type, b.date) - getDiaryComparableTimestamp(a.type, a.date)
  );
}

export function groupDiaryEntriesByMonth(entries: DiaryEntry[]): Array<{
  monthKey: string;
  monthLabel: string;
  entries: DiaryEntry[];
}> {
  const sorted = sortDiaryEntriesDesc(entries);
  const groups = new Map<string, DiaryEntry[]>();

  for (const entry of sorted) {
    const comparable = getDiaryComparableDate(entry.type, entry.date);
    const monthKey = comparable.slice(0, 7);
    const bucket = groups.get(monthKey) ?? [];
    bucket.push(entry);
    groups.set(monthKey, bucket);
  }

  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([monthKey, monthEntries]) => {
      const [year, month] = monthKey.split("-");
      return {
        monthKey,
        monthLabel: `${year}年${month}月`,
        entries: monthEntries,
      };
    });
}
