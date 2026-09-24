/**
 * 番茄专注纯函数：计时推导、时间格式、按日 / 时段聚合、连续天数、提前结束判定。
 * 无 React、无命令调用，页面 / 小窗 / 沉浸窗共用；单测见 __tests__/model.test.ts。
 */

import type { PomodoroPreset, PomodoroSession } from "@/types";

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** 主进程结束会话时，专注不足该时长直接丢弃、不落库 */
export const MIN_RECORD_MS = 5 * MINUTE_MS;

/** 账本 / 时段分布的时间轴范围（点钟） */
export const AXIS_FROM_HOUR = 6;
export const AXIS_TO_HOUR = 24;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** ts 所在日相对 now 所在日的偏移（今天 0、昨天 -1） */
export function dayOffset(ts: number, now: number): number {
  return Math.round((startOfDay(ts) - startOfDay(now)) / DAY_MS);
}

/* ---------- 计时 ---------- */

export interface SessionTiming {
  elapsedMs: number;
  /** 倒计时剩余；正计时为 undefined */
  remainMs: number | undefined;
  /** 0–1：倒计时 = 已专注 / 预期；正计时按小时一圈 */
  progress: number;
  /** 大字显示值：倒计时显示剩余，正计时显示已专注 */
  displayMs: number;
  paused: boolean;
  /** 运行中的倒计时预计结束时刻；暂停或正计时为 null */
  endsAt: number | null;
  /** 此刻结束会被主进程丢弃 */
  willDiscard: boolean;
}

/** 与主进程 tick 同一算法：进行中的暂停段计入暂停总时长 */
export function sessionTiming(session: PomodoroSession, now: number): SessionTiming {
  let pauseTotalMs = session.pauseTotalMs;
  const last = session.pauses[session.pauses.length - 1];
  const paused = session.status === "paused";
  if (paused && last && last.end === undefined) pauseTotalMs += now - last.start;
  const elapsedMs = Math.max(0, now - session.startTime - pauseTotalMs);
  const expected = session.expectedMs && session.expectedMs > 0 ? session.expectedMs : undefined;
  const remainMs = expected !== undefined ? Math.max(0, expected - elapsedMs) : undefined;
  return {
    elapsedMs,
    remainMs,
    progress:
      expected !== undefined ? Math.min(1, elapsedMs / expected) : (elapsedMs % HOUR_MS) / HOUR_MS,
    displayMs: remainMs ?? elapsedMs,
    paused,
    endsAt: remainMs !== undefined && !paused ? now + remainMs : null,
    willDiscard: elapsedMs < MIN_RECORD_MS,
  };
}

/** 倒计时未到点手动结束（容差 30s）；历史数据里提前结束多被记成 completed，故按时长推导而不看 status */
export function isEarlyStop(session: Pick<PomodoroSession, "expectedMs" | "focusMs">): boolean {
  return !!session.expectedMs && session.focusMs < session.expectedMs - 30_000;
}

/* ---------- 格式 ---------- */

const pad = (n: number) => String(n).padStart(2, "0");

/** 25:00 / 1:05:09 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return (h > 0 ? `${h}:${pad(m)}` : pad(m)) + `:${pad(s)}`;
}

/** 1h 05m / 25m */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / MINUTE_MS);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${pad(m)}m` : `${m}m`;
}

/** 1 小时 5 分 / 25 分钟 */
export function formatDurationCN(ms: number): string {
  const minutes = Math.round(ms / MINUTE_MS);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} 分钟`;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

