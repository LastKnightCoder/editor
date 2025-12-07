import { useRef, forwardRef, useImperativeHandle } from "react";
import { ICard, ECardCategory } from "@/types";
import VirtualCardList, { VirtualCardListRef } from "./VistualCardList";
import { useMemoizedFn } from "ahooks";

export interface CardListPanelRef {
  scrollToTop: () => void;
}

interface CardListPanelProps {
  cards: ICard[];
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
      <div className="flex-1 min-w-0 relative overflow-hidden">
        <div className="px-10 pb-5 h-full max-w-[800px] mx-auto overflow-auto">
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
