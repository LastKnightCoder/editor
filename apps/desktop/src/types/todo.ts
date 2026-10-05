import { Descendant } from "slate";
import type { CalendarEvent } from "./calendar";

// 任务类型（「计划任务」已退役：计划时段改由关联待办的日历事件表达，见 D-114）
export type TodoItemType = "normal" | "deadline" | "recurring";

// 系统组类型
export type TodoSystemGroupType =
  | "all" // 全部任务
  | "normal" // 普通任务
  | "deadline" // 截止任务
  | "recurring" // 周期任务
  | null;

// 周期类型
export type RecurrenceType =
  | "daily" // 每天
  | "weekdays" // 工作日（排除周末）
  | "weekly" // 每周
  | "monthly" // 每月
  | "yearly" // 每年
  | "custom"; // 自定义间隔

export interface TodoGroup {
  id: number;
  title: string;
  color?: string;
  sortIndex: number;
  isArchived: boolean;
  isSystem: boolean;
  systemType: TodoSystemGroupType;
  createTime: number;
  updateTime: number;
}

export interface TodoItem {
  id: number;
  groupId: number;
  parentId: number | null;
  title: string;
  type: TodoItemType;
  descriptionContentId?: number | null;
  descriptionContent?: Descendant[];
  isCompleted: boolean;
  startAt?: number | null; // 计划任务的开始时间
  dueAt?: number | null; // 截止时间（截止任务）或结束时间（计划任务）
  remindBefore?: number | null; // 提醒时间（截止前多少毫秒）
  completedAt?: number | null;
  sortIndex: number;
  isArchived: boolean;
  createTime: number;
  updateTime: number;
  // 周期任务关联
  recurrence?: TodoRecurrence | null;
}

// 周期规则
export interface TodoRecurrence {
  id: number;
  todoItemId: number;
  type: RecurrenceType;
  interval: number; // 间隔（每N天/周/月/年）
  weekdays?: number[] | null; // [0-6]，0=周日，用于 weekly 类型
  monthDay?: number | null; // 每月几号（1-31）
  yearMonth?: number | null; // 每年几月（1-12）
  yearDay?: number | null; // 每年几号
  excludeHolidays: boolean; // 是否排除节假日
  startDate: number; // 周期开始日期
  endDate?: number | null; // 周期结束日期（null=永不结束）
  maxOccurrences?: number | null; // 最大重复次数（null=永不结束）
  createTime: number;
  updateTime: number;
}

// 周期任务完成记录
export interface TodoRecurrenceCompletion {
  id: number;
  recurrenceId: number;
  scheduledDate: number; // 计划完成日期
  completedAt?: number | null; // 实际完成时间
  skipped: boolean; // 是否跳过
  createTime: number;
}

// 待办-日历映射（系统日历物化）
export type TodoCalendarSyncType = "deadline" | "recurring";

export interface TodoCalendarMapping {
  id: number;
  todoItemId: number;
  calendarEventId: number;
  syncType: TodoCalendarSyncType;
  recurrenceDate?: number | null; // 周期任务的具体日期
  createTime: number;
}

// 日历日程的待办来源（日历页勾选完成用；按日程 ID 批量查询）
export interface TodoCalendarEventSource {
  calendarEventId: number;
  todoItemId: number;
  /** linked = 用户日历里关联待办的事件（安排） */
  syncType: TodoCalendarSyncType | "linked";
  recurrenceDate: number | null;
  /** 周期任务的规则 ID（完成单次需要）；非周期任务为 null */
  recurrenceId: number | null;
  /** 普通任务看 is_completed；周期任务看该次是否有完成记录（跳过不算完成） */
  isCompleted: boolean;
}

export interface TodoNoteLink {
  id: number;
  todoId: number;
  contentId: number;
  title?: string;
  type?: string;
  sortIndex: number;
  createTime: number;
  updateTime: number;
}

export interface CreateTodoGroup {
  title: string;
  color?: string;
  isSystem?: boolean;
  systemType?: TodoSystemGroupType;
}

export interface UpdateTodoGroup {
  id: number;
  title?: string;
  color?: string | null;
  sortIndex?: number;
  isArchived?: boolean;
}

export interface CreateTodoItem {
  groupId: number;
  parentId?: number | null;
  title: string;
  type?: TodoItemType;
  description?: string;
  startAt?: number | null;
  dueAt?: number | null;
  remindBefore?: number | null;
}

export interface UpdateTodoItem {
  id: number;
  title?: string;
  type?: TodoItemType;
  descriptionContentId?: number | null;
  startAt?: number | null;
  dueAt?: number | null;
  remindBefore?: number | null;
}

// 创建周期规则
export interface CreateTodoRecurrence {
  todoItemId: number;
  type: RecurrenceType;
  interval?: number;
  weekdays?: number[] | null;
  monthDay?: number | null;
  yearMonth?: number | null;
  yearDay?: number | null;
  excludeHolidays?: boolean;
  startDate: number;
  endDate?: number | null;
  maxOccurrences?: number | null;
}

