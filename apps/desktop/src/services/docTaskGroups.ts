/**
 * 编辑器文档待办扩展的项目能力（IDocTaskGroups）：读写主库待办项目。
 * 扩展装饰每次渲染都要同步拿项目列表，这里维护一份本地缓存，项目变化（任意窗口 / AI）后刷新。
 */

import { createTodoGroup, listTodoGroups } from "@/commands/todo";
import type { DocTaskGroupsService } from "@/editor-extensions/doc-tasks/service";
import { emitTodoMutation, TODO_MUTATION_ACTIONS } from "@/mcp/todo/mutation";
import { subscribeTodoMutationEvent } from "@/mcp/todo/events";
import { TONE_OPTIONS, groupDotClass } from "@/utils/groupTone";
import useSettingStore from "@/stores/useSettingStore";
import type { TodoGroup } from "@/types";
import { getDocTaskGroups } from "@/commands/doc-tasks";
import type { DocTaskGroup } from "@/entity/doc-tasks";
import { bindDatabaseCommands } from "./command-context";
import useGlobalStateStore from "@/stores/useGlobalStateStore";

const EMPTY_GROUPS: Array<TodoGroup & DocTaskGroup> = [];
interface GroupCache {
  groups: Array<TodoGroup & DocTaskGroup>;
  loaded: boolean;
  revision: number;
  loading: Promise<void> | null;
}
const caches = new Map<string, GroupCache>();
const listeners = new Set<() => void>();
const activeDatabase = () => useSettingStore.getState().setting.database.active;
function cacheFor(database: string): GroupCache {
  let cache = caches.get(database);
  if (!cache) {
    cache = { groups: EMPTY_GROUPS, loaded: false, revision: 0, loading: null };
    caches.set(database, cache);
  }
  return cache;
}

const notify = () => listeners.forEach(listener => listener());

function refresh() {
  const database = activeDatabase();
  const cache = cacheFor(database);
  const revision = ++cache.revision;
  const commands = bindDatabaseCommands({ listTodoGroups }, { databaseName: database });
  cache.loading = Promise.all([commands.listTodoGroups(), getDocTaskGroups(database)])
    .then(([next, metadata]) => {
      if (activeDatabase() !== database || cache.revision !== revision) return;
      const aliases = new Map(metadata.map(group => [group.id, group.aliases]));
      cache.groups = next
        .filter(g => !g.isSystem && !g.isArchived)
        .map(group => ({ ...group, aliases: aliases.get(group.id), createdAt: group.createTime }));
      cache.loaded = true;
      notify();
    })
    .catch(() => {})
    .finally(() => {
      if (cache.revision === revision) cache.loading = null;
    });
  return cache.loading;
}

let subscribed = false;
function ensureSubscribed() {
  if (subscribed) return;
  subscribed = true;
  subscribeTodoMutationEvent(event => {
    if (event.entityType === "group") void refresh();
  });
  useSettingStore.subscribe((state, previous) => {
    if (state.setting.database.active !== previous.setting.database.active) {
      cacheFor(previous.setting.database.active).revision++;
      const cache = cacheFor(activeDatabase());
      cache.groups = EMPTY_GROUPS;
      cache.loaded = false;
      cache.loading = null;
      notify();
      void refresh();
    }
  });
  useGlobalStateStore.subscribe((state, previous) => {
    const database = activeDatabase();
    if (state.databaseStatus[database] === "ready" && previous.databaseStatus[database] !== "ready")
      void refresh();
  });
}

export const desktopDocTaskGroups: DocTaskGroupsService = {
  list() {
    ensureSubscribed();
    const cache = cacheFor(activeDatabase());
    if (!cache.loaded && !cache.loading) void refresh();
    return cache.groups;
  },
  subscribe(listener) {
    ensureSubscribed();
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  async create(title) {
    const database = activeDatabase();
    const cache = cacheFor(database);
    const revision = cache.revision;
    const commands = bindDatabaseCommands({ createTodoGroup }, { databaseName: database });
    const group = await commands.createTodoGroup({ title, color: TONE_OPTIONS[4].color });
    if (activeDatabase() !== database || cache.revision !== revision)
      throw new Error("项目数据已变化，请重新补全");
    emitTodoMutation({
      source: "doc-tasks",
      entityType: "group",
      action: TODO_MUTATION_ACTIONS.CREATE_GROUP,
      groupId: group.id,
    });
    cache.groups = [...cache.groups.filter(candidate => candidate.id !== group.id), group];
    notify();
    return { id: group.id, title: group.title };
  },
  dotClass(groupId) {
    const group = cacheFor(activeDatabase()).groups.find(g => g.id === groupId);
    return group ? groupDotClass(group.color) : "";
  },
};
