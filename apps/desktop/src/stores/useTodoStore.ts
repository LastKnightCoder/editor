import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import {
  TodoGroup,
  TodoItem,
  TodoNoteLink,
  TodoGroupStats,
  TodoSystemGroupType,
  CreateTodoGroup,
  UpdateTodoGroup,
  CreateTodoItem,
  UpdateTodoItem,
  MoveAndReorderPayload,
} from "@/types";
import { Descendant } from "slate";
import {
  listTodoGroups,
  createTodoGroup,
  updateTodoGroup,
  archiveTodoGroup,
  reorderTodoGroups,
  getTodoGroupStats,
  getSystemGroupStats,
  getSystemGroups,
  listTodoItems,
  listTodoItemsByType,
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
import { emitTodoMutation, TODO_MUTATION_ACTIONS } from "@/mcp/todo/mutation";

interface TodoUIState {
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
}

type TodoItemsByGroupId = Record<string, TodoItem[]>;

interface TodoState {
  ui: TodoUIState;
  groups: TodoGroup[];
  systemGroups: TodoGroup[];
  groupStats: Record<number, TodoGroupStats>;
  itemsByGroupId: TodoItemsByGroupId;
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
  loadSystemGroups: () => Promise<void>;
  loadGroupStats: () => Promise<void>;
  createGroup: (payload: CreateTodoGroup) => Promise<void>;
  renameGroup: (payload: UpdateTodoGroup) => Promise<void>;
  archiveGroup: (id: number, isArchived: boolean) => Promise<void>;
  reorderGroups: (orderedIds: number[]) => Promise<void>;
  pinGroupToTop: (id: number) => Promise<void>;
  setActiveGroup: (id: number | null) => void;
  setActiveTodo: (id: number | null) => void;
  reloadAfterDatabaseChange: () => Promise<void>;

  loadItems: (groupId: number) => Promise<void>;
  loadItemsByType: (type: Exclude<TodoSystemGroupType, null>) => Promise<void>;
  createItem: (payload: CreateTodoItem) => Promise<TodoItem>;
  createItemRelative: (payload: {
    refId: number;
    position: "child" | "above" | "below";
    title: string;
    description?: string;
    dueAt?: number | null;
  }) => Promise<void>;
  updateItem: (payload: UpdateTodoItem) => Promise<void>;
  updateItemDescriptionContent: (
    todoId: number,
    groupId: number,
    content: Descendant[],
  ) => void;
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
  devtools(
    persist(
      (set, get) => {
        const refreshCurrentGroupItems = async () => {
          const gid = get().activeGroupId;
          if (gid == null) return;

          const systemGroup = get().systemGroups.find(
            (group) => group.id === gid,
          );
          if (systemGroup?.systemType) {
            await get().loadItemsByType(systemGroup.systemType);
            return;
          }

          await get().loadItems(gid);
        };

        return {
          ui: {
            leftOpen: true,
            rightOpen: false,
            leftWidth: 260,
            rightWidth: 360,
          },
          groups: [],
          systemGroups: [],
          groupStats: {},
          itemsByGroupId: {},
          notesByTodoId: {},
          activeGroupId: null,
          activeTodoId: null,
          expandedIds: new Set<number>(),
          filters: {},
          loading: { groups: false, items: false, notes: false },

          setLeftOpen: (open) =>
            set((s) => ({ ui: { ...s.ui, leftOpen: open } })),
          setRightOpen: (open) =>
            set((s) => ({ ui: { ...s.ui, rightOpen: open } })),
          setLeftWidth: (w) => set((s) => ({ ui: { ...s.ui, leftWidth: w } })),
          setRightWidth: (w) =>
            set((s) => ({ ui: { ...s.ui, rightWidth: w } })),

          reset: () => {
            set({
              groups: [],
              systemGroups: [],
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

          loadSystemGroups: async () => {
            const systemGroups = await getSystemGroups();
            set({ systemGroups });
          },

          loadGroupStats: async () => {
            const [stats, systemStats] = await Promise.all([
              getTodoGroupStats(),
              getSystemGroupStats(),
            ]);
            const statsMap: Record<number, TodoGroupStats> = {};
            stats.forEach((s) => (statsMap[s.groupId] = s));
            systemStats.forEach((s) => (statsMap[s.groupId] = s));
            set({ groupStats: statsMap });
          },

          createGroup: async (payload) => {
            const g = await createTodoGroup(payload);
            set((s) => ({ groups: [...s.groups, g] }));
            emitTodoMutation({
              source: "todo-store",
              entityType: "group",
              entityId: g.id,
              groupId: g.id,
              action: TODO_MUTATION_ACTIONS.CREATE_GROUP,
              changedFields: ["title", "color"],
            });
          },

          renameGroup: async (payload) => {
            const g = await updateTodoGroup(payload);
            set((s) => ({
              groups: s.groups.map((x) => (x.id === g.id ? g : x)),
            }));
            emitTodoMutation({
              source: "todo-store",
              entityType: "group",
              entityId: g.id,
              groupId: g.id,
              action: TODO_MUTATION_ACTIONS.UPDATE_GROUP,
              changedFields: ["title", "color", "sortIndex", "isArchived"],
            });
          },

          archiveGroup: async (id, isArchived) => {
            await archiveTodoGroup(id, isArchived);
            set((s) => ({
              groups: s.groups.filter((g) => (isArchived ? g.id !== id : true)),
            }));
            emitTodoMutation({
              source: "todo-store",
              entityType: "group",
              entityId: id,
              groupId: id,
              action: isArchived
                ? TODO_MUTATION_ACTIONS.ARCHIVE_GROUP
                : TODO_MUTATION_ACTIONS.UNARCHIVE_GROUP,
              changedFields: ["isArchived"],
            });
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
            emitTodoMutation({
              source: "todo-store",
              entityType: "group",
              action: TODO_MUTATION_ACTIONS.REORDER_GROUPS,
              changedFields: ["sortIndex"],
            });
          },

          pinGroupToTop: async (id) => {
            const ids = get().groups.map((g) => g.id);
            const newOrder = [id, ...ids.filter((x) => x !== id)];
            await get().reorderGroups(newOrder);
          },

          setActiveGroup: (id) =>
            set({ activeGroupId: id, activeTodoId: null }),
          setActiveTodo: (id) => set({ activeTodoId: id }),

          reloadAfterDatabaseChange: async () => {
            const previousActiveGroupId = get().activeGroupId;
            const previousActiveTodoId = get().activeTodoId;

            set((s) => ({
              itemsByGroupId: {},
              notesByTodoId: {},
              groupStats: {},
              loading: {
                ...s.loading,
                groups: true,
                items: false,
                notes: false,
              },
            }));

            const [systemGroups, groups, stats, systemStats] =
              await Promise.all([
                getSystemGroups(),
                listTodoGroups(),
                getTodoGroupStats(),
                getSystemGroupStats(),
              ]);

            const statsMap: Record<number, TodoGroupStats> = {};
            stats.forEach((x) => (statsMap[x.groupId] = x));
            systemStats.forEach((x) => (statsMap[x.groupId] = x));

            const groupExists =
              previousActiveGroupId != null &&
              [...systemGroups, ...groups].some(
                (group) => group.id === previousActiveGroupId,
              );

            const fallbackGroupId =
              systemGroups.find((group) => group.systemType === "all")?.id ??
              groups[0]?.id ??
              systemGroups[0]?.id ??
              null;

            const nextActiveGroupId = groupExists
              ? previousActiveGroupId
              : fallbackGroupId;

            set((s) => ({
              systemGroups,
              groups,
              groupStats: statsMap,
              activeGroupId: nextActiveGroupId,
              loading: { ...s.loading, groups: false },
            }));

            let currentItems: TodoItem[] = [];

            if (nextActiveGroupId != null) {
              const activeSystemGroup = systemGroups.find(
                (group) => group.id === nextActiveGroupId,
              );

              if (activeSystemGroup?.systemType) {
                currentItems = await listTodoItemsByType(
                  activeSystemGroup.systemType,
                );
                const systemKey = `_system_${activeSystemGroup.systemType}`;
                set((s) => ({
                  itemsByGroupId: {
                    ...s.itemsByGroupId,
                    [systemKey]: currentItems,
                  },
                }));
              } else {
                currentItems = await listTodoItems(nextActiveGroupId);
                set((s) => ({
                  itemsByGroupId: {
                    ...s.itemsByGroupId,
                    [nextActiveGroupId]: currentItems,
                  },
                }));
              }
            }

            if (
              previousActiveTodoId != null &&
              !currentItems.some((item) => item.id === previousActiveTodoId)
            ) {
              set((s) => ({
                activeTodoId: null,
                ui: { ...s.ui, rightOpen: false },
              }));
            }
          },

          loadItems: async (groupId) => {
            set((s) => ({ loading: { ...s.loading, items: true } }));
            const items = await listTodoItems(groupId);
            set((s) => ({
              itemsByGroupId: { ...s.itemsByGroupId, [groupId]: items },
              loading: { ...s.loading, items: false },
            }));
          },

          loadItemsByType: async (type) => {
            set((s) => ({ loading: { ...s.loading, items: true } }));
            const items = await listTodoItemsByType(type);
            const key = `_system_${type}`;
            set((s) => ({
              itemsByGroupId: { ...s.itemsByGroupId, [key]: items },
              loading: { ...s.loading, items: false },
            }));
          },

          createItem: async (payload) => {
            const item = await createTodoItem(payload);
            set((s) => ({
              itemsByGroupId: {
                ...s.itemsByGroupId,
                [item.groupId]: [
                  ...(s.itemsByGroupId[item.groupId] || []),
                  item,
                ],
              },
            }));
            await get().loadGroupStats();
            emitTodoMutation({
              source: "todo-store",
              entityType: "item",
              entityId: item.id,
              groupId: item.groupId,
              action: TODO_MUTATION_ACTIONS.CREATE_ITEM,
              changedFields: [
                "title",
                "type",
                "description",
                "startAt",
                "dueAt",
                "remindBefore",
              ],
            });
            return item;
          },

          createItemRelative: async (payload) => {
            const item = await createTodoItemRelative(payload as any);
            await get().loadItems(item.groupId);
            await get().loadGroupStats();
            emitTodoMutation({
              source: "todo-store",
              entityType: "item",
              entityId: item.id,
              groupId: item.groupId,
              action:
                payload.position === "above"
                  ? TODO_MUTATION_ACTIONS.CREATE_ITEM_ABOVE
                  : payload.position === "below"
                    ? TODO_MUTATION_ACTIONS.CREATE_ITEM_BELOW
                    : TODO_MUTATION_ACTIONS.CREATE_ITEM_CHILD,
              changedFields: ["title", "type", "description", "dueAt"],
            });
          },

          updateItem: async (payload) => {
            const item = await updateTodoItem(payload);
            set((s) => ({
              itemsByGroupId: {
                ...s.itemsByGroupId,
                [item.groupId]: (s.itemsByGroupId[item.groupId] || []).map(
                  (x) => (x.id === item.id ? item : x),
                ),
              },
            }));
            await get().loadGroupStats();
            emitTodoMutation({
              source: "todo-store",
              entityType: "item",
              entityId: item.id,
              groupId: item.groupId,
              action: TODO_MUTATION_ACTIONS.UPDATE_ITEM,
              changedFields: [
                "title",
                "type",
                "descriptionContentId",
                "startAt",
                "dueAt",
                "remindBefore",
              ],
            });
          },

          updateItemDescriptionContent: (todoId, groupId, content) => {
            set((s) => ({
              itemsByGroupId: {
                ...s.itemsByGroupId,
                [groupId]: (s.itemsByGroupId[groupId] || []).map((x) =>
                  x.id === todoId ? { ...x, descriptionContent: content } : x,
                ),
              },
            }));
          },

          toggleCompleteCascade: async (id, isCompleted) => {
            await toggleCompleteCascade(id, isCompleted);
            await refreshCurrentGroupItems();
            await get().loadGroupStats();
            emitTodoMutation({
              source: "todo-store",
              entityType: "item",
              entityId: id,
              groupId: get().activeGroupId,
              action: isCompleted
                ? TODO_MUTATION_ACTIONS.COMPLETE_ITEM
                : TODO_MUTATION_ACTIONS.UNCOMPLETE_ITEM,
              changedFields: ["isCompleted", "completedAt"],
            });
          },

          moveAndReorder: async (payload) => {
            await moveAndReorderTodoItem(payload);
            await refreshCurrentGroupItems();
            await get().loadGroupStats();
            emitTodoMutation({
              source: "todo-store",
              entityType: "item",
              entityId: payload.id,
              groupId: payload.toGroupId,
              action: TODO_MUTATION_ACTIONS.MOVE_ITEM,
              changedFields: ["groupId", "parentId", "sortIndex"],
            });
          },

          archiveItem: async (id, isArchived) => {
            await archiveTodoItem(id, isArchived);
            await refreshCurrentGroupItems();
            await get().loadGroupStats();
            emitTodoMutation({
              source: "todo-store",
              entityType: "item",
              entityId: id,
              groupId: get().activeGroupId,
              action: isArchived
                ? TODO_MUTATION_ACTIONS.ARCHIVE_ITEM
                : TODO_MUTATION_ACTIONS.UNARCHIVE_ITEM,
              changedFields: ["isArchived"],
            });
          },

          deleteItem: async (id) => {
            await deleteTodoItem(id);
            await refreshCurrentGroupItems();
            await get().loadGroupStats();
            emitTodoMutation({
              source: "todo-store",
              entityType: "item",
              entityId: id,
              groupId: get().activeGroupId,
              action: TODO_MUTATION_ACTIONS.DELETE_ITEM,
            });
          },

          deleteItemCascade: async (id) => {
            await deleteTodoItemCascade(id);
            await refreshCurrentGroupItems();
            await get().loadGroupStats();
            emitTodoMutation({
              source: "todo-store",
              entityType: "item",
              entityId: id,
              groupId: get().activeGroupId,
              action: TODO_MUTATION_ACTIONS.DELETE_ITEM_CASCADE,
            });
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
            set((s) => ({
              notesByTodoId: { ...s.notesByTodoId, [todoId]: notes },
            }));
          },

          attachExistingNote: async (todoId, contentId, title, type) => {
            const link = await attachExistingNote({
              todoId,
              contentId,
              title,
              type,
            });
            set((s) => ({
              notesByTodoId: {
                ...s.notesByTodoId,
                [todoId]: [...(s.notesByTodoId[todoId] || []), link],
              },
            }));
            emitTodoMutation({
              source: "todo-store",
              entityType: "note-link",
              entityId: link.id,
              relatedItemId: todoId,
              action: TODO_MUTATION_ACTIONS.ATTACH_NOTE,
            });
          },

          createAndAttachNote: async (todoId, initialTitle) => {
            const { link } = await createAndAttachNote(todoId, initialTitle);
            set((s) => ({
              notesByTodoId: {
                ...s.notesByTodoId,
                [todoId]: [...(s.notesByTodoId[todoId] || []), link],
              },
            }));
            emitTodoMutation({
              source: "todo-store",
              entityType: "note-link",
              entityId: link.id,
              relatedItemId: todoId,
              action: TODO_MUTATION_ACTIONS.CREATE_AND_ATTACH_NOTE,
            });
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
                  emitTodoMutation({
                    source: "todo-store",
                    entityType: "note-link",
                    entityId: linkId,
                    relatedItemId: todoId,
                    action: TODO_MUTATION_ACTIONS.DETACH_NOTE,
                  });
                  break;
                }
              }
            }
          },

          reorderNotes: async (todoId, orderedLinkIds) => {
            await reorderNotes(todoId, orderedLinkIds);
            await get().loadNotes(todoId);
            emitTodoMutation({
              source: "todo-store",
              entityType: "note-link",
              relatedItemId: todoId,
              action: TODO_MUTATION_ACTIONS.REORDER_NOTES,
              changedFields: ["sortIndex"],
            });
          },

          updateNoteTitleSnapshot: async (linkId, title) => {
            await updateNoteTitleSnapshot(linkId, title);
            const entries = Object.entries(get().notesByTodoId);
            for (const [todoIdStr] of entries) {
              const todoId = Number(todoIdStr);
              await get().loadNotes(todoId);
            }
            emitTodoMutation({
              source: "todo-store",
              entityType: "note-link",
              entityId: linkId,
              action: TODO_MUTATION_ACTIONS.UPDATE_NOTE_TITLE_SNAPSHOT,
              changedFields: ["title"],
            });
          },
        };
      },
      {
        name: "todo-store",
        partialize: (state) => ({
          activeGroupId: state.activeGroupId,
        }),
      },
    ),
  ),
);
