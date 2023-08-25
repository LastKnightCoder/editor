import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FloatButton } from "antd";
import { PlusOutlined } from '@ant-design/icons';

import useArticleManagementStore from "@/hooks/useArticleManagementStore.ts";
import useEditArticleStore from "@/hooks/useEditArticleStore.ts";
import {CREATE_ARTICLE_ID} from "@/constants";

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
      readonly: true,
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
      <FloatButton
        shape={'circle'}
        icon={<PlusOutlined />}
        onClick={() => {
          useEditArticleStore.setState({
            editingArticleId: CREATE_ARTICLE_ID,
            readonly: false,
          });
          navigate('/articles/edit');
        }}
        tooltip={'新建文章'}
      />
    </div>
  )
}

export default Articles;
