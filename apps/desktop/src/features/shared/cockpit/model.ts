/** 驾驶舱列表模型：排布、排序、最近打开与时间展示（纯函数，三模块共用） */

import type { ListLayout } from "../list/ListControls";
import type { CockpitItem } from "./types";

export type CockpitLayout = ListLayout;
export type CockpitSort = "opened" | "updated" | "name" | "created";

export const COCKPIT_SORTS = ["opened", "updated", "name", "created"] as const;

const COMPARE: Record<CockpitSort, (a: CockpitItem, b: CockpitItem) => number> = {
  // 从未打开的排在打开过的之后，组内按更新时间
  opened: (a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0) || b.updateTime - a.updateTime,
  updated: (a, b) => b.updateTime - a.updateTime,
  name: (a, b) => a.title.localeCompare(b.title, "zh-CN", { numeric: true }),
  created: (a, b) => b.createTime - a.createTime,
};

/** 置顶在任何排序下都排最前 */
export function sortCockpitItems<T extends CockpitItem>(items: T[], sort: CockpitSort): T[] {
  return [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || COMPARE[sort](a, b));
}

/** 「最近打开」续读行：打开过的按打开时间取前 n 个（不受置顶影响） */
export function recentCockpitItems<T extends CockpitItem>(items: T[], n = 3): T[] {
  return items
    .filter(item => item.openedAt !== null)
    .sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))
    .slice(0, n);
}
