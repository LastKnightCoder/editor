import {useEffect, useRef} from "react";
import {useNavigate} from "react-router-dom";
import {FloatButton} from "antd";
import {PlusOutlined, UpOutlined} from '@ant-design/icons';

import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import useEditArticleStore from "@/stores/useEditArticleStore.ts";
import {CREATE_ARTICLE_ID} from "@/constants";

import ArticleCard from "./ArticleCard";
import styles from './index.module.less';
import useSettingStore from "@/stores/useSettingStore.ts";
import {transformGithubUrlToCDNUrl, uploadFileFromFile} from "@/utils";


const Articles = () => {
  const {
    articles,
    init,
    updateArticleIsTop,
    deleteArticle,
    updateArticleBannerBg,
  } = useArticleManagementStore(state => ({
    articles: state.articles,
    init: state.init,
    updateArticleIsTop: state.updateArticleIsTop,
    deleteArticle: state.deleteArticle,
    updateArticleBannerBg: state.updateArticleBannerBg,
  }));

  const { github } = useSettingStore(state => ({
    github: state.setting.imageBed.github,
  }));

  const uploadFile = async (file: File) => {
    const uploadRes = await uploadFileFromFile(file, github) as any;
    if (!uploadRes) {
      return '';
    }
    const { content: { download_url } } = uploadRes;
    return transformGithubUrlToCDNUrl(download_url, github.branch);
  }

  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    init().then();
  }, [init])

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
            isTop={article.isTop}
            updateArticleIsTop={updateArticleIsTop}
            deleteArticle={deleteArticle}
            updateArticleBannerBg={updateArticleBannerBg}
            uploadFile={uploadFile}
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
