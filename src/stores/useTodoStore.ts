import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  TodoGroup,
  TodoItem,
  TodoNoteLink,
  TodoGroupStats,
  CreateTodoGroup,
  UpdateTodoGroup,
  CreateTodoItem,
  UpdateTodoItem,
  MoveAndReorderPayload,
} from "@/types";
import {
  listTodoGroups,
  createTodoGroup,
  updateTodoGroup,
  archiveTodoGroup,
  reorderTodoGroups,
  getTodoGroupStats,
  listTodoItems,
  createTodoItem,
  createTodoItemRelative,
  updateTodoItem,
  toggleCompleteCascade,
  moveAndReorderTodoItem,
  archiveTodoItem,
  deleteTodoItem,
  deleteTodoItemCascade,
  listTodoNotes,
  attachExistingNote,
  createAndAttachNote,
  detachNote,
  reorderNotes,
  updateNoteTitleSnapshot,
} from "@/commands/todo";

interface TodoUIState {
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
}

interface TodoState {
  ui: TodoUIState;
  groups: TodoGroup[];
  groupStats: Record<number, TodoGroupStats>;
  itemsByGroupId: Record<number, TodoItem[]>;
  notesByTodoId: Record<number, TodoNoteLink[]>;
  activeGroupId: number | null;
  activeTodoId: number | null;
  expandedIds: Set<number>;
  filters: { completed?: boolean; overdue?: boolean; keyword?: string };
  loading: { groups: boolean; items: boolean; notes: boolean };

  setLeftOpen: (open: boolean) => void;
  setRightOpen: (open: boolean) => void;
  setLeftWidth: (w: number) => void;
  setRightWidth: (w: number) => void;

  loadGroups: () => Promise<void>;
  loadGroupStats: () => Promise<void>;
  createGroup: (payload: CreateTodoGroup) => Promise<void>;
  renameGroup: (payload: UpdateTodoGroup) => Promise<void>;
  archiveGroup: (id: number, isArchived: boolean) => Promise<void>;
  reorderGroups: (orderedIds: number[]) => Promise<void>;
  pinGroupToTop: (id: number) => Promise<void>;
  setActiveGroup: (id: number | null) => void;
  setActiveTodo: (id: number | null) => void;

  loadItems: (groupId: number) => Promise<void>;
  createItem: (payload: CreateTodoItem) => Promise<TodoItem>;
  createItemRelative: (payload: {
    refId: number;
    position: "child" | "above" | "below";
    title: string;
    description?: string;
    dueAt?: number | null;
  }) => Promise<void>;
  updateItem: (payload: UpdateTodoItem) => Promise<void>;
  toggleCompleteCascade: (id: number, isCompleted: boolean) => Promise<void>;
  moveAndReorder: (payload: MoveAndReorderPayload) => Promise<void>;
  archiveItem: (id: number, isArchived: boolean) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
  deleteItemCascade: (id: number) => Promise<void>;
  setExpanded: (id: number, open: boolean) => void;
  setFilters: (
    f: Partial<{ completed?: boolean; overdue?: boolean; keyword?: string }>,
  ) => void;

  loadNotes: (todoId: number) => Promise<void>;
  attachExistingNote: (
    todoId: number,
    contentId: number,
    title?: string,
    type?: string,
  ) => Promise<void>;
  createAndAttachNote: (todoId: number, initialTitle?: string) => Promise<void>;
  detachNote: (linkId: number) => Promise<void>;
  reorderNotes: (todoId: number, orderedLinkIds: number[]) => Promise<void>;
  updateNoteTitleSnapshot: (linkId: number, title: string) => Promise<void>;
  reset: () => void;
}

