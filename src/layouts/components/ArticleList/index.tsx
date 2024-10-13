import classnames from 'classnames';
import For from "@/components/For";
import ArticleCard from "../ArticleCard";
import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";

import styles from './index.module.less';

interface ArticleListProps {
  className?: string;
  style?: React.CSSProperties;
}

const ArticleList = (props: ArticleListProps) => {
  const { className, style } = props;

  const {
    articles,
  } = useArticleManagementStore(state => ({
    articles: state.articles,
  }));

  return (
    <div className={classnames(styles.listContainer, className)} style={style}>
      <For
        data={articles}
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
  )
}

export default ArticleList;