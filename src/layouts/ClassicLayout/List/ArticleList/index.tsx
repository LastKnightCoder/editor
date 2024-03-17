import { useState, memo } from 'react';

import styles from './index.module.less';
import { IArticle } from "@/types";
import For from "@/components/For";
import LoadMoreComponent from "@/components/LoadMoreComponent";
import ArticleItem from './ArticleItem';
import { useMemoizedFn } from "ahooks";

interface IArticleListProps {
  articles: IArticle[];
  onClickArticle: (article: IArticle) => void;
  activeArticleId?: number;
}

const ArticleList = memo((props: IArticleListProps) => {
  const { articles, onClickArticle, activeArticleId } = props;

  const [articleCount, setArticleCount] = useState<number>(10);
  const slicedArticles = articles.slice(0, articleCount);
  
  const onLoadMore = useMemoizedFn(async () => {
   setArticleCount(Math.min(articleCount + 10, articles.length));
  });

  return (
    <div className={styles.articleListContainer}>
      <div className={styles.list}>
        <LoadMoreComponent onLoadMore={onLoadMore} showLoader={slicedArticles.length < articles.length}>
          <For data={slicedArticles} renderItem={(article) => (
            <ArticleItem
              key={article.id}
              article={article}
              active={article.id === activeArticleId}
              onClickArticle={onClickArticle}
            />
          )} />
        </LoadMoreComponent>
      </div>
    </div>
  )
});

export default ArticleList;
