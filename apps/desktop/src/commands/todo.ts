import { invoke } from "@/electron";
import {
  CalendarEvent,
  TodoGroup,
  CreateTodoGroup,
  UpdateTodoGroup,
  TodoItem,
  CreateTodoItem,
  UpdateTodoItem,
  MoveAndReorderPayload,
  TodoNoteLink,
  AttachExistingNotePayload,
  TodoItemType,
  TodoRecurrence,
  CreateTodoRecurrence,
  UpdateTodoRecurrence,
  TodoRecurrenceCompletion,
  TodoCalendarMapping,
  TodoCalendarEventSource,
} from "@/types";

// ==================== Groups ====================

export const listTodoGroups = async (): Promise<TodoGroup[]> => {
  return invoke("todo:list-groups");
};

export const listArchivedTodoGroups = async (): Promise<TodoGroup[]> => {
  return invoke("todo:list-archived-groups");
};

export const getSystemGroups = async (): Promise<TodoGroup[]> => {
  return invoke("todo:get-system-groups");
};

export const createTodoGroup = async (payload: CreateTodoGroup): Promise<TodoGroup> => {
  return invoke("todo:create-group", payload);
};

export const updateTodoGroup = async (payload: UpdateTodoGroup): Promise<TodoGroup> => {
  return invoke("todo:update-group", payload);
};

export const archiveTodoGroup = async (id: number, isArchived: boolean): Promise<number> => {
  return invoke("todo:archive-group", { id, isArchived });
};

/** 删除项目（连同其下全部任务），返回删除的任务数 */
export const deleteTodoGroup = async (id: number): Promise<number> => {
  return invoke("todo:delete-group", { id });
};

// ==================== Items ====================

export const listTodoItems = async (groupId: number): Promise<TodoItem[]> => {
  return invoke("todo:list-items", { groupId });
};

// 按任务类型列出任务（用于系统组）
export const listTodoItemsByType = async (type: TodoItemType | "all"): Promise<TodoItem[]> => {
  return invoke("todo:list-items-by-type", { type });
};

export const createTodoItem = async (payload: CreateTodoItem): Promise<TodoItem> => {
  return invoke("todo:create-item", payload);
};

/** 建普通待办并同时安排进某个时段（快速添加写了时段时） */
export const createTodoWithSchedule = async (
  payload: CreateTodoItem & { schedule: { startDate: number; startTime: number; endTime: number } }
): Promise<{ item: TodoItem; event: CalendarEvent }> => {
  return invoke("todo:create-with-schedule", payload);
};

export const deleteTodoItemCascade = async (id: number): Promise<number> => {
  return invoke("todo:delete-item-cascade", { id });
};

export const updateTodoItem = async (payload: UpdateTodoItem): Promise<TodoItem> => {
  return invoke("todo:update-item", payload);
};

export const toggleCompleteCascade = async (id: number, isCompleted: boolean): Promise<number> => {
  return invoke("todo:toggle-complete-cascade", { id, isCompleted });
};

export const moveAndReorderTodoItem = async (payload: MoveAndReorderPayload): Promise<TodoItem> => {
  return invoke("todo:move-and-reorder", payload);
};

// ==================== Recurrence ====================

export const getRecurrenceByItemId = async (todoItemId: number): Promise<TodoRecurrence | null> => {
  return invoke("todo:get-recurrence-by-item", { todoItemId });
};

export const getRecurrencesByItemIds = async (
  todoItemIds: number[]
): Promise<Record<number, TodoRecurrence>> => {
  return invoke("todo:get-recurrences-by-item-ids", { todoItemIds });
};

export const createRecurrence = async (payload: CreateTodoRecurrence): Promise<TodoRecurrence> => {
  return invoke("todo:create-recurrence", payload);
};

export const updateRecurrence = async (payload: UpdateTodoRecurrence): Promise<TodoRecurrence> => {
  return invoke("todo:update-recurrence", payload);
};

// ==================== Recurrence Completion ====================

export const getRecurrenceCompletions = async (
  recurrenceId: number,
  startDate?: number,
  endDate?: number
): Promise<TodoRecurrenceCompletion[]> => {
  return invoke("todo:get-recurrence-completions", {
    recurrenceId,
    startDate,
    endDate,
  });
};

export const getRecurrenceCompletionsByRecurrenceIds = async (
  recurrenceIds: number[],
  startDate?: number,
  endDate?: number
): Promise<Record<number, TodoRecurrenceCompletion[]>> => {
  return invoke("todo:get-recurrence-completions-by-recurrence-ids", {
    recurrenceIds,
    startDate,
    endDate,
  });
};

export const completeRecurrence = async (
  recurrenceId: number,
  scheduledDate: number,
  originalOccurrence = false
): Promise<TodoRecurrenceCompletion> => {
  return invoke("todo:complete-recurrence", {
    recurrenceId,
    scheduledDate,
    ...(originalOccurrence ? { originalOccurrence: true } : {}),
  });
};

export const uncompleteRecurrence = async (
  recurrenceId: number,
  scheduledDate: number,
  originalOccurrence = false
): Promise<number> => {
  return invoke("todo:uncomplete-recurrence", {
    recurrenceId,
    scheduledDate,
    ...(originalOccurrence ? { originalOccurrence: true } : {}),
  });
};

export const skipRecurrence = async (
  recurrenceId: number,
  scheduledDate: number
): Promise<TodoRecurrenceCompletion> => {
  return invoke("todo:skip-recurrence", { recurrenceId, scheduledDate });
};

// ==================== Calendar Mapping ====================

export const getCalendarEventSources = async (
  calendarEventIds: number[]
): Promise<Record<number, TodoCalendarEventSource>> => {
  return invoke("todo:get-calendar-event-sources", { calendarEventIds });
};

export const getCalendarMappingsByTodo = async (
  todoItemId: number
): Promise<TodoCalendarMapping[]> => {
  return invoke("todo:get-calendar-mappings-by-todo", { todoItemId });
};

export const getCalendarMappingsByTodoIds = async (
  todoItemIds: number[]
): Promise<Record<number, TodoCalendarMapping[]>> => {
  return invoke("todo:get-calendar-mappings-by-todo-ids", { todoItemIds });
};

// ==================== Notes ====================
export const listTodoNotes = async (todoId: number): Promise<TodoNoteLink[]> => {
  return invoke("todoNote:list", { todoId });
};

export const listTodoNotesByTodoIds = async (
  todoIds: number[]
): Promise<Record<number, TodoNoteLink[]>> => {
  return invoke("todoNote:listByTodoIds", { todoIds });
};

export const attachExistingNote = async (
  payload: AttachExistingNotePayload
): Promise<TodoNoteLink> => {
  return invoke("todoNote:attachExisting", payload);
};

export const createAndAttachNote = async (
  todoId: number,
  initialTitle?: string
): Promise<{ link: TodoNoteLink; contentId: number }> => {
  return invoke("todoNote:createAndAttach", { todoId, initialTitle });
};

export const detachNote = async (linkId: number): Promise<number> => {
  return invoke("todoNote:detach", { linkId });
};

export const updateNoteTitleSnapshot = async (linkId: number, title: string): Promise<number> => {
  return invoke("todoNote:updateTitleSnapshot", { linkId, title });
};

// ==================== Reminders ====================

/** 待办提醒列表（截止前毫秒数，升序）：首个写 remind_before，其余写 item_reminder */
export const updateTodoReminders = async (todoId: number, offsets: number[]): Promise<number[]> => {
  return invoke("todo:update-reminders", { todoId, offsets });
};
