import { memo } from 'react';
import { Typography } from 'antd';
import classnames from "classnames";

import Tags from "@/components/Tags";

import { getEditorTextValue } from "@/utils";
import { IArticle } from "@/types";

import styles from './index.module.less';

interface IArticleItemProps {
  article: IArticle;
  active?: boolean;
  onClickArticle?: (article: IArticle) => void;
}

const { Paragraph } = Typography;

const ArticleItem = memo((props: IArticleItemProps) => {
  const { article, active = false, onClickArticle } = props;

  return (
    <div className={classnames(styles.articleItem, { [styles.active]: active })} onClick={() => {
      onClickArticle?.(article);
    }}>
      <div className={styles.cover} style={{
        backgroundImage: `url(${article.bannerBg || 'https://cdn.jsdelivr.net/gh/LastKnightCoder/ImgHosting2/20210402153806.png'})`,
      }}>
        <div className={styles.title}>
          {article.title}
        </div>
      </div>
      <div className={styles.content}>
        <Paragraph ellipsis={{ rows: 2 }}>
          {getEditorTextValue(article.content)}
        </Paragraph>
      </div>
      <div className={styles.tags}>
        <Tags tags={article.tags} showIcon tagStyle={active ? { backgroundColor: '#FDE9E2' } : {}} />
      </div>
    </div>
  )
});

export default ArticleItem;
