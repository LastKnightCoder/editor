import { memo, useMemo } from "react";
import { Routes, Route } from "react-router-dom";

import Sidebar from './Sidebar';
import Titlebar from "./Titlebar";
import CardList from './List/Card';
import CardContent from './Content/Card';

import useCardsManagementStore from "@/stores/useCardsManagementStore";

import styles from './index.module.less';
import useCardManagement from "@/hooks/useCardManagement";
import { ECardCategory } from "@/types";
import { useMemoizedFn } from "ahooks";


const ClassicLayout = memo(() => {
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
    onCloseOtherTabs,
  } = useCardManagement();

  const { cards, selectCategory, updateCard } = useCardsManagementStore((state) => ({
    cards: state.cards,
    selectCategory: state.selectCategory,
    updateCard: state.updateCard,
  }));

  const onSelectCategoryChange = useMemoizedFn((category: ECardCategory) => {
    useCardsManagementStore.setState({
      selectCategory: category,
    })
  })

  const cardsWithCategory = useMemo(() => {
    return cards.filter((card) => {
      return card.category === selectCategory;
    })
  }, [cards, selectCategory]);

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <Sidebar />
      </div>
      <div className={styles.list}>
        <Routes>
          <Route path="/" element={(
            <CardList
              activeCardIds={[leftActiveCardId, rightActiveCardId].filter(Boolean) as number[]}
              onClickCard={onClickCard}
              onCreateCard={onCreateCard}
              onDeleteCard={onDeleteCard}
              updateCard={updateCard}
              cards={cardsWithCategory}
              selectCategory={selectCategory}
              onSelectCategoryChange={onSelectCategoryChange}
            />
          )} />
        </Routes>
      </div>
      <div className={styles.contentArea}>
        <div className={styles.titleBar}>
          <Titlebar />
        </div>
        <div className={styles.content}>
          <Routes>
            <Route path="/" element={(
              <CardContent
                leftCardIds={leftCardIds}
                rightCardIds={rightCardIds}
                leftActiveCardId={leftActiveCardId}
                rightActiveCardId={rightActiveCardId}
                onClickCard={onClickCard}
                onClickTab={onClickTab}
                onCloseTab={onCloseTab}
                onMoveCard={onMoveCard}
                onCloseOtherTabs={onCloseOtherTabs}
              />
            )} />
          </Routes>
        </div>
      </div>
    </div>
  )
});

export default ClassicLayout;