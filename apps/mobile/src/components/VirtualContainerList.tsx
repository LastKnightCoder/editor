import { useEffect, useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEdgeFade } from "../hooks/useScrollState";

type VirtualContainerListProps<T extends { id: number }> = {
  items: T[];
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => Promise<unknown>;
  estimateSize?: number;
  className?: string;
  /** 顶部边缘渐隐随滚动状态显隐（列表贴顶时无渐隐带） */
  edgeFade?: boolean;
  renderItem: (item: T, index: number) => ReactNode;
};

export function VirtualContainerList<T extends { id: number }>({
  items,
  hasNextPage = false,
  isFetchingNextPage = false,
  fetchNextPage,
  estimateSize = 108,
  className,
  edgeFade = false,
  renderItem,
}: VirtualContainerListProps<T>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEdgeFade(scrollRef, edgeFade ? { bottom: false } : { top: false, bottom: false });
  const virtualizer = useVirtualizer({
    count: items.length + (hasNextPage ? 1 : 0),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    getItemKey: index => items[index]?.id ?? "load-more",
    overscan: 5,
  });

  // 虚拟项须在 render 期取：滚动只触发 virtualizer 内部 rerender，实例引用始终不变，
  // 若在 effect 内取值再依赖 virtualizer，滚动不会重跑 effect，分页将永不触发。
  const virtualItems = virtualizer.getVirtualItems();
  const lastVisibleIndex =
    virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : -1;

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || !fetchNextPage) return;
    if (lastVisibleIndex < items.length - 3) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, items.length, lastVisibleIndex]);

  return (
    <div ref={scrollRef} className={className ?? "flex-1 overflow-y-auto"}>
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualItems.map(row => {
          const item = items[row.index];
          return (
            <div
              key={row.key}
              ref={virtualizer.measureElement}
              data-index={row.index}
              className="absolute inset-x-0 pb-2.5"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              {item ? (
                renderItem(item, row.index)
              ) : (
                <div className="text-ink-3 py-4 text-center text-xs">
                  {isFetchingNextPage ? "正在加载更多…" : "继续滚动加载"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
