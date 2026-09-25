/**
 * 待办页纯派生层（无 React、无 IPC）：时间分段 / 排序 / 日期文案 / 周期打卡统计。
 * 所有函数显式接收 now（毫秒时间戳），便于单测固定「今天」。
 *
 * 时间口径：
 *  - 截止任务「只到日期」= dueAt 落在当日 0 点（与日历同步的全天事件同口径：时间部分为 0 即全天）；
 *  - 逾期按自然日判断（昨天及更早未完成），不按时刻——今天 17:00 到期的任务整天都在「今天」段；
 *  - 本周 = 周一至周日（中文习惯），「本周稍后」= 后天起至本周日；
 *  - 周期任务无时刻字段（TodoRecurrence 只有日期规则），议程里按「打卡」全天项呈现。
 */

import dayjs from "dayjs";
import type { TodoRecurrence } from "@/types";
import { isDateScheduledForRecurrence } from "@/utils/recurrence";
import type { BucketKey, HabitCell, HabitCellState, TodoEntry, TodoSnapshot } from "./types";

export const DAY_MS = 86_400_000;
export const WEEKDAY_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

/* ---------- 日期基础 ---------- */

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
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

/** 本周一 0 点 */
export function startOfWeek(now: number): number {
  const wd = new Date(now).getDay();
  return startOfDay(now) - ((wd + 6) % 7) * DAY_MS;
}

