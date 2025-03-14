import React, { useState } from "react";
import classnames from "classnames";
import For from "@/components/For";

import ArticleCard from "../ArticleCard";
import styles from "./index.module.less";
import { Pagination } from "antd";
import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";

interface ArticleListProps {
  className?: string;
  style?: React.CSSProperties;
}

const ArticleList = (props: ArticleListProps) => {
  const { className, style } = props;

  const { articles } = useArticleManagementStore((state) => ({
    articles: state.articles,
  }));

  const [pageNum, setPageNum] = useState(1);

  const showArticles = articles.slice((pageNum - 1) * 10, pageNum * 10);

  return (
    <div className={classnames(styles.container, className)} style={style}>
      <div className={styles.listContainer}>
        <For
          data={showArticles}
          renderItem={(article, index) => (
            <ArticleCard
              className={styles.item}
              key={article.id}
              article={article}
              imageRight={index % 2 === 1}
            />
          )}
        />
      </div>
      <div className={styles.pagination}>
        <Pagination
          align={"start"}
          pageSize={10}
          current={pageNum}
          onChange={setPageNum}
          total={articles.length}
          showSizeChanger={false}
          hideOnSinglePage={true}
        />
      </div>
    </div>
  );
};

export default ArticleList;
