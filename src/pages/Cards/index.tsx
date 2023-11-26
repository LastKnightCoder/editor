import { memo, useEffect } from "react";
import { RightOutlined } from "@ant-design/icons";
import classnames from "classnames";
import isHotkey from "is-hotkey";

import useCardsManagementStore from "@/stores/useCardsManagementStore";
import { EActiveSide } from "@/stores/useCardPanelStore.ts";
import useSidebarManagementStore from "./stores/useSidebarManagementStore.ts";

import Sidebar from "./Sidebar";
import CardsManagement from "./CardsManagement";
import useCardManagement from "./hooks/useCardManagement.ts";

import styles from './index.module.less';
import If from "@/components/If";

const Cards = memo(() => {
  const {
    isHideSidebar,
  } = useSidebarManagementStore((state) => ({
    isHideSidebar: state.isHideSidebar,
  }));

  const {
    init,
  } = useCardsManagementStore((state) => ({
    init: state.init,
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
  } = useCardManagement();

  useEffect(() => {
    init().then();
  }, [init]);

  // 监听快捷键 mod + left 隐藏列表，mod + right 显示列表
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotkey('mod+left', e)) {
        useSidebarManagementStore.setState({
          isHideSidebar: true,
        })
        e.preventDefault();
      }
      if (isHotkey('mod+right', e)) {
        useSidebarManagementStore.setState({
          isHideSidebar: false,
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
    <div className={classnames(styles.cardsContainer, { [styles.hideSidebar]: isHideSidebar })}>
      <If condition={isHideSidebar}>
        <div
          className={styles.showSidebar}
          onClick={() => {
            useSidebarManagementStore.setState({
              isHideSidebar: false,
            });
          }}>
          <RightOutlined />
        </div>
      </If>
      <div className={classnames(styles.sidebar, { [styles.hide]: isHideSidebar })}>
        <Sidebar
          editingCardId={activeSide === EActiveSide.Left ? leftActiveCardId : rightActiveCardId}
          onCreateCard={onCreateCard}
          onDeleteCard={onDeleteCard}
          onClickCard={onClickCard}
        />
      </div>
      <div className={styles.content}>
        <div className={styles.cardsPanel}>
          <If condition={leftCardIds.length > 0}>
            <CardsManagement
              cardIds={leftCardIds}
              activeCardId={leftActiveCardId}
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
              onClickCard={onClickCard}
              onClickTab={onClickTab}
              onCloseTab={onCloseTab}
              onMoveCard={onMoveCard}
            />
          </If>
        </div>
      </div>
    </div>
  )
})

export default Cards;
