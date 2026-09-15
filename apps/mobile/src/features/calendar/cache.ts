import { getQueryClient } from "../../router/query/PageQueryProvider";

export function invalidateCalendarQueries() {
  return getQueryClient().invalidateQueries({ queryKey: ["calendar"] });
}

// 这些来源域写入会同时增删改日历事件，所有 IPC 调用方共用同一失效边界。
const CALENDAR_SOURCE_MUTATIONS = new Set([
  "todo_create_item",
  "todo_create_item_relative",
  "todo_update_item",
  "todo_archive_item",
  "todo_delete_item",
  "todo_delete_item_cascade",
  "todo_create_recurrence",
  "todo_update_recurrence",
  "todo_delete_recurrence",
  "todo_delete_recurrence_by_item",
  "pomodoro_stop_session",
  "pomodoro_delete_session",
  "pomodoro_delete_sessions",
]);

export function invalidateCalendarAfterMutation(command: string) {
  if (CALENDAR_SOURCE_MUTATIONS.has(command)) {
    void invalidateCalendarQueries();
  }
}