export function hm(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 时间部分为 0 = 只到日期（全天） */
export function isDateOnly(ts: number): boolean {
  return ts === startOfDay(ts);
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

/** 日期 + 时刻（只到日期时省略时刻） */
export function dateTimeWord(ts: number, now: number): string {
  return isDateOnly(ts) ? dayWord(ts, now) : `${dayWord(ts, now)} ${hm(ts)}`;
}

/* ---------- 周期规则 ---------- */

export function isScheduledOn(recurrence: TodoRecurrence, day: number): boolean {
  return isDateScheduledForRecurrence(recurrence, dayjs(day));
}

/** 从 now 起第 fromOffset 天开始找下一次计划日（找不到返回 null，窗口 400 天） */
export function nextOccurrence(
  recurrence: TodoRecurrence,
  now: number,
  fromOffset = 0
): number | null {
  const base = startOfDay(now);
  for (let i = fromOffset; i < 400; i++) {
    const day = base + i * DAY_MS;
    if (isScheduledOn(recurrence, day)) return day;
  }
  return null;
}

export function scheduledToday(entry: TodoEntry, now: number): boolean {
  return (
    entry.type === "recurring" &&
    entry.recurrence !== null &&
    isScheduledOn(entry.recurrence, startOfDay(now))
  );
}

/** 今天是否已打卡 */
export function doneToday(entry: TodoEntry, now: number): boolean {
  return entry.occurrences.get(startOfDay(now)) === "done";
}

const WEEKDAY_SHORT = ["日", "一", "二", "三", "四", "五", "六"];

export function recurrenceText(recurrence: TodoRecurrence): string {
  const n = Math.max(1, recurrence.interval || 1);
  const start = new Date(recurrence.startDate);
  switch (recurrence.type) {
    case "daily":
      return n === 1 ? "每天" : `每 ${n} 天`;
    case "weekdays":
      return "工作日";
    case "weekly": {
      const days = recurrence.weekdays?.length ? recurrence.weekdays : [start.getDay()];
      // 周一在前、周日殿后
      const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      return `${n === 1 ? "每周" : `每 ${n} 周的周`}${sorted.map(d => WEEKDAY_SHORT[d]).join("、")}`;
    }
    case "monthly":
      return `${n === 1 ? "每月" : `每 ${n} 个月的`} ${recurrence.monthDay ?? start.getDate()} 日`;
    case "yearly":
      return `每年 ${recurrence.yearMonth ?? start.getMonth() + 1} 月 ${recurrence.yearDay ?? start.getDate()} 日`;
    default:
      return `每 ${n} 天`;
  }
}

/* ---------- 完成态 ---------- */

/** 「未完成」口径：一次性任务看 isCompleted；周期任务看今天是否已打卡（非计划日视为未完成——它仍是活跃习惯） */
export function isOpen(entry: TodoEntry, now: number): boolean {
  return entry.type === "recurring" ? !doneToday(entry, now) : !entry.isCompleted;
}

export function isOverdue(entry: TodoEntry, now: number): boolean {
  if (entry.isCompleted) return false;
  if (entry.type === "deadline" && entry.dueAt != null) return dayDiff(entry.dueAt, now) < 0;
  if (entry.type === "planned" && entry.dueAt != null) return dayDiff(entry.dueAt, now) < 0;
  return false;
}

/** 计划任务今天处于起止区间内 */
export function isRunning(entry: TodoEntry, now: number): boolean {
  if (entry.type !== "planned" || entry.startAt == null) return false;
  const end = entry.dueAt ?? entry.startAt;
  return dayDiff(entry.startAt, now) <= 0 && dayDiff(end, now) >= 0;
}

/* ---------- 议程分段与排序 ---------- */

function bucketForDay(diff: number, now: number): BucketKey {
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= daysLeftInWeek(now)) return "week";
  return "later";
}

export function bucketOf(entry: TodoEntry, now: number): BucketKey {
  switch (entry.type) {
    case "deadline":
      return entry.dueAt == null ? "none" : bucketForDay(dayDiff(entry.dueAt, now), now);
    case "planned": {
      if (entry.startAt == null && entry.dueAt == null) return "none";
      if (isRunning(entry, now)) return "today";
      const end = entry.dueAt ?? entry.startAt!;
      if (dayDiff(end, now) < 0) return "overdue";
      return bucketForDay(dayDiff(entry.startAt ?? end, now), now);
    }
    case "recurring": {
      if (!entry.recurrence) return "none";
      const next = nextOccurrence(entry.recurrence, now);
      return next == null ? "none" : bucketForDay(dayDiff(next, now), now);
    }
    default:
      return "none";
  }
}

/** 段内排序键：截止看 dueAt、计划看开始、周期看下一次计划日（全天，排在同日带时刻项之前） */
export function sortKey(entry: TodoEntry, now: number): number {
  switch (entry.type) {
    case "deadline":
      return entry.dueAt ?? Number.MAX_SAFE_INTEGER;
    case "planned":
      return isRunning(entry, now)
        ? startOfDay(now)
        : (entry.startAt ?? entry.dueAt ?? Number.MAX_SAFE_INTEGER);
    case "recurring":
      return entry.recurrence
        ? (nextOccurrence(entry.recurrence, now) ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}

/** 议程段先后（与待办页按日期分段同序） */
export const BUCKET_RANK: Record<BucketKey, number> = {
  overdue: 0,
  today: 1,
  tomorrow: 2,
  week: 3,
  later: 4,
  none: 5,
};

/* ---------- 可见范围 ---------- */

/** 进行中项目下的条目：快照含已归档项目的任务，视图一律经此过滤；hidden 为额外隐藏的 id */
export function liveEntries(snapshot: TodoSnapshot, hidden?: ReadonlySet<number>): TodoEntry[] {
  const activeIds = new Set(snapshot.groups.map(g => g.id));
  return snapshot.entries.filter(e => activeIds.has(e.groupId) && !hidden?.has(e.id));
}

/** 删除项目的影响范围：本项目全部任务 + 它们的子孙（跨项目挂着的子孙也算，与主进程 deleteGroup 同口径） */
export function groupDeletionIds(snapshot: TodoSnapshot, groupId: number): Set<number> {
  const ids = new Set<number>();
  const visit = (id: number) => {
    if (ids.has(id)) return; // 去重兼防环
    ids.add(id);
    snapshot.byId.get(id)?.childIds.forEach(visit);
  };
  snapshot.entries.filter(e => e.groupId === groupId).forEach(e => visit(e.id));
  return ids;
}

/** 未完成的顶层任务（= 待办页「全部」计数口径），按议程段 + 段内时间排序 */
export function openRoots(entries: TodoEntry[], now: number): TodoEntry[] {
  return entries
    .filter(e => e.parentId == null && isOpen(e, now))
    .sort(
      (a, b) =>
        BUCKET_RANK[bucketOf(a, now)] - BUCKET_RANK[bucketOf(b, now)] ||
        sortKey(a, now) - sortKey(b, now) ||
        a.sortIndex - b.sortIndex
    );
}

/* ---------- 打卡统计 ---------- */

/** 某计划日的打卡状态（非计划日 off、未来 future、今天未打 today、过去未打 miss） */
export function occurrenceState(entry: TodoEntry, day: number, now: number): HabitCellState {
  const rec = entry.recurrence;
  const diff = dayDiff(day, now);
  if (diff > 0 || !rec || day < startOfDay(rec.startDate)) return "future";
  if (!isScheduledOn(rec, day)) return "off";
  const mark = entry.occurrences.get(startOfDay(day));
  if (mark === "done") return "done";
  if (mark === "skip") return "skip";
  return diff === 0 ? "today" : "miss";
}

/** 连续打卡：从今天往回数计划日，完成 +1、跳过不断链、缺卡即断；今天未打不算断 */
export function streakOf(entry: TodoEntry, now: number): number {
  if (!entry.recurrence) return 0;
  let streak = 0;
  const today = startOfDay(now);
  for (let i = 0; i < 366; i++) {
    const day = today - i * DAY_MS;
    const state = occurrenceState(entry, day, now);
    if (state === "future") break; // 早于规则开始
    if (state === "off" || state === "skip" || state === "today") continue;
    if (state === "done") streak += 1;
    else break;
  }
  return streak;
}

/** 按周列对齐的热力格：weeks 列 × 7 行（行 = 周一 … 周日），本周剩余日为 future */
export function habitCells(entry: TodoEntry, now: number, weeks = 12): HabitCell[] {
  const first = startOfWeek(now) - (weeks - 1) * 7 * DAY_MS;
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const day = first + i * DAY_MS;
    return { day, state: occurrenceState(entry, day, now) };
  });
}

/** 近 weeks 周的完成率（分母 = 已过去的计划日 + 今天若已打卡；跳过不计入分母） */
export function habitStats(
  entry: TodoEntry,
  now: number,
  weeks = 12
): { done: number; rate: number; total: number } {
  const cells = habitCells(entry, now, weeks);
  const done = cells.filter(c => c.state === "done").length;
  const denominator = cells.filter(c => c.state === "done" || c.state === "miss").length;
  let total = 0;
  for (const mark of entry.occurrences.values()) if (mark === "done") total += 1;
  return { done, rate: denominator ? Math.round((done / denominator) * 100) : 0, total };
}

/* ---------- 提醒 ---------- */

const MINUTE = 60_000;

/** 提前提醒选项（remindBefore 单位毫秒；与 legacy ReminderSelect 同档） */
export const REMIND_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "不提醒" },
  { value: 0, label: "准时" },
  { value: 5 * MINUTE, label: "提前 5 分钟" },
  { value: 10 * MINUTE, label: "提前 10 分钟" },
  { value: 15 * MINUTE, label: "提前 15 分钟" },
  { value: 30 * MINUTE, label: "提前 30 分钟" },
  { value: 60 * MINUTE, label: "提前 1 小时" },
  { value: 120 * MINUTE, label: "提前 2 小时" },
  { value: 1440 * MINUTE, label: "提前 1 天" },
];

export function remindText(remindBefore: number | null | undefined): string {
  if (remindBefore == null) return "不提醒";
  const hit = REMIND_OPTIONS.find(o => o.value === remindBefore);
  if (hit) return hit.label;
  const minutes = Math.round(remindBefore / MINUTE);
  return minutes >= 60 ? `提前 ${Math.round(minutes / 60)} 小时` : `提前 ${minutes} 分钟`;
}
