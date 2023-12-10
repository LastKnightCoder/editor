import { memo } from "react";
import classnames from "classnames";

import If from "@/components/If";

import { EActiveSide } from "@/stores/useCardPanelStore.ts";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";

import Sidebar from "./Sidebar";
import CardsManagement from "./CardsManagement";
import useCardManagement from "./hooks/useCardManagement.ts";
import WidthResizable from "@/components/WidthResizable";

import styles from './index.module.less';
import useDragAndHideSidebar from "@/hooks/useDragAndHideSidebar.ts";

const Cards = memo(() => {

  const scope = useDragAndHideSidebar();

  const {
    sidebarWidth,
  } = useGlobalStateStore(state => ({
    sidebarWidth: state.sidebarWidth,
  }));

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
      <div ref={scope} style={{ width: sidebarWidth }} className={classnames(styles.sidebar)}>
          <WidthResizable
            defaultWidth={sidebarWidth}
            minWidth={200}
            maxWidth={500}
            onResize={(width) => {
              useGlobalStateStore.setState({
                sidebarWidth: width,
              });
              localStorage.setItem('sidebarWidth', String(width));
            }}
            style={{
              height: '100%'
            }}
          >
            <Sidebar
              editingCardId={activeSide === EActiveSide.Left ? leftActiveCardId : rightActiveCardId}
              onCreateCard={onCreateCard}
              onDeleteCard={onDeleteCard}
              onClickCard={onClickCard}
            />
          </WidthResizable>
      </div>
      <div className={styles.content}>
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
