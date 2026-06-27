export type BadgeSource = "system" | "custom";
export type BadgeStatus = "active" | "archived";
export type BadgeRetroactiveMode = "system" | "enabled" | "disabled";
export type BadgeAwardKind = "success" | "failure";
export type BadgeScheduleType =
  | "daily"
  | "weekly"
  | "monthly"
  | "date_range"
  | "all_time";
export type BadgeAwardPolicyType = "streak" | "accumulation" | "threshold";
export type BadgeRuleOperator = "all" | "any";
export type BadgeComparator = ">=" | ">" | "=" | "<=" | "<";

export interface BadgeDesign {
  title: string;
  description?: string;
  icon?: string;
  imageUrl?: string;
  color?: string;
}

export interface BadgeSchedule {
  type: BadgeScheduleType;
  startDate?: number;
  endDate?: number;
}

export interface BadgeAwardPolicy {
  type: BadgeAwardPolicyType;
  target: number;
  failureEnabled?: boolean;
  graceDays?: number;
}

export interface BadgeMilestone {
  id: number;
  definitionId: number;
  milestoneKey: string;
  targetValue: number;
  title: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  sortOrder: number;
  createTime: number;
  updateTime: number;
}

export interface CreateBadgeMilestoneInput {
  milestoneKey?: string | null;
  targetValue: number;
  title?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
}

export interface BadgeEventCountCondition {
  type: "event_count";
  eventType: string;
  comparator: BadgeComparator;
  target: number;
}

export interface BadgeManualCountCondition {
  type: "manual_count";
  manualKey: string;
  comparator: BadgeComparator;
  target: number;
}

export interface BadgeAggregateSnapshotCondition {
  type: "aggregate_snapshot";
  aggregateKey: string;
  comparator: BadgeComparator;
  target: number;
}

export type BadgeCondition =
  | BadgeEventCountCondition
  | BadgeManualCountCondition
  | BadgeAggregateSnapshotCondition;

export interface BadgeConditionGroup {
  op: BadgeRuleOperator;
  conditions: BadgeRule[];
}

export type BadgeRule = BadgeCondition | BadgeConditionGroup;

export interface BadgeDefinition {
  id: number;
  systemKey?: string | null;
  name: string;
  source: BadgeSource;
  status: BadgeStatus;
  successDesign: BadgeDesign;
  failureDesign?: BadgeDesign | null;
  rule: BadgeRule;
  schedule: BadgeSchedule;
  awardPolicy: BadgeAwardPolicy;
  milestones?: BadgeMilestone[];
  retroactiveMode: BadgeRetroactiveMode;
  createTime: number;
  updateTime: number;
}

export interface CreateBadgeDefinitionInput {
  systemKey?: string | null;
  name: string;
  source?: BadgeSource;
  successDesign: BadgeDesign;
  failureDesign?: BadgeDesign | null;
  rule: BadgeRule;
  schedule: BadgeSchedule;
  awardPolicy: BadgeAwardPolicy;
  milestones?: CreateBadgeMilestoneInput[];
  retroactiveMode?: BadgeRetroactiveMode;
}

export interface UpdateBadgeDefinitionInput extends Partial<CreateBadgeDefinitionInput> {
  id: number;
  status?: BadgeStatus;
}

export interface BadgeEvent {
  id: number;
  eventKey: string;
  eventType: string;
  eventTime: number;
  subjectType?: string | null;
  subjectId?: number | null;
  value: number;
  metadata?: Record<string, unknown> | null;
  createTime: number;
}

export interface CreateBadgeEventInput {
  eventKey: string;
  eventType: string;
  eventTime: number;
  subjectType?: string | null;
  subjectId?: number | null;
  value?: number;
  metadata?: Record<string, unknown> | null;
}

export interface BadgeManualEntry {
  id: number;
  definitionId: number;
  manualKey: string;
  entryDate: string;
  completedAt: number;
  detailContentId?: number | null;
  attachments?: Array<Record<string, unknown>>;
  createTime: number;
  updateTime: number;
}

export interface CreateBadgeManualEntryInput {
  definitionId: number;
  manualKey: string;
  entryDate: string;
  detailContent?: unknown[];
  attachments?: Array<Record<string, unknown>>;
}

export interface BadgeProgress {
  id: number;
  definitionId: number;
  currentPeriodKey?: string | null;
  currentValue: number;
  currentStreak: number;
  bestStreak: number;
  accumulatedCount: number;
  lastPassedPeriodKey?: string | null;
  lastEvaluatedAt?: number | null;
  updateTime: number;
}

export interface BadgeAward {
  id: number;
  definitionId: number;
  milestoneId?: number | null;
  awardKind: BadgeAwardKind;
  periodKey: string;
  periodStart: number;
  periodEnd: number;
  targetValue: number;
  progressValue: number;
  evidence?: Record<string, unknown> | null;
  awardedAt: number;
}

export interface BadgeDashboard {
  definitions: BadgeDefinition[];
  progress: BadgeProgress[];
  awards: BadgeAward[];
  todayManualEntries: BadgeManualEntry[];
}
