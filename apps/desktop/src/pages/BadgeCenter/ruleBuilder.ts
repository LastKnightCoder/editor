import type {
  BadgeAwardPolicyType,
  BadgeComparator,
  BadgeCondition,
  BadgeDefinition,
  BadgeRule,
  BadgeRuleOperator,
  BadgeScheduleType,
} from "@/types";
import { badgeDefaultFailureColor } from "./components/theme";

export type BadgeConditionSource =
  | "event:output.created"
  | "event:card.permanent.created"
  | "event:article.created"
  | "event:project-item.created"
  | "event:document-item.created"
  | "event:diary.created"
  | "event:whiteboard.created"
  | "manual:custom";

export interface BadgeConditionDraft {
  id: string;
  source: BadgeConditionSource;
  customManualKey?: string;
  comparator: BadgeComparator;
  target: number;
}

export interface BadgeRuleGroupDraft {
  id: string;
  op: BadgeRuleOperator;
  conditions: BadgeConditionDraft[];
}

export interface BadgeRuleDraft {
  topOp: BadgeRuleOperator;
  groups: BadgeRuleGroupDraft[];
}

export interface BadgeMilestoneDraft {
  id: string;
  targetValue: number;
  title: string;
}

export interface BadgeCreateDraft {
  name: string;
  description: string;
  icon: string;
  color: string;
  failureColor: string;
  ruleDraft: BadgeRuleDraft;
  scheduleType: BadgeScheduleType;
  rangeStart?: string;
  rangeEnd?: string;
  awardType: BadgeAwardPolicyType;
  target: number;
  openEnded: boolean;
  milestones: BadgeMilestoneDraft[];
  failureEnabled: boolean;
  graceDays: number;
}

export const badgeConditionSources: Array<{
  value: BadgeConditionSource;
  label: string;
  kind: "自动" | "手动";
}> = [
  {
    value: "event:output.created",
    label: "任意输出（新增或更新任意内容）",
    kind: "自动",
  },
  {
    value: "event:card.permanent.created",
    label: "新增永久卡片",
    kind: "自动",
  },
  { value: "event:article.created", label: "新增文章", kind: "自动" },
  { value: "event:project-item.created", label: "新增项目文档", kind: "自动" },
  {
    value: "event:document-item.created",
    label: "新增知识库文档",
    kind: "自动",
  },
  { value: "event:diary.created", label: "新增日记", kind: "自动" },
  { value: "event:whiteboard.created", label: "新增白板", kind: "自动" },
  { value: "manual:custom", label: "手动打卡：自定义", kind: "手动" },
];

export const comparatorOptions: Array<{
  value: BadgeComparator;
  label: string;
}> = [
  { value: ">=", label: "至少" },
  { value: "=", label: "刚好" },
  { value: ">", label: "超过" },
  { value: "<=", label: "不超过" },
  { value: "<", label: "少于" },
];

export const scheduleOptions: Array<{
  value: BadgeScheduleType;
  label: string;
}> = [
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
  { value: "date_range", label: "自定义时间段" },
  { value: "all_time", label: "全部时间" },
];

export const awardOptions: Array<{
  value: BadgeAwardPolicyType;
  label: string;
}> = [
  { value: "streak", label: "连续坚持" },
  { value: "accumulation", label: "累计坚持" },
  { value: "threshold", label: "达到数量" },
];

export const commonMilestoneTargets = [7, 30, 180, 365, 1000, 2000];

export const aggregateSnapshotLabels: Record<string, string> = {
  "card.total": "卡片总数",
  "article.total": "文章总数",
  "project-item.total": "项目文档总数",
  "document-item.total": "知识库文档总数",
  "diary.total": "日记总数",
  "whiteboard.total": "白板总数",
};

export function createMilestoneDraft(
  targetValue: number,
  id = `milestone-${targetValue}`,
  title = String(targetValue),
): BadgeMilestoneDraft {
  return {
    id,
    targetValue,
    title,
  };
}

