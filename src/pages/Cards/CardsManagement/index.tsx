import CardTabs from './CardTabs';
import EditCard from "../EditCard";
import If from "@/components/If";

import styles from './index.module.less';

interface ICardsManagementProps {
  cardIds: number[];
  activeCardId?: number;
  onClickCard: (id: number) => void;
  onClickTab: (id: number) => void;
  onCloseTab: (id: number) => void;
  onMoveCard: (cardId: number) => void;
}

const CardsManagement = (props: ICardsManagementProps) => {
  const {
    cardIds,
    activeCardId,
    onClickCard: onClickLinkCard,
    onCloseTab,
    onClickTab,
    onMoveCard,
  } = props;

  return (
    <div className={styles.cardsManagement}>
      <CardTabs
        cardIds={cardIds}
        activeCardId={activeCardId}
        onClickTab={onClickTab}
        onCloseTab={onCloseTab}
        onMoveCard={onMoveCard}
      />
      <If condition={!!activeCardId}>
        <div style={{
          marginTop: 24
        }}>
          <EditCard
            key={activeCardId!}
            cardId={activeCardId!}
            onClickLinkCard={onClickLinkCard}
          />
        </div>
      </If>
    </div>
  )
}

export default CardsManagement;