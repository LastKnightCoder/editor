/**
 * 白板之间的跳转：画布里双击嵌入的白板卡片时沿链前进，面包屑点上级时精确回到那一级。
 *
 * - WhiteboardNavContext：白板详情页提供「当前白板 / 页 / 链」，嵌入卡片据此拼出目标的 trail 参数
 * - 定位请求：回到某一级时要定位并高亮来源卡片；请求先挂起，等那一页的画布显示
 *  （新挂载，或保活实例从 Activity 隐藏态恢复、effect 重跑）时取走，过期作废
 */

import { createContext } from "react";
import { formatTrail, type TrailStep } from "./model";

export interface WhiteboardNav {
  boardId: number;
  pageId: number;
  trail: TrailStep[];
}

export const WhiteboardNavContext = createContext<WhiteboardNav | null>(null);

/** 回到链上第 index 级的页面参数（链截到它之前） */
export function trailStepParams(trail: TrailStep[], index: number) {
  const step = trail[index];
  return { id: step.boardId, page: step.pageId, trail: formatTrail(trail.slice(0, index)) };
}

/* ───────── 定位来源卡片 ───────── */

const REVEAL_TTL = 5000;
let pending: { pageId: number; elementId: string; at: number } | null = null;
const listeners = new Set<() => void>();

export function requestReveal(pageId: number, elementId: string) {
  pending = { pageId, elementId, at: Date.now() };
  listeners.forEach(listener => listener());
}

/** 取走发给这一页的定位请求（取走即清除） */
export function takeReveal(pageId: number): string | null {
  if (!pending || Date.now() - pending.at > REVEAL_TTL) {
    pending = null;
    return null;
  }
  if (pending.pageId !== pageId) return null;
  const { elementId } = pending;
  pending = null;
  return elementId;
}

export function subscribeReveal(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
