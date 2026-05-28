import type { ICard } from "./card";
import type { IQuestion } from "./question";
import type { TodoGroup, TodoItem } from "./todo";

export interface WorkbenchPageRequest {
  limit?: number;
  cursor?: number | null;
}

export interface WorkbenchExpiringCardItem {
  card: ICard;
  expiresAt: number;
  remainingMs: number;
}

export interface WorkbenchExpiringCardsResponse {
  items: WorkbenchExpiringCardItem[];
  nextCursor: number | null;
  total: number;
}

export interface WorkbenchTodoPreviewRequest extends WorkbenchPageRequest {
  groupId?: number | null;
  status?: "pending" | "completed" | "all";
}

export interface WorkbenchTodoGroupStat {
  group: TodoGroup;
  total: number;
  pending: number;
  overdue: number;
}

export interface WorkbenchTodoPreviewResponse {
  items: TodoItem[];
  groups: WorkbenchTodoGroupStat[];
  nextCursor: number | null;
  total: number;
  pendingTotal: number;
  overdueTotal: number;
}

export interface WorkbenchQuestionPreviewRequest extends WorkbenchPageRequest {
  groupId?: number | null;
  statuses?: Array<"not_started" | "in_progress" | "resolved">;
}

export interface WorkbenchQuestionGroupStat {
  group: {
    id: number;
    title: string;
    color?: string;
    isDefault: boolean;
  };
  total: number;
  notStarted: number;
  inProgress: number;
  resolved: number;
}

export interface WorkbenchQuestionPreviewResponse {
  items: IQuestion[];
  groups: WorkbenchQuestionGroupStat[];
  nextCursor: number | null;
  total: number;
  notStartedTotal: number;
  inProgressTotal: number;
}
