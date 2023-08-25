import {useEffect} from "react";

import useArticleManagementStore from "@/hooks/useArticleManagementStore.ts";

import ArticleCard from "./ArticleCard";
import styles from './index.module.less';

const Articles = () => {
  const {
    articles,
    init,
  } = useArticleManagementStore(state => ({
    articles: state.articles,
    init: state.init,
  }));

  useEffect(() => {
    init();
  }, [])

  return (
    <div className={styles.container}>
      {
        articles.map((article, index) => (
          <ArticleCard key={article.id} article={article} imageRight={index % 2 === 1} />
        ))
      }
    </div>
  )
}

export default Articles;
