import classnames from "classnames";
import dayjs from "dayjs";
import { CalendarOutlined } from '@ant-design/icons';

import useSettingStore from "@/hooks/useSettingStore.ts";
import Editor from "@/components/Editor";
import {IArticle} from "@/types";

import styles from './index.module.less';
import Tags from "@/components/Tags";

interface IArticleCardProps {
  article: IArticle;
  className?: string;
  style?: React.CSSProperties;
  imageRight?: boolean;
  onClick?: () => void;
}

const allThemes = [styles.green, styles.blue, styles.red, styles.yellow, styles.purple];

const ArticleCard = (props: IArticleCardProps) => {
  const {
    darkMode,
  } = useSettingStore(state => ({
    darkMode: state.darkMode,
  }));

  const {
    article,
    className,
    style,
    imageRight,
    onClick,
  } = props;

  const randomTheme = allThemes[Math.floor(Math.random() * allThemes.length)];
  const cardClassName = classnames(
    styles.articleCard,
    randomTheme,
    {
      [styles.right]: imageRight,
      [styles.dark]: darkMode,
    },
    className
  )

  return (
    <div className={cardClassName} style={style}>
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
        </div>
        <div>
          <Tags tags={article.tags} showIcon noWrap />
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