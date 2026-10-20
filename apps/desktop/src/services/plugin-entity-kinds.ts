/**
 * 插件声明的内容类型（context.entities.registerKind）。打开方式与可否 @ 由插件运行时登记，
 * 插件停用即注销；类型名与图标另随库保存（plugin_entity_kinds），插件不运行时各处照样显示。
 */
import { useCallback, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { listPluginEntityKinds, pluginEntityOwners } from "@/commands/plugin-entities";
import { queryClient } from "@/queryClient";
import useSettingStore from "@/stores/useSettingStore";
import type {
  PluginEntityKindAppearance,
  PluginEntityOwner,
  PluginEntityRecord,
} from "@/types/plugin-entities";
import { bindDatabaseCommands } from "./command-context";

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

/** 每次登记变化换一张新表，便于 React 以引用比较订阅 */
let kinds = new Map<string, PluginEntityKindEntry>();
const listeners = new Set<() => void>();

const keyOf = (pluginId: string, kind: string) => JSON.stringify([pluginId, kind]);

function changed(next: Map<string, PluginEntityKindEntry>) {
  kinds = next;
  for (const listener of listeners) listener();
}

export function registerPluginEntityKind(entry: PluginEntityKindEntry): () => void {
  const key = keyOf(entry.pluginId, entry.kind);
  changed(new Map(kinds).set(key, entry));
  return () => {
    if (kinds.get(key) !== entry) return;
    const next = new Map(kinds);
    next.delete(key);
    changed(next);
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

/** 插件未运行或未声明该类型时为 undefined：打开回落宿主只读页；显示用 usePluginEntityAppearances */
export function usePluginEntityKind(
  pluginId: string | undefined,
  kind: string | undefined
): PluginEntityKindEntry | undefined {
  const running = useSyncExternalStore(subscribe, () => kinds);
  return pluginId && kind ? running.get(keyOf(pluginId, kind)) : undefined;
}

/** @ 面板只收录插件声明为可引用（mentionable）且正在运行的插件内容；其他类型不受影响 */
export function isMentionableResult(result: {
  type: string;
  pluginEntity?: { pluginId: string; kind: string };
}): boolean {
  if (result.type !== "plugin-entity") return true;
  const entry = result.pluginEntity
    ? pluginEntityKind(result.pluginEntity.pluginId, result.pluginEntity.kind)
    : undefined;
  return Boolean(entry?.mentionable);
}

/** 显示用的类型外观；icon 为 SVG 文本，空串表示插件未声明图标 */
export type PluginEntityAppearance = Pick<PluginEntityKindAppearance, "label" | "icon">;

const APPEARANCE_KEY = ["plugin-entities", "appearance"] as const;
// 显式用全局 QueryClient：编辑器等处可能挂在没有 Provider 的独立 React 根里
const OWNER_BATCH = 500;
const NO_KINDS = new Map<string, PluginEntityAppearance>();

/** 外观或归属变化后（声明、删除、恢复）让各处重新读取 */
export function invalidatePluginEntityAppearance() {
  void queryClient.invalidateQueries({ queryKey: APPEARANCE_KEY });
}

const useActiveDatabase = () => useSettingStore(state => state.setting.database.active);

function useSavedKinds(): Map<string, PluginEntityAppearance> {
  const databaseName = useActiveDatabase();
  const { data } = useQuery(
    {
      queryKey: [...APPEARANCE_KEY, "kinds", databaseName],
      queryFn: async () =>
        new Map(
          (
            await bindDatabaseCommands(
              { listPluginEntityKinds },
              { databaseName }
            ).listPluginEntityKinds(databaseName)
          ).map(row => [keyOf(row.pluginId, row.kind), { label: row.label, icon: row.icon }])
        ),
      enabled: Boolean(databaseName),
      staleTime: Infinity,
    },
    queryClient
  );
  return data ?? NO_KINDS;
}

/**
 * 按插件与类型取外观：运行中登记的类型名最新，图标与插件不运行时的类型名取库里保存的声明；
 * 都没有时返回 undefined，由调用方回落通用的「插件内容」。适合列表在渲染时逐项调用。
 */
export function usePluginEntityAppearances(): (
  pluginId: string | undefined,
  kind: string | undefined
) => PluginEntityAppearance | undefined {
  const saved = useSavedKinds();
  const running = useSyncExternalStore(subscribe, () => kinds);
  return useCallback(
    (pluginId, kind) => {
      if (!pluginId || !kind) return undefined;
      const key = keyOf(pluginId, kind);
      const declared = saved.get(key);
      const label = running.get(key)?.label ?? declared?.label;
      return label ? { label, icon: declared?.icon ?? "" } : undefined;
    },
    [saved, running]
  );
}

type OwnerWaiter = {
  resolve(owner: PluginEntityOwner | null): void;
  reject(error: unknown): void;
};
const pendingOwners = new Map<string, Map<number, OwnerWaiter[]>>();

/** 同一轮渲染里各处的查询合并成一次命令 */
function loadOwner(databaseName: string, id: number): Promise<PluginEntityOwner | null> {
  return new Promise((resolve, reject) => {
    let batch = pendingOwners.get(databaseName);
    if (!batch) {
      batch = new Map();
      pendingOwners.set(databaseName, batch);
      setTimeout(() => void flushOwners(databaseName), 0);
    }
    batch.set(id, [...(batch.get(id) ?? []), { resolve, reject }]);
  });
}

async function flushOwners(databaseName: string) {
  const batch = pendingOwners.get(databaseName);
  pendingOwners.delete(databaseName);
  if (!batch) return;
  const entries = [...batch];
  const commands = bindDatabaseCommands({ pluginEntityOwners }, { databaseName });
  for (let start = 0; start < entries.length; start += OWNER_BATCH) {
    const chunk = entries.slice(start, start + OWNER_BATCH);
    try {
      const owners = new Map(
        (
          await commands.pluginEntityOwners(
            databaseName,
            chunk.map(([id]) => id)
          )
        ).map(owner => [owner.id, owner])
      );
      for (const [id, waiters] of chunk)
        for (const waiter of waiters) waiter.resolve(owners.get(id) ?? null);
    } catch (error) {
      for (const [, waiters] of chunk) for (const waiter of waiters) waiter.reject(error);
    }
  }
}

/** 插件内容所属的插件与类型；只有 ID 的引用（正文链接、脉络、漫步）据此找到外观。不存在时为 null */
export function usePluginEntityOwner(id: number | undefined): PluginEntityOwner | null | undefined {
  const databaseName = useActiveDatabase();
  const { data } = useQuery(
    {
      queryKey: [...APPEARANCE_KEY, "owner", databaseName, id],
      queryFn: () => (id === undefined ? null : loadOwner(databaseName, id)),
      enabled: Boolean(databaseName) && id !== undefined,
      // 归属不会变；删除与恢复经 invalidatePluginEntityAppearance 刷新
      staleTime: Infinity,
    },
    queryClient
  );
  return data;
}
