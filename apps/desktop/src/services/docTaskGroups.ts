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

let groups: TodoGroup[] = [];
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;
let loadedFor: string | null = null;

const notify = () => listeners.forEach(listener => listener());

function refresh() {
  const database = useSettingStore.getState().setting.database.active;
  loading = listTodoGroups()
    .then(next => {
      // 迟到的旧库结果不覆盖当前库
      if (useSettingStore.getState().setting.database.active !== database) return;
      groups = next.filter(g => !g.isSystem && !g.isArchived);
      loadedFor = database;
      notify();
    })
    .catch(() => {})
    .finally(() => {
      loading = null;
    });
  return loading;
}

let subscribed = false;
function ensureSubscribed() {
  if (subscribed) return;
  subscribed = true;
  subscribeTodoMutationEvent(event => {
    if (event.entityType === "group") void refresh();
  });
  useSettingStore.subscribe(state => {
    if (state.setting.database.active !== loadedFor) {
      groups = [];
      notify();
      void refresh();
    }
  });
}

export const desktopDocTaskGroups: DocTaskGroupsService = {
  list() {
    ensureSubscribed();
    if (!loadedFor && !loading) void refresh();
    return groups;
  },
  subscribe(listener) {
    ensureSubscribed();
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  async create(title) {
    const group = await createTodoGroup({ title, color: TONE_OPTIONS[4].color });
    emitTodoMutation({
      source: "doc-tasks",
      entityType: "group",
      action: TODO_MUTATION_ACTIONS.CREATE_GROUP,
      groupId: group.id,
    });
    groups = [...groups, group];
    notify();
    return { id: group.id, title: group.title };
  },
  dotClass(groupId) {
    const group = groups.find(g => g.id === groupId);
    return group ? groupDotClass(group.color) : "";
  },
};
