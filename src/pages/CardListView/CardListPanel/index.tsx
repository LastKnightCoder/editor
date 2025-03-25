import { useState, useRef, forwardRef, useImperativeHandle } from "react";
import { FloatButton } from "antd";
import { UpOutlined } from "@ant-design/icons";
import If from "@/components/If";
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
  onScrollToTop?: () => void; // 通知父组件已经回到顶部，可用于同步其他组件
  onCardClick?: (cardId: number) => void; // 卡片点击事件回调
  onDeleteCard?: (cardId: number) => Promise<void>;
  onUpdateCardCategory?: (
    card: ICard,
    category: ECardCategory,
  ) => Promise<void>;
}

const CardListPanel = forwardRef<CardListPanelRef, CardListPanelProps>(
  (
    { cards, onScrollToTop, onCardClick, onDeleteCard, onUpdateCardCategory },
    ref,
  ) => {
    const [showScrollToTop, setShowScrollToTop] = useState(false);
    const [isPresentation, setIsPresentation] = useState(false);
    const virtualListRef = useRef<VirtualCardListRef>(null);

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      scrollToTop: () => {
        virtualListRef.current?.scrollToTop();
      },
    }));

    const handleScroll = useMemoizedFn((scrollTop: number) => {
      if (scrollTop > 100) {
        setShowScrollToTop(true);
      } else {
        setShowScrollToTop(false);
      }
    });

    const handlePresentationMode = useMemoizedFn(() => {
      setIsPresentation(true);
    });

    const handleExitPresentationMode = useMemoizedFn(() => {
      setIsPresentation(false);
    });

    const handleScrollToTop = useMemoizedFn(() => {
      virtualListRef.current?.scrollToTop();
      onScrollToTop?.();
    });

    const handleCardClick = useMemoizedFn((cardId: number) => {
      onCardClick?.(cardId);
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
          <If condition={showScrollToTop && !isPresentation}>
            <FloatButton
              className={styles.floatButton}
              icon={<UpOutlined />}
              tooltip={"回到顶部"}
              onClick={handleScrollToTop}
            />
          </If>
        </div>
      </div>
    );
  },
);

CardListPanel.displayName = "CardListPanel";

export { CardListPanel };
export default CardListPanel;
