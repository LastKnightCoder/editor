import { create } from "zustand";
import { getQueryClient } from "../../../router";
import type { Descendant } from "slate";
import * as tauri from "../../../services/tauri";
import type {
  ArchiveTodoGroupPayload,
  CreateTodoGroupPayload,
  CreateTodoItemPayload,
  CreateTodoItemRelativePayload,
  ListTodoItemsByTypePayload,
  MoveAndReorderTodoItemPayload,
  ReorderTodoGroupsPayload,
  TodoGroup,
  TodoGroupStats,
  TodoItem,
  TodoItemType,
  TodoSystemGroupType,
  ToggleTodoCompletePayload,
  UpdateTodoGroupPayload,
  UpdateTodoItemPayload,
} from "../../../types";

const TODO_SYSTEM_TYPES: Exclude<TodoSystemGroupType, null>[] = [
  "all",
  "normal",
  "deadline",
  "planned",
  "recurring",
];

const EMPTY_GROUP_STATS: Record<number, TodoGroupStats> = {};

type TodoItemsByGroupId = Record<string, TodoItem[]>;

type TodoFilterState = {
  completed?: boolean;
  overdue?: boolean;
  keyword?: string;
  type?: TodoItemType | "all";
};

type TodoLoadingState = {
  groups: boolean;
  items: boolean;
};

