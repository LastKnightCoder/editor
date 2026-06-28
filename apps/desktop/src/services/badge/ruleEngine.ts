import type {
  BadgeAward,
  BadgeAwardPolicy,
  BadgeCondition,
  BadgeMilestone,
  BadgeProgress,
  BadgeRule,
  BadgeSchedule,
} from "@/types";

export interface BadgePeriodRange {
  start: number;
  end: number;
  key: string;
}

export interface BadgeRuleEventInput {
  eventType: string;
  eventTime: number;
  value?: number;
}

export interface BadgeRuleManualEntryInput {
  manualKey: string;
  entryDate: string;
  completedAt: number;
}

export interface BadgeRuleContext {
  range: BadgePeriodRange;
  events: BadgeRuleEventInput[];
  manualEntries: BadgeRuleManualEntryInput[];
  aggregates: Record<string, number>;
}

export interface BadgeRuleEvaluation {
  passed: boolean;
  value: number;
  evidence: {
    conditionResults: Array<{
      type: string;
      key: string;
      value: number;
      target: number;
      passed: boolean;
    }>;
  };
}

export interface BadgeAwardEvaluationInput {
  schedule: BadgeSchedule;
  policy: BadgeAwardPolicy;
  milestones?: Array<Pick<BadgeMilestone, "id" | "targetValue">>;
  currentPeriodPassed: boolean;
  currentValue: number;
  previousProgress: Pick<
    BadgeProgress,
    "currentStreak" | "bestStreak" | "accumulatedCount" | "lastPassedPeriodKey"
  >;
  period: BadgePeriodRange;
  now: number;
}

export interface BadgeAwardEvaluation {
  nextProgress: Pick<
    BadgeProgress,
    | "currentPeriodKey"
    | "currentValue"
    | "currentStreak"
    | "bestStreak"
    | "accumulatedCount"
    | "lastPassedPeriodKey"
    | "lastEvaluatedAt"
  >;
  successAward: Omit<BadgeAward, "id" | "definitionId" | "awardedAt"> | null;
  successAwards: Array<Omit<BadgeAward, "id" | "definitionId" | "awardedAt">>;
  failureAward: Omit<BadgeAward, "id" | "definitionId" | "awardedAt"> | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function startOfLocalDay(time: number) {
  const date = new Date(time);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

function startOfLocalWeek(time: number) {
  const start = new Date(startOfLocalDay(time));
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);
  return start.getTime();
}

function getIsoWeekKey(time: number) {
  const date = new Date(startOfLocalDay(time));
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / DAY_MS -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    );
  return `${date.getFullYear()}-W${pad(week)}`;
}

export function computeBadgePeriodRange(
  schedule: BadgeSchedule,
  now = Date.now(),
): BadgePeriodRange {
  if (schedule.type === "all_time") {
    return { start: 0, end: Number.MAX_SAFE_INTEGER, key: "all" };
  }

  if (schedule.type === "date_range") {
    const start = schedule.startDate ?? 0;
    const end = schedule.endDate ?? Number.MAX_SAFE_INTEGER;
    return { start, end, key: `${start}-${end}` };
  }

  if (schedule.type === "weekly") {
    const start = startOfLocalWeek(now);
    return { start, end: start + 7 * DAY_MS, key: getIsoWeekKey(now) };
  }

  if (schedule.type === "monthly") {
    const date = new Date(now);
    const start = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
    return {
      start,
      end,
      key: `${date.getFullYear()}-${pad(date.getMonth() + 1)}`,
    };
  }

  const start = startOfLocalDay(now);
  return { start, end: start + DAY_MS, key: dateKey(new Date(start)) };
}

function compare(
  value: number,
  comparator: BadgeCondition["comparator"],
  target: number,
) {
  switch (comparator) {
    case ">":
      return value > target;
    case "=":
      return value === target;
    case "<=":
      return value <= target;
    case "<":
      return value < target;
    case ">=":
    default:
      return value >= target;
  }
}

function inRange(time: number, range: BadgePeriodRange) {
  return time >= range.start && time < range.end;
}

function evaluateCondition(
  condition: BadgeCondition,
  context: BadgeRuleContext,
): BadgeRuleEvaluation {
  if (condition.type === "event_count") {
    const value = context.events
      .filter(
        (event) =>
          event.eventType === condition.eventType &&
          inRange(event.eventTime, context.range),
      )
      .reduce((sum, event) => sum + (event.value ?? 1), 0);
    const passed = compare(value, condition.comparator, condition.target);
    return {
      passed,
      value,
      evidence: {
        conditionResults: [
          {
            type: condition.type,
            key: condition.eventType,
            value,
            target: condition.target,
            passed,
          },
        ],
      },
    };
  }

  if (condition.type === "manual_count") {
    const value = context.manualEntries.filter(
      (entry) =>
        entry.manualKey === condition.manualKey &&
        inRange(entry.completedAt, context.range),
    ).length;
    const passed = compare(value, condition.comparator, condition.target);
    return {
      passed,
      value,
      evidence: {
        conditionResults: [
          {
            type: condition.type,
            key: condition.manualKey,
            value,
            target: condition.target,
            passed,
          },
        ],
      },
    };
  }

  const value = context.aggregates[condition.aggregateKey] ?? 0;
  const passed = compare(value, condition.comparator, condition.target);
  return {
    passed,
    value,
    evidence: {
      conditionResults: [
        {
          type: condition.type,
          key: condition.aggregateKey,
          value,
          target: condition.target,
          passed,
        },
      ],
    },
  };
}

