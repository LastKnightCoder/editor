import { useEffect, useMemo, useRef, useState } from 'react';
import classnames from 'classnames';
import { Select, Tooltip, FloatButton, Popover } from 'antd';
import { useMemoizedFn } from 'ahooks';

import For from '@/components/For';
import CardItem2 from '@/components/CardItem2';
import LoadMoreComponent from '@/components/LoadMoreComponent';
import SearchTag from '@/components/SearchTag';
import TagItem from '@/components/TagItem';
import { MenuFoldOutlined, MenuUnfoldOutlined, PlusOutlined } from '@ant-design/icons';
import Card from '../../../ThreeColumnLayout/Content/Card';

import useCardsManagementStore from '@/stores/useCardsManagementStore';
import useCardPanelStore from '@/stores/useCardPanelStore';
import useCardTree from '@/hooks/useCardTree';
import useCardManagement from '@/hooks/useCardManagement';
import useSearchKeywords from '@/hooks/useSearchKeywords';
import { ECardCategory, ICard } from '@/types';
import { cardCategoryName } from "@/constants";
import { getMarkdown } from "@/utils";

import styles from './index.module.less';

const MIN_WIDTH = 200;
const MAX_WIDTH = 300;
const GAP = 20;

const CardContainer = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  const { cardTree } = useCardTree();

  const { 
    cards, 
    selectCategory, 
    activeCardTag, 
    updateCard 
  } = useCardsManagementStore(state => ({
    cards: state.cards,
    selectCategory: state.selectCategory,
    activeCardTag: state.activeCardTag,
    updateCard: state.updateCard
  }));

  const filteredCards = useMemo(() => {
    const cardWithCategory = cards.filter((card) => {
      return card.category === selectCategory;
    });

    if (!activeCardTag) return cardWithCategory;
    return cardWithCategory.filter((card) => card.tags.some(tag => {
      const activeCardTags = activeCardTag.split('/');
      const tags = tag.split('/');
      if (tags.length < activeCardTags.length) return false;
      for (let i = 0; i < activeCardTags.length; i++) {
        if (activeCardTags[i] !== tags[i]) return false;
      }
      return true;
    }));
  }, [activeCardTag, cards, selectCategory]);

  const [hideCardTree, setHideCardTree] = useState(false);
  const [searchCards, setSearchCards] = useState<ICard[]>(filteredCards);
  const [itemWidth, setItemWidth] = useState(200);
  const [cardsCount, setCardsCount] = useState<number>(30);

  const sliceCards = searchCards.slice(0, cardsCount);

  const {
    onClickCard,
    onCtrlClickCard,
    onDeleteCard,
    onCreateCard
  } = useCardManagement();

  const {
    searchValue,
    handleValueChange,
    handleBlur,
    handleFocus,
    handleDeleteKeyword,
    keywords,
    inputRef,
    handleAddKeyword,
  } = useSearchKeywords();

  const { leftCardIds, rightCardIds } = useCardPanelStore(state => ({
    leftCardIds: state.leftCardIds,
    rightCardIds: state.rightCardIds,
  }));

  const isShowEdit = useMemo(() => {
    return leftCardIds.length > 0 || rightCardIds.length > 0;
  }, [leftCardIds, rightCardIds]);

  const onSearchTags = useMemoizedFn((cards: ICard[], keywords: string[]) => {
    if (keywords.length === 0) {
      setSearchCards(cards);
      setCardsCount(30);
      return;
    }
    const filteredCards = cards.filter((card) => {
      return keywords.every((keyword) => {
        const allTags = card.tags.map(tag => tag.split('/')).flat(Infinity);
        return allTags.includes(keyword);
      });
    });
    setSearchCards(filteredCards);
    setCardsCount(30);
  });

  const loadMore = useMemoizedFn(async () => {
    setCardsCount(Math.min(cardsCount + 10, searchCards.length));
  })

  const handleResize = useMemoizedFn((entries: ResizeObserverEntry[]) => {
    const { width } = entries[0].contentRect;

    const nMin = Math.ceil((width + GAP) / (MAX_WIDTH + GAP));
    const nMax = Math.floor((width + GAP) / (MIN_WIDTH + GAP));

    const n = Math.min(nMin, nMax);

    const itemWidth = (width + GAP) / n - GAP;

    setItemWidth(itemWidth);
  });

  const onSelectCategoryChange = useMemoizedFn((category: ECardCategory) => {
    useCardsManagementStore.setState({
      selectCategory: category,
    })
  });

  const onClickTag = useMemoizedFn((tag: string) => {
    useCardsManagementStore.setState({
      activeCardTag: tag === activeCardTag ? '' : tag
    })
  });

  const getSettings = (cardId: number) => {
    return [{
      title: '删除卡片',
      onClick: onDeleteCard,
    }, {
      title: '导出 Markdown',
      onClick: () => {
        const card = cards.find((card) => card.id === cardId);
        if (!card) return;
        const markdown = getMarkdown(card.content);
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${cardId}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }
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
                    className={classnames(styles.categoryItem, { [styles.disable]: category === selectCategory })}
                    onClick={async (event) => {
                      if (category === selectCategory) return;
                      const toUpdateCard = filteredCards.find((card) => card.id === cardId);
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(handleResize);

    observer.observe(container);

    return () => {
      observer.disconnect();
    }
  }, [handleResize]);

  useEffect(() => {
    onSearchTags(filteredCards, keywords);
  }, [keywords, onSearchTags, filteredCards]);

  return (
    <div className={styles.queryContainer}>
      <div
        className={
          classnames(
            styles.container,
            {
              [styles.showEdit]: isShowEdit,
              [styles.hideCardTree]: hideCardTree
            }
          )
        }>
        <div className={styles.list}>
          <div className={styles.select}>
            {
              hideCardTree && (
                <Tooltip
                  trigger={'hover'}
                  title={'展开标签树'}
                  placement='bottom'
                >
                  <div className={styles.showCardTreeIcon} onClick={() => setHideCardTree(false)}>
                    <MenuUnfoldOutlined />
                  </div>
                </Tooltip>
              )
            }
            <SearchTag
              ref={inputRef}
              searchValue={searchValue}
              tags={keywords}
              onDeleteTag={handleDeleteKeyword}
              onSearchValueChange={handleValueChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onSearch={handleAddKeyword}
              style={{
                height: 40
              }}
            />
            <Select
              value={selectCategory}
              options={Object.keys(cardCategoryName).map((key) => ({
                label: cardCategoryName[key as ECardCategory],
                value: key,
              }))}
              onChange={onSelectCategoryChange}
              style={{
                marginLeft: 20,
                height: 40
              }}
            ></Select>
          </div>
          <div className={styles.cards}>
            <div className={styles.cardTree}>
              <div className={styles.header}>
                <div className={styles.title}>标签树</div>
                <Tooltip
                  trigger={'hover'}
                  title={'收起标签树'}
                  placement='top'
                >
                  <div className={styles.icon} onClick={() => setHideCardTree(true)}>
                    <MenuFoldOutlined />
                  </div>
                </Tooltip>
              </div>
              <For
                data={cardTree}
                renderItem={card => (
                  <TagItem
                    key={card.tag}
                    item={card}
                    onClickTag={onClickTag}
                    activeTag={activeCardTag}
                  />
                )}
              />
            </div>
            <div
              ref={containerRef}
              className={styles.cardGridContainer}
              style={{ gap: GAP }}
            >
              <LoadMoreComponent
                onLoadMore={loadMore}
                showLoader={cardsCount < searchCards.length}
              >
                <For
                  data={sliceCards}
                  renderItem={card => (
                    <CardItem2
                      key={card.id}
                      card={card}
                      className={styles.item}
                      style={{ width: itemWidth }}
                      active={leftCardIds.includes(card.id) || rightCardIds.includes(card.id)}
                      showTags
                      showTime
                      maxRows={3}
                      settings={getSettings(card.id)}
                      onClick={(e) => {
                        if (e.ctrlKey) {
                          onCtrlClickCard(card.id)
                        } else {
                          onClickCard(card.id)
                        }
                      }}
                    />
                  )}
                />
              </LoadMoreComponent>
            </div>
          </div>
        </div>
        <div className={styles.edit}>
          <Card />
        </div>
      </div>
      <FloatButton
        icon={<PlusOutlined />}
        tooltip={'新建卡片'}
        onClick={onCreateCard}
      />
    </div>
  )
}

export default CardContainer;
