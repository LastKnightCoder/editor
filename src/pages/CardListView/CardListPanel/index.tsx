import { useRef, forwardRef, useImperativeHandle } from "react";
import { ICard, ECardCategory, ICreateCard } from "@/types";
import VirtualCardList, { VirtualCardListRef } from "../VistualCardList";
import styles from "./index.module.less";
import { useMemoizedFn } from "ahooks";

export interface CardListPanelRef {
  scrollToTop: () => void;
}

interface CardListPanelProps {
  cards: ICard[];
  selectCategory: ECardCategory;
  onSelectCategoryChange: (category: ECardCategory) => void;
  onCreateCard: (card: ICreateCard) => Promise<void>;
  onImportMarkdown: () => Promise<void>;
  onCardClick?: (card: ICard) => void;
  onDeleteCard?: (cardId: number) => Promise<void>;
  onUpdateCardCategory?: (
    card: ICard,
    category: ECardCategory,
  ) => Promise<void>;
  onToggleCardTop: (cardId: number) => Promise<void>;
  onShowScrollToTop: (show: boolean) => void;
  onPresentationMode: (card: ICard) => void;
}

const CardListPanel = forwardRef<CardListPanelRef, CardListPanelProps>(
  (
    {
      cards,
      onCardClick,
      onDeleteCard,
      onUpdateCardCategory,
      onToggleCardTop,
      onShowScrollToTop,
      onPresentationMode,
    },
    ref,
  ) => {
    const virtualListRef = useRef<VirtualCardListRef>(null);

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      scrollToTop: () => {
        virtualListRef.current?.scrollToTop();
      },
    }));

    const handleScroll = useMemoizedFn((scrollTop: number) => {
      if (scrollTop > 100) {
        onShowScrollToTop(true);
      } else {
        onShowScrollToTop(false);
      }
    });

    return (
      <div className={styles.cardContainer}>
        <div className={styles.cardList}>
          <VirtualCardList
            ref={virtualListRef}
            cards={cards}
            onScroll={handleScroll}
            onPresentationMode={onPresentationMode}
            onCardClick={onCardClick}
            onDeleteCard={onDeleteCard}
            onUpdateCardCategory={onUpdateCardCategory}
            onToggleCardTop={onToggleCardTop}
          />
        </div>
      </div>
    );
  },
);

CardListPanel.displayName = "CardListPanel";

export { CardListPanel };
export default CardListPanel;
