import CardsManagement from "@/pages/Cards/CardsManagement";
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

const Card = (props: ICardProps) => {
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
        />
      </If>
    </If>
  )
}

export default Card;
