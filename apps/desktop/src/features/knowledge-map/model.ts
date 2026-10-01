/**
 * 知识地图页的纯函数：把主进程给的节点展示信息转成图谱输入，计算筛选命中与统计。
 */

import type { GraphItem } from "@/components/LinkGraph";
import type { KnowledgeMapItem } from "@/knowledge-map/types";

export type MapItemKind = KnowledgeMapItem["kind"];

export const KIND_LABEL: Record<MapItemKind, string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目文档",
};

export interface MapFilter {
  kind: MapItemKind | null;
  projectId: number | null;
}

export const EMPTY_FILTER: MapFilter = { kind: null, projectId: null };

/** 场景内数值 id 取数组下标；连线由节点键转成下标，指向不在列表里的丢弃 */
export function toGraphItems(items: KnowledgeMapItem[]): GraphItem[] {
  const indexOf = new Map(items.map((item, index) => [item.key, index]));
  return items.map((item, index) => ({
    id: index,
    key: item.key,
    label: item.title,
    createdAt: item.createdAt,
    tags: item.tags,
    links: item.links
      .map(key => indexOf.get(key))
      .filter((target): target is number => target !== undefined),
    contentId: item.contentId,
  }));
}

/** 筛选命中的下标；没有任何筛选时为 null（地图保持平时的样子，不是「全员命中」） */
export function filterHits(items: KnowledgeMapItem[], filter: MapFilter): number[] | null {
  if (filter.kind === null && filter.projectId === null) return null;
  const hits: number[] = [];
  items.forEach((item, index) => {
    if (filter.kind !== null && item.kind !== filter.kind) return;
    if (filter.projectId !== null && item.projectId !== filter.projectId) return;
    hits.push(index);
  });
  return hits;
}

export function countByKind(items: KnowledgeMapItem[]): Record<MapItemKind, number> {
  const counts: Record<MapItemKind, number> = { card: 0, article: 0, "project-item": 0 };
  for (const item of items) counts[item.kind] += 1;
  return counts;
}

/** 节点键 → 下标；focus 参数解析用 */
export function indexOfKey(items: KnowledgeMapItem[], key: string | undefined): number | null {
  if (!key) return null;
  const index = items.findIndex(item => item.key === key);
  return index >= 0 ? index : null;
}
