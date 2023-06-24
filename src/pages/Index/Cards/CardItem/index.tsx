import {memo, useEffect, useRef} from "react";
import { Descendant } from "slate";
import { Tag } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

import Editor, {EditorRef} from "@/pages/Editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import useCardsManagementStore from "../hooks/useCardsManagementStore";
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
  console.log('CardItem render', typeof initValue);


  const ref = useRef<EditorRef>(null);

  const { deleteCard, updateEditingCard, editorRef } = useCardsManagementStore((state) => ({
    deleteCard: state.deleteCard,
    updateEditingCard: state.updateEditingCard,
    editorRef: state.editorRef,
  }));

  useEffect(() => {
    const editor = ref.current;
    if (editor) {
      editor.setEditorValue(JSON.parse(card.content));
    }
  }, [card.content]);

  const handleEditCard = () => {
    const { id, content, tags } = card;
    const parsedContent = JSON.parse(content);
    updateEditingCard({
      id,
      content: parsedContent,
      tags,
    });
    if (editorRef.current) {
      editorRef.current.setEditorValue(parsedContent);
    }
  }

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
      <div className={styles.time}>更新于 {dayjs(update_time).format('YYYY/MM/DD HH:mm:ss')}</div>
        <div className={styles.content}>
          <ErrorBoundary><Editor ref={ref} initValue={initValue} readonly={true} /></ErrorBoundary>
        </div>
      <div className={styles.actions}>
        <div onClick={() => { deleteCard(card.id) }} className={styles.actionItem}>
          <DeleteOutlined />
        </div>
        <div className={styles.divider}></div>
        <div onClick={handleEditCard} className={styles.actionItem}>
          <EditOutlined />
        </div>
      </div>
    </div>
  )
});

export default CardItem;
