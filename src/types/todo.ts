import { Descendant } from "slate";

// 任务类型
export type TodoItemType = "normal" | "deadline" | "planned" | "recurring";

// 系统组类型
export type TodoSystemGroupType =
  | "all" // 全部任务
  | "normal" // 普通任务
  | "deadline" // 截止任务
  | "planned" // 计划任务
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

// 待办-日历映射
export type TodoCalendarSyncType = "deadline" | "planned" | "recurring";

export interface TodoCalendarMapping {
  id: number;
  todoItemId: number;
  calendarEventId: number;
  syncType: TodoCalendarSyncType;
  recurrenceDate?: number | null; // 周期任务的具体日期
  createTime: number;
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
