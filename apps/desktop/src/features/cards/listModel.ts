/**
 * 卡片库列表视图模型：排序与行文案（纯函数）。
 */

import type { ICard } from "@/types";
import { clampText, richTextPlainText } from "@tau/shared/rich-text-text";

export type CardListSort = "created" | "updated" | "words" | "links";

const COMPARE: Record<CardListSort, (a: ICard, b: ICard) => number> = {
  created: (a, b) => b.create_time - a.create_time,
  updated: (a, b) => b.update_time - a.update_time,
  words: (a, b) => b.count - a.count || b.create_time - a.create_time,
  links: (a, b) => b.links.length - a.links.length || b.create_time - a.create_time,
};

/** 置顶在任何排序下都排最前，各列方向固定为降序 */
export function sortCardList(cards: ICard[], sort: CardListSort): ICard[] {
  return [...cards].sort((a, b) => Number(b.isTop) - Number(a.isTop) || COMPARE[sort](a, b));
}

/**
 * 行文案：有 AI 标题时标题用它、摘要取正文开头；没有时首个非空块当标题、其余块当摘要
 * （不再用「前 N 字」切标题，避免摘要从半句话开始）。列表缓存里的 content 是主进程截好的预览块。
 */
export function cardListText(card: Pick<ICard, "content" | "aiTitle">): {
  title: string;
  excerpt: string;
} {
  const aiTitle = card.aiTitle?.trim();
  if (aiTitle) return { title: aiTitle, excerpt: clampText(richTextPlainText(card.content), 120) };
  const blocks = (Array.isArray(card.content) ? card.content : [])
    .map(block => richTextPlainText([block]))
    .filter(Boolean);
  return {
    title: blocks[0] ?? "",
    excerpt: clampText(blocks.slice(1).join(" "), 120),
  };
}
