import type { TodoItemType } from "@/types";

export const typeLabelMap: Record<TodoItemType, string> = {
  normal: "普通",
  deadline: "截止",
  recurring: "周期",
};
