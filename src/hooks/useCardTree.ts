import { generateCardTree } from "@/utils";
import { useMemoizedFn } from "ahooks";
import { useMemo, useState } from "react";
import { ICard } from "@/types";

const useCardTree = (cards: ICard[], defaultCount = 10) => {
  const [cardTreeCount, setCardTreeCount] = useState(defaultCount);

  const cardTree = useMemo(() => {
    const cardTree = generateCardTree(cards);
    cardTree.sort((a, b) => b.cardIds.length - a.cardIds.length);
    return cardTree;
  }, [cards]);

  const slicedCardTree = useMemo(() => {
    return cardTree.slice(0, cardTreeCount);
  }, [cardTree, cardTreeCount]);

  const loadMoreCardTree = useMemoizedFn(async () => {
    setCardTreeCount(Math.min(cardTreeCount + 10, cardTree.length));
  });

  return {
    cardTree,
    cardTreeCount,
    slicedCardTree,
    loadMoreCardTree,
  };
};

export default useCardTree;
