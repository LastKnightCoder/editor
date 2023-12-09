import { memo, useEffect } from "react";
import { motion } from 'framer-motion';
import classnames from "classnames";
import isHotkey from "is-hotkey";

import If from "@/components/If";

import { EActiveSide } from "@/stores/useCardPanelStore.ts";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";

import Sidebar from "./Sidebar";
import CardsManagement from "./CardsManagement";
import useCardManagement from "./hooks/useCardManagement.ts";

import styles from './index.module.less';

const Cards = memo(() => {

  const {
    sidebarOpen,
  } = useGlobalStateStore(state => ({
    sidebarOpen: state.sidebarOpen,
  }));

  const sidebarVariants = {
    open: {
      width: 300,
    },
    close: {
      width: 0,
    }
  }

  const contentVariants = {
    open: {
      width: 'calc(100% - 300px)',
    },
    close: {
      width: '100%',
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

  // 监听快捷键 mod + left 隐藏列表，mod + right 显示列表
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotkey('mod+left', e)) {
        useGlobalStateStore.setState({
          sidebarOpen: false,
        })
        e.preventDefault();
      }
      if (isHotkey('mod+right', e)) {
        useGlobalStateStore.setState({
          sidebarOpen: true,
        });
        e.preventDefault();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, []);

  return (
    <motion.div animate={sidebarOpen ? 'open' : 'close'} className={classnames(styles.cardsContainer)}>
      <motion.div initial={false} variants={sidebarVariants} className={classnames(styles.sidebar)}>
        <Sidebar
          editingCardId={activeSide === EActiveSide.Left ? leftActiveCardId : rightActiveCardId}
          onCreateCard={onCreateCard}
          onDeleteCard={onDeleteCard}
          onClickCard={onClickCard}
        />
      </motion.div>
      <motion.div initial={false} variants={contentVariants} className={styles.content}>
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
