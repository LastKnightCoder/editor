import { invoke } from "@/electron";
import {
  TodoGroup,
  CreateTodoGroup,
  UpdateTodoGroup,
  TodoItem,
  CreateTodoItem,
  UpdateTodoItem,
  MoveAndReorderPayload,
  TodoNoteLink,
  AttachExistingNotePayload,
  TodoGroupStats,
  CreateTodoItemRelative,
  TodoItemType,
  TodoRecurrence,
  CreateTodoRecurrence,
  UpdateTodoRecurrence,
  TodoRecurrenceCompletion,
  TodoCalendarMapping,
  TodoCalendarSyncType,
} from "@/types";

// ==================== Groups ====================

export const listTodoGroups = async (): Promise<TodoGroup[]> => {
  return invoke("todo:list-groups");
};

export const getSystemGroups = async (): Promise<TodoGroup[]> => {
  return invoke("todo:get-system-groups");
};

export const createTodoGroup = async (
  payload: CreateTodoGroup,
): Promise<TodoGroup> => {
  return invoke("todo:create-group", payload);
};

export const updateTodoGroup = async (
  payload: UpdateTodoGroup,
): Promise<TodoGroup> => {
  return invoke("todo:update-group", payload);
};

export const archiveTodoGroup = async (
  id: number,
  isArchived: boolean,
): Promise<number> => {
  return invoke("todo:archive-group", { id, isArchived });
};

export const reorderTodoGroups = async (
  orderedIds: number[],
): Promise<number> => {
  return invoke("todo:reorder-groups", { orderedIds });
};

export const getTodoGroupStats = async (): Promise<TodoGroupStats[]> => {
  return invoke("todo:get-group-stats");
};

export const getSystemGroupStats = async (): Promise<TodoGroupStats[]> => {
  return invoke("todo:get-system-group-stats");
};

// ==================== Items ====================

export const listTodoItems = async (groupId: number): Promise<TodoItem[]> => {
  return invoke("todo:list-items", { groupId });
};

// 按任务类型列出任务（用于系统组）
export const listTodoItemsByType = async (
  type: TodoItemType | "all",
): Promise<TodoItem[]> => {
  return invoke("todo:list-items-by-type", { type });
};

export const createTodoItem = async (
  payload: CreateTodoItem,
): Promise<TodoItem> => {
  return invoke("todo:create-item", payload);
};

export const createTodoItemRelative = async (
  payload: CreateTodoItemRelative,
): Promise<TodoItem> => {
  return invoke("todo:create-item-relative", payload);
};

export const deleteTodoItemCascade = async (id: number): Promise<number> => {
  return invoke("todo:delete-item-cascade", { id });
};

export const updateTodoItem = async (
  payload: UpdateTodoItem,
): Promise<TodoItem> => {
  return invoke("todo:update-item", payload);
};

export const toggleCompleteCascade = async (
  id: number,
  isCompleted: boolean,
): Promise<number> => {
  return invoke("todo:toggle-complete-cascade", { id, isCompleted });
};

export const moveAndReorderTodoItem = async (
  payload: MoveAndReorderPayload,
): Promise<TodoItem> => {
  return invoke("todo:move-and-reorder", payload);
};

export const archiveTodoItem = async (
  id: number,
  isArchived: boolean,
): Promise<number> => {
  return invoke("todo:archive-item", { id, isArchived });
};

export const deleteTodoItem = async (id: number): Promise<number> => {
  return invoke("todo:delete-item", id);
};

// ==================== Recurrence ====================

export const getRecurrence = async (
  id: number,
): Promise<TodoRecurrence | null> => {
  return invoke("todo:get-recurrence", { id });
};

export const getRecurrenceByItemId = async (
  todoItemId: number,
): Promise<TodoRecurrence | null> => {
  return invoke("todo:get-recurrence-by-item", { todoItemId });
};

export const createRecurrence = async (
  payload: CreateTodoRecurrence,
): Promise<TodoRecurrence> => {
  return invoke("todo:create-recurrence", payload);
};

export const updateRecurrence = async (
  payload: UpdateTodoRecurrence,
): Promise<TodoRecurrence> => {
  return invoke("todo:update-recurrence", payload);
};

export const deleteRecurrence = async (id: number): Promise<number> => {
  return invoke("todo:delete-recurrence", { id });
};

export const deleteRecurrenceByItemId = async (
  todoItemId: number,
): Promise<number> => {
  return invoke("todo:delete-recurrence-by-item", { todoItemId });
};

// ==================== Recurrence Completion ====================

export const getRecurrenceCompletions = async (
  recurrenceId: number,
  startDate?: number,
  endDate?: number,
): Promise<TodoRecurrenceCompletion[]> => {
  return invoke("todo:get-recurrence-completions", {
    recurrenceId,
    startDate,
    endDate,
  });
};

