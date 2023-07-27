import { memo } from "react";
import dayjs from "dayjs";

import Editor from "@/components/Editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import Footer from "./Footer";
import styles from './index.module.less';

import { ICard } from "@/types";
import Tags from "@/components/Tags";

interface CardItemProps {
  card: ICard;
}

const CardItem = memo((props: CardItemProps) => {
  const { card } = props;
  const { content, update_time, tags } = card;

  return (
    <div className={styles.item}>
      <Tags tags={tags} />
      <div className={styles.time}>
        更新于 {dayjs(update_time).format('YYYY/MM/DD HH:mm:ss')}
      </div>
      <div className={styles.content}>
        <ErrorBoundary>
          <Editor initValue={(content && content.length > 0) ? content.slice(0, 2) : undefined} readonly={true} />
        </ErrorBoundary>
      </div>
      <Footer cardId={card.id} />
    </div>
  )
});

export default CardItem;
