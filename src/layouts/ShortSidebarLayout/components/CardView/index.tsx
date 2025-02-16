import { useMemo, useRef, useState } from 'react';
import classnames from 'classnames';
import { Empty, Select } from 'antd';
import { useMemoizedFn } from 'ahooks';

import For from '@/components/For';
import LoadMoreComponent from '@/components/LoadMoreComponent';
import TagItem from '@/components/TagItem';
import { PlusOutlined } from '@ant-design/icons';
import CardItem from './CardItem';
import Card from '../../../ThreeColumnLayout/Content/Card';

import useCardsManagementStore from '@/stores/useCardsManagementStore';
import useCardPanelStore from '@/stores/useCardPanelStore';
import useCardTree from '@/hooks/useCardTree';
import { ECardCategory, ICreateCard } from '@/types';
import { cardCategoryName } from "@/constants";
import CreateCard from './CreateCard';

import styles from './index.module.less';
import { Descendant } from "slate";
import If from "@/components/If";

const CardContainer = () => {
  const { cardTree } = useCardTree();
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const { 
    cards, 
    selectCategory, 
    activeCardTag,
    createCard,
  } = useCardsManagementStore(state => ({
    cards: state.cards,
    selectCategory: state.selectCategory,
    activeCardTag: state.activeCardTag,
    createCard: state.createCard,
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

  const [cardsCount, setCardsCount] = useState<number>(5);

  const sliceCards = filteredCards.slice(0, cardsCount);

  const { leftCardIds, rightCardIds } = useCardPanelStore(state => ({
    leftCardIds: state.leftCardIds,
    rightCardIds: state.rightCardIds,
  }));

  const isShowEdit = useMemo(() => {
    return leftCardIds.length > 0 || rightCardIds.length > 0;
  }, [leftCardIds, rightCardIds]);
  
  const onSaveCard = useMemoizedFn(async (content: Descendant[], tags: string[]) => {
    const card: ICreateCard = {
      content,
      tags,
      links: [],
      category: selectCategory,
      count: 0,
    }
    await createCard(card);
    setIsCreatingCard(false);
  });

  const loadMore = useMemoizedFn(async () => {
    setCardsCount(Math.min(cardsCount + 5, filteredCards.length));
  });

  const onSelectCategoryChange = useMemoizedFn((category: ECardCategory) => {
    useCardsManagementStore.setState({
      selectCategory: category,
    })
  });

  const onClickTag = useMemoizedFn((tag: string) => {
    useCardsManagementStore.setState({
      activeCardTag: tag === activeCardTag ? '' : tag
    });
    listRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
    setCardsCount(5)
  });

  return (
    <div className={styles.queryContainer}>
      <div
        className={
          classnames(
            styles.container,
            {
              [styles.showEdit]: isShowEdit,
            }
          )
        }>
        <div className={styles.list}>
          <div className={styles.cards}>
            <div className={styles.cardTree}>
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
            <div className={styles.cardContainer}>
              <div className={styles.cardList}>
                <div className={styles.header}>
                  <div className={styles.left}>
                    <div className={styles.title}>卡片</div>
                    <Select
                      value={selectCategory}
                      options={Object.keys(cardCategoryName).map((key) => ({
                        label: cardCategoryName[key as ECardCategory],
                        value: key,
                      }))}
                      onChange={onSelectCategoryChange}
                    />
                  </div>
                  <div
                    className={styles.addCard}
                    onClick={() => {
                      setIsCreatingCard(true);
                    }}
                  >
                    <PlusOutlined />
                  </div>
                </div>
                {
                  isCreatingCard && (
                    <CreateCard
                      className={styles.createCard}
                      onSave={onSaveCard}
                      onCancel={() => {
                        setIsCreatingCard(false);
                      }}
                    />
                  )
                }
                <div className={styles.list} ref={listRef}>
                  <If condition={filteredCards.length === 0}>
                    <Empty description={'暂无卡片'} />
                  </If>
                  <If condition={filteredCards.length > 0}>
                    <LoadMoreComponent
                      onLoadMore={loadMore}
                      showLoader={cardsCount < filteredCards.length}
                    >
                      <For
                        data={sliceCards}
                        renderItem={card => (
                          <CardItem
                            key={card.id}
                            card={card}
                          />
                        )}
                      />
                    </LoadMoreComponent>
                  </If>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.edit}>
          <Card />
        </div>
      </div>
    </div>
  )
}

export default CardContainer;
