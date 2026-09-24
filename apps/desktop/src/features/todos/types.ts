/**
 * 待办页视图模型：在 legacy 实体（src/types/todo.ts）之上聚合周期规则、打卡记录、
 * 关联笔记与子任务索引——页面一次拉全量快照，渲染期纯函数派生（model.ts）。
 */

import type { TodoGroup, TodoItem, TodoNoteLink, TodoRecurrence } from "@/types";

/** 单日打卡状态（与 TodoRecurrenceCompletion 对应：completedAt 非空 = done，skipped = skip） */
export type OccurrenceMark = "done" | "skip";

export interface TodoEntry extends TodoItem {
  recurrence: TodoRecurrence | null;
  /** 打卡记录：scheduledDate（当日 0 点时间戳）→ 状态；只含近一年窗口 */
  occurrences: Map<number, OccurrenceMark>;
  noteLinks: TodoNoteLink[];
  /** 直接子任务 id（按 sortIndex） */
  childIds: number[];
}

export interface TodoSnapshot {
  /** 进行中的用户项目（sortIndex 序；系统组不在其中） */
  groups: TodoGroup[];
  archivedGroups: TodoGroup[];
  /** 全部未归档任务（含子任务、含已归档项目下的任务——视图按 groups 过滤） */
  entries: TodoEntry[];
  byId: Map<number, TodoEntry>;
}

/** 议程时间段 */
export type BucketKey = "overdue" | "today" | "tomorrow" | "week" | "later" | "none";

/** 热力格 / 周打卡点的单元状态 */
export type HabitCellState = "done" | "skip" | "miss" | "off" | "today" | "future";

export interface HabitCell {
  day: number;
  state: HabitCellState;
}
