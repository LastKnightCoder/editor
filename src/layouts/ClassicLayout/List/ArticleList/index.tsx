import { PlusOutlined } from '@ant-design/icons';

import styles from './index.module.less';
import { IArticle } from "@/types";
import For from "@/components/For";
import ArticleItem from './ArticleItem';

interface IArticleListProps {
  articles: IArticle[];
  addArticle: () => void;
  onClickArticle: (article: IArticle) => void;
  activeArticleId?: number;
}

const ArticleList = (props: IArticleListProps) => {
  const { addArticle, articles, onClickArticle, activeArticleId } = props;

  return (
    <div className={styles.articleListContainer}>
      <div className={styles.header}>
        <div className={styles.add} onClick={addArticle}>
          <PlusOutlined />
        </div>
      </div>
      <div className={styles.list}>
        <For data={articles} renderItem={(article) => (
          <ArticleItem
            key={article.id}
            article={article}
            active={article.id === activeArticleId}
            onClickArticle={onClickArticle}
          />
        )} />
      </div>
    </div>
  )
}

export default ArticleList;
