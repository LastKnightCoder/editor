// history 适配器 v2：把 screen/overlay 两条栈序列化进 window.history，
// popstate 时恢复。恢复走两道防线：schema 净化 + 按位置对齐保留 entry id。

import { getPageMeta } from "./pageMeta";
import { sanitizeParams } from "./paramsSchema";
import type { RouteEntry, StackSnapshot } from "./stackMachine";

const HISTORY_MARK = "__tau_router_v2__";
const HISTORY_VERSION = 2;

export type RouterHistorySnapshot = {
  screens: Array<{ key: string; params: Record<string, unknown> }>;
  overlays: Array<{ key: string; params: Record<string, unknown> }>;
};

type RouterHistoryState = {
  mark: typeof HISTORY_MARK;
  version: typeof HISTORY_VERSION;
  snapshot: RouterHistorySnapshot;
};

export function toHistoryState(
  screens: StackSnapshot,
  overlays: StackSnapshot
): RouterHistoryState {
  return {
    mark: HISTORY_MARK,
    version: HISTORY_VERSION,
    snapshot: {
      screens: screens.entries.map(entry => ({
        key: entry.key,
        params: entry.params as Record<string, unknown>,
      })),
      overlays: overlays.entries.map(entry => ({
        key: entry.key,
        params: entry.params as Record<string, unknown>,
      })),
    },
  };
}

export function readHistoryState(raw: unknown): RouterHistoryState | null {
  if (!raw || typeof raw !== "object") return null;
  const state = raw as Partial<RouterHistoryState>;
  if (state.mark !== HISTORY_MARK || state.version !== HISTORY_VERSION) {
    return null;
  }
  if (!state.snapshot || typeof state.snapshot !== "object") return null;
  const { screens, overlays } = state.snapshot;
  if (!Array.isArray(screens) || !Array.isArray(overlays)) return null;
  return state as RouterHistoryState;
}

function createEntryId(key: string, now: number): string {
  return `${key}-${now}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 从快照条目恢复栈：
 * - params 经页面 schema 净化，非法（必填缺失）条目直接丢弃；
 * - 与当前栈按位置对齐：同 key 保留原 entry id（避免整栈 remount、丢保活状态）。
 */
export function restoreStack(
  items: ReadonlyArray<{ key: string; params: unknown }>,
  currentStack: StackSnapshot,
  requireLayer: "screen" | "overlay",
  now: number
): StackSnapshot {
  const entries: RouteEntry[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const meta = getPageMeta(item.key);
    if (!meta || meta.layer !== requireLayer) continue;
    const params = sanitizeParams(meta.paramsSchema, item.params);
    if (params === null) continue;
    const existing = currentStack.entries[index];
    const reused =
      existing && existing.key === item.key
        ? existing
        : currentStack.entries.find(
            entry =>
              entry.key === item.key && JSON.stringify(entry.params) === JSON.stringify(params)
          );
    entries.push({
      id: reused ? reused.id : createEntryId(item.key, now),
      key: item.key,
      params: params as Record<string, unknown>,
      createdAt: reused ? reused.createdAt : now,
      // 复用时保留原 lastActiveAt，popstate 恢复不扰动 LRU 顺序
      lastActiveAt: reused ? reused.lastActiveAt : now,
    });
  }
  return { entries };
}

export function pushHistoryState(state: RouterHistoryState): void {
  if (typeof window === "undefined") return;
  window.history.pushState(state, "");
}

export function replaceHistoryState(state: RouterHistoryState): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(state, "");
}
