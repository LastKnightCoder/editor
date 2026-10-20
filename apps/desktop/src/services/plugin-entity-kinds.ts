/**
 * 插件声明的内容类型（context.entities.registerKind）：类型名与打开方式。由插件运行时登记，
 * 插件停用即注销；检索结果、打开与 @ 只经这里认识插件内容，不依赖插件运行时。
 */
import { useSyncExternalStore } from "react";
import type { PluginEntityRecord } from "@/types/plugin-entities";

export interface PluginEntityKindEntry {
  pluginId: string;
  kind: string;
  label: string;
  mentionable: boolean;
  /** 打开到插件页面；at 为正文定位（与内置详情页的 at 参数同格式） */
  open(entity: PluginEntityRecord, at?: string): Promise<void>;
}

/** 插件停用或已卸载时查看插件内容的宿主只读页 */
export const PLUGIN_ENTITY_PAGE_KEY = "plugin-entity";

const kinds = new Map<string, PluginEntityKindEntry>();
const listeners = new Set<() => void>();
let revision = 0;

const keyOf = (pluginId: string, kind: string) => JSON.stringify([pluginId, kind]);

function changed() {
  revision++;
  for (const listener of listeners) listener();
}

export function registerPluginEntityKind(entry: PluginEntityKindEntry): () => void {
  const key = keyOf(entry.pluginId, entry.kind);
  kinds.set(key, entry);
  changed();
  return () => {
    if (kinds.get(key) !== entry) return;
    kinds.delete(key);
    changed();
  };
}

export function pluginEntityKind(
  pluginId: string,
  kind: string
): PluginEntityKindEntry | undefined {
  return kinds.get(keyOf(pluginId, kind));
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** 插件已停用或未声明时为 undefined，展示端回落到通用的「插件内容」 */
export function usePluginEntityKind(
  pluginId: string | undefined,
  kind: string | undefined
): PluginEntityKindEntry | undefined {
  useSyncExternalStore(subscribe, () => revision);
  return pluginId && kind ? pluginEntityKind(pluginId, kind) : undefined;
}
