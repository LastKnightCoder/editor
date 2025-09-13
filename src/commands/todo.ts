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
} from "@/types";

export const listTodoGroups = async (): Promise<TodoGroup[]> => {
  return invoke("todo:list-groups");
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

// items
export const listTodoItems = async (groupId: number): Promise<TodoItem[]> => {
  return invoke("todo:list-items", { groupId });
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

// notes
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
