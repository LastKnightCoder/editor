import { describe, expect, it } from "vitest";
import type { PomodoroSession } from "@/types";
import {
  DAY_MS,
  MINUTE_MS,
  axisPercent,
  endedSession,
  focusDistribution,
  formatClock,
  formatDuration,
  formatDurationCN,
  isEarlyStop,
  sessionTiming,
  startOfDay,
  streakDays,
} from "../model";

const DAY = new Date(2026, 8, 24).getTime();
const at = (h: number, m = 0, dayOffset = 0) => DAY + dayOffset * DAY_MS + (h * 60 + m) * MINUTE_MS;

function session(partial: Partial<PomodoroSession>): PomodoroSession {
  return {
    id: 1,
    presetId: 1,
    startTime: at(9),
    focusMs: 25 * MINUTE_MS,
    pauseTotalMs: 0,
    pauseCount: 0,
    pauses: [],
    status: "completed",
    createTime: 0,
    updateTime: 0,
    ...partial,
  };
}

describe("sessionTiming", () => {
  it("倒计时：剩余 / 进度 / 预计结束", () => {
    const s = session({ status: "running", expectedMs: 25 * MINUTE_MS, focusMs: 0 });
    const t = sessionTiming(s, at(9, 10));
    expect(t.elapsedMs).toBe(10 * MINUTE_MS);
    expect(t.remainMs).toBe(15 * MINUTE_MS);
    expect(t.displayMs).toBe(15 * MINUTE_MS);
    expect(t.progress).toBeCloseTo(0.4);
    expect(t.endsAt).toBe(at(9, 25));
    expect(t.willDiscard).toBe(false);
  });

  it("暂停中：进行中的暂停段计入，预计结束为 null", () => {
    const s = session({
      status: "paused",
      expectedMs: 25 * MINUTE_MS,
      pauses: [{ start: at(9, 3) }],
      pauseCount: 1,
    });
    const t = sessionTiming(s, at(9, 10));
    expect(t.elapsedMs).toBe(3 * MINUTE_MS);
    expect(t.paused).toBe(true);
    expect(t.endsAt).toBeNull();
    expect(t.willDiscard).toBe(true);
  });

  it("正计时：显示已专注，按小时一圈", () => {
    const s = session({ status: "running", expectedMs: undefined });
    const t = sessionTiming(s, at(10, 30));
    expect(t.remainMs).toBeUndefined();
    expect(t.displayMs).toBe(90 * MINUTE_MS);
    expect(t.progress).toBeCloseTo(0.5);
  });
});

describe("endedSession", () => {
  it("不足 5 分钟判为丢弃", () => {
    const r = endedSession(session({ status: "running", expectedMs: 25 * MINUTE_MS }), at(9, 4));
    expect(r.saved).toBe(false);
  });

  it("未闭合的暂停截到结束时刻；倒计时到点不超过预期", () => {
    const paused = session({
      status: "paused",
      pauses: [{ start: at(9, 10), end: at(9, 12) }, { start: at(9, 20) }],
      pauseCount: 2,
    });
    expect(endedSession(paused, at(9, 30)).focusMs).toBe(18 * MINUTE_MS);
    const countdown = session({ status: "running", expectedMs: 25 * MINUTE_MS });
    expect(endedSession(countdown, at(9, 25) + 700).focusMs).toBe(25 * MINUTE_MS);
  });
});

describe("isEarlyStop", () => {
  it("倒计时未到点（30s 容差）才算提前结束，正计时不算", () => {
    expect(isEarlyStop({ expectedMs: 30 * MINUTE_MS, focusMs: 22 * MINUTE_MS })).toBe(true);
    expect(isEarlyStop({ expectedMs: 30 * MINUTE_MS, focusMs: 30 * MINUTE_MS - 10_000 })).toBe(
      false
    );
    expect(isEarlyStop({ expectedMs: undefined, focusMs: 5 * MINUTE_MS })).toBe(false);
  });
});

describe("格式", () => {
  it("时钟 / 时长", () => {
    expect(formatClock(25 * MINUTE_MS)).toBe("25:00");
    expect(formatClock(65 * MINUTE_MS + 9_000)).toBe("1:05:09");
    expect(formatDuration(68 * MINUTE_MS)).toBe("1h 08m");
    expect(formatDuration(25 * MINUTE_MS)).toBe("25m");
    expect(formatDurationCN(65 * MINUTE_MS)).toBe("1 小时 5 分");
    expect(formatDurationCN(120 * MINUTE_MS)).toBe("2 小时");
  });
});

describe("聚合", () => {
  it("连续天数：今天无记录从昨天起算，断档即止", () => {
    const list = [-1, -2, -3, -5].map(o => session({ startTime: at(9, 0, o) }));
    expect(streakDays(list, at(12))).toBe(3);
    expect(streakDays([session({ startTime: at(8) }), ...list], at(12))).toBe(4);
    expect(streakDays([], at(12))).toBe(0);
  });

  it("时段分布：扣除暂停、跨桶拆分", () => {
    const s = session({
      startTime: at(9, 20),
      endTime: at(10, 5),
      pauses: [{ start: at(9, 40), end: at(9, 50) }],
    });
    const buckets = focusDistribution([s]);
    const index = (h: number, m: number) => ((h - 6) * 60 + m) / 30;
    expect(buckets[index(9, 0)]).toBe(10);
    expect(buckets[index(9, 30)]).toBe(20);
    expect(buckets[index(10, 0)]).toBe(5);
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(35);
  });

  it("时间轴位置：6 点为 0、24 点为 100，越界截断", () => {
    const day = startOfDay(at(12));
    expect(axisPercent(at(6), day)).toBe(0);
    expect(axisPercent(at(15), day)).toBe(50);
    expect(axisPercent(at(3), day)).toBe(0);
  });
});
