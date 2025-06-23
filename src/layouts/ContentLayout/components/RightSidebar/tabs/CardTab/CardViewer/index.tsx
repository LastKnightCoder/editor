import { getCardById, updateCard } from "@/commands";
import { ICard } from "@/types";
import { Empty } from "antd";
import { Descendant } from "slate";
import { useState, useEffect, memo, useRef } from "react";
import styles from "./index.module.less";
import { formatDate, getEditorText } from "@/utils";
import Editor, { EditorRef } from "@/components/Editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import Tags from "@/components/Tags";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";
import { LoadingOutlined } from "@ant-design/icons";
import { defaultCardEventBus } from "@/utils";
import { useRightSidebarContext } from "../../../RightSidebarContext";
import { useWindowFocus } from "@/hooks/useWindowFocus";
import useEditContent from "@/hooks/useEditContent";
import useUploadResource from "@/hooks/useUploadResource";

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
];

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
  const uploadResource = useUploadResource();

  const cardEventBus = useCreation(
    () => defaultCardEventBus.createEditor(),
    [],
  );

  const { throttleHandleEditorContentChange } = useEditContent(
    card?.contentId,
    (content) => {
      editorRef.current?.setEditorValue(content);
      onTitleChange(getEditorText(content, 10));
    },
  );

  const isWindowFocused = useWindowFocus();

  useEffect(() => {
    if (!visible || !isConnected) return;
    setLoading(true);
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
    const changed =
      JSON.stringify({
        ...card,
        content: undefined,
        count: undefined,
      }) !==
      JSON.stringify({
        ...prevCard.current,
        content: undefined,
        count: undefined,
      });
    if (!changed) return null;
    const updatedCard = await updateCard(card);
    prevCard.current = updatedCard;
    setCard(updatedCard);
    return updatedCard;
  });

  useRafInterval(async () => {
    const updatedCard = await handleSaveCard();
    if (updatedCard) {
      cardEventBus.publishCardEvent("card:updated", updatedCard);
    }
  }, 500);

  useUnmount(async () => {
    throttleHandleEditorContentChange.flush();
    const updatedCard = await handleSaveCard();
    if (updatedCard) {
      cardEventBus.publishCardEvent("card:updated", updatedCard);
    }
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    if (isWindowFocused && editorRef.current?.isFocus()) {
      throttleHandleEditorContentChange(content);
    }
    onTitleChange(getEditorText(content, 10));
  });

  useEffect(() => {
    const unsubscribe = cardEventBus.subscribeToCardWithId(
      "card:updated",
      Number(cardId),
      (data) => {
        setCard(data.card);
        prevCard.current = data.card;
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
          uploadResource={uploadResource}
        />
      </ErrorBoundary>
      {card.tags.length > 0 && (
        <Tags className={styles.tags} tags={card.tags} showIcon />
      )}
    </div>
  );
});

export default CardViewer;
