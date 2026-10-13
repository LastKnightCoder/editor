/**
 * 漫步偏好（localStorage）：抽取范围（哪几类内容进抽样池）与抽取偏好，跨会话保留。
 * 「至少保留 1 种」由选择器 UI 守卫；这里只做解析校验，空 / 损坏的种类表回默认。
 */

import type { WalkBias, WalkRefKind } from "@/types";
import { WALK_KIND_ORDER } from "./model";

export interface WalkPrefs {
  kinds: WalkRefKind[];
  bias: WalkBias;
}

const KEY = "walk:prefs";
const ALL_KINDS = new Set<string>(WALK_KIND_ORDER);

export const DEFAULT_WALK_PREFS: WalkPrefs = {
  kinds: [...WALK_KIND_ORDER],
  bias: "stale",
};

export function readWalkPrefs(): WalkPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== "object")
      return { ...DEFAULT_WALK_PREFS, kinds: [...WALK_KIND_ORDER] };
    const { kinds, bias } = value as { kinds?: unknown; bias?: unknown };
    const validKinds = Array.isArray(kinds)
      ? kinds.filter((kind): kind is WalkRefKind => typeof kind === "string" && ALL_KINDS.has(kind))
      : [];
    return {
      kinds: validKinds.length > 0 ? validKinds : [...WALK_KIND_ORDER],
      bias: bias === "random" || bias === "on-this-day" ? bias : "stale",
    };
  } catch {
    return { ...DEFAULT_WALK_PREFS, kinds: [...WALK_KIND_ORDER] };
  }
}

export function saveWalkPrefs(prefs: WalkPrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // 存储不可用时静默跳过，偏好丢失不影响功能
  }
}
