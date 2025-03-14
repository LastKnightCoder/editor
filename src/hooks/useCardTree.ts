import useCardsManagementStore from "@/stores/useCardsManagementStore";
import { generateCardTree } from "@/utils";
import { useMemoizedFn } from "ahooks";
import { useMemo, useState } from "react";

const useCardTree = (defaultCount = 10) => {
  const [cardTreeCount, setCardTreeCount] = useState(defaultCount);
  const { cards } = useCardsManagementStore((state) => ({
    cards: state.cards,
  }));

  const cardTree = useMemo(() => {
    return generateCardTree(cards);
  }, [cards]);

  cardTree.sort((a, b) => b.cardIds.length - a.cardIds.length);

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
