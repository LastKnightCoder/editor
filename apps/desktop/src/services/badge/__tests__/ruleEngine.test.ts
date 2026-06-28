import { describe, expect, it } from "vitest";
import {
  computeBadgePeriodRange,
  evaluateBadgeRule,
  evaluateBadgeAward,
} from "../ruleEngine";
import type { BadgeRule, BadgeAwardPolicy, BadgeSchedule } from "@/types";

const DAY = 24 * 60 * 60 * 1000;
const at = (isoDate: string) => new Date(`${isoDate}T12:00:00.000Z`).getTime();

describe("badge rule engine", () => {
  it("evaluates all/any groups with event and manual counts", () => {
    const rule: BadgeRule = {
      op: "all",
      conditions: [
        {
          type: "event_count",
          eventType: "card.permanent.created",
          comparator: ">=",
          target: 1,
        },
        {
          op: "any",
          conditions: [
            {
              type: "manual_count",
              manualKey: "exercise",
              comparator: ">=",
              target: 1,
            },
            {
              type: "manual_count",
              manualKey: "no_dinner",
              comparator: ">=",
              target: 1,
            },
          ],
        },
      ],
    };

    const result = evaluateBadgeRule(rule, {
      range: {
        start: Date.UTC(2026, 0, 1),
        end: Date.UTC(2026, 0, 2),
        key: "2026-01-01",
      },
      events: [
        {
          eventType: "card.permanent.created",
          eventTime: at("2026-01-01"),
          value: 1,
        },
      ],
      manualEntries: [
        {
          manualKey: "exercise",
          entryDate: "2026-01-01",
          completedAt: at("2026-01-01"),
        },
      ],
      aggregates: {},
    });

    expect(result.passed).toBe(true);
    expect(result.value).toBe(1);
    expect(result.evidence.conditionResults).toHaveLength(3);
  });

  it("uses local calendar windows for daily, weekly, monthly, date range, and all time", () => {
    const now = new Date("2026-06-17T08:30:00.000Z").getTime();

    expect(computeBadgePeriodRange({ type: "daily" }, now)).toEqual({
      start: new Date("2026-06-17T00:00:00.000").getTime(),
      end: new Date("2026-06-18T00:00:00.000").getTime(),
      key: "2026-06-17",
    });
    expect(computeBadgePeriodRange({ type: "weekly" }, now).key).toBe(
      "2026-W25",
    );
    expect(computeBadgePeriodRange({ type: "monthly" }, now).key).toBe(
      "2026-06",
    );
    expect(
      computeBadgePeriodRange(
        {
          type: "date_range",
          startDate: Date.UTC(2026, 5, 1),
          endDate: Date.UTC(2026, 5, 30),
        },
        now,
      ),
    ).toEqual({
      start: Date.UTC(2026, 5, 1),
      end: Date.UTC(2026, 5, 30),
      key: `${Date.UTC(2026, 5, 1)}-${Date.UTC(2026, 5, 30)}`,
    });
    expect(computeBadgePeriodRange({ type: "all_time" }, now)).toEqual({
      start: 0,
      end: Number.MAX_SAFE_INTEGER,
      key: "all",
    });
  });

  it("evaluates streak, accumulation, threshold, and failure states", () => {
    const schedule: BadgeSchedule = { type: "daily" };
    const policy: BadgeAwardPolicy = {
      type: "streak",
      target: 3,
      failureEnabled: true,
      graceDays: 1,
    };

    expect(
      evaluateBadgeAward({
        schedule,
        policy,
        currentPeriodPassed: true,
        currentValue: 1,
        previousProgress: {
          currentStreak: 2,
          bestStreak: 2,
          accumulatedCount: 2,
          lastPassedPeriodKey: "2026-06-16",
        },
        period: computeBadgePeriodRange(
          schedule,
          new Date("2026-06-17T08:00:00.000Z").getTime(),
        ),
        now: new Date("2026-06-17T08:00:00.000Z").getTime(),
      }).successAward,
    ).toMatchObject({ targetValue: 3, progressValue: 3 });

    expect(
      evaluateBadgeAward({
        schedule,
        policy: { type: "accumulation", target: 5 },
        currentPeriodPassed: true,
        currentValue: 2,
        previousProgress: {
          currentStreak: 0,
          bestStreak: 0,
          accumulatedCount: 3,
          lastPassedPeriodKey: null,
        },
        period: computeBadgePeriodRange(
          { type: "all_time" },
          new Date("2026-06-17T08:00:00.000Z").getTime(),
        ),
        now: new Date("2026-06-17T08:00:00.000Z").getTime(),
      }).successAward,
    ).toMatchObject({ targetValue: 5, progressValue: 5 });

    expect(
      evaluateBadgeAward({
        schedule,
        policy: { type: "threshold", target: 100 },
        currentPeriodPassed: true,
        currentValue: 101,
        previousProgress: {
          currentStreak: 0,
          bestStreak: 0,
          accumulatedCount: 0,
          lastPassedPeriodKey: null,
        },
        period: computeBadgePeriodRange(
          { type: "all_time" },
          new Date("2026-06-17T08:00:00.000Z").getTime(),
        ),
        now: new Date("2026-06-17T08:00:00.000Z").getTime(),
      }).successAward,
    ).toMatchObject({ targetValue: 100, progressValue: 101 });

    expect(
      evaluateBadgeAward({
        schedule,
        policy,
        currentPeriodPassed: false,
        currentValue: 0,
        previousProgress: {
          currentStreak: 2,
          bestStreak: 2,
          accumulatedCount: 2,
          lastPassedPeriodKey: "2026-06-15",
        },
        period: computeBadgePeriodRange(
          schedule,
          new Date("2026-06-17T08:00:00.000Z").getTime() - DAY,
        ),
        now: new Date("2026-06-18T08:00:00.000Z").getTime(),
      }).failureAward,
    ).toMatchObject({ targetValue: 3, progressValue: 0 });
  });

  it("keeps streak progress idempotent when evaluating the same passed period", () => {
    const schedule: BadgeSchedule = { type: "daily" };
    const period = computeBadgePeriodRange(
      schedule,
      new Date("2026-06-17T08:00:00.000Z").getTime(),
    );

    const result = evaluateBadgeAward({
      schedule,
      policy: { type: "streak", target: 7 },
      currentPeriodPassed: true,
      currentValue: 1,
      previousProgress: {
        currentStreak: 3,
        bestStreak: 3,
        accumulatedCount: 3,
        lastPassedPeriodKey: period.key,
      },
      period,
      now: new Date("2026-06-17T10:00:00.000Z").getTime(),
    });

    expect(result.nextProgress.currentStreak).toBe(3);
    expect(result.nextProgress.bestStreak).toBe(3);
  });

  it("keeps accumulated progress idempotent when the same period is reevaluated", () => {
    const schedule: BadgeSchedule = { type: "daily" };
    const period = computeBadgePeriodRange(
      schedule,
      new Date("2026-06-17T08:00:00.000Z").getTime(),
    );

    const result = evaluateBadgeAward({
      schedule,
      policy: { type: "accumulation", target: 10 },
      currentPeriodPassed: true,
      currentValue: 2,
      previousProgress: {
        currentStreak: 1,
        bestStreak: 1,
        accumulatedCount: 5,
        lastPassedPeriodKey: period.key,
      },
      period,
      now: new Date("2026-06-17T10:00:00.000Z").getTime(),
    });

    expect(result.nextProgress.accumulatedCount).toBe(5);
    expect(result.successAward).toBeNull();
  });

  it("keeps yesterday's streak while the current daily period is still open", () => {
    const schedule: BadgeSchedule = { type: "daily" };
    const period = computeBadgePeriodRange(
      schedule,
      new Date("2026-06-18T08:00:00.000Z").getTime(),
    );

    const result = evaluateBadgeAward({
      schedule,
      policy: { type: "streak", target: 7 },
      currentPeriodPassed: false,
      currentValue: 0,
      previousProgress: {
        currentStreak: 1,
        bestStreak: 1,
        accumulatedCount: 1,
        lastPassedPeriodKey: "2026-06-17",
      },
      period,
      now: new Date("2026-06-18T08:00:00.000Z").getTime(),
    });

    expect(result.nextProgress.currentStreak).toBe(1);
    expect(result.nextProgress.bestStreak).toBe(1);
    expect(result.nextProgress.lastPassedPeriodKey).toBe("2026-06-17");
  });

  it("does not keep stale streaks when the previous day was missed", () => {
    const schedule: BadgeSchedule = { type: "daily" };
    const period = computeBadgePeriodRange(
      schedule,
      new Date("2026-06-19T08:00:00.000Z").getTime(),
    );

    const result = evaluateBadgeAward({
      schedule,
      policy: { type: "streak", target: 7 },
      currentPeriodPassed: false,
      currentValue: 0,
      previousProgress: {
        currentStreak: 1,
        bestStreak: 1,
        accumulatedCount: 1,
        lastPassedPeriodKey: "2026-06-17",
      },
      period,
      now: new Date("2026-06-19T08:00:00.000Z").getTime(),
    });

    expect(result.nextProgress.currentStreak).toBe(0);
    expect(result.nextProgress.bestStreak).toBe(1);
    expect(result.nextProgress.lastPassedPeriodKey).toBe("2026-06-17");
  });

  it("emits success awards for every reached milestone", () => {
    const schedule: BadgeSchedule = { type: "daily" };
    const result = evaluateBadgeAward({
      schedule,
      policy: { type: "streak", target: 30 },
      milestones: [
        { id: 1, targetValue: 7 },
        { id: 2, targetValue: 30 },
        { id: 3, targetValue: 180 },
      ],
      currentPeriodPassed: true,
      currentValue: 1,
      previousProgress: {
        currentStreak: 29,
        bestStreak: 29,
        accumulatedCount: 29,
        lastPassedPeriodKey: "2026-06-16",
      },
      period: computeBadgePeriodRange(
        schedule,
        new Date("2026-06-17T08:00:00.000Z").getTime(),
      ),
      now: new Date("2026-06-17T08:00:00.000Z").getTime(),
    });

    expect(result.successAwards).toEqual([
      expect.objectContaining({ milestoneId: 1, targetValue: 7 }),
      expect.objectContaining({ milestoneId: 2, targetValue: 30 }),
    ]);
    expect(result.successAwards).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ milestoneId: 3, targetValue: 180 }),
      ]),
    );
  });
});
