import { getCardById, updateCard } from "@/commands";
import { ICard } from "@/types";
import { Empty } from "antd";
import { useState, useEffect, memo, useRef } from "react";
import styles from "./index.module.less";
import { formatDate, getEditorText } from "@/utils";
import Editor, { EditorRef } from "@/components/Editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import Tags from "@/components/Tags";
import {
  cardLinkExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";
import { Descendant } from "slate";
import {
  useCreation,
  useDebounceFn,
  useMemoizedFn,
  useRafInterval,
  useUnmount,
} from "ahooks";
import { LoadingOutlined } from "@ant-design/icons";
import { defaultCardEventBus } from "@/utils";
import { useRightSidebarContext } from "../../../RightSidebarContext";
import { useWindowFocus } from "@/hooks/useWindowFocus";

const customExtensions = [cardLinkExtension, fileAttachmentExtension];

interface CardViewerProps {
  cardId: string;
  onTitleChange: (title: string) => void;
}

const CardViewer = memo(({ cardId, onTitleChange }: CardViewerProps) => {
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<ICard | null>(null);
  const editorRef = useRef<EditorRef>(null);
  const { visible, isConnected } = useRightSidebarContext();
  const prevCard = useRef<ICard | null>(null);

  const cardEventBus = useCreation(
    () => defaultCardEventBus.createEditor(),
    [],
  );

  const isWindowFocused = useWindowFocus();

  useEffect(() => {
    if (!visible || !isConnected) return;
    getCardById(Number(cardId))
      .then((card) => {
        setCard(card);
        prevCard.current = card;
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [cardId, visible, isConnected]);

  const handleSaveCard = useMemoizedFn(async () => {
    if (!card) return;
    const changed = JSON.stringify(card) !== JSON.stringify(prevCard.current);
    if (!changed) return null;
    const updatedCard = await updateCard(card);
    prevCard.current = updatedCard;
    setCard(updatedCard);
    return updatedCard;
  });

  useRafInterval(async () => {
    if (
      !card ||
      !editorRef.current ||
      !editorRef.current.isFocus() ||
      !isWindowFocused
    )
      return;
    const updatedCard = await handleSaveCard();
    if (updatedCard) {
      cardEventBus.publishCardEvent("card:updated", updatedCard);
    }
  }, 3000);

  useUnmount(async () => {
    onContentChange.flush();
    setTimeout(async () => {
      const updatedCard = await handleSaveCard();
      if (updatedCard) {
        cardEventBus.publishCardEvent("card:updated", updatedCard);
      }
    }, 200);
  });

  const { run: onContentChange } = useDebounceFn(
    (content: Descendant[]) => {
      if (!card) return;
      setCard({
        ...card,
        content: content,
      });
    },
    { wait: 200 },
  );

  useEffect(() => {
    const unsubscribe = cardEventBus.subscribeToCardWithId(
      "card:updated",
      Number(cardId),
      (data) => {
        setCard(data.card);
        prevCard.current = data.card;
        onTitleChange(getEditorText(data.card.content, 10));
        editorRef.current?.setEditorValue(data.card.content);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [cardId, cardEventBus]);

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
          ref={editorRef}
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
