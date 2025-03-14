import { ICard, ICardTree } from "@/types";

export const findCardsByTags = (cards: ICard[], tags: string[]) => {
  return cards.filter((card) =>
    tags.every((tag) =>
      card.tags
        .map((t) => t.toLowerCase())
        .some((t) => t.includes(tag.toLowerCase())),
    ),
  );
};

export const excludeCards = (cards: ICard[], excludeIds: number[]) => {
  return cards.filter((card) => !excludeIds.includes(card.id));
};

const addCardToTree = (tree: ICardTree[], tags: string[], card: ICard) => {
  if (tags.length === 0) {
    return;
  }
  const tag = tags[0];
  const node = tree.find((item) => item.tag === tag);
  if (node) {
    node.cardIds.push(card.id);
  } else {
    tree.push({
      tag,
      children: [],
      cardIds: [card.id],
    });
  }
  addCardToTree(
    tree.find((item) => item.tag === tag)!.children,
    tags.slice(1),
    card,
  );
};

export const generateCardTree = (cards: ICard[]): ICardTree[] => {
  const tree: ICardTree[] = [];
  cards.forEach((card) => {
    const tagsArr = card.tags.map((tag) => tag.trim().split("/"));
    tagsArr.forEach((tags) => {
      addCardToTree(tree, tags, card);
    });
  });
  return tree;
};
