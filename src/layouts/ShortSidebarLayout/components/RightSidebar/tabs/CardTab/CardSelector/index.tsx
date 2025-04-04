import React, { useRef, useState } from "react";
import { Empty } from "antd";
import { useMemoizedFn } from "ahooks";
import { useVirtualizer } from "@tanstack/react-virtual";

import Editor from "@/components/Editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import If from "@/components/If";
import EditText from "@/components/EditText";

import {
  cardLinkExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";

import { formatDate, searchContent } from "@/utils";
import { SearchResult } from "@/types";
import { SearchOutlined, LoadingOutlined } from "@ant-design/icons";
import useTheme from "@/hooks/useTheme";
import useEmbeddingConfig from "@/hooks/useEmbeddingConfig";

import styles from "./index.module.less";

const customExtensions = [cardLinkExtension, fileAttachmentExtension];

interface CardSelectorProps {
  onSelect: (card: SearchResult) => void;
}

const CardSelector: React.FC<CardSelectorProps> = ({ onSelect }) => {
  const modelInfo = useEmbeddingConfig();

  const { theme } = useTheme();

  const [search, setSearch] = useState("");
  const [searchedCards, setSearchedCards] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const searchCards = useMemoizedFn(async () => {
    setSearching(true);
    try {
      const result = await searchContent({
        query: search,
        types: ["card"],
        limit: 10,
        modelInfo,
      });
      setSearchedCards(result);
    } catch (error) {
      console.error(error);
    } finally {
      setSearching(false);
    }
  });

  const listRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: searchedCards.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 350, // 调整预估卡片高度，包含边距
    overscan: 2, // 预加载的项目数量
    // 获取实际元素的尺寸，支持动态高度
    getItemKey: (index) => searchedCards[index].id,
    // 确保只有可见的卡片被渲染和测量
    measureElement: (el) => {
      const card = el.firstElementChild;
      if (!card) return 350; // 默认高度
      // 包括元素自身和边距的高度
      return el.getBoundingClientRect().height;
    },
  });

  const handleCardClick = useMemoizedFn((card: SearchResult) => {
    onSelect(card);
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
          onPressEnter={searchCards}
          className={styles.search}
          onDeleteEmpty={() => {
            setSearch("");
            setSearchedCards([]);
          }}
        />
      </div>
      <div className={styles.list} ref={listRef}>
        <If condition={searching}>
          <div className={styles.searching}>
            <LoadingOutlined />
          </div>
        </If>
        <If condition={!searching && searchedCards.length === 0}>
          <Empty description="暂无卡片" />
        </If>
        <If condition={!searching && searchedCards.length > 0}>
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const card = searchedCards[virtualItem.index];
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
                    padding: "10px 0", // 添加上下间距
                  }}
                >
                  <div
                    className={styles.itemContainer}
                    onClick={handleCardClick.bind(null, card)}
                  >
                    <div className={styles.time}>
                      <span>更新于：{formatDate(card.updateTime, true)}</span>
                    </div>
                    <ErrorBoundary>
                      <Editor
                        className={styles.content}
                        readonly={true}
                        initValue={card.content.slice(0, 3)}
                        extensions={customExtensions}
                        theme={theme}
                      />
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

export default CardSelector;
