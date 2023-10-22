import { ICard } from "@/types";

export const findCardsByTags = (cards: ICard[], tags: string[]) => {
  return cards
    .filter(card =>
      tags.every(tag =>
        card.tags.map(t => t.toLowerCase()).some(t =>
          t.includes(tag.toLowerCase())
        )
      )
    )
}

export const excludeCards = (cards: ICard[], excludeIds: number[]) => {
  return cards.filter(card => !excludeIds.includes(card.id));
}