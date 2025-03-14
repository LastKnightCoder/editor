import React from "react";
import classnames from "classnames";
import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import For from "@/components/For";
import styles from "./index.module.less";
import { IArticle } from "@/types";
import { MenuFoldOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";

interface SimpleArticleListProps {
  className?: string;
  style?: React.CSSProperties;
}

const SimpleArticleList = (props: SimpleArticleListProps) => {
  const { className, style } = props;

  const { articles, activeArticleId } = useArticleManagementStore((state) => ({
    articles: state.articles,
    activeArticleId: state.activeArticleId,
  }));

  const onClick = (article: IArticle) => {
    if (activeArticleId === article.id) {
      useArticleManagementStore.setState({
        activeArticleId: undefined,
      });
      return;
    }
    useArticleManagementStore.setState({
      activeArticleId: article.id,
    });
  };

  const onFoldArticleList = useMemoizedFn(() => {
    useArticleManagementStore.setState({
      hideArticleList: true,
    });
  });

  const onClickTitle = useMemoizedFn(() => {
    useArticleManagementStore.setState({
      activeArticleId: undefined,
    });
  });

  return (
    <div className={classnames(styles.container, className)} style={style}>
      <div className={styles.header}>
        <div className={styles.title} onClick={onClickTitle}>
          文章列表({articles.length})
        </div>
        <div className={styles.icon} onClick={onFoldArticleList}>
          <MenuFoldOutlined />
        </div>
      </div>
      <div className={styles.divider}></div>
      <div className={styles.list}>
        <For
          data={articles}
          renderItem={(article) => (
            <div
              className={classnames(styles.item, {
                [styles.active]: article.id === activeArticleId,
              })}
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
