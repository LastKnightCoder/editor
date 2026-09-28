import React, { useRef, useState } from "react";
import { getLibraryContentKit } from "@/services/editorKit";
import { Tag } from "antd";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Editor } from "@tau/editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import If from "@/components/If";
import EditText from "@/components/EditText";
import { SearchOutlined, LoadingOutlined } from "@ant-design/icons";

import { formatDate, searchContent } from "@/utils";
import { IndexType, SearchResult } from "@/types/search";
import useEmbeddingConfig from "@/hooks/useEmbeddingConfig";

// 获取类型标签文字
const getTypeLabel = (type: IndexType): string => {
  const labels: Record<IndexType, string> = {
    card: "卡片",
    article: "文章",
    "project-item": "项目",
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
    "diary-daily": "purple",
  };
  return colors[type] || "default";
};

export interface ContentSelectorProps {
  onSelect: (item: SearchResult) => void;
  contentType: IndexType | IndexType[];
  emptyDescription?: string;
  showTitle?: boolean;
  isItemSelected?: (item: SearchResult) => boolean;
  isItemDisabled?: (item: SearchResult) => boolean;
  initialContents?: SearchResult[];
}

const defaultInitialContents: SearchResult[] = [];

const ContentSelector: React.FC<ContentSelectorProps> = ({
  onSelect,
  contentType,
  emptyDescription = "无结果",
  showTitle = true,
  isItemSelected,
  isItemDisabled,
  initialContents = defaultInitialContents,
}) => {
  const modelInfo = useEmbeddingConfig();

  const [search, setSearch] = useState("");
  const [searchedItems, setSearchedItems] = useState<SearchResult[]>(initialContents);
  const [searching, setSearching] = useState(false);

  const searchItems = useMemoizedFn(async () => {
    if (!search.trim()) {
      setSearchedItems(initialContents);
      return;
    }

    setSearching(true);
    try {
      const result = await searchContent({
        query: search,
        types: Array.isArray(contentType) ? contentType : [contentType],
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
    estimateSize: () => 350,
    overscan: 3,
    getItemKey: index => searchedItems[index].id,
    measureElement: el => {
      const item = el.firstElementChild;
      if (!item) return 350;
      return el.getBoundingClientRect().height;
    },
  });

  const handleItemClick = useMemoizedFn((item: SearchResult) => {
    if (isItemDisabled && isItemDisabled(item)) {
      return;
    }
    onSelect(item);
  });

  return (
    <div className="box-border flex h-full min-h-0 flex-col">
      <div className="relative mb-4 box-border flex w-full shrink-0 items-center p-0">
        <div className="z-1 pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-gray-400 dark:text-slate-500">
          {searching ? <LoadingOutlined /> : <SearchOutlined />}
        </div>
        <EditText
          defaultValue=""
          defaultFocus
          contentEditable={true}
          onChange={setSearch}
          onPressEnter={searchItems}
          className="relative flex-1 rounded-xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:bg-white focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-zinc-900"
          onDeleteEmpty={() => {
            setSearch("");
            setSearchedItems(initialContents);
          }}
        />
      </div>
      <div
        className={classnames(
          "border-20 mt-5 box-border flex min-h-0 flex-1 flex-col border-transparent px-5",
          {
            "overflow-y-auto": !searching,
          }
        )}
        ref={listRef}
      >
        <If condition={searching}>
          <div className="flex h-full w-full items-center justify-center text-[2em]">
            <LoadingOutlined />
          </div>
        </If>
        <If condition={!searching && searchedItems.length === 0}>
          <div className="flex h-full w-full flex-col items-center justify-center px-5 py-10 text-gray-400 dark:text-slate-500">
            <svg
              className="mb-4 h-16 w-16 opacity-50"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <p className="m-0 text-sm">{emptyDescription}</p>
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
              const selected = isItemSelected ? isItemSelected(item) : false;
              const disabled = isItemDisabled ? isItemDisabled(item) : false;

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
                    padding: "10px 0",
                  }}
                >
                  <div
                    className={classnames(
                      "relative rounded-lg border p-5",
                      "border-gray-200 dark:border-slate-700",
                      {
                        "border-[var(--th-border-focus)]": selected,
                        "cursor-not-allowed opacity-50": disabled,
                        "cursor-pointer": !disabled,
                      }
                    )}
                    onClick={handleItemClick.bind(null, item)}
                    style={{ contentVisibility: "auto" }}
                  >
                    <div className="mb-5 flex items-center gap-2">
                      <div>
                        <Tag color={getTypeColor(item.type)}>{getTypeLabel(item.type)}</Tag>
                      </div>
                      {showTitle && (
                        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-base font-bold">
                          {item.title}
                        </div>
                      )}
                    </div>
                    <div className="mb-3 flex gap-2.5 text-xs text-gray-500 dark:text-slate-400">
                      <span>更新于：{formatDate(item.updateTime, true)}</span>
                    </div>
                    <ErrorBoundary>
                      <div className="text-sm text-gray-600 dark:text-slate-400">
                        <Editor
                          kit={getLibraryContentKit()}
                          readonly={true}
                          initValue={item.content.slice(0, 3)}
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

export default ContentSelector;