// 更新周期规则
export interface UpdateTodoRecurrence {
  id: number;
  type?: RecurrenceType;
  interval?: number;
  weekdays?: number[] | null;
  monthDay?: number | null;
  yearMonth?: number | null;
  yearDay?: number | null;
  excludeHolidays?: boolean;
  startDate?: number;
  endDate?: number | null;
  maxOccurrences?: number | null;
}

export interface MoveAndReorderPayload {
  id: number;
  toGroupId: number;
  toParentId: number | null;
  beforeId?: number;
  afterId?: number;
}

// 创建相对位置的待办项
export type CreateRelativePosition = "child" | "above" | "below";

export interface CreateTodoItemRelative {
  refId: number; // 参考项 ID
  position: CreateRelativePosition; // 插入位置
  title: string;
  type?: TodoItemType;
  description?: string;
  startAt?: number | null;
  dueAt?: number | null;
  remindBefore?: number | null;
}

export interface AttachExistingNotePayload {
  todoId: number;
  contentId: number;
  title?: string;
  type?: string;
  beforeId?: number;
  afterId?: number;
}

export interface TodoGroupStats {
  groupId: number;
  total: number;
  uncompleted: number;
  overdue: number;
}

export type TodoQueryTimeField = "createTime" | "updateTime" | "dueAt" | "completedAt" | "startAt";

export type TodoQueryGroupBy =
  "none" | "group" | "status" | "type" | "due_date" | "completion_date";

export type TodoQuerySort =
  "manual" | "dueAtAsc" | "updateTimeDesc" | "createTimeDesc" | "completedAtDesc";

export interface TodoQueryFilter {
  groupIds?: number[];
  groupNames?: string[];
  systemGroupTypes?: Exclude<TodoSystemGroupType, null>[];
  todoIds?: number[];
  types?: TodoItemType[];
  isCompleted?: boolean;
  isArchived?: boolean;
  isOverdue?: boolean;
  hasDueAt?: boolean;
  hasStartAt?: boolean;
  parentId?: number | null;
  rootOnly?: boolean;
  includeChildren?: boolean;
  keyword?: string;
  timeField?: TodoQueryTimeField;
  start?: number | string | null;
  end?: number | string | null;
}

export interface TodoQueryRequest {
  filter?: TodoQueryFilter;
  groupBy?: TodoQueryGroupBy;
  sort?: TodoQuerySort;
  page?: number;
  pageSize?: number;
}

export interface TodoQueryItem extends TodoItem {
  group?: TodoGroup;
  noteCount?: number;
  notes?: TodoNoteLink[];
  recurrence?: TodoRecurrence | null;
  recurrenceCompletions?: TodoRecurrenceCompletion[];
  calendarMappings?: TodoCalendarMapping[];
  descriptionMarkdown?: string;
}

export interface TodoQuerySummary {
  totalCount: number;
  completedCount: number;
  pendingCount: number;
  overdueCount: number;
  groupsCount: number;
  recentCompleted: Array<{
    id: number;
    title: string;
    groupId: number;
    groupTitle?: string;
    completedAt: number;
  }>;
}

export interface TodoQueryBucket {
  key: string;
  label: string;
  itemIds: number[];
  totalCount: number;
}

export interface TodoQueryResponse {
  type: "todo-query-result";
  query: TodoQueryRequest;
  summary: TodoQuerySummary;
  items: TodoQueryItem[];
  groups: TodoQueryBucket[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  render: {
    layout: "todo-list";
    groupBy: TodoQueryGroupBy;
    sort: TodoQuerySort;
  };
}

export interface TodoDashboardResponse {
  type: "todo-dashboard";
  generatedAt: number;
  summary: TodoQuerySummary;
  items: TodoQueryItem[];
  groupBuckets: TodoQueryBucket[];
  overdueItems: TodoQueryItem[];
  pendingItems: TodoQueryItem[];
  recentCompletedItems: TodoQueryItem[];
  groups: Array<{
    id: number;
    title: string;
    color?: string;
    total: number;
    pending: number;
    overdue: number;
  }>;
}

export type TodoMutationEntityType =
  "group" | "item" | "recurrence" | "note-link" | "calendar-mapping";

export interface TodoMutationEvent {
  clientId?: string;
  source: string;
  entityType: TodoMutationEntityType;
  entityId?: number;
  groupId?: number | null;
  relatedItemId?: number | null;
  action: string;
  changedFields?: string[];
  timestamp: number;
}

/** 一条待办的安排概况（日历里关联它的事件） */
export interface TodoScheduleSummary {
  /** 尚未结束的最早一条（含进行中） */
  next?: CalendarEvent;
  /** 已结束的最近一条 */
  last?: CalendarEvent;
  count: number;
}