export function normalizeMilestoneDrafts(
  milestones: BadgeMilestoneDraft[],
): BadgeMilestoneDraft[] {
  const byTarget = new Map<number, BadgeMilestoneDraft>();

  milestones.forEach((milestone) => {
    const targetValue = Math.floor(Number(milestone.targetValue));
    if (!Number.isFinite(targetValue) || targetValue <= 0) return;
    if (byTarget.has(targetValue)) return;

    const title = milestone.title.trim() || String(targetValue);
    byTarget.set(targetValue, {
      ...milestone,
      targetValue,
      title,
    });
  });

  return Array.from(byTarget.values()).sort(
    (a, b) => a.targetValue - b.targetValue,
  );
}

export function validateMilestoneTargets(
  milestones: BadgeMilestoneDraft[],
  finalTarget: number,
): string | null {
  if (Number(finalTarget) <= 0) {
    return null;
  }
  const normalizedFinalTarget = Math.max(
    1,
    Math.floor(Number(finalTarget) || 1),
  );
  const normalizedMilestones = normalizeMilestoneDrafts(milestones);

  if (
    normalizedMilestones.some(
      (milestone) => milestone.targetValue >= normalizedFinalTarget,
    )
  ) {
    return "阶段目标必须小于总目标";
  }

  return null;
}

const comparatorText: Record<BadgeComparator, string> = {
  ">=": "至少",
  ">": "超过",
  "=": "刚好",
  "<=": "不超过",
  "<": "少于",
};

export function createConditionDraft(
  id: string,
  source: BadgeConditionSource = "event:output.created",
): BadgeConditionDraft {
  return {
    id,
    source,
    comparator: ">=",
    target: 1,
  };
}

export function createRuleDraft(): BadgeRuleDraft {
  return {
    topOp: "all",
    groups: [
      {
        id: "group-1",
        op: "all",
        conditions: [createConditionDraft("condition-1")],
      },
    ],
  };
}

function normalizeManualKey(condition: BadgeConditionDraft) {
  if (condition.source === "manual:custom") {
    return (condition.customManualKey ?? "").trim();
  }
  return condition.source.replace("manual:", "");
}

export function buildConditionRule(condition: BadgeConditionDraft): BadgeRule {
  const target = Math.max(1, Math.floor(Number(condition.target) || 1));

  if (condition.source.startsWith("manual:")) {
    const manualKey = normalizeManualKey(condition);
    if (!manualKey) {
      throw new Error("请填写自定义手动打卡标识");
    }
    return {
      type: "manual_count",
      manualKey,
      comparator: condition.comparator,
      target,
    };
  }

  return {
    type: "event_count",
    eventType: condition.source.replace("event:", ""),
    comparator: condition.comparator,
    target,
  };
}

export function buildBadgeRule(draft: BadgeRuleDraft): BadgeRule {
  const groups = draft.groups.filter((group) => group.conditions.length > 0);
  if (groups.length === 0) {
    throw new Error("请至少添加一个条件");
  }

  const groupRules = groups.map<BadgeRule>((group) => {
    const conditions = group.conditions.map(buildConditionRule);
    return conditions.length === 1
      ? conditions[0]
      : { op: group.op, conditions };
  });

  return groupRules.length === 1
    ? groupRules[0]
    : { op: draft.topOp, conditions: groupRules };
}

export function extractManualKeys(rule: BadgeRule): string[] {
  if ("op" in rule) {
    return Array.from(
      new Set(
        rule.conditions.flatMap((condition) => extractManualKeys(condition)),
      ),
    );
  }

  return rule.type === "manual_count" ? [rule.manualKey] : [];
}

export function formatBadgeRuleText(rule: BadgeRule): string {
  if ("op" in rule) {
    const joiner = rule.op === "all" ? " 并且 " : " 或者 ";
    return rule.conditions.map(formatBadgeRuleText).join(joiner);
  }

  if (rule.type === "event_count") {
    const source = badgeConditionSources.find(
      (s) => s.value === `event:${rule.eventType}`,
    );
    return `${source?.label ?? rule.eventType} ${comparatorText[rule.comparator]} ${rule.target} 次`;
  }

  if (rule.type === "manual_count") {
    const source = badgeConditionSources.find(
      (s) => s.value === `manual:${rule.manualKey}`,
    );
    return `${source?.label ?? `手动打卡：${rule.manualKey}`} ${comparatorText[rule.comparator]} ${rule.target} 次`;
  }

  const label = aggregateSnapshotLabels[rule.aggregateKey] ?? "累计数量";
  return `${label} ${comparatorText[rule.comparator]} ${rule.target}`;
}

