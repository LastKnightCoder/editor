import CardTabs from './CardTabs';
import EditCard from "../EditCard";
import If from "@/components/If";

import styles from './index.module.less';

interface ICardsManagementProps {
  cardIds: number[];
  activeCardId?: number;
  onClickLinkCard: (id: number) => void;
  onClickTab: (id: number) => void;
  onCloseTab: (id: number) => void;
  onMoveCard: (cardId) => void;
  onActiveSideChange: (cardId: number) => void;
}

const CardsManagement = (props: ICardsManagementProps) => {
  const {
    cardIds,
    activeCardId,
    onClickTab,
    onCloseTab,
    onClickLinkCard,
    onMoveCard,
    onActiveSideChange,
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
            onChange={() => {
              onActiveSideChange(activeCardId!);
            }}
          />
        </div>
      </If>
    </div>
  )
}

export default CardsManagement;