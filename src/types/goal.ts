export enum EGoalStatus {
  InProgress = "in_progress",
  Completed = "completed",
  Abandoned = "abandoned",
}

export enum EGoalItemType {
  BigGoal = "big_goal", // 大目标，可以拆解为子目标
  Milestone = "milestone", // 里程碑，手动确认
  Progress = "progress", // 进度，数量化
}

export enum EGoalItemStatus {
  NotStarted = "not_started",
  InProgress = "in_progress",
  Completed = "completed",
  Abandoned = "abandoned",
}

export interface IGoal {
  id: number;
  title: string;
  description?: string;
  start_date?: number; // timestamp
  end_date?: number; // timestamp
  status: EGoalStatus;
  create_time: number;
  update_time: number;
}

export interface IGoalItem {
  id: number;
  goal_id: number;
  parent_id?: number; // 父级目标项ID，用于树状结构
  title: string;
  description?: string;
  type: EGoalItemType;
  status: EGoalItemStatus;
  target_value?: number; // 目标值，用于progress类型
  current_value?: number; // 当前值，用于progress类型
  unit?: string; // 单位，比如"页"、"小时"、"%"
  sort_order: number; // 排序
  create_time: number;
  update_time: number;
}

export interface IGoalProgressEntry {
  id: number;
  goal_item_id: number;
  title?: string;
  description?: string;
  progress_delta?: number; // 进度增量，用于progress类型的目标项
  create_time: number;
}

// 创建和更新类型
export type ICreateGoal = Omit<IGoal, "id" | "create_time" | "update_time">;
export type IUpdateGoal = Partial<
  Omit<IGoal, "id" | "create_time" | "update_time">
> & { id: number };

export type ICreateGoalItem = Omit<
  IGoalItem,
  "id" | "create_time" | "update_time"
>;
export type IUpdateGoalItem = Partial<
  Omit<IGoalItem, "id" | "create_time" | "update_time">
> & { id: number };

export type ICreateGoalProgressEntry = Omit<
  IGoalProgressEntry,
  "id" | "create_time"
>;

// 树状结构的目标项
export interface IGoalItemTree extends IGoalItem {
  children: IGoalItemTree[];
  progress_entries?: IGoalProgressEntry[];
}

// 带有子目标的完整目标
export interface IGoalWithItems extends IGoal {
  items: IGoalItemTree[];
}
