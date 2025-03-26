import { useRef, forwardRef, useImperativeHandle } from "react";
import { ICard, ECardCategory, ICreateCard } from "@/types";
import VirtualCardList, { VirtualCardListRef } from "../VistualCardList";
import styles from "./index.module.less";
import { useMemoizedFn } from "ahooks";
import useCardsManagementStore from "@/stores/useCardsManagementStore";

export interface CardListPanelRef {
  scrollToTop: () => void;
}

interface CardListPanelProps {
  cards: ICard[];
  selectCategory: ECardCategory;
  onSelectCategoryChange: (category: ECardCategory) => void;
  onCreateCard: (card: ICreateCard) => Promise<void>;
  onImportMarkdown: () => Promise<void>;
  onScrollToTop?: () => void; // 通知父组件已经回到顶部，可用于同步其他组件
  onCardClick?: (card: ICard) => void; // 卡片点击事件回调
  onDeleteCard?: (cardId: number) => Promise<void>;
  onUpdateCardCategory?: (
    card: ICard,
    category: ECardCategory,
  ) => Promise<void>;
}

const CardListPanel = forwardRef<CardListPanelRef, CardListPanelProps>(
  ({ cards, onCardClick, onDeleteCard, onUpdateCardCategory }, ref) => {
    const virtualListRef = useRef<VirtualCardListRef>(null);

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      scrollToTop: () => {
        virtualListRef.current?.scrollToTop();
      },
    }));

    const handleScroll = useMemoizedFn((scrollTop: number) => {
      if (scrollTop > 100) {
        useCardsManagementStore.setState({
          showScrollToTop: true,
        });
      } else {
        useCardsManagementStore.setState({
          showScrollToTop: false,
        });
      }
    });

    const handlePresentationMode = useMemoizedFn(() => {
      useCardsManagementStore.setState({
        isPresentation: true,
      });
    });

    const handleExitPresentationMode = useMemoizedFn(() => {
      useCardsManagementStore.setState({
        isPresentation: false,
      });
    });

    const handleCardClick = useMemoizedFn((card: ICard) => {
      onCardClick?.(card);
    });

    return (
      <div className={styles.cardContainer}>
        <div className={styles.cardList}>
          <VirtualCardList
            ref={virtualListRef}
            cards={cards}
            onScroll={handleScroll}
            onPresentationMode={handlePresentationMode}
            onExitPresentationMode={handleExitPresentationMode}
            onCardClick={handleCardClick}
            onDeleteCard={onDeleteCard}
            onUpdateCardCategory={onUpdateCardCategory}
          />
        </div>
      </div>
    );
  },
);

CardListPanel.displayName = "CardListPanel";

export { CardListPanel };
export default CardListPanel;
