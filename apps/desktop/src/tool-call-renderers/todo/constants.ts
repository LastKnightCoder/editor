import type { TodoItemType } from "@/types";

export const typeLabelMap: Record<TodoItemType, string> = {
  normal: "普通",
  deadline: "截止",
  planned: "计划",
  recurring: "周期",
};