function isConditionGroup(
  rule: BadgeRule,
): rule is Extract<BadgeRule, { op: "all" | "any" }> {
  return "op" in rule;
}

export function evaluateBadgeRule(
  rule: BadgeRule,
  context: BadgeRuleContext,
): BadgeRuleEvaluation {
  if (!isConditionGroup(rule)) {
    return evaluateCondition(rule, context);
  }

  const results = rule.conditions.map((condition) =>
    evaluateBadgeRule(condition, context),
  );
  const passed =
    rule.op === "all"
      ? results.every((result) => result.passed)
      : results.some((result) => result.passed);

  // 条件组的 value：当前周期是否达标（0/1），而非子条件值之和
  // 例如"不吃晚饭 + 运动"两个条件都满足，value=1 表示本周期达标 1 次，而非打卡 2 次
  return {
    passed,
    value: passed ? 1 : 0,
    evidence: {
      conditionResults: results.flatMap(
        (result) => result.evidence.conditionResults,
      ),
    },
  };
}

function isPreviousPeriod(
  schedule: BadgeSchedule,
  previousKey: string | null | undefined,
  period: BadgePeriodRange,
) {
  if (!previousKey) return false;
  if (schedule.type === "daily") {
    const previousPeriod = computeBadgePeriodRange(schedule, period.start - 1);
    return previousKey === previousPeriod.key;
  }
  if (schedule.type === "weekly") {
    const previousPeriod = computeBadgePeriodRange(schedule, period.start - 1);
    return previousKey === previousPeriod.key;
  }
  if (schedule.type === "monthly") {
    const previousPeriod = computeBadgePeriodRange(schedule, period.start - 1);
    return previousKey === previousPeriod.key;
  }
  return previousKey === period.key || previousKey === "all";
}

function buildAward(
  awardKind: "success" | "failure",
  policy: BadgeAwardPolicy,
  period: BadgePeriodRange,
  progressValue: number,
  milestone?: Pick<BadgeMilestone, "id" | "targetValue">,
): Omit<BadgeAward, "id" | "definitionId" | "awardedAt"> {
  return {
    milestoneId: milestone?.id ?? null,
    awardKind,
    periodKey: period.key,
    periodStart: period.start,
    periodEnd: period.end,
    targetValue: milestone?.targetValue ?? policy.target,
    progressValue,
    evidence: null,
  };
}

export function evaluateBadgeAward(
  input: BadgeAwardEvaluationInput,
): BadgeAwardEvaluation {
  const {
    policy,
    schedule,
    milestones,
    currentPeriodPassed,
    currentValue,
    previousProgress,
    period,
    now,
  } = input;

  const continued = isPreviousPeriod(
    schedule,
    previousProgress.lastPassedPeriodKey,
    period,
  );
  const samePassedPeriod = previousProgress.lastPassedPeriodKey === period.key;
  const graceMs = (policy.graceDays ?? 0) * DAY_MS;
  const periodStillOpen = period.end + graceMs > now;
  const currentStreak = currentPeriodPassed
    ? samePassedPeriod
      ? previousProgress.currentStreak
      : continued
        ? previousProgress.currentStreak + 1
        : 1
    : periodStillOpen && continued
      ? previousProgress.currentStreak
      : 0;
  const accumulatedCount = currentPeriodPassed
    ? samePassedPeriod
      ? previousProgress.accumulatedCount
      : previousProgress.accumulatedCount + currentValue
    : previousProgress.accumulatedCount;
  const bestStreak = Math.max(previousProgress.bestStreak, currentStreak);

  const progressValue =
    policy.type === "streak"
      ? currentStreak
      : policy.type === "accumulation"
        ? accumulatedCount
        : currentValue;
  const awardMilestones =
    milestones && milestones.length > 0
      ? milestones
      : [{ id: null as unknown as number, targetValue: policy.target }];
  const successAwards = currentPeriodPassed
    ? awardMilestones
        .filter((milestone) => progressValue >= milestone.targetValue)
        .map((milestone) =>
          buildAward("success", policy, period, progressValue, milestone),
        )
    : [];
  const successAward =
    successAwards.length > 0
      ? milestones && milestones.length > 0
        ? successAwards[0]
        : buildAward("success", policy, period, progressValue)
      : null;

  const failureAward =
    policy.failureEnabled && !currentPeriodPassed && period.end + graceMs <= now
      ? buildAward("failure", policy, period, currentValue)
      : null;

  return {
    nextProgress: {
      currentPeriodKey: period.key,
      currentValue,
      currentStreak,
      bestStreak,
      accumulatedCount,
      lastPassedPeriodKey: currentPeriodPassed
        ? period.key
        : previousProgress.lastPassedPeriodKey,
      lastEvaluatedAt: now,
    },
    successAward,
    successAwards,
    failureAward,
  };
}
