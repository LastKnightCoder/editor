import React, { useEffect, useState } from "react";
import classnames from "classnames";
import For from "@/components/For";
import styles from "./index.module.less";
import { IArticle } from "@/types";
import { LoadingOutlined } from "@ant-design/icons";
import { getAllArticles } from "@/commands";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import useThemeColors from "@/hooks/useThemeColors";
import { defaultArticleEventBus } from "@/utils";

interface SimpleArticleListProps {
  activeArticleId: number;
  className?: string;
  style?: React.CSSProperties;
}

const SimpleArticleList = (props: SimpleArticleListProps) => {
  const { className, style, activeArticleId } = props;
  const { hoverClass, activeClass } = useThemeColors();

  const [articles, setArticles] = useState<IArticle[]>([]);
  const navigateTo = useTabStore((state) => state.navigateTo);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getAllArticles()
      .then((articles) => {
        setArticles(articles);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const unsubscribe = defaultArticleEventBus.subscribe(
      "article:updated",
      (data) => {
        setArticles((prevArticles) =>
          prevArticles.map((article) =>
            article.id === data.article.id ? data.article : article,
          ),
        );
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const onClick = (article: IArticle) => {
    if (activeArticleId === article.id) {
      navigateTo(TabType.ArticleList);
      return;
    }
    navigateTo(
      TabType.ArticleDetail,
      { id: article.id },
      `文章 - ${article.title || `#${article.id}`}`,
    );
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <LoadingOutlined style={{ fontSize: 24 }} spin />
      </div>
    );
  }

  return (
    <div
      className={classnames(
        styles.container,
        "border-r border-[#f0f0f0] dark:border-[#2a2a2a]",
        className,
      )}
      style={style}
    >
      <div className={styles.header}>
        <div className={styles.title}>文章列表({articles.length})</div>
      </div>
      <div className={styles.divider}></div>
      <div className={styles.list}>
        <For
          data={articles}
          renderItem={(article) => (
            <div
              key={article.id}
              className={classnames(
                styles.item,
                article.id === activeArticleId ? activeClass : hoverClass,
              )}
              onClick={() => onClick(article)}
            >
              {article.title}
            </div>
          )}
        />
      </div>
    </div>
  );
};

export default SimpleArticleList;
