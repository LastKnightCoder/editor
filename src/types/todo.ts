export interface TodoGroup {
  id: number;
  title: string;
  color?: string;
  sortIndex: number;
  isArchived: boolean;
  createTime: number;
  updateTime: number;
}

export interface TodoItem {
  id: number;
  groupId: number;
  parentId: number | null;
  title: string;
  description?: string;
  isCompleted: boolean;
  dueAt?: number | null;
  completedAt?: number | null;
  sortIndex: number;
  isArchived: boolean;
  createTime: number;
  updateTime: number;
}

export interface TodoNoteLink {
  id: number;
  todoId: number;
  contentId: number;
  title?: string;
  type?: string;
  sortIndex: number;
  createTime: number;
  updateTime: number;
}

export interface CreateTodoGroup {
  title: string;
  color?: string;
}

export interface UpdateTodoGroup {
  id: number;
  title?: string;
  color?: string | null;
  sortIndex?: number;
  isArchived?: boolean;
}

export interface CreateTodoItem {
  groupId: number;
  parentId?: number | null;
  title: string;
  description?: string;
  dueAt?: number | null;
}

export interface UpdateTodoItem {
  id: number;
  title?: string;
  description?: string | null;
  dueAt?: number | null;
}

export interface MoveAndReorderPayload {
  id: number;
  toGroupId: number;
  toParentId: number | null;
  beforeId?: number;
  afterId?: number;
}

// 创建相对位置的待办项
export type CreateRelativePosition = "child" | "above" | "below";

export interface CreateTodoItemRelative {
  refId: number; // 参考项 ID
  position: CreateRelativePosition; // 插入位置
  title: string;
  description?: string;
  dueAt?: number | null;
}

export interface AttachExistingNotePayload {
  todoId: number;
  contentId: number;
  title?: string;
  type?: string;
  beforeId?: number;
  afterId?: number;
}

export interface TodoGroupStats {
  groupId: number;
  total: number;
  uncompleted: number;
  overdue: number;
}
