import React, { useRef, useState } from "react";
import { Flex, Tag } from "antd";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Editor, IExtension } from "@tau/editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import If from "@/components/If";
import EditText from "@/components/EditText";
import { SearchOutlined, LoadingOutlined } from "@ant-design/icons";

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
    "diary-weekly": "周记",
    "diary-monthly": "月记",
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
    "diary-weekly": "cyan",
    "diary-monthly": "magenta",
  };
  return colors[type] || "default";
};

export interface ContentSelectorProps {
  onSelect: (item: SearchResult) => void;
  contentType: IndexType | IndexType[];
  extensions: IExtension[];
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
  extensions,
  emptyDescription = "无结果",
  showTitle = true,
  isItemSelected,
  isItemDisabled,
  initialContents = defaultInitialContents,
}) => {
  const { theme } = useTheme();
  const modelInfo = useEmbeddingConfig();

  const [search, setSearch] = useState("");
  const [searchedItems, setSearchedItems] =
    useState<SearchResult[]>(initialContents);
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
    getItemKey: (index) => searchedItems[index].id,
    measureElement: (el) => {
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
    <div className="h-full overflow-y-auto overflow-x-hidden box-border flex flex-col max-h-[600px]">
      <div className="shrink-0 flex w-full p-0 box-border items-center mb-4 relative">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 z-1 text-gray-400 dark:text-slate-500 text-base pointer-events-none">
          {searching ? <LoadingOutlined /> : <SearchOutlined />}
        </div>
        <EditText
          defaultValue=""
          defaultFocus
          contentEditable={true}
          onChange={setSearch}
          onPressEnter={searchItems}
          className="flex-1 px-4 py-3 pl-11 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white relative focus:border-purple-500 focus:shadow-[0_0_0_3px_rgba(168,85,247,0.15)] focus:bg-white dark:focus:bg-zinc-900 placeholder:text-gray-400 dark:placeholder:text-slate-500"
          onDeleteEmpty={() => {
            setSearch("");
            setSearchedItems(initialContents);
          }}
        />
      </div>
      <div
        className={classnames(
          "mt-5 border-20 border-transparent px-5 flex-1 box-border flex flex-col",
          {
            "overflow-y-auto": !searching,
            "overflow-hidden": searching,
          },
        )}
        ref={listRef}
      >
        <If condition={searching}>
          <div className="flex items-center justify-center h-full w-full text-[2em]">
            <LoadingOutlined />
          </div>
        </If>
        <If condition={!searching && searchedItems.length === 0}>
          <div className="flex flex-col items-center justify-center h-full w-full py-10 px-5 text-gray-400 dark:text-slate-500">
            <svg
              className="w-16 h-16 mb-4 opacity-50"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <p className="text-sm m-0">{emptyDescription}</p>
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
            {virtualizer.getVirtualItems().map((virtualItem) => {
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
                      "p-5 border rounded-lg relative",
                      "border-gray-200 dark:border-slate-700",
                      {
                        "border-purple-500 dark:border-purple-500": selected,
                        "opacity-50 cursor-not-allowed": disabled,
                        "cursor-pointer": !disabled,
                      },
                    )}
                    onClick={handleItemClick.bind(null, item)}
                    style={{ contentVisibility: "auto" }}
                  >
                    <Flex gap={8} align="center" className="mb-3">
                      <div>
                        <Tag color={getTypeColor(item.type)}>
                          {getTypeLabel(item.type)}
                        </Tag>
                      </div>
                      {showTitle && (
                        <div className="text-base font-bold overflow-hidden text-ellipsis whitespace-nowrap">
                          {item.title}
                        </div>
                      )}
                    </Flex>
                    <div className="mb-3 flex gap-2.5 text-gray-500 dark:text-slate-400 text-xs">
                      <span>更新于：{formatDate(item.updateTime, true)}</span>
                    </div>
                    <ErrorBoundary>
                      <div className="text-gray-600 dark:text-slate-400 text-sm">
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

export default ContentSelector;
