import { useCallback, useEffect, useRef, useState } from "react";
import { App, Button, Input, Skeleton, Spin, Tooltip } from "antd";
import { CloseOutlined, LeftOutlined, PlusOutlined, UpOutlined, RightOutlined } from "@ant-design/icons";
import isHotkey from "is-hotkey";

import WidthResizable from "@/components/WidthResizable";
import Tags from "@/components/Tags";
import If from "@/components/If";

import ErrorBoundary from "@/components/ErrorBoundary";
import CardItem2 from "../CardItem2";

import useSearch from "../hooks/useSearch.ts";
import useLoadMore from "@/hooks/useLoadMore.ts";
import useEditCardStore from "@/stores/useEditCardStore.ts";

import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";

import styles from "./index.module.less";


const Sidebar = () => {
  const [isHideSidebar, setIsHideSidebar] = useState<boolean>(false);
  const [cardCount, setCardCount] = useState<number>(20);
  const [defaultSidebarWidth, setDefaultSidebarWidth] = useState<number>(() => {
    const width = localStorage.getItem('default-sidebar-width');
    if (width) return Number(width);
    return 300;
  });
  const loaderRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const {
    cards,
    loading,
    deleteCard,
  } = useCardsManagementStore((state) => ({
    cards: state.cards,
    loading: state.initLoading,
    deleteCard: state.deleteCard,
  }));

  const {
    editingCardId,
  } = useEditCardStore((state) => ({
    editingCardId: state.editingCardId,
  }));

  const { modal } = App.useApp();

  const scrollToTop = () => {
    if (listRef.current) {
      listRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
      setCardCount(20);
    }
  }

  const {
    searchValue,
    setSearchValue,
    searchTags,
    searchTips,
    setShowSearchTips,
    showSearchTips,
    filterCards,
    onSearch,
    onClickSearchTag,
    deleteTag,
    handleFocus,
    handleBlur,
  } = useSearch(cards, scrollToTop);

  const loadMore = useCallback(() => {
    if (loading) return;
    setCardCount(Math.min(cardCount + 20, filterCards.length));
  }, [loading, cardCount, filterCards]);

  useLoadMore(loaderRef, loadMore);

  const createCard = async () => {
    useEditCardStore.setState({
      editingCardId: undefined,
    });
    const id = await useCardsManagementStore.getState().createCard({
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
    useEditCardStore.setState({
      editingCardId: id,
    });
  }

  const handleClickCard = (id: number) => {
    if (!editingCardId) {
      useEditCardStore.setState({
        editingCardId: id,
      })
      return;
    }

    if (id === editingCardId) {
      // cardDetailRef.current?.quit();
      useEditCardStore.setState({
        editingCardId: undefined,
      });
      return;
    }
    useEditCardStore.setState({
      editingCardId: id,
    });
  }

  const onResize = (width: number) => {
    setDefaultSidebarWidth(width);
    localStorage.setItem('default-sidebar-width', String(width));
  }

  const onDeleteCard = async (id: number) => {
    modal.confirm({
      title: '确认删除？',
      content: '删除后无法恢复',
      onOk: async () => {
        await deleteCard(id);
        if (editingCardId === id) {
          useEditCardStore.setState({
            editingCardId: undefined,
          })
        }
      },
      okText: '确认',
      cancelText: '取消',
      okButtonProps: {
        danger: true
      }
    });
  }

  // 监听快捷键 mod + left 隐藏列表，mod + right 显示列表
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotkey('mod+left', e)) {
        setIsHideSidebar(true);
        e.preventDefault();
      }
      if (isHotkey('mod+right', e)) {
        setIsHideSidebar(false);
        e.preventDefault();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, [])

  const settings = [{
    title: '删除卡片',
    onClick: onDeleteCard,
  }]

  return (
    <div className={styles.sidebarContainer}>
      <If condition={isHideSidebar}>
        <div className={styles.showSidebar} onClick={() => { setIsHideSidebar(false) }}>
          <RightOutlined className={styles.icon} />
        </div>
      </If>
      <div className={styles.sidebar}>
        <div className={styles.header}>
          <div className={styles.total}>
            <div className={styles.number} style={{ overflow: 'hide', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>总数：{filterCards.length}</div>
            <div className={styles.buttons} style={{ display: isHideSidebar ? 'none' : 'flex' }}>
              <Tooltip title={'隐藏列表'}>
                <Button icon={<LeftOutlined />} onClick={() => { setIsHideSidebar(true) }}></Button>
              </Tooltip>
              <Tooltip title={'返回顶部'}>
                <Button icon={<UpOutlined />} onClick={scrollToTop}></Button>
              </Tooltip>
              <Tooltip title={'新建卡片'}>
                <Button icon={<PlusOutlined />} onClick={createCard}></Button>
              </Tooltip>
            </div>
          </div>
          <div className={styles.input}>
            <Input
              prefix={searchTags.length > 0 ? <Tags closable showIcon tags={searchTags} onClose={deleteTag} /> : undefined}
              onPressEnter={onSearch}
              value={searchValue}
              onChange={(e) => { setSearchValue(e.target.value) }}
              placeholder="输入标签进行筛选"
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
            <If condition={showSearchTips}>
              <div className={styles.searchTips}>
                <div className={styles.searchHeader}>
                  <div className={styles.title}>搜索记录</div>
                  <CloseOutlined onClick={() => { setShowSearchTips(false) }} />
                </div>
                <Tags onClick={onClickSearchTag} tags={searchTips} noWrap showIcon hoverAble />
              </div>
            </If>
          </div>
        </div>
        <div ref={listRef} className={styles.cardList}>
          {
            loading
              ? Array.from({ length: 20 }).map((_, index) => (
                <Skeleton key={index} active />
              ))
              : filterCards.slice(0, cardCount).map((card) => (
                <ErrorBoundary key={card.id}>
                  <CardItem2
                    showTags
                    active={card.id === editingCardId}
                    card={card}
                    onClick={(e) => {
                      handleClickCard(card.id);
                      e.stopPropagation();
                    }}
                    settings={settings}
                    maxRows={3}
                  />
                </ErrorBoundary>
              ))
          }
          {
            cardCount < filterCards.length && !loading &&
            <Spin>
              <div ref={loaderRef} style={{ height: 100 }} />
            </Spin>
          }
        </div>
      </div>
      {/*<WidthResizable*/}
      {/*  defaultWidth={defaultSidebarWidth}*/}
      {/*  minWidth={240}*/}
      {/*  maxWidth={380}*/}
      {/*  onResize={onResize}*/}
      {/*  hide={isHideSidebar}*/}
      {/*  style={{*/}
      {/*    height: '100%',*/}
      {/*  }}*/}
      {/*>*/}
      {/*  */}
      {/*</WidthResizable>*/}
    </div>
  )
}

export default Sidebar;