import { memo, useEffect, useRef } from "react";
import dayjs from "dayjs";

import Editor, {EditorRef} from "@/pages/Editor";
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

  const ref = useRef<EditorRef>(null);

  // 由于编辑器是非受控，得手动更新
  useEffect(() => {
    if (ref.current && content) {
      ref.current.setEditorValue(content);
    }
  }, [JSON.stringify(content)]);

  return (
    <div className={styles.item}>
      <Tags tags={tags} />
      <div className={styles.time}>
        更新于 {dayjs(update_time).format('YYYY/MM/DD HH:mm:ss')}
      </div>
      <div className={styles.content}>
        <ErrorBoundary>
          <Editor ref={ref} initValue={content || undefined} readonly={true} />
        </ErrorBoundary>
      </div>
      <Footer cardId={card.id} />
    </div>
  )
});

export default CardItem;
