import { describe, expect, it } from "vitest";
import type { PomodoroSession } from "../../../types";
import {
  computeElapsedMs,
  computeRemainMs,
  formatClock,
  formatFocusDuration,
  todayRange,
  weekDayStarts,
  weekdayIndex,
} from "../timer";

const T0 = 1_800_000_000_000; // 固定基准时刻

function makeSession(patch?: Partial<PomodoroSession>): PomodoroSession {
  return {
    id: 1,
    presetId: 10,
    startTime: T0,
    endTime: null,
    expectedMs: 25 * 60 * 1000,
    focusMs: 0,
    pauseTotalMs: 0,
    pauseCount: 0,
    pauses: [],
    status: "running",
    createTime: T0,
    updateTime: T0,
    ...patch,
  };
}

describe("pomodoro/timer", () => {
  it("running 会话：elapsed = now - start", () => {
    const session = makeSession();
    expect(computeElapsedMs(session, T0 + 60_000)).toBe(60_000);
  });

  it("已闭合暂停计入 elapsed 扣减", () => {
    const session = makeSession({
      status: "paused",
      pauseTotalMs: 30_000,
      pauses: [{ start: T0 + 120_000, end: T0 + 150_000 }],
    });
    // now - start - 30s
    expect(computeElapsedMs(session, T0 + 200_000)).toBe(170_000);
  });

  it("paused 会话：未闭合的暂停段按 now 闭合累计", () => {
    const session = makeSession({
      status: "paused",
      pauses: [{ start: T0 + 100_000 }],
    });
    // (now - start) - (now - pauseStart) = pauseStart - start = 100s
    expect(computeElapsedMs(session, T0 + 400_000)).toBe(100_000);
  });

  it("正计时/无期望时长：remain 为 null", () => {
    expect(computeRemainMs(makeSession({ expectedMs: null }), T0 + 1000)).toBeNull();
  });

  it("倒计时：remain = expected - elapsed 且不小于 0", () => {
    const session = makeSession({ expectedMs: 60_000 });
    expect(computeRemainMs(session, T0 + 20_000)).toBe(40_000);
    expect(computeRemainMs(session, T0 + 120_000)).toBe(0);
  });

  it("formatClock：分钟秒与小时两种形态", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(65_000)).toBe("01:05");
    expect(formatClock(3_725_000)).toBe("1:02:05");
  });

  it("formatFocusDuration：分钟/小时展示", () => {
    expect(formatFocusDuration(0)).toBe("0m");
    expect(formatFocusDuration(25 * 60 * 1000)).toBe("25m");
    expect(formatFocusDuration(65 * 60 * 1000)).toBe("1h05m");
    expect(formatFocusDuration(120 * 60 * 1000)).toBe("2h");
  });

  it("todayRange：区间为本地零点到当日末尾", () => {
    const { start, end } = todayRange(new Date(2026, 8, 12, 15, 30));
    expect(start).toBe(new Date(2026, 8, 12, 0, 0, 0, 0).getTime());
    expect(end).toBe(start + 24 * 60 * 60 * 1000 - 1);
  });

  it("weekDayStarts：周一起始的 7 个连续零点", () => {
    // 2026-09-12 是周六
    const days = weekDayStarts(new Date(2026, 8, 12, 20, 0));
    expect(days).toHaveLength(7);
    expect(new Date(days[0]).getDay()).toBe(1);
    expect(days[6]).toBe(days[0] + 6 * 24 * 60 * 60 * 1000);
    expect(weekdayIndex(new Date(2026, 8, 12))).toBe(5);
  });
});
