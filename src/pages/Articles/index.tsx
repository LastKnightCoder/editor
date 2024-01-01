import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FloatButton } from "antd";
import { PlusOutlined, UpOutlined } from '@ant-design/icons';

import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import useUploadImage from "@/hooks/useUploadImage.ts";
import { DEFAULT_ARTICLE_CONTENT } from "@/constants";

import ArticleCard from "./ArticleCard";
import styles from './index.module.less';

const Articles = () => {
  const {
    articles,
    createArticle,
    updateArticleIsTop,
    deleteArticle,
    updateArticleBannerBg,
  } = useArticleManagementStore(state => ({
    articles: state.articles,
    updateArticleIsTop: state.updateArticleIsTop,
    deleteArticle: state.deleteArticle,
    updateArticleBannerBg: state.updateArticleBannerBg,
    createArticle: state.createArticle,
  }));

  const uploadImage = useUploadImage();

  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const handleClickArticleCard = (articleId: number) => {
    navigate(`/articles/edit/${articleId}`);
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
            isTop={article.isTop}
            updateArticleIsTop={updateArticleIsTop}
            deleteArticle={deleteArticle}
            updateArticleBannerBg={updateArticleBannerBg}
            uploadFile={uploadImage}
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
          onClick={async () => {
            const createdArticle = await createArticle({
              title: '默认文章标题',
              content: DEFAULT_ARTICLE_CONTENT,
              bannerBg: '',
              isTop: false,
              author: 'Tao',
              links: [],
              tags: []
            })
            navigate(`/articles/edit/${createdArticle.id}`);
          }}
          tooltip={'新建文章'}
        />
      </FloatButton.Group>
    </div>
  )
}

export default Articles;
