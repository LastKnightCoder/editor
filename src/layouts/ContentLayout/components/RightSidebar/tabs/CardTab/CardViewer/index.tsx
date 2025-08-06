import { getCardById, updateCard } from "@/commands";
import { ICard } from "@/types";
import { Empty, App } from "antd";
import { Descendant } from "slate";
import { useState, useEffect, memo, useRef } from "react";
import styles from "./index.module.less";
import { formatDate, getEditorText } from "@/utils";
import Editor, { EditorRef } from "@/components/Editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";
import { LoadingOutlined } from "@ant-design/icons";
import { defaultCardEventBus } from "@/utils";
import { useRightSidebarContext } from "../../../RightSidebarContext";
import useEditContent from "@/hooks/useEditContent";
import useUploadResource from "@/hooks/useUploadResource";
import AddTag from "@/components/AddTag";
import { produce } from "immer";

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
  const { message } = App.useApp();
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
    throttleHandleEditorContentChange(content);
    onTitleChange(getEditorText(content, 10));
  });

  const handleAddTag = useMemoizedFn((tag: string) => {
    if (!card) return;
    if (card.tags.includes(tag)) return;
    const updatedCard = produce(card, (draft) => {
      draft.tags.push(tag);
    });
    setCard(updatedCard);
  });
  const handleDeleteTag = useMemoizedFn((tag: string) => {
    if (!card) return;
    const updatedCard = produce(card, (draft) => {
      draft.tags = draft.tags.filter((t) => t !== tag);
    });
    setCard(updatedCard);
  });

  const handleEditTag = useMemoizedFn((oldTag: string, newTag: string) => {
    if (!card || !newTag || newTag === oldTag) return;
    if (card.tags.includes(newTag)) {
      message.warning("标签已存在");
      return;
    }
    // 直接替换标签，保持顺序
    const updatedCard = produce(card, (draft) => {
      const index = draft.tags.indexOf(oldTag);
      if (index !== -1) {
        draft.tags[index] = newTag;
      }
    });
    setCard(updatedCard);
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
      <AddTag
        tags={card.tags}
        addTag={handleAddTag}
        removeTag={handleDeleteTag}
        editTag={handleEditTag}
        readonly={false}
      />
    </div>
  );
});

export default CardViewer;
