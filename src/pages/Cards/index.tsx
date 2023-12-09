import { memo } from "react";
import { motion } from 'framer-motion';
import classnames from "classnames";

import If from "@/components/If";

import { EActiveSide } from "@/stores/useCardPanelStore.ts";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";

import Sidebar from "./Sidebar";
import CardsManagement from "./CardsManagement";
import useCardManagement from "./hooks/useCardManagement.ts";
import WidthResizable from "@/components/WidthResizable";

import styles from './index.module.less';

const Cards = memo(() => {

  const {
    sidebarOpen,
    sidebarWidth,
  } = useGlobalStateStore(state => ({
    sidebarOpen: state.sidebarOpen,
    sidebarWidth: state.sidebarWidth,
  }));


  const sidebarVariants = {
    open: {
      width: sidebarWidth,
    },
    close: {
      width: 0,
    }
  }

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
  } = useCardManagement();

  return (
    <motion.div animate={sidebarOpen ? 'open' : 'close'} className={classnames(styles.cardsContainer)}>
      <motion.div style={{ flexBasis: sidebarWidth }} initial={false} variants={sidebarVariants} className={classnames(styles.sidebar)}>
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
      </motion.div>
      <motion.div initial={false}  className={styles.content}>
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
            />
          </If>
        </div>
      </motion.div>
    </motion.div>
  )
})

export default Cards;
