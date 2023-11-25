import { useEffect, memo } from "react";
import { useMemoizedFn } from 'ahooks';
import { App } from "antd";
import { RightOutlined } from "@ant-design/icons";
import classnames from "classnames";
import isHotkey from "is-hotkey";

import useCardsManagementStore from "@/stores/useCardsManagementStore";
import useSidebarManagementStore from "./stores/useSidebarManagementStore.ts";

import Sidebar from "./Sidebar";
import CardsManagement from "./CardsManagement";
import useCardManagement from "./hooks/useCardManagement.ts";

import styles from './index.module.less';
import If from "@/components/If";

const Cards = memo(() => {

  const { modal } = App.useApp();

  const {
    isHideSidebar,
  } = useSidebarManagementStore((state) => ({
    isHideSidebar: state.isHideSidebar,
  }));

  const {
    init,
    createCard,
    deleteCard,
  } = useCardsManagementStore((state) => ({
    init: state.init,
    deleteCard: state.deleteCard,
    createCard: state.createCard,
  }));

  const {
    cardIds,
    activeCardId,
    addCard,
    removeCard,
    setActive,
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
  }, [])

  const onClickTab = useMemoizedFn((id: number) => {
    if (id === activeCardId) return;
    setActive(id);
  })

  const onCloseTab = useMemoizedFn((id: number) => {
    removeCard(id);
    if (id === activeCardId) {
      setActive(undefined);
    }
  });

  const onCreateCard = useMemoizedFn(async () => {
    const id = await createCard({
      content: [{
        type: 'paragraph',
        children: [{
          type: 'formatted',
          text: ''
        }]
      }],
      tags: [],
      links: [],
    });
    addCard(id);
    setActive(id);
  });

  const onDeleteCard = useMemoizedFn(async (id: number) => {
    modal.confirm({
      title: '确认删除？',
      content: '删除后无法恢复',
      onOk: async () => {
        await deleteCard(id);
        if (cardIds.includes(id)) {
          removeCard(id);
        }
        if (activeCardId === id) {
          setActive(undefined);
        }
      },
      okText: '确认',
      cancelText: '取消',
      okButtonProps: {
        danger: true
      }
    });
  });

  const onClickCard = useMemoizedFn((id: number) => {
    if (cardIds.includes(id)) {
      onClickTab(id);
    } else {
      addCard(id);
      setActive(id);
    }
  });

  return (
    <div className={styles.cardsContainer}>
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
          editingCardId={activeCardId}
          onCreateCard={onCreateCard}
          onDeleteCard={onDeleteCard}
          onClickCard={onClickCard}
        />
      </div>
      <div className={styles.content}>
        <CardsManagement
          cardIds={cardIds}
          activeCardId={activeCardId}
          onClickLinkCard={onClickCard}
          onClickTab={onClickTab}
          onCloseTab={onCloseTab}
        />
      </div>
    </div>
  )
})

export default Cards;
