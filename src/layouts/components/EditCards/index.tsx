import { memo } from 'react';

import CardsManagement from "./CardsManagement";
import If from "@/components/If";

import { EActiveSide } from "@/stores/useCardPanelStore";
import useCard from '@/hooks/useCard';

const Card = memo(() => {
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
  } = useCard();

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
          showCardTabs={leftCardIds.length > 0}
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
          showCardTabs={rightCardIds.length > 0}
        />
      </If>
    </If>
  )
});

export default Card;