export function getBadgeProgressValueLabel(rule: BadgeRule): string {
  if ("op" in rule) {
    for (const condition of rule.conditions) {
      const label = getBadgeProgressValueLabel(condition);
      if (label !== "当前进度") return label;
    }
    return "当前进度";
  }

  if (rule.type === "aggregate_snapshot") {
    return aggregateSnapshotLabels[rule.aggregateKey] ?? "累计数量";
  }

  return "当前进度";
}

function isConditionGroup(
  rule: BadgeRule,
): rule is Extract<BadgeRule, { op: BadgeRuleOperator }> {
  return "op" in rule;
}

export function hasAggregateCondition(rule: BadgeRule): boolean {
  if (isConditionGroup(rule)) {
    return rule.conditions.some(hasAggregateCondition);
  }
  return rule.type === "aggregate_snapshot";
}

function conditionToDraft(
  condition: BadgeCondition,
  id: string,
): BadgeConditionDraft {
  if (condition.type === "event_count") {
    return {
      id,
      source: `event:${condition.eventType}` as BadgeConditionSource,
      comparator: condition.comparator,
      target: condition.target,
    };
  }
  if (condition.type === "manual_count") {
    const presetSource = badgeConditionSources.find(
      (s) => s.value === `manual:${condition.manualKey}`,
    );
    return {
      id,
      source: presetSource
        ? (presetSource.value as BadgeConditionSource)
        : "manual:custom",
      customManualKey: presetSource ? undefined : condition.manualKey,
      comparator: condition.comparator,
      target: condition.target,
    };
  }
  return {
    id,
    source: "event:card.permanent.created",
    comparator: condition.comparator,
    target: condition.target,
  };
}

export function ruleToDraft(rule: BadgeRule): BadgeRuleDraft {
  if (!isConditionGroup(rule)) {
    return {
      topOp: "all",
      groups: [
        {
          id: "group-1",
          op: "all",
          conditions: [conditionToDraft(rule, "condition-1")],
        },
      ],
    };
  }

  const allLeaves = rule.conditions.every((c) => !isConditionGroup(c));
  if (allLeaves) {
    return {
      topOp: "all",
      groups: [
        {
          id: "group-1",
          op: rule.op,
          conditions: rule.conditions.map((c, i) =>
            conditionToDraft(c as BadgeCondition, `condition-${i + 1}`),
          ),
        },
      ],
    };
  }

  return {
    topOp: rule.op,
    groups: rule.conditions.map((c, gi) => {
      if (!isConditionGroup(c)) {
        return {
          id: `group-${gi + 1}`,
          op: "all",
          conditions: [conditionToDraft(c, `condition-${gi + 1}-1`)],
        };
      }
      return {
        id: `group-${gi + 1}`,
        op: c.op,
        conditions: c.conditions.map((cc, ci) =>
          conditionToDraft(
            cc as BadgeCondition,
            `condition-${gi + 1}-${ci + 1}`,
          ),
        ),
      };
    }),
  };
}

export function definitionToDraft(
  definition: BadgeDefinition,
): BadgeCreateDraft {
  const design = definition.successDesign;
  return {
    name: definition.name,
    description: design?.description ?? "",
    icon: design?.icon ?? "★",
    color: design?.color ?? "#2563eb",
    failureColor: definition.failureDesign?.color ?? badgeDefaultFailureColor,
    ruleDraft: ruleToDraft(definition.rule),
    scheduleType: definition.schedule.type,
    rangeStart:
      definition.schedule.type === "date_range" && definition.schedule.startDate
        ? new Date(definition.schedule.startDate).toISOString().slice(0, 10)
        : "",
    rangeEnd:
      definition.schedule.type === "date_range" && definition.schedule.endDate
        ? new Date(definition.schedule.endDate).toISOString().slice(0, 10)
        : "",
    awardType: definition.awardPolicy.type,
    target: definition.awardPolicy.target,
    openEnded: definition.awardPolicy.target <= 0,
    milestones: normalizeMilestoneDrafts(
      definition.milestones?.map((milestone) => ({
        id: `milestone-${milestone.id}`,
        targetValue: milestone.targetValue,
        title: milestone.title,
      })) ?? [],
    ),
    failureEnabled: !!definition.failureDesign,
    graceDays: definition.awardPolicy.graceDays ?? 0,
  };
}
