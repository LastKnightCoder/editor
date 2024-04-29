import { memo } from 'react';

import CardsManagement from "./CardsManagement";
import If from "@/components/If";

import { EActiveSide } from "@/stores/useCardPanelStore";

interface ICardProps {
  leftCardIds: number[];
  rightCardIds: number[];
  leftActiveCardId?: number;
  rightActiveCardId?: number;
  onClickCard: (id: number) => void;
  onClickTab: (id: number) => void;
  onCloseTab: (id: number) => void;
  onMoveCard: (cardId: number) => void;
  onCloseOtherTabs: (id: number, side: EActiveSide) => void;
}

const Card = memo((props: ICardProps) => {
  const {
    leftCardIds,
    rightCardIds,
    leftActiveCardId,
    rightActiveCardId,
    onClickCard,
    onClickTab,
    onCloseTab,
    onMoveCard,
    onCloseOtherTabs,
  } = props;

  return (
    <If condition={leftCardIds.length > 0 || rightCardIds.length > 0}>
      <If condition={leftCardIds.length > 0}>
        <CardsManagement
          cardIds={leftCardIds}
          activeCardId={leftActiveCardId}
          side={EActiveSide.Left}
          onClickCard={onClickCard}
          onClickTab={onClickTab}
          onCloseTab={onCloseTab}
          onMoveCard={onMoveCard}
          onCloseOtherTabs={onCloseOtherTabs}
          showCardTabs={leftCardIds.length > 1 || (leftCardIds.length > 0 && rightCardIds.length > 0)}
        />
      </If>
      <If condition={rightCardIds.length > 0}>
        <CardsManagement
          cardIds={rightCardIds}
          activeCardId={rightActiveCardId}
          side={EActiveSide.Right}
          onClickCard={onClickCard}
          onClickTab={onClickTab}
          onCloseTab={onCloseTab}
          onMoveCard={onMoveCard}
          onCloseOtherTabs={onCloseOtherTabs}
          showCardTabs={rightCardIds.length > 1 || (leftCardIds.length > 0 && rightCardIds.length > 0)}
        />
      </If>
    </If>
  )
});

export default Card;
