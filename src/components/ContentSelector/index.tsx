import React, { useRef, useState } from "react";
import { Empty } from "antd";
import { useMemoizedFn } from "ahooks";
import { useVirtualizer } from "@tanstack/react-virtual";

import Editor from "@/components/Editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import If from "@/components/If";
import EditText from "@/components/EditText";
import { SearchOutlined, LoadingOutlined } from "@ant-design/icons";

import { formatDate, searchContent } from "@/utils";
import { IndexType, SearchResult } from "@/types/search";
import useTheme from "@/hooks/useTheme";
import useEmbeddingConfig from "@/hooks/useEmbeddingConfig";

import styles from "./index.module.less";

export interface ContentSelectorProps {
  onSelect: (item: SearchResult) => void;
  contentType: IndexType | IndexType[];
  extensions: any[];
  emptyDescription?: string;
  showTitle?: boolean;
  isItemSelected?: (item: SearchResult) => boolean;
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
    onSelect(item);
  });

  return (
    <div className={styles.container}>
      <div className={styles.searchHeader}>
        <div className={styles.searchIcon}>
          {searching ? <LoadingOutlined /> : <SearchOutlined />}
        </div>
        <EditText
          defaultValue=""
          contentEditable={true}
          onChange={setSearch}
          onPressEnter={searchItems}
          className={styles.search}
          onDeleteEmpty={() => {
            setSearch("");
            setSearchedItems(initialContents);
          }}
        />
      </div>
      <div className={styles.list} ref={listRef}>
        <If condition={searching}>
          <div className={styles.searching}>
            <LoadingOutlined />
          </div>
        </If>
        <If condition={!searching && searchedItems.length === 0}>
          <Empty description={emptyDescription} />
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
                    className={`${styles.itemContainer} ${selected ? styles.selected : ""}`}
                    onClick={handleItemClick.bind(null, item)}
                  >
                    {showTitle && (
                      <div className={styles.title}>{item.title}</div>
                    )}
                    <div className={styles.time}>
                      <span>更新于：{formatDate(item.updateTime, true)}</span>
                    </div>
                    <ErrorBoundary>
                      <div className={styles.content}>
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
