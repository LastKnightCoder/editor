/**
 * 「去连接」（KL-061）：知识地图上的呼应 / 重复有一端是长文时，打开那篇，正文直接进入洞见视图、只画这一处、
 * 弹出气泡；在那里连接或不相关后，经 onResolved 回写到地图那一条。
 *
 * 地图先登记再打开文档；详情页的洞见视图挂载或已经打开时取走它（只取一次）。
 */

import { entityRefKey, type EntityRef } from "@/entity/ref";
import type { InsightMark } from "@/types/content-insights";

export interface InsightFocus {
  ref: EntityRef;
  mark: InsightMark;
  onResolved(status: "linked" | "dismissed"): void;
}

let pending: InsightFocus | null = null;
const listeners = new Set<() => void>();

export function requestInsightFocus(focus: InsightFocus): void {
  pending = focus;
  listeners.forEach(listener => listener());
}

/** 这一篇有待显示的一处就取走（取走即清掉） */
export function takeInsightFocus(ref: EntityRef): InsightFocus | null {
  if (!pending || entityRefKey(pending.ref) !== entityRefKey(ref)) return null;
  const focus = pending;
  pending = null;
  return focus;
}

/** 文档已经打开时也能收到（再次打开同一篇不会重新挂载） */
export function subscribeInsightFocus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
