import { memo, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDebounceFn, useMemoizedFn } from "ahooks";
import { Loader2 } from "lucide-react";
import { message } from "antd";
import type { Descendant } from "slate";

import useDiaryStore from "@/stores/useDiaryStore";
import useSettingStore from "@/stores/useSettingStore";
import { searchContent } from "@/utils";
import { resolveEmbeddingModelInfoFromSetting } from "@/utils/embedding-model-info";
import MomentCard from "@/pages/DiaryView/components/MomentCard";
import MomentFilterBar from "@/pages/DiaryView/components/MomentFilterBar";
import {
  buildDiarySearchRankMap,
  filterAndSortSegmentsBySearchRank,
  type DiarySearchRankMap,
} from "./utils";

const MomentStreamView = memo(() => {
  const {
    segmentsFlat,
    tagSettings,
    activeTagFilter,
    activeDateRange,
    searchQuery,
    visibleCount,
    activeEntryId,
    initLoading,
    loadMore,
    onCreateMoment,
    onUpdateDiarySegment,
    onDeleteDiarySegment,
    onUpdateDiaryTags,
    upsertTagSetting,
    deleteTagSetting,
    setActiveTagFilter,
    setActiveDateRange,
    setSearchQuery,
    setActiveEntryId,
  } = useDiaryStore();

  const [searchedEntryRankMap, setSearchedEntryRankMap] =
    useState<DiarySearchRankMap | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const lastScrolledEntryRef = useRef<number | null>(null);
  const resizeObserversRef = useRef<Map<string, ResizeObserver>>(new Map());
  const searchRequestIdRef = useRef(0);

  // 搜索：debounce 后调用 hybrid 搜索（FTS + embedding 向量召回）
  const { run: debouncedSearch } = useDebounceFn(
    async (query: string) => {
      const trimmed = query.trim();
      const requestId = searchRequestIdRef.current + 1;
      searchRequestIdRef.current = requestId;

      if (!trimmed) {
        setSearchedEntryRankMap(null);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const settings = useSettingStore.getState().setting;
        const modelInfo = resolveEmbeddingModelInfoFromSetting(settings);
        const results = await searchContent({
          query: trimmed,
          types: ["diary-daily"],
          limit: 100,
          ...(modelInfo ? { modelInfo } : {}),
        });
        if (searchRequestIdRef.current !== requestId) return;
        setSearchedEntryRankMap(
          buildDiarySearchRankMap(results.map((result) => result.id)),
        );
      } catch (error) {
        if (searchRequestIdRef.current !== requestId) return;
        console.error("Diary search failed:", error);
        setSearchedEntryRankMap(new Map());
      } finally {
        if (searchRequestIdRef.current === requestId) {
          setIsSearching(false);
        }
      }
    },
    { wait: 300 },
  );

  useEffect(() => {
    debouncedSearch(searchQuery);
  }, [searchQuery, debouncedSearch]);

  // 筛选 + 搜索过滤
  const filteredSegments = useMemo(() => {
    let result = segmentsFlat;

    if (activeTagFilter.length > 0) {
      result = result.filter((item) =>
        activeTagFilter.some((tag) => item.tags.includes(tag)),
      );
    }

    if (activeDateRange) {
      const [start, end] = activeDateRange;
      result = result.filter(
        (item) => item.entryDateMs >= start && item.entryDateMs <= end,
      );
    }

    if (activeEntryId == null && searchedEntryRankMap) {
      result = filterAndSortSegmentsBySearchRank(result, searchedEntryRankMap);
    }

    return result;
  }, [
    segmentsFlat,
    activeTagFilter,
    activeDateRange,
    activeEntryId,
    searchedEntryRankMap,
  ]);

  const visibleSegments = useMemo(
    () => filteredSegments.slice(0, visibleCount),
    [filteredSegments, visibleCount],
  );

  const hasMore = visibleCount < filteredSegments.length;

  const activeEntryIndex = useMemo(() => {
    if (activeEntryId == null) return -1;
    return filteredSegments.findIndex((item) => item.diaryId === activeEntryId);
  }, [activeEntryId, filteredSegments]);

  const tagUsageCounts = useMemo(() => {
    const tagEntryIds = new Map<string, Set<number>>();
    segmentsFlat.forEach((item) => {
      item.tags.forEach((tag) => {
        const entryIds = tagEntryIds.get(tag) ?? new Set<number>();
        entryIds.add(item.diaryId);
        tagEntryIds.set(tag, entryIds);
      });
    });
    return new Map(
      Array.from(tagEntryIds.entries()).map(([tag, entryIds]) => [
        tag,
        entryIds.size,
      ]),
    );
  }, [segmentsFlat]);

  // 虚拟列表
  const virtualizer = useVirtualizer({
    count: visibleSegments.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 180,
    overscan: 5,
    getItemKey: (index) => visibleSegments[index].id,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  useEffect(() => {
    return () => {
      resizeObserversRef.current.forEach((observer) => observer.disconnect());
      resizeObserversRef.current.clear();
    };
  }, []);

  const setMeasuredElement = useCallback(
    (key: string) => (node: HTMLDivElement | null) => {
      resizeObserversRef.current.get(key)?.disconnect();

      if (!node) {
        resizeObserversRef.current.delete(key);
        return;
      }

      virtualizer.measureElement(node);
      const observer = new ResizeObserver(() => {
        virtualizer.measureElement(node);
      });
      observer.observe(node);
      resizeObserversRef.current.set(key, observer);
    },
    [virtualizer],
  );

  // 无限滚动
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const distanceToBottom =
        target.scrollHeight - target.scrollTop - target.clientHeight;
      if (distanceToBottom > 200 || loadingMoreRef.current || !hasMore) return;
      loadingMoreRef.current = true;
      loadMore(20);
      requestAnimationFrame(() => {
        loadingMoreRef.current = false;
      });
    },
    [hasMore, loadMore],
  );

  const handleSegmentChange = useMemoizedFn(
    (segmentId: number, content: Descendant[]) =>
      onUpdateDiarySegment(segmentId, content),
  );

  const handleSegmentDelete = useMemoizedFn((segmentId: number) =>
    onDeleteDiarySegment(segmentId),
  );

  const handleTagsChange = useMemoizedFn((entryId: number, tags: string[]) =>
    onUpdateDiaryTags(entryId, tags),
  );

  const handleTagSettingChange = useMemoizedFn(
    (setting: { name: string; color: string; sort?: number }) =>
      upsertTagSetting(setting),
  );

  const handleTagSettingDelete = useMemoizedFn(async (name: string) => {
    try {
      await deleteTagSetting(name);
      message.success("标签已清理");
    } catch {
      message.error("清理标签失败");
    }
  });

  const handleCreateMoment = useCallback(async () => {
    try {
      await onCreateMoment();
    } catch {
      message.error("创建失败");
    }
  }, [onCreateMoment]);

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (activeEntryId == null || activeEntryIndex < 0) return;
    if (lastScrolledEntryRef.current === activeEntryId) return;

    if (activeEntryIndex >= visibleCount) {
      loadMore(activeEntryIndex - visibleCount + 1);
      return;
    }

    const timer = window.setTimeout(() => {
      virtualizer.scrollToIndex(activeEntryIndex, { align: "center" });
      lastScrolledEntryRef.current = activeEntryId;
    }, 80);

    return () => window.clearTimeout(timer);
  }, [activeEntryId, activeEntryIndex, visibleCount, loadMore, virtualizer]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* 顶部筛选条 */}
      <MomentFilterBar
        tagSettings={tagSettings}
        activeTagFilter={activeTagFilter}
        activeDateRange={activeDateRange}
        searchQuery={searchQuery}
        onTagFilterChange={(tags) => {
          lastScrolledEntryRef.current = null;
          setActiveEntryId(undefined);
          setActiveTagFilter(tags);
        }}
        onDateRangeChange={(range) => {
          lastScrolledEntryRef.current = null;
          setActiveEntryId(undefined);
          setActiveDateRange(range);
        }}
        onSearchQueryChange={(query) => {
          lastScrolledEntryRef.current = null;
          setActiveEntryId(undefined);
          setSearchQuery(query);
        }}
        onCreateMoment={handleCreateMoment}
      />

      {/* 主内容区：虚拟列表 + 无限滚动 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-6 [&::-webkit-scrollbar]:hidden"
      >
        <div className="mx-auto max-w-[800px]">
          {initLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2
                className="h-5 w-5 animate-spin"
                style={{ color: "var(--th-text-secondary)" }}
              />
            </div>
          ) : visibleSegments.length === 0 ? (
            <div
              className="flex h-64 flex-col items-center justify-center gap-3"
              style={{ color: "var(--th-text-secondary)" }}
            >
              <span className="text-sm">
                {isSearching
                  ? "搜索中..."
                  : activeEntryId != null
                    ? "没有可显示的日记"
                    : searchQuery
                      ? "没有匹配的日记"
                      : filteredSegments.length === 0
                        ? "还没有日记记录"
                        : "没有符合条件的日记"}
              </span>
            </div>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualItems.map((virtualItem) => {
                const item = visibleSegments[virtualItem.index];
                const isLast = virtualItem.index === visibleSegments.length - 1;
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={setMeasuredElement(String(virtualItem.key))}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start}px)`,
                      boxSizing: "border-box",
                    }}
                  >
                    <MomentCard
                      item={item}
                      isLast={isLast}
                      isActive={activeEntryId === item.diaryId}
                      tagSettings={tagSettings}
                      tagUsageCounts={tagUsageCounts}
                      onSegmentChange={handleSegmentChange}
                      onSegmentDelete={handleSegmentDelete}
                      onTagsChange={handleTagsChange}
                      onTagSettingChange={handleTagSettingChange}
                      onTagSettingDelete={handleTagSettingDelete}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* 底部状态 */}
          {!initLoading && visibleSegments.length > 0 && (
            <div className="mt-4">
              {hasMore ? (
                <div
                  className="flex items-center justify-center gap-2 py-4 text-xs"
                  style={{ color: "var(--th-text-secondary)" }}
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>继续向下滚动加载更多</span>
                </div>
              ) : (
                <div
                  className="py-4 text-center text-xs"
                  style={{ color: "var(--th-text-secondary)" }}
                >
                  已加载全部 {filteredSegments.length} 条记录
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

MomentStreamView.displayName = "MomentStreamView";
export default MomentStreamView;
