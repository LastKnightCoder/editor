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
} from "@/editor-extensions";

import useArticleManagementStore from "@/stores/useArticleManagementStore";

import { formatDate } from "@/utils";
import { searchFTS } from "@/commands";
import { IArticle } from "@/types";
import { SearchOutlined, LoadingOutlined } from "@ant-design/icons";

import styles from "./index.module.less";
import useTheme from "@/hooks/useTheme";

interface ArticleSelectorProps {
  onSelect: (article: IArticle) => void;
}

const customExtensions = [fileAttachmentExtension, cardLinkExtension];

const ArticleSelector: React.FC<ArticleSelectorProps> = ({ onSelect }) => {
  const { theme } = useTheme();
  const articles = useArticleManagementStore((state) => state.articles);

  const [search, setSearch] = useState("");
  const [searchedArticles, setSearchedArticles] =
    useState<IArticle[]>(articles);
  const [searching, setSearching] = useState(false);

  const searchArticles = useMemoizedFn(async () => {
    setSearching(true);
    try {
      console.time("searchArticles");
      const result = await searchFTS({
        query: search,
        types: ["article"],
        limit: 10,
      });
      const searchedArticles = articles.filter((article) =>
        result.some((item) => item.id === article.id),
      );
      setSearchedArticles(searchedArticles);
      console.timeEnd("searchArticles");
    } catch (error) {
      console.error(error);
    } finally {
      setSearching(false);
    }
  });

  const listRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: searchedArticles.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 350,
    overscan: 3,
    getItemKey: (index) => searchedArticles[index].id,
    measureElement: (el) => {
      const article = el.firstElementChild;
      if (!article) return 350;
      return el.getBoundingClientRect().height;
    },
  });

  const handleArticleClick = useMemoizedFn((article: IArticle) => {
    onSelect(article);
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
          onPressEnter={searchArticles}
          className={styles.search}
          onDeleteEmpty={() => {
            setSearch("");
            setSearchedArticles(articles);
          }}
        />
      </div>
      <div className={styles.list} ref={listRef}>
        <If condition={searching}>
          <div className={styles.searching}>
            <LoadingOutlined />
          </div>
        </If>
        <If condition={!searching && searchedArticles.length === 0}>
          <Empty description="暂无文章" />
        </If>
        <If condition={!searching && searchedArticles.length > 0}>
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const article = searchedArticles[virtualItem.index];
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
                    onClick={handleArticleClick.bind(null, article)}
                  >
                    <div className={styles.title}>{article.title}</div>
                    <div className={styles.time}>
                      <span>
                        创建于：{formatDate(article.create_time, true)}
                      </span>
                      <span>
                        更新于：{formatDate(article.update_time, true)}
                      </span>
                    </div>
                    <ErrorBoundary>
                      <div className={styles.content}>
                        <Editor
                          readonly={true}
                          initValue={article.content.slice(0, 3)}
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

export default ArticleSelector;
