import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import classnames from "classnames";
import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import For from "@/components/For";
import styles from "./index.module.less";
import { IArticle } from "@/types";
import { MenuFoldOutlined, LoadingOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import { getAllArticles } from "@/commands";

interface SimpleArticleListProps {
  activeArticleId: number;
  className?: string;
  style?: React.CSSProperties;
}

const SimpleArticleList = (props: SimpleArticleListProps) => {
  const { className, style, activeArticleId } = props;

  const [articles, setArticles] = useState<IArticle[]>([]);
  const navigate = useNavigate();
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

  const onClick = (article: IArticle) => {
    if (activeArticleId === article.id) {
      navigate(`/articles/list`);
      return;
    }
    navigate(`/articles/detail/${article.id}`);
  };

  const onFoldArticleList = useMemoizedFn(() => {
    useArticleManagementStore.setState({
      hideArticleList: true,
    });
  });

  if (loading) {
    return (
      <div className={styles.loading}>
        <LoadingOutlined style={{ fontSize: 24 }} spin />
      </div>
    );
  }

  return (
    <div className={classnames(styles.container, className)} style={style}>
      <div className={styles.header}>
        <div className={styles.title}>文章列表({articles.length})</div>
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
              key={article.id}
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
