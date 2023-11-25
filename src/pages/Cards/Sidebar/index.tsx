import { useCallback, useRef, useState } from "react";
import { Button, Input, Skeleton, Spin, Tooltip } from "antd";
import { CloseOutlined, LeftOutlined, PlusOutlined, UpOutlined } from "@ant-design/icons";

// import WidthResizable from "@/components/WidthResizable";
import Tags from "@/components/Tags";
import If from "@/components/If";

import ErrorBoundary from "@/components/ErrorBoundary";
import CardItem2 from "../CardItem2";

import useSearch from "../hooks/useSearch.ts";
import useLoadMore from "@/hooks/useLoadMore.ts";

import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import useSidebarManagementStore from "../stores/useSidebarManagementStore.ts";

import styles from "./index.module.less";

interface ISidebarProps {
  editingCardId?: number;
  onDeleteCard: (id: number) => Promise<void>;
  onCreateCard: () => Promise<void>;
  onClickCard: (id: number) => void;
}

const Sidebar = (props: ISidebarProps) => {
  const { editingCardId, onDeleteCard, onCreateCard, onClickCard } = props;
  const [cardCount, setCardCount] = useState<number>(20);
  const loaderRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const {
    isHideSidebar,
  } = useSidebarManagementStore((state) => ({
    isHideSidebar: state.isHideSidebar,
  }));

  const {
    cards,
    loading,
  } = useCardsManagementStore((state) => ({
    cards: state.cards,
    loading: state.initLoading,
  }));

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

  // const onResize = (width: number) => {
  //   setDefaultSidebarWidth(width);
  //   localStorage.setItem('default-sidebar-width', String(width));
  // }

  const settings = [{
    title: '删除卡片',
    onClick: onDeleteCard,
  }]

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.total}>
          <div className={styles.number} style={{ overflow: 'hide', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>总数：{filterCards.length}</div>
          <div className={styles.buttons} style={{ display: isHideSidebar ? 'none' : 'flex' }}>
            <Tooltip title={'隐藏列表'}>
              <Button icon={<LeftOutlined />} onClick={() => {
                useSidebarManagementStore.setState({
                  isHideSidebar: true,
                });
              }}></Button>
            </Tooltip>
            <Tooltip title={'返回顶部'}>
              <Button icon={<UpOutlined />} onClick={scrollToTop}></Button>
            </Tooltip>
            <Tooltip title={'新建卡片'}>
              <Button icon={<PlusOutlined />} onClick={onCreateCard}></Button>
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
                    onClickCard(card.id);
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
  )
}

export default Sidebar;