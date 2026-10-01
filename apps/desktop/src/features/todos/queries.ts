/**
 * 待办页数据源：一次拉全量快照（项目 + 未归档任务 + 周期规则 + 近一年打卡 + 关联笔记），
 * 渲染期纯函数派生（model.ts）。数量级：个人待办通常数百条以内，全量轻表足够，不做分页窗口。
 *
 * 刷新：模块级订阅 todo mutation 事件（本页操作、AI 工具、其他窗口经 websocket 广播）统一失效重拉
 * ——页面未挂载时也生效，首页待办卡读同一份缓存（ensureTodoSnapshot）不会读到旧数据；
 * 本页的变更函数只负责「调命令 + 发事件」，失效由订阅兜底——同一条路径，不会漏刷。
 * 勾选 / 打卡走乐观更新（先改缓存再落库），列表手感即时。
 */

import { useEffect, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { queryClient as globalQueryClient } from "@/queryClient";
import type { Descendant } from "slate";
import {
  archiveTodoGroup,
  attachExistingNote,
  completeRecurrence,
  createAndAttachNote,
  createRecurrence,
  createTodoGroup,
  createTodoItem,
  deleteTodoGroup,
  deleteTodoItemCascade,
  detachNote,
  getRecurrenceCompletionsByRecurrenceIds,
  getRecurrencesByItemIds,
  listArchivedTodoGroups,
  listTodoGroups,
  listTodoItemsByType,
  listTodoNotesByTodoIds,
  moveAndReorderTodoItem,
  skipRecurrence,
  toggleCompleteCascade,
  uncompleteRecurrence,
  updateNoteTitleSnapshot,
  updateRecurrence,
  updateTodoGroup,
  updateTodoItem,
} from "@/commands/todo";
import { createContent } from "@/commands/content";
import { getContentLength } from "@/utils/helper";
import { emitTodoMutation, TODO_MUTATION_ACTIONS } from "@/mcp/todo/mutation";
import { subscribeTodoMutationEvent } from "@/mcp/todo/events";
import type {
  TodoGroup,
  TodoItemType,
  TodoMutationEntityType,
  TodoRecurrence,
  UpdateTodoItem,
  UpdateTodoRecurrence,
} from "@/types";
import type { QuickAddResult } from "./quickAdd";
import { DAY_MS, startOfDay } from "./model";
import type { OccurrenceMark, TodoEntry, TodoSnapshot } from "./types";

const SNAPSHOT_KEY = ["todos", "snapshot"] as const;
const SOURCE = "todos-page";
const STALE_MS = 30_000;

/* 任意来源的待办变更 → 失效重拉（首页待办卡同源数据一并失效） */
subscribeTodoMutationEvent(() => {
  void globalQueryClient.invalidateQueries({ queryKey: ["todos"] });
  void globalQueryClient.invalidateQueries({ queryKey: ["home"] });
});

/* ---------- 快照 ---------- */

/** IN (...) 占位符分批（SQLite 变量上限保守取 500） */
async function chunked<T>(ids: number[], fetch: (part: number[]) => Promise<Record<number, T>>) {
  const out: Record<number, T> = {};
  for (let i = 0; i < ids.length; i += 500) Object.assign(out, await fetch(ids.slice(i, i + 500)));
  return out;
}

async function fetchTodoSnapshot(): Promise<TodoSnapshot> {
  const [groups, archivedGroups, items] = await Promise.all([
    listTodoGroups(),
    listArchivedTodoGroups(),
    listTodoItemsByType("all"),
  ]);
  const ids = items.map(item => item.id);
  const recurringIds = items.filter(item => item.type === "recurring").map(item => item.id);
  const [recurrences, notes] = await Promise.all([
    chunked(recurringIds, getRecurrencesByItemIds),
    chunked(ids, listTodoNotesByTodoIds),
  ]);
  const today = startOfDay(Date.now());
  const recurrenceIds = Object.values(recurrences).map(r => r.id);
  const completions = await chunked(recurrenceIds, part =>
    getRecurrenceCompletionsByRecurrenceIds(part, today - 366 * DAY_MS, today + DAY_MS)
  );

  const childIds = new Map<number, number[]>();
  for (const item of [...items].sort((a, b) => a.sortIndex - b.sortIndex)) {
    if (item.parentId == null) continue;
    const list = childIds.get(item.parentId) ?? [];
    list.push(item.id);
    childIds.set(item.parentId, list);
  }

  const entries: TodoEntry[] = items.map(item => {
    const recurrence = recurrences[item.id] ?? null;
    const occurrences = new Map<number, OccurrenceMark>();
    for (const c of (recurrence && completions[recurrence.id]) || []) {
      if (c.skipped) occurrences.set(startOfDay(c.scheduledDate), "skip");
      else if (c.completedAt) occurrences.set(startOfDay(c.scheduledDate), "done");
    }
    return {
      ...item,
      recurrence,
      occurrences,
      noteLinks: notes[item.id] ?? [],
      childIds: childIds.get(item.id) ?? [],
    };
  });

  return {
    groups,
    archivedGroups,
    entries,
    byId: new Map(entries.map(entry => [entry.id, entry])),
  };
}

/** 非 React 场景（首页汇总）取快照：与待办页共享缓存，新鲜则不重复拉取 */
export function ensureTodoSnapshot(): Promise<TodoSnapshot> {
  return globalQueryClient.fetchQuery({
    queryKey: SNAPSHOT_KEY,
    queryFn: fetchTodoSnapshot,
    staleTime: STALE_MS,
  });
}

export function useTodoSnapshot(): { snapshot: TodoSnapshot | undefined; loading: boolean } {
  const query = useQuery({
    queryKey: SNAPSHOT_KEY,
    queryFn: fetchTodoSnapshot,
    staleTime: STALE_MS,
    refetchOnWindowFocus: true,
  });

  return { snapshot: query.data, loading: query.isPending };
}

const NO_GROUPS: TodoGroup[] = [];

/** 进行中项目列表（与待办页共享快照缓存）；enabled=false 时不拉取，命令面板打开时才用 */
export function useTodoGroups(enabled = true): TodoGroup[] {
  const query = useQuery({
    queryKey: SNAPSHOT_KEY,
    queryFn: fetchTodoSnapshot,
    staleTime: STALE_MS,
    enabled,
  });
  return query.data?.groups ?? NO_GROUPS;
}

/** 渲染期「现在」：每分钟跳一次（「现在」刻度线、跨零点后今天 / 明天分段自动滚动） */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/* ---------- 变更 ---------- */

function emit(
  entityType: TodoMutationEntityType,
  action: (typeof TODO_MUTATION_ACTIONS)[keyof typeof TODO_MUTATION_ACTIONS],
  params: { entityId?: number; groupId?: number | null; relatedItemId?: number | null } = {}
) {
  emitTodoMutation({ source: SOURCE, entityType, action, ...params });
}

/** 乐观补丁：按 id 改缓存里的条目（落库失败由随后的失效重拉纠正） */
function patchEntry(queryClient: QueryClient, id: number, patch: (entry: TodoEntry) => TodoEntry) {
  queryClient.setQueryData<TodoSnapshot>(SNAPSHOT_KEY, prev => {
    if (!prev || !prev.byId.has(id)) return prev;
    const entries = prev.entries.map(entry => (entry.id === id ? patch(entry) : entry));
    return { ...prev, entries, byId: new Map(entries.map(e => [e.id, e])) };
  });
}

function descendantsOf(snapshot: TodoSnapshot | undefined, id: number): number[] {
  if (!snapshot) return [];
  const out: number[] = [];
  const walk = (pid: number) =>
    snapshot.byId.get(pid)?.childIds.forEach(cid => {
      out.push(cid);
      walk(cid);
    });
  walk(id);
  return out;
}

const DEFAULT_RECURRENCE = (startDate: number) => ({
  type: "daily" as const,
  interval: 1,
  excludeHolidays: false,
  startDate,
});

/** 快速添加落库（命令面板等非待办页入口也走这里）：周期任务同时建规则，否则日历上不会出现 */
export async function createTodoFromQuickAdd(parsed: QuickAddResult, groupId: number) {
  const item = await createTodoItem({
    groupId,
    title: parsed.title,
    type: parsed.type,
    startAt: parsed.startAt,
    dueAt: parsed.dueAt,
  });
  if (parsed.type === "recurring" && parsed.recurrence) {
    await createRecurrence({
      todoItemId: item.id,
      ...DEFAULT_RECURRENCE(startOfDay(Date.now())),
      type: parsed.recurrence.type,
      weekdays: parsed.recurrence.weekdays ?? null,
      monthDay: parsed.recurrence.monthDay ?? null,
    });
  }
  emit("item", TODO_MUTATION_ACTIONS.CREATE_ITEM, { entityId: item.id, groupId });
  return item;
}

export function useTodoMutations() {
  const queryClient = useQueryClient();
  const snapshot = () => queryClient.getQueryData<TodoSnapshot>(SNAPSHOT_KEY);

  return {
    createFromQuickAdd: createTodoFromQuickAdd,

    async addSubtask(parent: TodoEntry, title: string) {
      const item = await createTodoItem({ groupId: parent.groupId, parentId: parent.id, title });
      emit("item", TODO_MUTATION_ACTIONS.CREATE_ITEM_CHILD, {
        entityId: item.id,
        groupId: parent.groupId,
      });
      return item;
    },

    /** 一次性任务完成切换（连带全部子孙，主进程级联） */
    async setCompleted(entry: TodoEntry, completed: boolean) {
      const now = Date.now();
      for (const id of [entry.id, ...descendantsOf(snapshot(), entry.id)])
        patchEntry(queryClient, id, e => ({
          ...e,
          isCompleted: completed,
          completedAt: completed ? now : null,
        }));
      await toggleCompleteCascade(entry.id, completed);
      emit(
        "item",
        completed ? TODO_MUTATION_ACTIONS.COMPLETE_ITEM : TODO_MUTATION_ACTIONS.UNCOMPLETE_ITEM,
        { entityId: entry.id, groupId: entry.groupId }
      );
    },

    /** 周期任务某计划日打卡：done / skip / null（撤销） */
    async setOccurrence(entry: TodoEntry, day: number, mark: OccurrenceMark | null) {
      const recurrence = entry.recurrence;
      if (!recurrence) return;
      const key = startOfDay(day);
      patchEntry(queryClient, entry.id, e => {
        const occurrences = new Map(e.occurrences);
        if (mark) occurrences.set(key, mark);
        else occurrences.delete(key);
        return { ...e, occurrences };
      });
      if (mark === "done") await completeRecurrence(recurrence.id, key);
      else if (mark === "skip") await skipRecurrence(recurrence.id, key);
      else await uncompleteRecurrence(recurrence.id, key);
      emit(
        "recurrence",
        mark === "done"
          ? TODO_MUTATION_ACTIONS.COMPLETE_OCCURRENCE
          : mark === "skip"
            ? TODO_MUTATION_ACTIONS.SKIP_OCCURRENCE
            : TODO_MUTATION_ACTIONS.UNCOMPLETE_OCCURRENCE,
        { entityId: recurrence.id, relatedItemId: entry.id, groupId: entry.groupId }
      );
    },

    /** 字段更新（标题 / 时间 / 提醒）；日历同步由主进程 updateItem 内部完成 */
    async updateItem(entry: TodoEntry, patch: Omit<UpdateTodoItem, "id">) {
      patchEntry(queryClient, entry.id, e => ({ ...e, ...patch }));
      await updateTodoItem({ id: entry.id, ...patch });
      emit("item", TODO_MUTATION_ACTIONS.UPDATE_ITEM, {
        entityId: entry.id,
        groupId: entry.groupId,
      });
    },

    /** 类型切换：补齐目标类型的必要字段；切到周期且无规则时建默认规则（每天，自今天起） */
    async changeType(entry: TodoEntry, type: TodoItemType) {
      if (type === entry.type) return;
      const today = startOfDay(Date.now());
      const patch: Omit<UpdateTodoItem, "id"> = { type };
      if (type === "deadline" && entry.dueAt == null) patch.dueAt = today;
      if (type === "planned") {
        const start = entry.startAt ?? today + DAY_MS + 9 * 3_600_000;
        patch.startAt = start;
        if (entry.dueAt == null || entry.dueAt < start) patch.dueAt = start + 3_600_000;
      }
      await updateTodoItem({ id: entry.id, ...patch });
      if (type === "recurring" && !entry.recurrence) {
        await createRecurrence({ todoItemId: entry.id, ...DEFAULT_RECURRENCE(today) });
      }
      emit("item", TODO_MUTATION_ACTIONS.UPDATE_ITEM, {
        entityId: entry.id,
        groupId: entry.groupId,
      });
    },

    async updateRecurrence(recurrence: TodoRecurrence, patch: Omit<UpdateTodoRecurrence, "id">) {
      await updateRecurrence({ id: recurrence.id, ...patch });
      emit("recurrence", TODO_MUTATION_ACTIONS.UPDATE_RECURRENCE, {
        entityId: recurrence.id,
        relatedItemId: recurrence.todoItemId,
      });
    },

    /** 描述首次写入时创建正文并挂到任务上，后续编辑由文档会话持久化。 */
    async attachDescription(entry: TodoEntry, content: Descendant[]) {
      const contentId = await createContent(content, getContentLength(content));
      if (!contentId) return;
      await updateTodoItem({ id: entry.id, descriptionContentId: contentId });
      emit("item", TODO_MUTATION_ACTIONS.UPDATE_ITEM, {
        entityId: entry.id,
        groupId: entry.groupId,
      });
    },

    /** 移动到其他项目（子树随父迁移，主进程级联 group_id；追加到目标项目末尾） */
    async moveToGroup(entry: TodoEntry, groupId: number) {
      await moveAndReorderTodoItem({ id: entry.id, toGroupId: groupId, toParentId: null });
      emit("item", TODO_MUTATION_ACTIONS.MOVE_ITEM, { entityId: entry.id, groupId });
    },

    async remove(id: number) {
      await deleteTodoItemCascade(id);
      emit("item", TODO_MUTATION_ACTIONS.DELETE_ITEM_CASCADE, { entityId: id });
    },

    /* ----- 项目 ----- */

    async createGroup(title: string, color: string) {
      const group = await createTodoGroup({ title, color });
      emit("group", TODO_MUTATION_ACTIONS.CREATE_GROUP, { groupId: group.id });
      return group;
    },

    async updateGroup(id: number, title: string, color: string) {
      await updateTodoGroup({ id, title, color });
      emit("group", TODO_MUTATION_ACTIONS.UPDATE_GROUP, { groupId: id });
    },

    async setGroupArchived(id: number, archived: boolean) {
      await archiveTodoGroup(id, archived);
      emit(
        "group",
        archived ? TODO_MUTATION_ACTIONS.ARCHIVE_GROUP : TODO_MUTATION_ACTIONS.UNARCHIVE_GROUP,
        { groupId: id }
      );
    },

    async deleteGroup(id: number) {
      const removed = await deleteTodoGroup(id);
      emit("group", TODO_MUTATION_ACTIONS.DELETE_GROUP, { groupId: id });
      return removed;
    },

    /* ----- 关联笔记 ----- */

    async attachNote(todoId: number, contentId: number, title: string, type: string) {
      await attachExistingNote({ todoId, contentId, title, type });
      emit("note-link", TODO_MUTATION_ACTIONS.ATTACH_NOTE, { relatedItemId: todoId });
    },

    async createNote(todoId: number) {
      const result = await createAndAttachNote(todoId, "未命名文档");
      emit("note-link", TODO_MUTATION_ACTIONS.CREATE_AND_ATTACH_NOTE, { relatedItemId: todoId });
      return result;
    },

    async detachNote(todoId: number, linkId: number) {
      await detachNote(linkId);
      emit("note-link", TODO_MUTATION_ACTIONS.DETACH_NOTE, {
        entityId: linkId,
        relatedItemId: todoId,
      });
    },

    async renameNote(todoId: number, linkId: number, title: string) {
      await updateNoteTitleSnapshot(linkId, title);
      emit("note-link", TODO_MUTATION_ACTIONS.UPDATE_NOTE_TITLE_SNAPSHOT, {
        entityId: linkId,
        relatedItemId: todoId,
      });
    },
  };
}

export type TodoMutations = ReturnType<typeof useTodoMutations>;
