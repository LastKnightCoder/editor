/**
 * 开发悬浮球的快捷操作注册表。
 *
 * 各功能在自己的模块里 registerDevAction，悬浮球只负责列出与执行——
 * 这样加新操作不用改悬浮球本身，功能下线时操作跟着代码一起删掉。
 * 只在开发构建里有意义：悬浮球不挂载时注册了也没有入口（生产包里注册表只是一个空转的 Map）。
 */

import { useSyncExternalStore } from "react";

export interface DevAction {
  /** 全局唯一，重复注册会覆盖（HMR 重新执行模块时不会出现两份） */
  id: string;
  /** 分组标题，如「知识地图」 */
  group: string;
  label: string;
  description?: string;
  /** 返回的字符串作为成功提示；抛错显示为失败提示 */
  run: () => Promise<string | void> | string | void;
}

const actions = new Map<string, DevAction>();
const listeners = new Set<() => void>();
let snapshot: DevAction[] = [];

function emit() {
  snapshot = [...actions.values()];
  for (const listener of listeners) listener();
}

export function registerDevAction(action: DevAction): () => void {
  actions.set(action.id, action);
  emit();
  return () => {
    if (actions.get(action.id) !== action) return;
    actions.delete(action.id);
    emit();
  };
}

export function listDevActions(): DevAction[] {
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDevActions(): DevAction[] {
  return useSyncExternalStore(subscribe, listDevActions, listDevActions);
}
