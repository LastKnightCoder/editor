import { useMemo, useState } from "react";
import useCardManagement from "@/hooks/useCardManagement";
import useCardsManagementStore from "@/stores/useCardsManagementStore";
import { useMemoizedFn } from "ahooks";
import { ECardCategory } from "@/types";

const useCard = () => {
  const [activeCardTag, setActiveCardTag] = useState('');

  const {
    leftCardIds,
    rightCardIds,
    leftActiveCardId,
    rightActiveCardId,
    onCreateCard,
    onDeleteCard,
    onClickCard,
    onCtrlClickCard,
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
  });

  const onActiveCardTagChange = useMemoizedFn((tag: string) => {
    setActiveCardTag(tag);
  });

  const filteredCards = useMemo(() => {
    const cardWithCategory = cards.filter((card) => {
      return card.category === selectCategory;
    });

    if (!activeCardTag) return cardWithCategory;
    return cardWithCategory.filter((card) => card.tags.some(tag => tag.startsWith(activeCardTag)));
  }, [activeCardTag, cards, selectCategory]);

  return {
    activeCardTag,
    selectCategory,
    leftCardIds,
    rightCardIds,
    leftActiveCardId,
    rightActiveCardId,
    onCreateCard,
    onDeleteCard,
    onClickCard,
    onCtrlClickCard,
    onClickTab,
    onCloseTab,
    onMoveCard,
    onCloseOtherTabs,
    onSelectCategoryChange,
    onActiveCardTagChange,
    filteredCards,
    updateCard,
  }
}

export default useCard;