import React, { useRef, useState } from "react";
import { Empty } from "antd";
import { useMemoizedFn } from "ahooks";
import { useVirtualizer } from "@tanstack/react-virtual";

import EditText from "@/components/EditText";
import ErrorBoundary from "@/components/ErrorBoundary";
import If from "@/components/If";
import Editor from "@/components/Editor";

import {
  fileAttachmentExtension,
  cardLinkExtension,
  documentCardListExtension,
} from "@/editor-extensions";

import { searchFTS } from "@/commands";
import { SearchOutlined, LoadingOutlined } from "@ant-design/icons";
import { formatDate } from "@/utils";

import styles from "./index.module.less";
import { SearchResult } from "@/types/search";
import useTheme from "@/hooks/useTheme";

interface DocumentItemSelectorProps {
  onSelect: (documentItem: SearchResult) => void;
}

const customExtensions = [
  fileAttachmentExtension,
  cardLinkExtension,
  documentCardListExtension,
];

const DocumentItemSelector: React.FC<DocumentItemSelectorProps> = ({
  onSelect,
}) => {
  const { theme } = useTheme();
  const [search, setSearch] = useState("");
  const [searchedDocumentItems, setSearchedDocumentItems] = useState<
    SearchResult[]
  >([]);
  const [searching, setSearching] = useState(false);

  const searchDocumentItems = useMemoizedFn(async () => {
    if (!search.trim()) {
      setSearchedDocumentItems([]);
      return;
    }

    setSearching(true);
    try {
      console.time("searchDocumentItems");
      const result = await searchFTS({
        query: search,
        types: ["document-item"],
        limit: 10,
      });
      setSearchedDocumentItems(result);
      console.timeEnd("searchDocumentItems");
    } catch (error) {
      console.error(error);
    } finally {
      setSearching(false);
    }
  });

  const listRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: searchedDocumentItems.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 350,
    overscan: 3,
    getItemKey: (index) => searchedDocumentItems[index].id,
    measureElement: (el) => {
      const item = el.firstElementChild;
      if (!item) return 350;
      return el.getBoundingClientRect().height;
    },
  });

  const handleDocumentItemClick = useMemoizedFn(
    (documentItem: SearchResult) => {
      onSelect(documentItem);
    },
  );

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
          onPressEnter={searchDocumentItems}
          className={styles.search}
          onDeleteEmpty={() => {
            setSearch("");
            setSearchedDocumentItems([]);
          }}
        />
      </div>
      <div className={styles.list} ref={listRef}>
        <If condition={searching}>
          <div className={styles.searching}>
            <LoadingOutlined />
          </div>
        </If>
        <If condition={!searching && searchedDocumentItems.length === 0}>
          <Empty description="无结果" />
        </If>
        <If condition={!searching && searchedDocumentItems.length > 0}>
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const documentItem = searchedDocumentItems[virtualItem.index];
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
                    className={styles.itemContainer}
                    onClick={handleDocumentItemClick.bind(null, documentItem)}
                  >
                    <div className={styles.title}>{documentItem.title}</div>
                    <div className={styles.time}>
                      <span>
                        更新于：{formatDate(documentItem.updateTime, true)}
                      </span>
                    </div>
                    <ErrorBoundary>
                      <div className={styles.content}>
                        <Editor
                          readonly={true}
                          initValue={documentItem.content.slice(0, 3)}
                          extensions={customExtensions}
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

export default DocumentItemSelector;