export const getRecurrenceCompletion = async (
  recurrenceId: number,
  scheduledDate: number,
): Promise<TodoRecurrenceCompletion | null> => {
  return invoke("todo:get-recurrence-completion", {
    recurrenceId,
    scheduledDate,
  });
};

export const completeRecurrence = async (
  recurrenceId: number,
  scheduledDate: number,
): Promise<TodoRecurrenceCompletion> => {
  return invoke("todo:complete-recurrence", { recurrenceId, scheduledDate });
};

export const uncompleteRecurrence = async (
  recurrenceId: number,
  scheduledDate: number,
): Promise<number> => {
  return invoke("todo:uncomplete-recurrence", { recurrenceId, scheduledDate });
};

export const skipRecurrence = async (
  recurrenceId: number,
  scheduledDate: number,
): Promise<TodoRecurrenceCompletion> => {
  return invoke("todo:skip-recurrence", { recurrenceId, scheduledDate });
};

// ==================== Calendar Mapping ====================

export const getCalendarMappingsByTodo = async (
  todoItemId: number,
): Promise<TodoCalendarMapping[]> => {
  return invoke("todo:get-calendar-mappings-by-todo", { todoItemId });
};

export const getCalendarMappingByEvent = async (
  calendarEventId: number,
): Promise<TodoCalendarMapping | null> => {
  return invoke("todo:get-calendar-mapping-by-event", { calendarEventId });
};

export const createCalendarMapping = async (
  todoItemId: number,
  calendarEventId: number,
  syncType: TodoCalendarSyncType,
  recurrenceDate?: number | null,
): Promise<TodoCalendarMapping> => {
  return invoke("todo:create-calendar-mapping", {
    todoItemId,
    calendarEventId,
    syncType,
    recurrenceDate,
  });
};

export const deleteCalendarMapping = async (id: number): Promise<number> => {
  return invoke("todo:delete-calendar-mapping", { id });
};

export const deleteCalendarMappingsByTodo = async (
  todoItemId: number,
): Promise<number> => {
  return invoke("todo:delete-calendar-mappings-by-todo", { todoItemId });
};

export const deleteCalendarMappingsByEvent = async (
  calendarEventId: number,
): Promise<number> => {
  return invoke("todo:delete-calendar-mappings-by-event", { calendarEventId });
};

// ==================== Notes ====================
export const listTodoNotes = async (
  todoId: number,
): Promise<TodoNoteLink[]> => {
  return invoke("todoNote:list", { todoId });
};

export const attachExistingNote = async (
  payload: AttachExistingNotePayload,
): Promise<TodoNoteLink> => {
  return invoke("todoNote:attachExisting", payload);
};

export const createAndAttachNote = async (
  todoId: number,
  initialTitle?: string,
): Promise<{ link: TodoNoteLink; contentId: number }> => {
  return invoke("todoNote:createAndAttach", { todoId, initialTitle });
};

export const detachNote = async (linkId: number): Promise<number> => {
  return invoke("todoNote:detach", { linkId });
};

export const reorderNotes = async (
  todoId: number,
  orderedLinkIds: number[],
): Promise<number> => {
  return invoke("todoNote:reorder", { todoId, orderedLinkIds });
};

export const updateNoteTitleSnapshot = async (
  linkId: number,
  title: string,
): Promise<number> => {
  return invoke("todoNote:updateTitleSnapshot", { linkId, title });
};

// ==================== Calendar Sync ====================

interface TodoCalendars {
  groupId: number;
  deadline: number;
  planned: number;
  recurring: number;
}

export const getTodoCalendars = async (): Promise<TodoCalendars> => {
  return invoke("todo-calendar:get-calendars");
};

export const syncTodoItemToCalendar = async (
  todoItem: TodoItem,
  recurrenceDate?: number,
): Promise<number | null> => {
  return invoke("todo-calendar:sync-item", { todoItem, recurrenceDate });
};

export const removeTodoItemFromCalendar = async (
  todoItemId: number,
  recurrenceDate?: number,
): Promise<number> => {
  return invoke("todo-calendar:remove-item", { todoItemId, recurrenceDate });
};

export const syncFromCalendarEvent = async (
  calendarEventId: number,
): Promise<boolean> => {
  return invoke("todo-calendar:sync-from-event", { calendarEventId });
};

export const cleanupOrphanedCalendarEvents = async (): Promise<number> => {
  return invoke("todo-calendar:cleanup-orphaned");
};

// ==================== Reminders ====================

export interface PendingReminder {
  todoItem: TodoItem;
  recurrenceDate?: number;
  remindAt: number;
}

export const getPendingReminders = async (): Promise<PendingReminder[]> => {
  return invoke("todo-reminder:get-pending");
};

export const dismissReminder = async (
  todoId: number,
  recurrenceDate?: number,
): Promise<void> => {
  return invoke("todo-reminder:dismiss", { todoId, recurrenceDate });
};

export const dismissAllReminders = async (): Promise<void> => {
  return invoke("todo-reminder:dismiss-all");
};
