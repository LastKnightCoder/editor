import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { NotebookPen } from "lucide-react";
import type { CardsOverviewResponse, CardsQueryState } from "../../types";
import CardItem from "./CardItem";

type CardsPageProps = {
  cards: CardsOverviewResponse | null;
  queryState: CardsQueryState;
  totalPages: number;
  isLoadingCards: boolean;
  isPreviewOpen: boolean;
  onPreviewCard: (cardId: number) => void;
  setQueryState: Dispatch<SetStateAction<CardsQueryState>>;
  refreshCards: (overrides?: Partial<CardsQueryState>) => Promise<CardsOverviewResponse | null>;
  /** 列表所在的滚动容器（首页 screen-scroll） */
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  /** 滚动容器的内容包裹层：其尺寸变化（仪表盘加载/模块开关）时重测列表偏移 */
  scrollContentRef?: RefObject<HTMLDivElement | null>;
};

const CARD_ESTIMATE_SIZE = 220;
const LOAD_SENTINEL_SIZE = 72;
const LOAD_MORE_THRESHOLD = 3;

export function CardsPage(props: CardsPageProps) {
  const items = props.cards?.items ?? [];
  const hasMore = props.queryState.page < props.totalPages;
  const listCount = items.length + (hasMore ? 1 : 0);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingPageRef = useRef<number | null>(null);
  const previewOpenRef = useRef(props.isPreviewOpen);
  const queryKeyRef = useRef(props.queryState.query);
  const [scrollMargin, setScrollMargin] = useState(0);

  // scrollMargin = 列表顶部相对滚动容器内容顶部的距离（虚拟化坐标系原点）
  const measureScrollMargin = useCallback((): number | null => {
    const element = listRef.current;
    const scroller = props.scrollContainerRef.current;
    if (!element || !scroller) return null;
    return (
      element.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop
    );
  }, [props.scrollContainerRef]);

  const applyScrollMargin = useCallback(() => {
    const nextMargin = measureScrollMargin();
    if (nextMargin == null) return;
    setScrollMargin(prev => (Math.abs(prev - nextMargin) > 1 ? nextMargin : prev));
  }, [measureScrollMargin]);

  const virtualizer = useVirtualizer({
    count: listCount,
    getScrollElement: () => props.scrollContainerRef.current,
    estimateSize: index =>
      hasMore && index === items.length ? LOAD_SENTINEL_SIZE : CARD_ESTIMATE_SIZE,
    overscan: 6,
    scrollMargin,
    getItemKey: index => (index < items.length ? items[index].id : "load-more-sentinel"),
  });

  const virtualItems = virtualizer.getVirtualItems();
  const lastVisibleIndex =
    virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : -1;

  useEffect(() => {
    applyScrollMargin();

    window.addEventListener("resize", applyScrollMargin);
    window.addEventListener("orientationchange", applyScrollMargin);
    // 内容层高度变化（Bento 统计异步加载、模块开关）会移动列表顶部的绝对位置，
    // 观察 body 无效（首页内容在 fixed 层内不撑 body 盒），必须观察内容包裹层本身
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(applyScrollMargin);
    if (observer && props.scrollContentRef?.current) {
      observer.observe(props.scrollContentRef.current);
    }

    return () => {
      window.removeEventListener("resize", applyScrollMargin);
      window.removeEventListener("orientationchange", applyScrollMargin);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyScrollMargin();
  }, [applyScrollMargin, listCount, props.isLoadingCards]);

  useEffect(() => {
    const wasPreviewOpen = previewOpenRef.current;
    previewOpenRef.current = props.isPreviewOpen;
    if (!wasPreviewOpen || props.isPreviewOpen) return;

    let frameA: number | null = null;
    let frameB: number | null = null;

    frameA = window.requestAnimationFrame(() => {
      frameB = window.requestAnimationFrame(() => {
        applyScrollMargin();
      });
    });

    return () => {
      if (frameA !== null) {
        window.cancelAnimationFrame(frameA);
      }
      if (frameB !== null) {
        window.cancelAnimationFrame(frameB);
      }
    };
  }, [applyScrollMargin, props.isPreviewOpen]);

  useEffect(() => {
    const queryKey = props.queryState.query;
    if (queryKeyRef.current !== queryKey) {
      queryKeyRef.current = queryKey;
      pendingPageRef.current = null;
    }
  }, [props.queryState.query]);

  useEffect(() => {
    if (pendingPageRef.current !== null && props.queryState.page >= pendingPageRef.current) {
      pendingPageRef.current = null;
    }
    if (!hasMore) {
      pendingPageRef.current = null;
    }
  }, [hasMore, props.queryState.page]);

  useEffect(() => {
    if (!hasMore || props.isLoadingCards || items.length === 0) return;
    if (lastVisibleIndex < items.length - LOAD_MORE_THRESHOLD) return;

    const nextPage = props.queryState.page + 1;
    if (pendingPageRef.current === nextPage) return;

    pendingPageRef.current = nextPage;
    void props
      .refreshCards({
        page: nextPage,
      })
      .finally(() => {
        if (pendingPageRef.current === nextPage) {
          pendingPageRef.current = null;
        }
      });
  }, [
    hasMore,
    items.length,
    lastVisibleIndex,
    props.isLoadingCards,
    props.queryState.page,
    props.refreshCards,
  ]);

  return (
    <section>
      {props.isLoadingCards && !props.cards?.items.length ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-4">
              <div className="bg-page h-4 w-16 animate-pulse rounded-full" />
              <div className="bg-page mt-3 h-4 w-full animate-pulse rounded" />
              <div className="bg-page mt-2 h-4 w-2/3 animate-pulse rounded" />
              <div className="bg-page mt-3 h-3 w-24 animate-pulse rounded-full" />
            </div>
          ))}
        </div>
      ) : items.length ? (
        <>
          <div
            ref={listRef}
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualItems.map(virtualItem => {
              const isLoadSentinel = hasMore && virtualItem.index === items.length;
              if (isLoadSentinel) {
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start - scrollMargin}px)`,
                    }}
                  >
                    <div className="py-4 text-center">
                      {props.isLoadingCards ? (
                        <div className="flex items-center justify-center gap-2">
                          <div className="border-accent h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
                          <span className="text-ink-3 text-sm">加载中...</span>
                        </div>
                      ) : (
                        <span className="text-ink-3 text-xs">继续下滑加载更多</span>
                      )}
                    </div>
                  </div>
                );
              }

              const item = items[virtualItem.index];
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  className="pb-3"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start - scrollMargin}px)`,
                    boxSizing: "border-box",
                  }}
                >
                  <CardItem item={item} onPreviewCard={props.onPreviewCard} />
                </div>
              );
            })}
          </div>

          {!hasMore && (
            <p className="text-ink-3 py-4 text-center text-xs">
              已加载全部 {props.cards?.total ?? 0} 条卡片
            </p>
          )}
        </>
      ) : (
        <div className="py-20 text-center">
          <NotebookPen size={44} className="text-ink-3 mx-auto" aria-hidden="true" />
          <p className="text-ink-2 mt-4 text-[14px] font-medium">还没有卡片</p>
          <p className="text-ink-3 mt-1 text-sm">点击下方 + 按钮创建第一张卡片</p>
        </div>
      )}
    </section>
  );
}
