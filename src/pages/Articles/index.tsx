import {useEffect, useRef} from "react";
import { useNavigate } from "react-router-dom";
import { FloatButton } from "antd";
import { PlusOutlined, UpOutlined } from '@ant-design/icons';

import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import useEditArticleStore from "@/stores/useEditArticleStore.ts";
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

  const ref = useRef<HTMLDivElement>(null);
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

  const scrollToTop = () => {
    ref.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  return (
    <div className={styles.container} ref={ref}>
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
      <FloatButton.Group shape={'square'}>
        <FloatButton
          icon={<UpOutlined />}
          onClick={scrollToTop}
          tooltip={'回到顶部'}
        />
        <FloatButton
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
      </FloatButton.Group>
    </div>
  )
}

export default Articles;
