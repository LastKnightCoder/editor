import { memo } from "react";
import classnames from "classnames";

import If from "@/components/If";

import { EActiveSide } from "@/stores/useCardPanelStore.ts";

import Sidebar from "./Sidebar";
import CardsManagement from "./CardsManagement";
import CardGraph from "./CardGraph";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import useCardManagement from "./hooks/useCardManagement.ts";

import styles from './index.module.less';

const Cards = memo(() => {
  const {
    leftCardIds,
    rightCardIds,
    leftActiveCardId,
    rightActiveCardId,
    onCreateCard,
    onDeleteCard,
    onClickCard,
    onClickTab,
    onCloseTab,
    onMoveCard,
    activeSide,
    onCloseOtherTabs,
  } = useCardManagement();

  return (
    <div className={classnames(styles.cardsContainer)}>
      <ResizeableAndHideableSidebar className={styles.sidebar}>
        <Sidebar
          editingCardId={activeSide === EActiveSide.Left ? leftActiveCardId : rightActiveCardId}
          onCreateCard={onCreateCard}
          onDeleteCard={onDeleteCard}
          onClickCard={onClickCard}
        />
      </ResizeableAndHideableSidebar>
      <div className={styles.content}>
        <If condition={leftCardIds.length === 0 && rightCardIds.length === 0}>
          <CardGraph />
        </If>
        <div className={styles.cardsPanel}>
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
        </div>
      </div>
    </div>
  )
})

export default Cards;
