import {memo, useEffect, useRef} from "react";
import { Descendant } from "slate";
import { Tag } from "antd";
import dayjs from "dayjs";

import Editor, {EditorRef} from "@/pages/Editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import Footer from "./Footer";
import styles from './index.module.less';

import { ICard } from "@/types";
import { TAG_COLORS } from '@/constants';

interface CardItemProps {
  card: ICard;
}

const CardItem = memo((props: CardItemProps) => {
  const { card } = props;
  const { content, update_time, tags } = card;
  const initValue: Descendant[] = JSON.parse(content);

  const ref = useRef<EditorRef>(null);

  useEffect(() => {
    const editor = ref.current;
    if (editor) {
      editor.setEditorValue(JSON.parse(card.content));
    }
  }, [card.content]);

  return (
    <div className={styles.item}>
      <div className={styles.tags}>
        {
          tags
            .split(',')
            .filter(tag => !!tag)
            .map(
              (tag, index) => (
                <Tag
                  color={TAG_COLORS[index % TAG_COLORS.length]}
                  key={tag}>
                  {tag}
                </Tag>
              )
            )
        }
      </div>
      <div className={styles.time}>
        更新于 {dayjs(update_time).format('YYYY/MM/DD HH:mm:ss')}
      </div>
      <div className={styles.content}>
        <ErrorBoundary>
          <Editor ref={ref} initValue={initValue} readonly={true} />
        </ErrorBoundary>
      </div>
      <Footer cardId={card.id} />
    </div>
  )
});

export default CardItem;
