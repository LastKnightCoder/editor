import dayjs from "dayjs";
import type { TodoDashboardResponse, TodoItem, TodoQueryResponse, TodoQueryItem } from "@/types";
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
    return "text-status-success";
  }
  if (item.dueAt && item.dueAt < Date.now()) {
    return "text-status-error";
  }
  return "text-slate-500";
};

export const formatTime = (value?: number | null) =>
  value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "—";

export const moveArrayItem = <T>(items: T[], fromIndex: number, toIndex: number) => {
  const next = [...items];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
};

export const isOverdue = (item: TodoItem) => {
  return !item.isCompleted && item.dueAt && item.dueAt < Date.now();
};

export const getSecondaryInfoItems = (item: TodoQueryItem) => {
  const items: Array<{ icon: string; text: string; tooltip: string }> = [];
  if (item.noteCount) {
    items.push({
      icon: "📝",
      text: String(item.noteCount),
      tooltip: `${item.noteCount} 条笔记`,
    });
  }
  if (item.calendarMappings?.length) {
    items.push({
      icon: "📅",
      text: String(item.calendarMappings.length),
      tooltip: `${item.calendarMappings.length} 个日历映射`,
    });
  }
  if (item.recurrence) {
    items.push({
      icon: "🔄",
      text: "",
      tooltip: "有周期规则",
    });
  }
  return items;
};
