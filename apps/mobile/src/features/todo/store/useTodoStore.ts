// todo 域状态：仅保留 UI 态（激活分组/筛选）与 mutation 编排。
// 服务端数据（groups/stats/items）由组件经 features/todo/queries.ts 直接订阅 query 缓存，
// mutation 后 invalidateQueries(["todo"]) 驱动所有订阅刷新——单一状态源。

import { create } from "zustand";
import type { Descendant } from "slate";
import { getQueryClient } from "../../../router";
import * as tauri from "../../../services/tauri";
import type {
  ArchiveTodoGroupPayload,
  CreateTodoGroupPayload,
  CreateTodoItemPayload,
  CreateTodoItemRelativePayload,
  MoveAndReorderTodoItemPayload,
  ReorderTodoGroupsPayload,
  TodoGroup,
  TodoItem,
  TodoItemType,
  TodoSystemGroupType,
  ToggleTodoCompletePayload,
  UpdateTodoGroupPayload,
  UpdateTodoItemPayload,
} from "../../../types";
import { resolveStatsMap } from "../queries";

const TODO_SYSTEM_TYPES: Exclude<TodoSystemGroupType, null>[] = [
  "all",
  "normal",
  "deadline",
  "recurring",
];

const TODO_QUERY_STALE_MS = 30_000;

type TodoFilterState = {
  completed?: boolean;
  overdue?: boolean;
  keyword?: string;
  type?: TodoItemType | "all";
};

type TodoState = {
  activeGroupId: number | null;
  filters: TodoFilterState;
  initializing: boolean;

  initialize: (databaseName?: string | null) => Promise<void>;
  reloadAfterDatabaseChange: (databaseName?: string | null) => Promise<void>;
  setActiveGroup: (groupId: number | null) => void;
  setFilters: (patch: Partial<TodoFilterState>) => void;
  clearFilters: () => void;

  createGroup: (payload: CreateTodoGroupPayload) => Promise<TodoGroup>;
  updateGroup: (payload: UpdateTodoGroupPayload) => Promise<TodoGroup>;
  archiveGroup: (payload: ArchiveTodoGroupPayload) => Promise<void>;
  reorderGroups: (payload: ReorderTodoGroupsPayload) => Promise<void>;

  createItem: (payload: CreateTodoItemPayload) => Promise<TodoItem>;
  createItemRelative: (payload: CreateTodoItemRelativePayload) => Promise<TodoItem>;
  updateItem: (payload: UpdateTodoItemPayload) => Promise<TodoItem>;
  patchItemDescriptionContent: (
    todoId: number,
    groupId: number,
    descriptionContent: Descendant[] | null
  ) => void;
  toggleCompleteCascade: (payload: ToggleTodoCompletePayload) => Promise<void>;
  moveAndReorder: (payload: MoveAndReorderTodoItemPayload) => Promise<TodoItem>;
  archiveItem: (id: number, isArchived: boolean) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
  deleteItemCascade: (id: number) => Promise<void>;
};

function invalidateTodoQueries() {
  getQueryClient().invalidateQueries({ queryKey: ["todo"] });
}

async function fetchAllGroupData() {
  const queryClient = getQueryClient();
  const [groups, systemGroups, groupStats] = await Promise.all([
    queryClient.fetchQuery({
      queryKey: ["todo", "groups"],
      queryFn: () => tauri.todoListGroups(),
      staleTime: TODO_QUERY_STALE_MS,
    }),
    queryClient.fetchQuery({
      queryKey: ["todo", "systemGroups"],
      queryFn: () => tauri.todoGetSystemGroups(),
      staleTime: TODO_QUERY_STALE_MS,
    }),
    queryClient.fetchQuery({
      queryKey: ["todo", "stats"],
      queryFn: async () => {
        const [groupStats, systemStats] = await Promise.all([
          tauri.todoGetGroupStats(),
          tauri.todoGetSystemGroupStats(),
        ]);
        return resolveStatsMap(groupStats, systemStats);
      },
      staleTime: TODO_QUERY_STALE_MS,
    }),
  ]);
  return { groups, systemGroups, groupStats };
}

function resolveItemsCacheKey(groupId: number | null, systemGroups: TodoGroup[]): string | null {
  if (groupId == null) {
    return null;
  }
  const systemType = systemGroups.find(group => group.id === groupId)?.systemType ?? null;
  if (systemType) {
    return `_system_${systemType}`;
  }
  return String(groupId);
}

