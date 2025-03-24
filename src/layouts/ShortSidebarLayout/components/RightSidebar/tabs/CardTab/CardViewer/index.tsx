import { getCardById, updateCard } from "@/commands";
import { ICard } from "@/types";
import { Empty } from "antd";
import { useState, useEffect, memo } from "react";
import styles from "./index.module.less";
import { formatDate, getEditorText } from "@/utils";
import Editor from "@/components/Editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import Tags from "@/components/Tags";
import {
  cardLinkExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import { LoadingOutlined } from "@ant-design/icons";

const customExtensions = [cardLinkExtension, fileAttachmentExtension];

interface CardViewerProps {
  cardId: string;
  onTitleChange: (title: string) => void;
}

const CardViewer = memo(({ cardId, onTitleChange }: CardViewerProps) => {
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<ICard | null>(null);

  useEffect(() => {
    getCardById(Number(cardId))
      .then((card) => {
        setCard(card);
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [cardId]);

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!card) return;
    updateCard({
      ...card,
      content: content,
    })
      .then((card) => {
        setCard(card);
        onTitleChange(getEditorText(content, 10));
      })
      .catch((error) => {
        console.error(error);
      });
  });

  if (loading) {
    return (
      <div className={styles.loading}>
        <LoadingOutlined />
      </div>
    );
  }

  if (!card) {
    return <Empty description="卡片不存在" />;
  }

  return (
    <div className={styles.itemContainer}>
      <div className={styles.time}>
        <span>创建于：{formatDate(card.create_time, true)}</span>
        <span>更新于：{formatDate(card.update_time, true)}</span>
      </div>
      <ErrorBoundary>
        <Editor
          className={styles.content}
          initValue={card.content}
          extensions={customExtensions}
          onChange={onContentChange}
          readonly={false}
        />
      </ErrorBoundary>
      {card.tags.length > 0 && (
        <Tags className={styles.tags} tags={card.tags} showIcon />
      )}
    </div>
  );
});

export default CardViewer;
