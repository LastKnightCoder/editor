/**
 * 测试夹具：把「卡片形状」的数据转成 LinkGraph 的通用输入 GraphItem。
 * 各测试原有的卡片夹具保持不变，喂给图谱前经这里转换。
 */

import type { GraphItem } from "../core/types";
import { labelFromContent } from "../core/graph";

interface CardLike {
  id: number;
  links?: number[];
  content?: unknown;
  create_time?: number;
  tags?: string[];
  contentId?: number;
}

export const toItems = (cards: CardLike[]): GraphItem[] =>
  cards.map(card => ({
    id: card.id,
    key: `card:${card.id}`,
    label: labelFromContent(card.content as never),
    createdAt: card.create_time ?? 0,
    tags: card.tags ?? [],
    links: card.links ?? [],
    contentId: card.contentId ?? card.id,
  }));
