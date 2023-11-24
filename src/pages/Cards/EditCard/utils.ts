import { ICard } from "@/types";

export const getLinkedCards = (card: ICard, cards: ICard[]): ICard[] => {
  const { links } = card;
  const linkedCards = links.map((id) => cards.find((card) => card.id === id));
  return [card, ...linkedCards.filter((card) => card !== undefined) as ICard[]];
}

export const getAllLinkedCards = (card: ICard, allCards: ICard[]): ICard[] => {
  const cards: Set<ICard> = new Set<ICard>([card]);
  const processedCards = new Set<ICard>();

  while (processedCards.size < cards.size) {
    // 找到未处理的卡片
    const unprocessedCards = [...cards].filter((card) => !processedCards.has(card));
    // 获取其所有链接卡片
    const linkedCards = unprocessedCards.flatMap((card) => getLinkedCards(card, allCards));
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
}