type TodoState = {
  groups: TodoGroup[];
  systemGroups: TodoGroup[];
  groupStats: Record<number, TodoGroupStats>;
  itemsByGroupId: TodoItemsByGroupId;
  activeGroupId: number | null;
  activeTodoId: number | null;
  filters: TodoFilterState;
  loading: TodoLoadingState;
  lastLoadedDatabase: string | null;
  initializing: boolean;

  initialize: (databaseName?: string | null) => Promise<void>;
  reloadAfterDatabaseChange: (databaseName?: string | null) => Promise<void>;
  loadGroups: () => Promise<void>;
  loadSystemGroups: () => Promise<void>;
  loadGroupStats: () => Promise<void>;
  refreshActiveItems: () => Promise<void>;
  loadItems: (groupId: number) => Promise<void>;
  loadItemsByType: (type: Exclude<TodoSystemGroupType, null>) => Promise<void>;

  setActiveGroup: (groupId: number | null) => Promise<void>;
  setActiveTodo: (todoId: number | null) => void;
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

function resolveStatsMap(
  groupStats: TodoGroupStats[],
  systemStats: TodoGroupStats[]
): Record<number, TodoGroupStats> {
  const next: Record<number, TodoGroupStats> = {};
  groupStats.forEach(stats => {
    next[stats.groupId] = stats;
  });
  systemStats.forEach(stats => {
    next[stats.groupId] = stats;
  });
  return next;
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

// 服务端读路径统一走 query 缓存：并发去重、staleTime 内切换分组秒显；
// mutation 后 invalidateQueries(["todo"]) 即可让所有读路径重新拉取
const TODO_QUERY_STALE_MS = 30_000;

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

export function getTodoItemsCacheKey(
  activeGroupId: number | null,
  systemGroups: TodoGroup[]
): string | null {
  return resolveItemsCacheKey(activeGroupId, systemGroups);
}

export const useTodoStore = create<TodoState>()((set, get) => ({
  groups: [],
  systemGroups: [],
  groupStats: EMPTY_GROUP_STATS,
  itemsByGroupId: {},
  activeGroupId: null,
  activeTodoId: null,
  filters: {
    type: "all",
  },
  loading: {
    groups: false,
    items: false,
  },
  lastLoadedDatabase: null,
  initializing: false,

  initialize: async databaseName => {
    const state = get();
    if (
      databaseName &&
      state.lastLoadedDatabase === databaseName &&
      state.systemGroups.length > 0
    ) {
      return;
    }
    if (state.initializing) return;
    set({ initializing: true });
    try {
      await get().reloadAfterDatabaseChange(databaseName ?? null);
    } finally {
      set({ initializing: false });
    }
  },

  reloadAfterDatabaseChange: async databaseName => {
    invalidateTodoQueries();
    set(state => ({
      loading: { ...state.loading, groups: true },
      itemsByGroupId: {},
      activeTodoId: null,
    }));

    try {
      const { groups, systemGroups, groupStats } = await fetchAllGroupData();
      const previousGroupId = get().activeGroupId;
      const nextActiveGroupId =
        previousGroupId != null && groupExists(previousGroupId, groups, systemGroups)
          ? previousGroupId
          : resolveFallbackGroupId(groups, systemGroups);

      set(state => ({
        groups,
        systemGroups,
        groupStats,
        activeGroupId: nextActiveGroupId,
        loading: { ...state.loading, groups: false },
        lastLoadedDatabase: databaseName ?? state.lastLoadedDatabase,
      }));

      if (nextActiveGroupId != null) {
        void get().refreshActiveItems();
      }
    } catch (error) {
      set(state => ({
        loading: { ...state.loading, groups: false },
      }));
      throw error;
    }
  },

  loadGroups: async () => {
    set(state => ({ loading: { ...state.loading, groups: true } }));
    try {
      const groups = await getQueryClient().fetchQuery({
        queryKey: ["todo", "groups"],
        queryFn: () => tauri.todoListGroups(),
        staleTime: TODO_QUERY_STALE_MS,
      });
      set(state => ({
        groups,
        loading: { ...state.loading, groups: false },
      }));
    } catch (error) {
      set(state => ({
        loading: { ...state.loading, groups: false },
      }));
      throw error;
    }
  },

  loadSystemGroups: async () => {
    const systemGroups = await getQueryClient().fetchQuery({
      queryKey: ["todo", "systemGroups"],
      queryFn: () => tauri.todoGetSystemGroups(),
      staleTime: TODO_QUERY_STALE_MS,
    });
    set({ systemGroups });
  },

  loadGroupStats: async () => {
    const statsMap = await getQueryClient().fetchQuery({
      queryKey: ["todo", "stats"],
      queryFn: async () => {
        const [groupStats, systemStats] = await Promise.all([
          tauri.todoGetGroupStats(),
          tauri.todoGetSystemGroupStats(),
        ]);
        return resolveStatsMap(groupStats, systemStats);
      },
      staleTime: TODO_QUERY_STALE_MS,
    });
    set({
      groupStats: statsMap,
    });
  },

  refreshActiveItems: async () => {
    const { activeGroupId, systemGroups } = get();
    if (activeGroupId == null) {
      return;
    }
    const systemType = systemGroups.find(group => group.id === activeGroupId)?.systemType ?? null;
    if (systemType) {
      await get().loadItemsByType(systemType);
      return;
    }
    await get().loadItems(activeGroupId);
  },

  loadItems: async groupId => {
    set(state => ({ loading: { ...state.loading, items: true } }));
    try {
      const items = await getQueryClient().fetchQuery({
        queryKey: ["todo", "items", "group", groupId],
        queryFn: () => tauri.todoListItems({ groupId }),
        staleTime: TODO_QUERY_STALE_MS,
      });
      set(state => ({
        itemsByGroupId: {
          ...state.itemsByGroupId,
          [String(groupId)]: items,
        },
        loading: { ...state.loading, items: false },
      }));
    } catch (error) {
      set(state => ({ loading: { ...state.loading, items: false } }));
      throw error;
    }
  },

  loadItemsByType: async type => {
    set(state => ({ loading: { ...state.loading, items: true } }));
    try {
      const payload: ListTodoItemsByTypePayload = { type };
      const items = await getQueryClient().fetchQuery({
        queryKey: ["todo", "items", "system", type],
        queryFn: () => tauri.todoListItemsByType(payload),
        staleTime: TODO_QUERY_STALE_MS,
      });
      set(state => ({
        itemsByGroupId: {
          ...state.itemsByGroupId,
          [`_system_${type}`]: items,
        },
        loading: { ...state.loading, items: false },
      }));
    } catch (error) {
      set(state => ({ loading: { ...state.loading, items: false } }));
      throw error;
    }
  },

  setActiveGroup: async groupId => {
    set({ activeGroupId: groupId, activeTodoId: null });
    if (groupId == null) {
      return;
    }
    await get().refreshActiveItems();
  },

  setActiveTodo: todoId => {
    set({ activeTodoId: todoId });
  },

  setFilters: patch => {
    set(state => ({
      filters: {
        ...state.filters,
        ...patch,
      },
    }));
  },

  clearFilters: () => {
    set({
      filters: {
        type: "all",
      },
    });
  },

  createGroup: async payload => {
    const group = await tauri.todoCreateGroup(payload);
    invalidateTodoQueries();
    await get().loadGroups();
    return group;
  },

  updateGroup: async payload => {
    const group = await tauri.todoUpdateGroup(payload);
    invalidateTodoQueries();
    await Promise.all([get().loadGroups(), get().loadSystemGroups()]);
    return group;
  },

  archiveGroup: async payload => {
    await tauri.todoArchiveGroup(payload);
    invalidateTodoQueries();
    await get().reloadAfterDatabaseChange(get().lastLoadedDatabase);
  },

  reorderGroups: async payload => {
    await tauri.todoReorderGroups(payload);
    invalidateTodoQueries();
    await get().loadGroups();
  },

  createItem: async payload => {
    const item = await tauri.todoCreateItem(payload);
    invalidateTodoQueries();
    await Promise.all([get().refreshActiveItems(), get().loadGroupStats()]);
    return item;
  },

  createItemRelative: async payload => {
    const item = await tauri.todoCreateItemRelative(payload);
    invalidateTodoQueries();
    await Promise.all([get().refreshActiveItems(), get().loadGroupStats()]);
    return item;
  },

  updateItem: async payload => {
    const item = await tauri.todoUpdateItem(payload);
    invalidateTodoQueries();
    await Promise.all([get().refreshActiveItems(), get().loadGroupStats()]);
    return item;
  },

  patchItemDescriptionContent: (todoId, groupId, descriptionContent) => {
    set(state => {
      const next = { ...state.itemsByGroupId };
      const cacheKey = String(groupId);
      const items = next[cacheKey];
      if (Array.isArray(items)) {
        next[cacheKey] = items.map(item =>
          item.id === todoId
            ? {
                ...item,
                descriptionContent,
              }
            : item
        );
      }
      return { itemsByGroupId: next };
    });
  },

  toggleCompleteCascade: async payload => {
    await tauri.todoToggleCompleteCascade(payload);
    invalidateTodoQueries();
    await Promise.all([get().refreshActiveItems(), get().loadGroupStats()]);
  },

  moveAndReorder: async payload => {
    const item = await tauri.todoMoveAndReorder(payload);
    invalidateTodoQueries();
    await Promise.all([get().refreshActiveItems(), get().loadGroupStats()]);
    return item;
  },

  archiveItem: async (id, isArchived) => {
    await tauri.todoArchiveItem(id, isArchived);
    invalidateTodoQueries();
    await Promise.all([get().refreshActiveItems(), get().loadGroupStats()]);
  },

  deleteItem: async id => {
    await tauri.todoDeleteItem(id);
    invalidateTodoQueries();
    await Promise.all([get().refreshActiveItems(), get().loadGroupStats()]);
  },

  deleteItemCascade: async id => {
    await tauri.todoDeleteItemCascade(id);
    invalidateTodoQueries();
    await Promise.all([get().refreshActiveItems(), get().loadGroupStats()]);
  },
}));
