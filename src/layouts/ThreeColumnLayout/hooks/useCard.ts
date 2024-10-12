import { useMemo } from "react";
import useCardManagement from "@/hooks/useCardManagement";
import useCardsManagementStore from "@/stores/useCardsManagementStore";
import { useMemoizedFn } from "ahooks";
import { ECardCategory } from "@/types";

const useCard = () => {
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

  const { cards, selectCategory, updateCard, activeCardTag } = useCardsManagementStore((state) => ({
    cards: state.cards,
    selectCategory: state.selectCategory,
    activeCardTag: state.activeCardTag,
    updateCard: state.updateCard,
  }));

  const onSelectCategoryChange = useMemoizedFn((category: ECardCategory) => {
    useCardsManagementStore.setState({
      selectCategory: category,
    })
  });

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
    filteredCards,
    updateCard,
  }
}

export default useCard;