import { useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Empty } from "antd";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useThrottleFn, useMemoizedFn } from "ahooks";
import If from "@/components/If";
import CardItem from "../CardItem";
import { ICard, ECardCategory } from "@/types";
import styles from "./index.module.less";

export interface VirtualCardListRef {
  scrollToTop: () => void;
}

interface VirtualCardListProps {
  cards: ICard[];
  onScroll?: (scrollTop: number) => void;
  onPresentationMode: () => void;
  onExitPresentationMode: () => void;
  onCardClick?: (cardId: number) => void;
  onDeleteCard?: (cardId: number) => Promise<void>;
  onUpdateCardCategory?: (
    card: ICard,
    category: ECardCategory,
  ) => Promise<void>;
}

const VirtualCardList = forwardRef<VirtualCardListRef, VirtualCardListProps>(
  (
    {
      cards,
      onScroll,
      onPresentationMode,
      onExitPresentationMode,
      onCardClick,
      onDeleteCard,
      onUpdateCardCategory,
    },
    ref,
  ) => {
    const listRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
      count: cards.length,
      getScrollElement: () => listRef.current,
      estimateSize: () => 350, // 调整预估卡片高度，包含边距
      overscan: 5, // 预加载的项目数量
      // 获取实际元素的尺寸，支持动态高度
      getItemKey: (index) => cards[index].id,
      // 确保只有可见的卡片被渲染和测量
      measureElement: (el) => {
        const card = el.firstElementChild;
        if (!card) return 350; // 默认高度
        // 包括元素自身和边距的高度
        return el.getBoundingClientRect().height;
      },
    });

    const scrollToTop = useMemoizedFn(() => {
      // 使用虚拟滚动的方式滚动到顶部
      virtualizer.scrollToIndex(0);
    });

    // 向父组件暴露方法
    useImperativeHandle(ref, () => ({
      scrollToTop,
    }));

    // 使用 throttle 优化滚动事件处理
    const { run: throttledCheckScroll } = useThrottleFn(
      () => {
        const scrollElement = listRef.current;
        if (!scrollElement) return;
        const { scrollTop } = scrollElement;
        onScroll?.(scrollTop);
      },
      { wait: 100 },
    );

    // 监听滚动事件
    useEffect(() => {
      const scrollElement = listRef.current;
      if (!scrollElement) return;

      scrollElement.addEventListener("scroll", throttledCheckScroll);
      return () => {
        scrollElement.removeEventListener("scroll", throttledCheckScroll);
      };
    }, []);

    const handleCardClick = useMemoizedFn((cardId: number) => {
      onCardClick?.(cardId);
    });

    return (
      <div className={styles.list} ref={listRef}>
        <If condition={cards.length === 0}>
          <Empty description={"暂无卡片"} />
        </If>
        <If condition={cards.length > 0}>
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const card = cards[virtualItem.index];
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                    padding: "10px 0", // 添加上下间距
                  }}
                >
                  <CardItem
                    card={card}
                    onPresentationMode={onPresentationMode}
                    onExitPresentationMode={onExitPresentationMode}
                    onCardClick={handleCardClick}
                    onDeleteCard={onDeleteCard}
                    onUpdateCardCategory={onUpdateCardCategory}
                  />
                </div>
              );
            })}
          </div>
        </If>
      </div>
    );
  },
);

VirtualCardList.displayName = "VirtualCardList";

export { VirtualCardList, type VirtualCardListProps };
export default VirtualCardList;
