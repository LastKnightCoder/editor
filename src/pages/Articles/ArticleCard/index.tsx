import classnames from "classnames";
import dayjs from "dayjs";
import { CalendarOutlined, TagsOutlined } from '@ant-design/icons';

import Editor from "@/components/Editor";
import {IArticle} from "@/types";

import styles from './index.module.less';

interface IArticleCardProps {
  article: IArticle;
  className?: string;
  style?: React.CSSProperties;
  imageRight?: boolean;
  onClick?: () => void;
}

const ArticleCard = (props: IArticleCardProps) => {
  const {
    article,
    className,
    style,
    imageRight,
    onClick,
  } = props;

  return (
    <div className={classnames(styles.articleCard, className)} style={style}>
      <div className={classnames(styles.imageContainer, { [styles.right]: imageRight })} onClick={onClick}>
        <img src={'https://cdn.jsdelivr.net/gh/LastKnightCoder/ImgHosting2/20210402153806.png'} />
      </div>
      <div className={styles.content}>
        <div className={styles.title} onClick={onClick}>{article.title}</div>
        <div className={styles.timeAndTags}>
          <div className={styles.time}>
            <CalendarOutlined />
            <span className={styles.date}>
              发表于{dayjs(article.update_time).format('YYYY-MM-DD HH:mm:ss')}
            </span>
          </div>
          <div className={styles.divider}>|</div>
          <div className={styles.time}>
            <TagsOutlined />
            <span className={styles.tags}>{article.tags.slice(0, 3).join(' ') || '无标签'}</span>
          </div>
        </div>
        <Editor
          initValue={article.content.slice(0, 1)}
          readonly
        />
      </div>
    </div>
  )
}

export default ArticleCard;