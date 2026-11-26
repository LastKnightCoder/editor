import type { TodoDashboardResponse, TodoItem, TodoQueryResponse } from "@/types";
import { isTodoDashboardResponse, isTodoQueryResponse } from "@/mcp/todo/query";

export type TodoRendererData = TodoQueryResponse | TodoDashboardResponse | null;

export const parseTodoRendererOutput = (output?: string): TodoRendererData => {
  if (!output) {
    return null;
  }

  try {
    const parsed = JSON.parse(output) as unknown;
    if (isTodoQueryResponse(parsed) || isTodoDashboardResponse(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

export const statusColorClass = (item: TodoItem) => {
  if (item.isCompleted) {
    return "text-ok";
  }
  if (item.dueAt && item.dueAt < Date.now()) {
    return "text-danger";
  }
  return "text-ink-3";
};

export const moveArrayItem = <T>(items: T[], fromIndex: number, toIndex: number) => {
  const next = [...items];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
};

export const isOverdue = (item: TodoItem) => {
  return !item.isCompleted && item.dueAt && item.dueAt < Date.now();
};
