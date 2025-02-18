import { useMemo, memo } from "react";
import { useMemoizedFn } from "ahooks";

import LinkGraph from "@/components/LinkGraph";

import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import useCardPanelStore from "@/stores/useCardPanelStore";

import { ICard } from "@/types";

import { getInlineLinks } from "../EditCards/CardsManagement/utils";

interface CardGraphProps {
  className?: string;
  style?: React.CSSProperties;
  onClickCard?: (id: number) => void;
}

const CardGraph = memo((props: CardGraphProps) => {
  const { className, style, onClickCard } = props;

  const { cards } = useCardsManagementStore(state => ({
    cards: state.cards,
  }));

  const {
    leftCardIds, 
    rightCardIds,
  } = useCardPanelStore(state => ({
    leftCardIds: state.leftCardIds,
    rightCardIds: state.rightCardIds,
  }));

  const activeIds = useMemo(() => {
    return [...leftCardIds, ...rightCardIds];
  }, [leftCardIds, rightCardIds]);

  const getCardLinks = useMemoizedFn((card: ICard) => {
    const links = getInlineLinks(card);
    return [...new Set([...links, ...card.links])];
  });

  return (
    <LinkGraph
      className={className}
      cards={cards}
      style={style}
      getCardLinks={getCardLinks}
      onClickCard={onClickCard}
      currentCardIds={activeIds}
    />
  )
})

export default CardGraph;
