import { useState, memo } from "react";
import { useMemoizedFn } from "ahooks";

import For from "@/components/For";
import LoadMoreComponent from "@/components/LoadMoreComponent";
import ArticleItem from "./ArticleItem";

import useArticleManagementStore from "@/stores/useArticleManagementStore";

import styles from "./index.module.less";

const ArticleList = memo(() => {
  const { articles } = useArticleManagementStore((state) => ({
    articles: state.articles,
  }));

  const [articleCount, setArticleCount] = useState<number>(10);
  const slicedArticles = articles.slice(0, articleCount);

  const onLoadMore = useMemoizedFn(async () => {
    setArticleCount(Math.min(articleCount + 10, articles.length));
  });

  return (
    <div className={styles.articleListContainer}>
      <div className={styles.list}>
        <LoadMoreComponent
          onLoadMore={onLoadMore}
          showLoader={slicedArticles.length < articles.length}
        >
          <For
            data={slicedArticles}
            renderItem={(article) => (
              <ArticleItem key={article.id} article={article} />
            )}
          />
        </LoadMoreComponent>
      </div>
    </div>
  );
});

export default ArticleList;
