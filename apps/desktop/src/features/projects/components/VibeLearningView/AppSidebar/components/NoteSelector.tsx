import React, { useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, Loader2 } from "lucide-react";

import { Editor, IExtension } from "@tau/editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import If from "@/components/If";
import EditText from "@/components/EditText";

import { formatDate, searchContent } from "@/utils";
import { IndexType, SearchResult } from "@/types/search";
import useTheme from "@/hooks/useTheme";
import useEmbeddingConfig from "@/hooks/useEmbeddingConfig";

// 获取类型标签文字
const getTypeLabel = (type: IndexType): string => {
  const labels: Record<IndexType, string> = {
    card: "卡片",
    article: "文章",
    "project-item": "项目",
    "document-item": "知识库",
    "diary-daily": "日记",
  };
  return labels[type] || type;
};

// 获取类型标签颜色
const getTypeColor = (type: IndexType): string => {
  const colors: Record<IndexType, string> = {
    card: "pink",
    article: "blue",
    "project-item": "green",
    "document-item": "orange",
    "diary-daily": "purple",
  };
  return colors[type] || "default";
};

const SEARCH_TYPES: IndexType[] = [
  "card",
  "article",
  "document-item",
  "project-item",
  "diary-daily",
];

export interface NoteSelectorProps {
  onSelect: (item: SearchResult) => void;
  extensions: IExtension[];
  emptyDescription?: string;
}

const NoteSelector: React.FC<NoteSelectorProps> = ({
  onSelect,
  extensions,
  emptyDescription = "搜索卡片、文章、知识库等内容",
}) => {
  const { theme } = useTheme();
  const modelInfo = useEmbeddingConfig();

  const [search, setSearch] = useState("");
  const [searchedItems, setSearchedItems] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const searchItems = useMemoizedFn(async () => {
    if (!search.trim()) {
      setSearchedItems([]);
      setHasSearched(false);
      return;
    }

    setSearching(true);
    setHasSearched(true);
    try {
      const result = await searchContent({
        query: search,
        types: SEARCH_TYPES,
        limit: 10,
        modelInfo,
      });
      setSearchedItems(result);
    } catch (error) {
      console.error(error);
    } finally {
      setSearching(false);
    }
  });

  const listRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: searchedItems.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 200,
    overscan: 3,
    getItemKey: index => searchedItems[index].id,
    measureElement: el => {
      const item = el.firstElementChild;
      if (!item) return 200;
      return el.getBoundingClientRect().height;
    },
  });

  const handleItemClick = useMemoizedFn((item: SearchResult) => {
    onSelect(item);
  });

  return (
    <div className="box-border flex h-full max-h-[500px] flex-col overflow-y-auto overflow-x-hidden">
      <div className="relative mb-4 box-border flex w-full shrink-0 items-center p-0">
        <div className="z-1 pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-gray-400 dark:text-slate-500">
          {searching ? <Loader2 strokeWidth={1.75} /> : <Search strokeWidth={1.75} />}
        </div>
        <EditText
          defaultValue=""
          defaultFocus
          contentEditable={true}
          onChange={setSearch}
          onPressEnter={searchItems}
          className="relative flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 pl-11 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:bg-white focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-zinc-900"
          onDeleteEmpty={() => {
            setSearch("");
            setSearchedItems([]);
            setHasSearched(false);
          }}
        />
      </div>
      <div
        className={classnames("box-border flex flex-1 flex-col", {
          "overflow-y-auto": !searching,
          "overflow-hidden": searching,
        })}
        ref={listRef}
      >
        <If condition={searching}>
          <div className="flex h-full w-full items-center justify-center py-12 text-[2em]">
            <Loader2 strokeWidth={1.75} />
          </div>
        </If>
        <If condition={!searching && !hasSearched}>
          <div className="flex h-full w-full flex-col items-center justify-center px-5 py-10 text-gray-400 dark:text-slate-500">
            <svg
              className="mb-3 h-12 w-12 opacity-50"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <p className="m-0 text-center text-sm">{emptyDescription}</p>
            <p className="m-0 mt-1 text-center text-xs opacity-70">输入关键词后按 Enter 搜索</p>
          </div>
        </If>
        <If condition={!searching && hasSearched && searchedItems.length === 0}>
          <div className="flex h-full w-full flex-col items-center justify-center px-5 py-10 text-gray-400 dark:text-slate-500">
            <svg
              className="mb-3 h-12 w-12 opacity-50"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <p className="m-0 text-sm">未找到相关内容</p>
          </div>
        </If>
        <If condition={!searching && searchedItems.length > 0}>
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map(virtualItem => {
              const item = searchedItems[virtualItem.index];

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
                    padding: "6px 0",
                  }}
                >
                  <div
                    className={classnames(
                      "cursor-pointer rounded-xl border p-4 transition-all",
                      "border-gray-200 dark:border-slate-700",
                      "hover:border-[var(--th-border-focus)] dark:hover:border-[var(--th-border-focus)]",
                      "dark:hover:bg-[var(--th-btn-hover)]/5 hover:bg-[var(--th-accent-soft)]/50"
                    )}
                    onClick={handleItemClick.bind(null, item)}
                    style={{ contentVisibility: "auto" }}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <div>
                        <span
                          className="rounded-[5px] px-[7px] py-px text-[11px]"
                          style={{ color: getTypeColor(item.type) }}
                        >
                          {getTypeLabel(item.type)}
                        </span>
                      </div>
                      {item.title && (
                        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-gray-800 dark:text-white">
                          {item.title}
                        </div>
                      )}
                    </div>
                    <div className="mb-2 flex gap-2.5 text-xs text-gray-500 dark:text-slate-400">
                      <span>更新于：{formatDate(item.updateTime, true)}</span>
                    </div>
                    <ErrorBoundary>
                      <div className="max-h-[120px] overflow-hidden text-sm text-gray-600 dark:text-slate-400">
                        <Editor
                          readonly={true}
                          initValue={item.content.slice(0, 3)}
                          extensions={extensions}
                          theme={theme}
                        />
                      </div>
                    </ErrorBoundary>
                  </div>
                </div>
              );
            })}
          </div>
        </If>
      </div>
    </div>
  );
};

export default NoteSelector;
