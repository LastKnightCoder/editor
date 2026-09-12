// 番茄专注计时纯函数：elapsed/remain 推算与时间格式化。
// 会话时间戳由后端持有（start/pauses），前端只做本地推算（tick 不发 IPC）。

import type { PomodoroSession } from "../../types";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** 会话已专注毫秒：now - start - 暂停累计（进行中的未闭合暂停段按 now 闭合计） */
export function computeElapsedMs(session: PomodoroSession, now: number): number {
  let pauseTotalMs = session.pauseTotalMs;
  if (session.status === "paused") {
    const last = session.pauses[session.pauses.length - 1];
    if (last && last.end == null) {
      pauseTotalMs += Math.max(0, now - last.start);
    }
  }
  return Math.max(0, now - session.startTime - pauseTotalMs);
}

/** 倒计时剩余毫秒；正计时或无期望时长返回 null */
export function computeRemainMs(session: PomodoroSession, now: number): number | null {
  if (session.expectedMs == null || session.expectedMs <= 0) return null;
  return Math.max(0, session.expectedMs - computeElapsedMs(session, now));
}

/** 计时表盘字符串：>=1h 显示 H:MM:SS，否则 MM:SS（倒计时展示剩余，正计时展示已专注） */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}

/** 专注时长展示：1h05m / 25m / 0m */
export function formatFocusDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "0m";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0) return rest > 0 ? `${hours}h${String(rest).padStart(2, "0")}m` : `${hours}h`;
  return `${minutes}m`;
}

/** 本地时区某时刻所在天的零点毫秒 */
export function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 今日 [零点, 23:59:59.999] 区间（对齐桌面端 summaryToday 口径） */
export function todayRange(now = new Date()): { start: number; end: number } {
  const start = startOfDay(now);
  return { start, end: start + DAY_MS - 1 };
}

/** 以周一为一周起点：返回包含 now 的那周的 7 个零点时间戳（周一→周日） */
export function weekDayStarts(now = new Date()): number[] {
  const monday = startOfWeek(0, now);
  return Array.from({ length: 7 }, (_, i) => monday + i * DAY_MS);
}

/** 周一锚点：包含 now 的那周（offsetWeeks=0）或前后某周的周一零点 */
export function startOfWeek(offsetWeeks: number, now = new Date()): number {
  const monday = startOfDay(now) - weekdayIndex(now) * DAY_MS;
  return monday + offsetWeeks * 7 * DAY_MS;
}

/** 一周内相对某基准时刻的天序号（0=周一 … 6=周日） */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}