export const useTodoStore = create<TodoState>()(
  devtools((set, get) => ({
    ui: { leftOpen: true, rightOpen: false, leftWidth: 260, rightWidth: 360 },
    groups: [],
    groupStats: {},
    itemsByGroupId: {},
    notesByTodoId: {},
    activeGroupId: null,
    activeTodoId: null,
    expandedIds: new Set<number>(),
    filters: {},
    loading: { groups: false, items: false, notes: false },

    setLeftOpen: (open) => set((s) => ({ ui: { ...s.ui, leftOpen: open } })),
    setRightOpen: (open) => set((s) => ({ ui: { ...s.ui, rightOpen: open } })),
    setLeftWidth: (w) => set((s) => ({ ui: { ...s.ui, leftWidth: w } })),
    setRightWidth: (w) => set((s) => ({ ui: { ...s.ui, rightWidth: w } })),

    reset: () => {
      set({
        groups: [],
        groupStats: {},
        itemsByGroupId: {},
        notesByTodoId: {},
        activeGroupId: null,
        activeTodoId: null,
        expandedIds: new Set<number>(),
        filters: {},
        loading: { groups: false, items: false, notes: false },
      });
    },

    loadGroups: async () => {
      set((s) => ({ loading: { ...s.loading, groups: true } }));
      const groups = await listTodoGroups();
      set((s) => ({ groups, loading: { ...s.loading, groups: false } }));
    },

    loadGroupStats: async () => {
      const stats = await getTodoGroupStats();
      const statsMap: Record<number, TodoGroupStats> = {};
      stats.forEach((s) => (statsMap[s.groupId] = s));
      set({ groupStats: statsMap });
    },

    createGroup: async (payload) => {
      const g = await createTodoGroup(payload);
      set((s) => ({ groups: [...s.groups, g] }));
    },

    renameGroup: async (payload) => {
      const g = await updateTodoGroup(payload);
      set((s) => ({ groups: s.groups.map((x) => (x.id === g.id ? g : x)) }));
    },

    archiveGroup: async (id, isArchived) => {
      await archiveTodoGroup(id, isArchived);
      set((s) => ({
        groups: s.groups.filter((g) => (isArchived ? g.id !== id : true)),
      }));
    },

    reorderGroups: async (orderedIds) => {
      await reorderTodoGroups(orderedIds);
      const idToIndex = new Map<number, number>();
      orderedIds.forEach((id, index) => idToIndex.set(id, index));
      set((s) => ({
        groups: [...s.groups].sort(
          (a, b) => idToIndex.get(a.id)! - idToIndex.get(b.id)!,
        ),
      }));
    },

    pinGroupToTop: async (id) => {
      const ids = get().groups.map((g) => g.id);
      const newOrder = [id, ...ids.filter((x) => x !== id)];
      await get().reorderGroups(newOrder);
    },

    setActiveGroup: (id) => set({ activeGroupId: id, activeTodoId: null }),
    setActiveTodo: (id) => set({ activeTodoId: id }),

    loadItems: async (groupId) => {
      set((s) => ({ loading: { ...s.loading, items: true } }));
      const items = await listTodoItems(groupId);
      set((s) => ({
        itemsByGroupId: { ...s.itemsByGroupId, [groupId]: items },
        loading: { ...s.loading, items: false },
      }));
    },

    createItem: async (payload) => {
      const item = await createTodoItem(payload);
      set((s) => ({
        itemsByGroupId: {
          ...s.itemsByGroupId,
          [item.groupId]: [...(s.itemsByGroupId[item.groupId] || []), item],
        },
      }));
      await get().loadGroupStats();
      return item;
    },

    createItemRelative: async (payload) => {
      const item = await createTodoItemRelative(payload as any);
      await get().loadItems(item.groupId);
      await get().loadGroupStats();
    },

    updateItem: async (payload) => {
      const item = await updateTodoItem(payload);
      set((s) => ({
        itemsByGroupId: {
          ...s.itemsByGroupId,
          [item.groupId]: (s.itemsByGroupId[item.groupId] || []).map((x) =>
            x.id === item.id ? item : x,
          ),
        },
      }));
      await get().loadGroupStats();
    },

    toggleCompleteCascade: async (id, isCompleted) => {
      await toggleCompleteCascade(id, isCompleted);
      const gid = get().activeGroupId;
      if (gid != null) await get().loadItems(gid);
      await get().loadGroupStats();
    },

    moveAndReorder: async (payload) => {
      const item = await moveAndReorderTodoItem(payload);
      await get().loadItems(item.groupId);
      await get().loadGroupStats();
    },

    archiveItem: async (id, isArchived) => {
      await archiveTodoItem(id, isArchived);
      const gid = get().activeGroupId;
      if (gid != null) await get().loadItems(gid);
      await get().loadGroupStats();
    },

    deleteItem: async (id) => {
      await deleteTodoItem(id);
      const gid = get().activeGroupId;
      if (gid != null) await get().loadItems(gid);
      await get().loadGroupStats();
    },

    deleteItemCascade: async (id) => {
      await deleteTodoItemCascade(id);
      const gid = get().activeGroupId;
      if (gid != null) await get().loadItems(gid);
      await get().loadGroupStats();
    },

    setExpanded: (id, open) =>
      set((s) => ({
        expandedIds: (() => {
          const next = new Set(s.expandedIds);
          if (open) next.add(id);
          else next.delete(id);
          return next;
        })(),
      })),

    setFilters: (f) =>
      set((s) => ({
        filters: { ...s.filters, ...f },
      })),

    loadNotes: async (todoId) => {
      const notes = await listTodoNotes(todoId);
      set((s) => ({ notesByTodoId: { ...s.notesByTodoId, [todoId]: notes } }));
    },

    attachExistingNote: async (todoId, contentId, title, type) => {
      const link = await attachExistingNote({ todoId, contentId, title, type });
      set((s) => ({
        notesByTodoId: {
          ...s.notesByTodoId,
          [todoId]: [...(s.notesByTodoId[todoId] || []), link],
        },
      }));
    },

    createAndAttachNote: async (todoId, initialTitle) => {
      const { link } = await createAndAttachNote(todoId, initialTitle);
      set((s) => ({
        notesByTodoId: {
          ...s.notesByTodoId,
          [todoId]: [...(s.notesByTodoId[todoId] || []), link],
        },
      }));
    },

    detachNote: async (linkId) => {
      await detachNote(linkId);
      const gid = get().activeGroupId;
      if (gid != null) {
        const entries = Object.entries(get().notesByTodoId);
        for (const [todoIdStr, links] of entries) {
          if (links.find((l) => l.id === linkId)) {
            const todoId = Number(todoIdStr);
            await get().loadNotes(todoId);
            break;
          }
        }
      }
    },

    reorderNotes: async (todoId, orderedLinkIds) => {
      await reorderNotes(todoId, orderedLinkIds);
      await get().loadNotes(todoId);
    },

    updateNoteTitleSnapshot: async (linkId, title) => {
      await updateNoteTitleSnapshot(linkId, title);
      const entries = Object.entries(get().notesByTodoId);
      for (const [todoIdStr] of entries) {
        const todoId = Number(todoIdStr);
        await get().loadNotes(todoId);
      }
    },
  })),
);
