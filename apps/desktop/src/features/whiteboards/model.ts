/**
 * 白板列表的纯函数层：把 WhiteBoard（含全部子白板）投影成列表项，排序、筛选、标签统计。
 * 「页」= 子白板（WhiteBoardContent）；列表接口已带回全部页数据，页数 / 元素数 / 演示序列都在这里派生。
 */

import type { WhiteBoard } from "@/types";

export interface WhiteboardPage {
  /** 子白板 id（whiteboard-content 页面参数） */
  id: number;
  name: string;
  /** 顶层元素数 */
  elementCount: number;
  updateTime: number;
}

export interface WhiteboardItem {
  id: number;
  title: string;
  description: string;
  tags: string[];
  /** 自定义封面（空 = 用画布缩略图） */
  snapshot: string;
  createTime: number;
  /** 白板行与各页更新时间的较大者（改画布只更新页，不更新白板行） */
  updateTime: number;
  pages: WhiteboardPage[];
  elementCount: number;
  /** 演示序列总数 */
  sequences: number;
  /** 上次停留的页 */
  activePageId: number | null;
}

export function toItem(board: WhiteBoard): WhiteboardItem {
  const pages = (board.whiteBoardContentList ?? []).map(content => ({
    id: content.id,
    name: content.name,
    elementCount: content.data?.children?.length ?? 0,
    updateTime: content.updateTime,
  }));
  const sequences = (board.whiteBoardContentList ?? []).reduce(
    (sum, content) => sum + (content.data?.presentationSequences?.length ?? 0),
    0
  );
  return {
    id: board.id,
    title: board.title,
    description: board.description ?? "",
    tags: board.tags ?? [],
    snapshot: board.snapshot ?? "",
    createTime: board.createTime,
    updateTime: Math.max(board.updateTime, ...pages.map(p => p.updateTime)),
    pages,
    elementCount: pages.reduce((sum, p) => sum + p.elementCount, 0),
    sequences,
    activePageId: board.activeWhiteBoardContentId,
  };
}

/* ───────── 排序 ───────── */

export type WhiteboardSort = "updated" | "created" | "title";

export function sortItems(items: WhiteboardItem[], sort: WhiteboardSort): WhiteboardItem[] {
  const list = items.slice();
  if (sort === "updated") list.sort((a, b) => b.updateTime - a.updateTime);
  else if (sort === "created") list.sort((a, b) => b.createTime - a.createTime);
  else list.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b), "zh-CN"));
  return list;
}

export const displayTitle = (item: Pick<WhiteboardItem, "id" | "title">) =>
  item.title.trim() || "未命名白板";

/* ───────── 范围（侧栏标签子项）与标题过滤 ───────── */

export type WhiteboardScope = { kind: "all" } | { kind: "tag"; tag: string } | { kind: "untagged" };

export function parseScope(id: unknown): WhiteboardScope {
  if (typeof id !== "string") return { kind: "all" };
  if (id.startsWith("tag:") && id.length > 4) return { kind: "tag", tag: id.slice(4) };
  if (id === "untagged") return { kind: "untagged" };
  return { kind: "all" };
}

export const scopeId = (scope: WhiteboardScope) =>
  scope.kind === "tag" ? `tag:${scope.tag}` : scope.kind === "untagged" ? "untagged" : "";

export function inScope(item: WhiteboardItem, scope: WhiteboardScope): boolean {
  if (scope.kind === "tag") return item.tags.includes(scope.tag);
  if (scope.kind === "untagged") return item.tags.length === 0;
  return true;
}

/** 标题过滤（不区分大小写）；空串 = 不过滤 */
export function matchTitle(item: WhiteboardItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || displayTitle(item).toLowerCase().includes(q);
}

/** 标题里命中的区间 [start, end)，用于高亮；未命中返回 null */
export function titleHit(title: string, query: string): [number, number] | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const start = title.toLowerCase().indexOf(q);
  return start < 0 ? null : [start, start + q.length];
}

/* ───────── 标签 ───────── */

export interface TagStat {
  name: string;
  count: number;
}

/** 标签按使用次数降序，同次数按名称 */
export function rankTags(items: WhiteboardItem[]): TagStat[] {
  const counts = new Map<string, number>();
  for (const item of items)
    for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
}

export const untaggedCount = (items: WhiteboardItem[]) =>
  items.filter(item => item.tags.length === 0).length;

/** 规整用户输入的标签：去首尾空白、去空、去重（保持顺序） */
export function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map(t => t.trim()).filter(Boolean))];
}

/* ───────── 打开 ───────── */

/** 打开哪一页：指定页 → 上次停留页 → 第一页；没有页返回 null */
export function openTarget(item: WhiteboardItem, pageIndex?: number): number | null {
  if (pageIndex !== undefined && item.pages[pageIndex]) return item.pages[pageIndex].id;
  if (item.activePageId !== null && item.pages.some(p => p.id === item.activePageId))
    return item.activePageId;
  return item.pages[0]?.id ?? null;
}

/* ───────── 展示 ───────── */

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / 昨天 / N 天前 / 9月17日 / 2025年9月17日 */
export function relativeTime(ts: number, now: number): string {
  const diff = now - ts;
  if (diff < MIN) return "刚刚";
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 2 * DAY) return "昨天";
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  const d = new Date(ts);
  return d.getFullYear() === new Date(now).getFullYear()
    ? `${d.getMonth() + 1}月${d.getDate()}日`
    : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function fullTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
