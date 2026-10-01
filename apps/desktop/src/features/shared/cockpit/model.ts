/** 驾驶舱列表模型：排布、排序、最近打开与时间展示（纯函数，三模块共用） */

import { cockpitRelativeTime } from "./text";
import type { CockpitItem } from "./types";

export type CockpitLayout = "grid" | "list";
export type CockpitSort = "opened" | "updated" | "name" | "created";

export const COCKPIT_SORTS: { value: CockpitSort; label: string }[] = [
  { value: "opened", label: "最近打开" },
  { value: "updated", label: "最近更新" },
  { value: "name", label: "名称" },
  { value: "created", label: "创建时间" },
];

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

/** 打开时间：今天 / 昨天带时刻，更早用相对时间 */
export function formatOpenedAt(ts: number, now = Date.now()): string {
  const day = cockpitRelativeTime(ts, now);
  if (day !== "今天" && day !== "昨天") return day;
  const date = new Date(ts);
  return `${day} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** 日期：今年省略年份 */
export function formatDate(ts: number, now = Date.now()): string {
  const date = new Date(ts);
  const md = `${date.getMonth() + 1}月${date.getDate()}日`;
  return date.getFullYear() === new Date(now).getFullYear() ? md : `${date.getFullYear()}年${md}`;
}

/** 网格卡片的时间位跟随排序口径；按最近打开排时，没打开过的回落到更新时间 */
export function cockpitTimeMeta(item: CockpitItem, sort: CockpitSort, now = Date.now()): string {
  if (sort === "created") return `创建于 ${formatDate(item.createTime, now)}`;
  if (sort === "opened" && item.openedAt !== null)
    return `${cockpitRelativeTime(item.openedAt, now)}打开`;
  return `${cockpitRelativeTime(item.updateTime, now)}更新`;
}
