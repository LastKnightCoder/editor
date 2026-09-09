import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { NotebookPen } from "lucide-react";
import type { CardsOverviewResponse, CardsQueryState } from "../../types";
import CardItem from "./CardItem";
import type { KnownCardCategory } from "./cardCategory";

type CardsPageProps = {
  cards: CardsOverviewResponse | null;
  queryState: CardsQueryState;
  totalPages: number;
  isLoadingCards: boolean;
  isPreviewOpen: boolean;
  onPreviewCard: (cardId: number) => void;
  onUpdateCardCategory: (cardId: number, category: KnownCardCategory) => Promise<void>;
  onDeleteCard: (cardId: number) => Promise<void>;
  setQueryState: Dispatch<SetStateAction<CardsQueryState>>;
  refreshCards: (overrides?: Partial<CardsQueryState>) => Promise<CardsOverviewResponse | null>;
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
  const queryKeyRef = useRef(`${props.queryState.query}::${props.queryState.category}`);
  const [scrollMargin, setScrollMargin] = useState(0);

  const virtualizer = useWindowVirtualizer({
    count: listCount,
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
    const updateScrollMargin = () => {
      const element = listRef.current;
      if (!element) return;
      const bodyTop = document.body.getBoundingClientRect().top;
      const nextMargin = element.getBoundingClientRect().top - bodyTop;
      setScrollMargin(prev => (Math.abs(prev - nextMargin) > 1 ? nextMargin : prev));
    };

    updateScrollMargin();

    window.addEventListener("resize", updateScrollMargin);
    window.addEventListener("orientationchange", updateScrollMargin);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScrollMargin);
    if (observer) {
      observer.observe(document.body);
    }

    return () => {
      window.removeEventListener("resize", updateScrollMargin);
      window.removeEventListener("orientationchange", updateScrollMargin);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const bodyTop = document.body.getBoundingClientRect().top;
    const nextMargin = element.getBoundingClientRect().top - bodyTop;
    setScrollMargin(prev => (Math.abs(prev - nextMargin) > 1 ? nextMargin : prev));
  }, [listCount, props.isLoadingCards]);

  useEffect(() => {
    const wasPreviewOpen = previewOpenRef.current;
    previewOpenRef.current = props.isPreviewOpen;
    if (!wasPreviewOpen || props.isPreviewOpen) return;

    let frameA: number | null = null;
    let frameB: number | null = null;

    frameA = window.requestAnimationFrame(() => {
      frameB = window.requestAnimationFrame(() => {
        const element = listRef.current;
        if (!element) return;
        const bodyTop = document.body.getBoundingClientRect().top;
        const nextMargin = element.getBoundingClientRect().top - bodyTop;
        setScrollMargin(prev => (Math.abs(prev - nextMargin) > 1 ? nextMargin : prev));
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
  }, [props.isPreviewOpen]);

  useEffect(() => {
    const queryKey = `${props.queryState.query}::${props.queryState.category}`;
    if (queryKeyRef.current !== queryKey) {
      queryKeyRef.current = queryKey;
      pendingPageRef.current = null;
    }
  }, [props.queryState.category, props.queryState.query]);

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
    <section className="pb-24">
      {props.isLoadingCards && !props.cards?.items.length ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-4">
              <div className="h-5 w-3/4 animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
              <div className="mt-3 h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
              <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
              <div className="mt-3 h-3 w-24 animate-pulse rounded bg-gray-100 dark:bg-zinc-800" />
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
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                          <span className="text-sm text-gray-400 dark:text-gray-500">
                            加载中...
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300 dark:text-gray-600">
                          继续下滑加载更多
                        </span>
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
                  <CardItem
                    item={item}
                    onPreviewCard={props.onPreviewCard}
                    onUpdateCardCategory={props.onUpdateCardCategory}
                    onDeleteCard={props.onDeleteCard}
                  />
                </div>
              );
            })}
          </div>

          {!hasMore && (
            <p className="py-4 text-center text-xs text-gray-400 dark:text-gray-500">
              已加载全部 {props.cards?.total ?? 0} 条卡片
            </p>
          )}
        </>
      ) : (
        <div className="py-20 text-center">
          <NotebookPen
            size={44}
            className="mx-auto text-gray-400 dark:text-gray-500"
            aria-hidden="true"
          />
          <p className="mt-4 text-base text-gray-500 dark:text-gray-400">还没有卡片</p>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            点击下方 + 按钮创建第一张卡片
          </p>
        </div>
      )}
    </section>
  );
}