function resolveFallbackGroupId(groups: TodoGroup[], systemGroups: TodoGroup[]): number | null {
  const preferredSystemOrder = new Map<string, number>();
  TODO_SYSTEM_TYPES.forEach((type, index) => {
    preferredSystemOrder.set(type, index);
  });
  const sortedSystemGroups = [...systemGroups].sort((a, b) => {
    const orderA = preferredSystemOrder.get(a.systemType ?? "") ?? 999;
    const orderB = preferredSystemOrder.get(b.systemType ?? "") ?? 999;
    return orderA - orderB;
  });
  return sortedSystemGroups[0]?.id ?? groups[0]?.id ?? null;
}

function groupExists(groupId: number, groups: TodoGroup[], systemGroups: TodoGroup[]): boolean {
  return (
    groups.some(group => group.id === groupId) || systemGroups.some(group => group.id === groupId)
  );
}

export function getTodoItemsCacheKey(
  activeGroupId: number | null,
  systemGroups: TodoGroup[]
): string | null {
  return resolveItemsCacheKey(activeGroupId, systemGroups);
}

export const useTodoStore = create<TodoState>()((set, get) => ({
  activeGroupId: null,
  filters: { type: "all" },
  initializing: false,

  initialize: async _databaseName => {
    if (get().initializing) return;
    set({ initializing: true });
    try {
      const { groups, systemGroups } = await fetchAllGroupData();
      const previousGroupId = get().activeGroupId;
      const nextActiveGroupId =
        previousGroupId != null && groupExists(previousGroupId, groups, systemGroups)
          ? previousGroupId
          : resolveFallbackGroupId(groups, systemGroups);
      if (nextActiveGroupId !== previousGroupId) {
        set({ activeGroupId: nextActiveGroupId });
      }
    } finally {
      set({ initializing: false });
    }
  },

  reloadAfterDatabaseChange: async _databaseName => {
    invalidateTodoQueries();
    const { groups, systemGroups } = await fetchAllGroupData();
    const previousGroupId = get().activeGroupId;
    const nextActiveGroupId =
      previousGroupId != null && groupExists(previousGroupId, groups, systemGroups)
        ? previousGroupId
        : resolveFallbackGroupId(groups, systemGroups);
    set({ activeGroupId: nextActiveGroupId });
  },

  // items 数据由 useTodoItems 按 key 订阅，切换分组即自动拉取
  setActiveGroup: groupId => {
    set({ activeGroupId: groupId });
  },
  setFilters: patch => {
    set(state => ({ filters: { ...state.filters, ...patch } }));
  },
  clearFilters: () => {
    set({ filters: { type: "all" } });
  },

  createGroup: async payload => {
    const group = await tauri.todoCreateGroup(payload);
    invalidateTodoQueries();
    return group;
  },
  updateGroup: async payload => {
    const group = await tauri.todoUpdateGroup(payload);
    invalidateTodoQueries();
    return group;
  },
  archiveGroup: async payload => {
    await tauri.todoArchiveGroup(payload);
    await get().reloadAfterDatabaseChange(null);
  },
  reorderGroups: async payload => {
    await tauri.todoReorderGroups(payload);
    invalidateTodoQueries();
  },

  createItem: async payload => {
    const item = await tauri.todoCreateItem(payload);
    invalidateTodoQueries();
    return item;
  },
  createItemRelative: async payload => {
    const item = await tauri.todoCreateItemRelative(payload);
    invalidateTodoQueries();
    return item;
  },
  updateItem: async payload => {
    const item = await tauri.todoUpdateItem(payload);
    invalidateTodoQueries();
    return item;
  },
  patchItemDescriptionContent: (todoId, _groupId, descriptionContent) => {
    // 乐观更新所有 items 订阅缓存（group/system 两个 key 空间统一处理）
    getQueryClient().setQueriesData<TodoItem[]>({ queryKey: ["todo", "items"] }, prev => {
      if (!Array.isArray(prev)) return prev;
      return prev.map(item => (item.id === todoId ? { ...item, descriptionContent } : item));
    });
  },
  toggleCompleteCascade: async payload => {
    await tauri.todoToggleCompleteCascade(payload);
    invalidateTodoQueries();
  },
  moveAndReorder: async payload => {
    const item = await tauri.todoMoveAndReorder(payload);
    invalidateTodoQueries();
    return item;
  },
  archiveItem: async (id, isArchived) => {
    await tauri.todoArchiveItem(id, isArchived);
    invalidateTodoQueries();
  },
  deleteItem: async id => {
    await tauri.todoDeleteItem(id);
    invalidateTodoQueries();
  },
  deleteItemCascade: async id => {
    await tauri.todoDeleteItemCascade(id);
    invalidateTodoQueries();
  },
}));
