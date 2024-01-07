import { useCallback, useRef, useState } from "react";
import classnames from 'classnames';
import { Button, Input, Skeleton, Spin, Tooltip, Popover } from "antd";
import { CloseOutlined, PlusOutlined, UpOutlined, SyncOutlined } from "@ant-design/icons";

import Tags from "@/components/Tags";
import If from "@/components/If";

import ErrorBoundary from "@/components/ErrorBoundary";
import CardItem2 from "../CardItem2";

import useSearch from "../hooks/useSearch.ts";
import useLoadMore from "@/hooks/useLoadMore.ts";
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import { cardCategoryName } from "@/constants";

import styles from "./index.module.less";
import { ECardCategory } from "@/types";

interface ICardListProps {
  editingCardId?: number;
  onDeleteCard: (id: number) => Promise<void>;
  onCreateCard: () => Promise<void>;
  onClickCard: (id: number) => void;
}

const CardList = (props: ICardListProps) => {
  const { editingCardId, onDeleteCard, onCreateCard, onClickCard } = props;
  const [cardCount, setCardCount] = useState<number>(20);
  const loaderRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const {
    cards,
    loading,
    selectCardCategory,
    updateCard,
    init,
  } = useCardsManagementStore((state) => ({
    cards: state.cards,
    loading: state.initLoading,
    selectCardCategory: state.selectCategory,
    updateCard: state.updateCard,
    init: state.init
  }));

  const selectCards = cards.filter((card) => {
    return card.category === selectCardCategory;
  });

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
  } = useSearch(selectCards, scrollToTop);

  const loadMore = useCallback(() => {
    if (loading) return;
    setCardCount(Math.min(cardCount + 20, filterCards.length));
  }, [loading, cardCount, filterCards]);

  useLoadMore(loaderRef, loadMore);

  const getSettings = (cardId: number) => {
    return [{
      title: '删除卡片',
      onClick: onDeleteCard,
    }, {
      title: (
        <Popover
          placement="right"
          trigger="hover"
          overlayInnerStyle={{
            padding: 4
          }}
          content={(
            <div className={styles.categories}>
              {
                Object.keys(cardCategoryName).map((category) => (
                  <div
                    key={category}
                    className={classnames(styles.categoryItem, { [styles.disable]: category === selectCardCategory })}
                    onClick={async (event) => {
                      if (category === selectCardCategory) return;
                      const toUpdateCard = cards.find((card) => card.id === cardId);
                      if (!toUpdateCard) return;
                      await updateCard({
                        ...toUpdateCard,
                        category: category as ECardCategory,
                      });
                      event.stopPropagation();
                    }}
                  >
                    {cardCategoryName[category as ECardCategory]}
                  </div>
                ))
              }
            </div>
          )}
        >
          <div>
            编辑分类
          </div>
        </Popover>
      ),
    }]
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.total}>
          <div className={styles.number} style={{ overflow: 'hide', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>总数：{filterCards.length}</div>
          <div className={styles.buttons}>
            <Tooltip title={'刷新'}>
              <Button icon={<SyncOutlined />} onClick={init}></Button>
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
                  settings={getSettings(card.id)}
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

export default CardList;