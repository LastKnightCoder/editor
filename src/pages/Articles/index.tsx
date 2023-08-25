import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import useArticleManagementStore from "@/hooks/useArticleManagementStore.ts";
import useEditArticleStore from "@/hooks/useEditArticleStore.ts";

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

  const navigate = useNavigate();

  useEffect(() => {
    init();
  }, [])

  const handleClickArticleCard = (articleId: number) => {
    useEditArticleStore.setState({
      editingArticleId: articleId,
    });
    navigate(`/articles/edit`);
  }

  return (
    <div className={styles.container}>
      {
        articles.map((article, index) => (
          <ArticleCard
            key={article.id}
            article={article}
            imageRight={index % 2 === 1}
            onClick={() => handleClickArticleCard(article.id)}
          />
        ))
      }
    </div>
  )
}

export default Articles;
