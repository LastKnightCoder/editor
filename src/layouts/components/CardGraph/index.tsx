import { memo } from "react";
import { useMemoizedFn } from "ahooks";
import LinkGraph from "@/components/LinkGraph";

import { ICard } from "@/types";
import { getInlineLinks } from "@/utils";

const defaultCurrentCardIds: number[] = [];

interface CardGraphProps {
  className?: string;
  style?: React.CSSProperties;
  onClickCard?: (card: ICard) => void;
  cards: ICard[];
  fitView?: boolean;
  fitViewPadding?: number[];
  currentCardIds?: number[];
}

const CardGraph = memo((props: CardGraphProps) => {
  const {
    className,
    style,
    onClickCard,
    cards,
    fitView,
    fitViewPadding,
    currentCardIds = defaultCurrentCardIds,
  } = props;

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
      currentCardIds={currentCardIds}
      fitView={fitView}
      fitViewPadding={fitViewPadding}
    />
  );
});

export default CardGraph;
