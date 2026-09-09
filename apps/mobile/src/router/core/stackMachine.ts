// L1 栈机：纯函数、无 React、无副作用。所有导航动作都归结为这里的状态迁移，
// 由上层（navigator 运行时）负责生成 entry id、分发 history 快照与生命周期。

import { getPageMeta, resolveEntryIdentity } from "./pageMeta";

export type RouteEntry<P = Record<string, unknown>> = {
  id: string;
  key: string;
  params: P;
  createdAt: number;
  /** 最近一次成为栈顶的时间，LRU 保活淘汰依据 */
  lastActiveAt: number;
};

export type StackSnapshot = {
  entries: RouteEntry[];
};

export type EntrySpec = {
  key: string;
  params: Record<string, unknown>;
  id: string;
  now: number;
};

export function createEmptyStack(): StackSnapshot {
  return { entries: [] };
}

export function createStack(entries: RouteEntry[]): StackSnapshot {
  return { entries };
}

function makeEntry(spec: EntrySpec): RouteEntry {
  return {
    id: spec.id,
    key: spec.key,
    params: spec.params,
    createdAt: spec.now,
    lastActiveAt: spec.now,
  };
}

function markTop(entries: RouteEntry[], now: number): RouteEntry[] {
  if (entries.length === 0) return entries;
  return entries.map((entry, index) =>
    index === entries.length - 1 ? { ...entry, lastActiveAt: now } : entry
  );
}

/**
 * push：按 match 策略去重。
 * - single：同 key 已存在则移到顶并更新 params（不新建实例）
 * - params：同身份（getId）已存在则移到顶并更新 params
 * - multi：始终新建实例
 */
export function pushEntry(stack: StackSnapshot, spec: EntrySpec): StackSnapshot {
  const meta = getPageMeta(spec.key);
  const entry = makeEntry(spec);
  if (!meta) {
    return { entries: markTop([...stack.entries, entry], spec.now) };
  }
  const identity = resolveEntryIdentity(meta, spec.params);
  if (identity) {
    const existingIndex = stack.entries.findIndex(item => {
      if (item.key !== spec.key) return false;
      if (meta.match === "single") return true;
      return resolveEntryIdentity(meta, item.params as Record<string, unknown>) === identity;
    });
    if (existingIndex >= 0) {
      const moved = stack.entries.filter((_, index) => index !== existingIndex);
      // 复用即视为“重新打开”：createdAt 刷新为本次时间——overlay 层的可见性判定
      // （createdAt 晚于栈顶 screen）依赖此不变式；screen 层不参与可见性，统一刷新安全
      return {
        entries: markTop([...moved, { ...entry }], spec.now),
      };
    }
  }
  return { entries: markTop([...stack.entries, entry], spec.now) };
}

/** pop：弹掉栈顶。返回弹出的 entry（无则 null），供结果通道 resolve。 */
export function popEntry(
  stack: StackSnapshot,
  now: number
): { stack: StackSnapshot; popped: RouteEntry | null } {
  if (stack.entries.length === 0) {
    return { stack, popped: null };
  }
  const popped = stack.entries[stack.entries.length - 1];
  return {
    stack: { entries: markTop(stack.entries.slice(0, -1), now) },
    popped,
  };
}

/** replace：替换栈顶（保留位置，新实例 id） */
export function replaceTop(stack: StackSnapshot, spec: EntrySpec): StackSnapshot {
  if (stack.entries.length === 0) {
    return pushEntry(stack, spec);
  }
  const entries = [...stack.entries];
  entries[entries.length - 1] = makeEntry(spec);
  return { entries: markTop(entries, spec.now) };
}

/** 弹到指定 key 的最近实例（含该实例）；不存在则不动作。 */
export function popToKey(stack: StackSnapshot, key: string, now: number): StackSnapshot {
  const targetIndex = stack.entries.findIndex(
    (entry, index) => entry.key === key && index < stack.entries.length - 1
  );
  if (targetIndex < 0) {
    return { entries: markTop(stack.entries, now) };
  }
  return { entries: markTop(stack.entries.slice(0, targetIndex + 1), now) };
}

export function popToTop(stack: StackSnapshot, now: number): StackSnapshot {
  if (stack.entries.length <= 1) return stack;
  return { entries: markTop(stack.entries.slice(0, 1), now) };
}

export function removeEntryById(stack: StackSnapshot, id: string, now: number): StackSnapshot {
  const index = stack.entries.findIndex(entry => entry.id === id);
  if (index < 0) return stack;
  return {
    entries: markTop(
      stack.entries.filter((_, i) => i !== index),
      now
    ),
  };
}

/** LRU：按 lastActiveAt 升序返回 keepAlive==="keep" 的深层页面 id（越靠前越久未访问） */
export function collectKeepAliveEvictionCandidates(
  stack: StackSnapshot,
  isKeepAlive: (key: string) => boolean,
  protectedIds: ReadonlySet<string>,
  limit: number
): string[] {
  return stack.entries
    .filter(entry => isKeepAlive(entry.key) && !protectedIds.has(entry.id))
    .sort((a, b) => a.lastActiveAt - b.lastActiveAt)
    .slice(0, limit)
    .map(entry => entry.id);
}

export function getTopEntry(stack: StackSnapshot): RouteEntry | null {
  return stack.entries[stack.entries.length - 1] ?? null;
}
