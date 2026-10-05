import type { Descendant } from "slate";
import { ICard, ICardTree } from "@/types";
import { inlineCardIds } from "@/entity/inline-refs";

/** 卡片正文还是新建时的样子：至多一个只含空文字的段落（有图片、公式等任何元素都不算空） */
export const isBlankCardContent = (content: Descendant[]) => {
  if (content.length > 1) return false;
  const [first] = content as Array<{ type?: string; children?: Array<{ text?: unknown }> }>;
  return (
    !first ||
    (first.type === "paragraph" &&
      (first.children ?? []).every(child => typeof child.text === "string" && !child.text))
  );
};

export const findCardsByTags = (cards: ICard[], tags: string[]) => {
  return cards.filter(card =>
    tags.every(tag => card.tags.map(t => t.toLowerCase()).some(t => t.includes(tag.toLowerCase())))
  );
};

export const excludeCards = (cards: ICard[], excludeIds: number[]) => {
  return cards.filter(card => !excludeIds.includes(card.id));
};

const addCardToTree = (tree: ICardTree[], tags: string[], card: ICard) => {
  if (tags.length === 0) {
    return;
  }
  const tag = tags[0];
  const node = tree.find(item => item.tag === tag);
  if (node) {
    node.cardIds.push(card.id);
  } else {
    tree.push({
      tag,
      children: [],
      cardIds: [card.id],
    });
  }
  addCardToTree(tree.find(item => item.tag === tag)!.children, tags.slice(1), card);
};

export const generateCardTree = (cards: ICard[]): ICardTree[] => {
  const tree: ICardTree[] = [];
  cards.forEach(card => {
    const tagsArr = card.tags.map(tag => tag.trim().split("/"));
    tagsArr.forEach(tags => {
      addCardToTree(tree, tags, card);
    });
  });
  return tree;
};

/** 正文里内联引用的卡片 id */
export const getInlineLinks = (card: ICard) => inlineCardIds(card.content);

export const getLinkedCards = (card: ICard, cards: ICard[]): ICard[] => {
  const { links } = card;
  const inlineLinks = getInlineLinks(card);
  const finalLinks = [...new Set([...links, ...inlineLinks])];
  const linkedCards = finalLinks.map(id => cards.find(card => card.id === id));
  return [card, ...(linkedCards.filter(card => card !== undefined) as ICard[])];
};

export const getAllLinkedCards = (card: ICard, allCards: ICard[]): ICard[] => {
  const cards: Set<ICard> = new Set<ICard>([card]);
  const processedCards = new Set<ICard>();

  while (processedCards.size < cards.size) {
    // 找到未处理的卡片
    const unprocessedCards = [...cards].filter(card => !processedCards.has(card));
    // 获取其所有链接卡片
    const linkedCards = unprocessedCards.flatMap(card => getLinkedCards(card, allCards));
    // 将其所有链接卡片加入已处理卡片列表
    for (const unprocessedCard of unprocessedCards) {
      processedCards.add(unprocessedCard);
    }
    // 将其所有链接卡片加入卡片列表
    for (const linkedCard of linkedCards) {
      cards.add(linkedCard);
    }
  }

  return [...cards];
};
