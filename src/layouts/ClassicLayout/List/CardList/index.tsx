import { memo, useEffect, useState } from "react";
import { Popover, Select } from "antd";
import classnames from "classnames";

import CardItem from '@/components/CardItem2'
import For from "@/components/For";
import LoadMoreComponent from "@/components/LoadMoreComponent";
import SearchTag from "@/components/SearchTag";
import useSearchKeywords from "@/hooks/useSearchKeywords.ts";
import { cardCategoryName } from "@/constants";
import { ICard, ECardCategory, IUpdateCard } from "@/types";

import styles from './index.module.less';
import { useMemoizedFn } from "ahooks";

interface ICardProps {
  cards: ICard[];
  activeCardIds: number[];
  onClickCard: (id: number) => void;
  onDeleteCard: (id: number) => Promise<void>;
  updateCard: (card: IUpdateCard) => Promise<number>;
  selectCategory: ECardCategory;
  onSelectCategoryChange: (category: ECardCategory) => void;
  onCtrlClickCard: (id: number) => void;
}

const CardList = memo((props: ICardProps) => {
  const {
    cards,
    onClickCard,
    onDeleteCard,
    updateCard,
    activeCardIds,
    selectCategory,
    onSelectCategoryChange,
    onCtrlClickCard
  } = props;

  const [cardsCount, setCardsCount] = useState<number>(10);
  const [searchCards, setSearchCards] = useState<ICard[]>(cards);
  const sliceCards = searchCards.slice(0, cardsCount);
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

  const onSearchTags = useMemoizedFn((cards: ICard[], keywords: string[]) => {
    if (keywords.length === 0) {
      setSearchCards(cards);
      setCardsCount(10);
      return;
    }
    const filteredCards = cards.filter((card) => {
      return keywords.every((keyword) => {
        const allTags = card.tags.map(tag => tag.split('/')).flat(Infinity);
        return allTags.includes(keyword);
      });
    });
    setSearchCards(filteredCards);
    setCardsCount(10);
  });

  useEffect(() => {
    onSearchTags(cards, keywords);
  }, [keywords, onSearchTags, cards]);

  const loadMore = async () => {
    setCardsCount(Math.min(cardsCount + 10, searchCards.length));
  }

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
                    className={classnames(styles.categoryItem, { [styles.disable]: category === selectCategory })}
                    onClick={async (event) => {
                      if (category === selectCategory) return;
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
    <div className={styles.listContainer}>
      <div className={styles.header}>
        <div className={styles.select}>
          <Select
            value={selectCategory}
            options={Object.keys(cardCategoryName).map((key) => ({
              label: cardCategoryName[key as ECardCategory],
              value: key,
            }))}
            onChange={onSelectCategoryChange}
          ></Select>
        </div>
        <SearchTag
          ref={inputRef}
          searchValue={searchValue}
          tags={keywords}
          onDeleteTag={handleDeleteKeyword}
          onSearchValueChange={handleValueChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onSearch={handleAddKeyword}
        />
      </div>
      <div className={styles.list}>
        <LoadMoreComponent onLoadMore={loadMore} showLoader={cardsCount < searchCards.length}>
          <For data={sliceCards} renderItem={(card) => {
            return (
              <CardItem
                key={card.id}
                card={card}
                onClick={(e) => {
                  // 是否按下了 mod 或 ctrl 键
                  if (e.ctrlKey || e.metaKey) {
                    onCtrlClickCard(card.id);
                  } else {
                    onClickCard(card.id);
                  }
                }}
                active={activeCardIds.includes(card.id)}
                showTags
                showTime
                showLine={false}
                settings={getSettings(card.id)}
              />
            )
          }} />
        </LoadMoreComponent>
      </div>
    </div>
  )
})

export default CardList;
