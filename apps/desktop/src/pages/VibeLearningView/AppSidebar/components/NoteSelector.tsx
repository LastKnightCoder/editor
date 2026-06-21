import React, { useRef, useState } from "react";
import { Flex, Tag } from "antd";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SearchOutlined, LoadingOutlined } from "@ant-design/icons";

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
    getItemKey: (index) => searchedItems[index].id,
    measureElement: (el) => {
      const item = el.firstElementChild;
      if (!item) return 200;
      return el.getBoundingClientRect().height;
    },
  });

  const handleItemClick = useMemoizedFn((item: SearchResult) => {
    onSelect(item);
  });

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden box-border flex flex-col max-h-[500px]">
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
          className="flex-1 px-4 py-3 pl-11 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white relative focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] focus:bg-white dark:focus:bg-zinc-900 placeholder:text-gray-400 dark:placeholder:text-slate-500"
          onDeleteEmpty={() => {
            setSearch("");
            setSearchedItems([]);
            setHasSearched(false);
          }}
        />
      </div>
      <div
        className={classnames("flex-1 box-border flex flex-col", {
          "overflow-y-auto": !searching,
          "overflow-hidden": searching,
        })}
        ref={listRef}
      >
        <If condition={searching}>
          <div className="flex items-center justify-center h-full w-full text-[2em] py-12">
            <LoadingOutlined />
          </div>
        </If>
        <If condition={!searching && !hasSearched}>
          <div className="flex flex-col items-center justify-center h-full w-full py-10 px-5 text-gray-400 dark:text-slate-500">
            <svg
              className="w-12 h-12 mb-3 opacity-50"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <p className="text-sm m-0 text-center">{emptyDescription}</p>
            <p className="text-xs m-0 mt-1 text-center opacity-70">
              输入关键词后按 Enter 搜索
            </p>
          </div>
        </If>
        <If condition={!searching && hasSearched && searchedItems.length === 0}>
          <div className="flex flex-col items-center justify-center h-full w-full py-10 px-5 text-gray-400 dark:text-slate-500">
            <svg
              className="w-12 h-12 mb-3 opacity-50"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <p className="text-sm m-0">未找到相关内容</p>
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
                      "p-4 border rounded-xl cursor-pointer transition-all",
                      "border-gray-200 dark:border-slate-700",
                      "hover:border-blue-500 dark:hover:border-blue-500",
                      "hover:bg-blue-50/50 dark:hover:bg-blue-500/5",
                    )}
                    onClick={handleItemClick.bind(null, item)}
                    style={{ contentVisibility: "auto" }}
                  >
                    <Flex gap={8} align="center" className="mb-2">
                      <div>
                        <Tag color={getTypeColor(item.type)}>
                          {getTypeLabel(item.type)}
                        </Tag>
                      </div>
                      {item.title && (
                        <div className="text-sm font-semibold overflow-hidden text-ellipsis whitespace-nowrap text-gray-800 dark:text-white">
                          {item.title}
                        </div>
                      )}
                    </Flex>
                    <div className="mb-2 flex gap-2.5 text-gray-500 dark:text-slate-400 text-xs">
                      <span>更新于：{formatDate(item.updateTime, true)}</span>
                    </div>
                    <ErrorBoundary>
                      <div className="text-gray-600 dark:text-slate-400 text-sm max-h-[120px] overflow-hidden">
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