export function formatHM(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const WEEK = "日一二三四五六";
export const weekdayLabel = (ts: number) => `周${WEEK[new Date(ts).getDay()]}`;
export const monthDayLabel = (ts: number) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

export function dayLabel(ts: number, now: number): string {
  const offset = dayOffset(ts, now);
  if (offset === 0) return "今天";
  if (offset === -1) return "昨天";
  if (offset === -2) return "前天";
  return monthDayLabel(ts);
}

/** 预设简写：25′ / 正计时 */
export function presetShort(preset: Pick<PomodoroPreset, "mode" | "durationMin">): string {
  return preset.mode === "countdown" ? `${preset.durationMin}′` : "正计时";
}

/* ---------- 聚合 ---------- */

export const sumFocus = (sessions: PomodoroSession[]) =>
  sessions.reduce((acc, s) => acc + s.focusMs, 0);

/** 按开始时刻归日：日起点 → 当日记录（保持入参顺序） */
export function groupByDay(sessions: PomodoroSession[]): Map<number, PomodoroSession[]> {
  const map = new Map<number, PomodoroSession[]>();
  for (const s of sessions) {
    const key = startOfDay(s.startTime);
    const list = map.get(key);
    if (list) list.push(s);
    else map.set(key, [s]);
  }
  return map;
}

/** 截至今天（今天无记录则截至昨天）连续有专注记录的天数 */
export function streakDays(sessions: PomodoroSession[], now: number): number {
  const days = new Set(sessions.map(s => startOfDay(s.startTime)));
  let cursor = startOfDay(now);
  if (!days.has(cursor)) cursor -= DAY_MS;
  let count = 0;
  while (days.has(cursor)) {
    count++;
    cursor = startOfDay(cursor - DAY_MS / 2);
  }
  return count;
}

/**
 * 时段分布：轴范围内每 bucketMinutes 分钟一桶，累计落在桶里的专注分钟（扣除暂停段）。
 * 专注段按分钟摊入，跨桶的会话拆分到各桶。
 */
export function focusDistribution(
  sessions: PomodoroSession[],
  bucketMinutes = 30,
  fromHour = AXIS_FROM_HOUR,
  toHour = AXIS_TO_HOUR
): number[] {
  const bucketCount = ((toHour - fromHour) * 60) / bucketMinutes;
  const buckets = new Array<number>(bucketCount).fill(0);
  for (const s of sessions) {
    if (s.endTime == null) continue;
    const dayStart = startOfDay(s.startTime);
    for (let t = s.startTime; t < s.endTime; t += MINUTE_MS) {
      if (s.pauses.some(p => p.end != null && t >= p.start && t < p.end)) continue;
      const minuteOfAxis = (t - dayStart) / MINUTE_MS - fromHour * 60;
      const index = Math.floor(minuteOfAxis / bucketMinutes);
      if (index >= 0 && index < bucketCount) buckets[index]++;
    }
  }
  return buckets;
}

/** 某日时间轴上的横向位置百分比（0–100 截断） */
export function axisPercent(ts: number, dayStart: number): number {
  const hours = (ts - dayStart) / HOUR_MS;
  const pct = ((hours - AXIS_FROM_HOUR) / (AXIS_TO_HOUR - AXIS_FROM_HOUR)) * 100;
  return Math.max(0, Math.min(100, pct));
}

/**
 * 结束结果推导：主进程不回传落库结果，按结束前最后一份会话在本地复算——
 * 暂停段截到结束时刻，专注不足 MIN_RECORD_MS 即被丢弃（同主进程 stopSession）。
 */
export interface EndedSession {
  presetId: number;
  startTime: number;
  focusMs: number;
  expectedMs?: number;
  pauseCount: number;
  saved: boolean;
}

export function endedSession(last: PomodoroSession, endedAt: number): EndedSession {
  const pauseTotal = last.pauses.reduce((acc, p) => acc + ((p.end ?? endedAt) - p.start), 0);
  let focusMs = Math.max(0, endedAt - last.startTime - pauseTotal);
  // 倒计时到点自动结束时主进程按秒 tick，本地时间可能多出零点几秒
  if (last.expectedMs && focusMs > last.expectedMs) focusMs = last.expectedMs;
  return {
    presetId: last.presetId,
    startTime: last.startTime,
    focusMs,
    expectedMs: last.expectedMs,
    pauseCount: last.pauseCount,
    saved: focusMs >= MIN_RECORD_MS,
  };
}
