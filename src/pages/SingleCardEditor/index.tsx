import { useEffect, useRef, useState } from "react";
import { Descendant } from "slate";
import { useSearchParams } from "react-router-dom";

import Editor, { EditorRef } from "@/components/Editor";
import AddTag from "@/components/AddTag";
import ErrorBoundary from "@/components/ErrorBoundary";

import useUploadResource from "@/hooks/useUploadResource.ts";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";
import {
  getCardById,
  updateCard,
  connectDatabaseByName,
  closeDatabase,
} from "@/commands";
import { ICard } from "@/types";
import { formatDate, defaultCardEventBus } from "@/utils";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";

import styles from "./index.module.less";
import { useWindowFocus } from "@/hooks/useWindowFocus";
import useEditContent from "@/hooks/useEditContent";

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
];

const SingleCardEditor = () => {
  const cardEventBus = useCreation(
    () => defaultCardEventBus.createEditor(),
    [],
  );
  const [searchParams] = useSearchParams();
  const cardId = Number(searchParams.get("cardId"));
  const databaseName = searchParams.get("databaseName");

  const isWindowFocused = useWindowFocus();
  const [editingCard, setEditingCard] = useState<ICard | null>(null);

  const editorRef = useRef<EditorRef>(null);
  const uploadResource = useUploadResource();
  const prevCardRef = useRef<ICard | null>(null);

  const { throttleHandleEditorContentChange } = useEditContent(
    editingCard?.contentId,
    (data) => {
      editorRef.current?.setEditorValue(data);
    },
  );

  useEffect(() => {
    const unsubscribe = cardEventBus.subscribeToCardWithId(
      "card:updated",
      cardId,
      (data) => {
        setEditingCard(data.card);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [cardEventBus, cardId]);

  useEffect(() => {
    if (!databaseName || !cardId) {
      return;
    }

    const loadCard = async (cardId: number) => {
      try {
        const card = await getCardById(cardId);
        setEditingCard(card);
        prevCardRef.current = card;
      } catch (error) {
        console.error("Failed to load card:", error);
      }
    };

    connectDatabaseByName(databaseName).then(() => {
      loadCard(cardId);
    });

    return () => {
      closeDatabase(databaseName);
    };
  }, [databaseName, cardId]);

  const onCardContentChange = useMemoizedFn((value: Descendant[]) => {
    if (!editingCard) return;
    setEditingCard({
      ...editingCard,
      content: value,
    });
  });

  const onContentChange = useMemoizedFn((value: Descendant[]) => {
    if (isWindowFocused && editorRef.current?.isFocus()) {
      throttleHandleEditorContentChange(value);
    }
    onCardContentChange(value);
  });

  const onAddTag = useMemoizedFn((tag: string) => {
    if (!editingCard) return;
    const newTags = [...editingCard.tags];
    if (newTags.includes(tag)) {
      return;
    }
    newTags.push(tag);
    setEditingCard({
      ...editingCard,
      tags: newTags,
    });
  });

  const onDeleteTag = useMemoizedFn((tag: string) => {
    if (!editingCard) return;
    const newTags = editingCard.tags.filter((t) => t !== tag);
    setEditingCard({
      ...editingCard,
      tags: newTags,
    });
  });

  const saveCard = useMemoizedFn(async () => {
    if (!editingCard) return;
    const changed =
      JSON.stringify({
        ...editingCard,
        content: undefined,
        count: undefined,
      }) !==
      JSON.stringify({
        ...prevCardRef.current,
        content: undefined,
        count: undefined,
      });
    if (!isWindowFocused || !changed) return;

    try {
      const updatedCard = await updateCard(editingCard);
      setEditingCard(updatedCard);
      prevCardRef.current = updatedCard;
    } catch (error) {
      console.error("Failed to save card:", error);
    }
  });

  useRafInterval(() => {
    saveCard();
  }, 3000);

  useUnmount(() => {
    throttleHandleEditorContentChange.flush();
    saveCard();
  });

  if (!editingCard) {
    return <div className={styles.loading}>Loading card...</div>;
  }

  return (
    <div className={styles.singleCardEditorContainer}>
      <div className={styles.time}>
        <div>
          <span>创建于 {formatDate(editingCard.create_time, true)}</span>
        </div>
        <div>
          <span>最后修改于 {formatDate(editingCard.update_time, true)}</span>
        </div>
      </div>
      <div className={styles.editorContainer}>
        <ErrorBoundary>
          <Editor
            ref={editorRef}
            className={styles.editor}
            initValue={editingCard.content}
            onChange={onContentChange}
            extensions={customExtensions}
            readonly={false}
            uploadResource={uploadResource}
          />
        </ErrorBoundary>
      </div>
      <div className={styles.addTag}>
        <AddTag
          tags={editingCard.tags}
          addTag={onAddTag}
          removeTag={onDeleteTag}
          readonly={false}
        />
      </div>
    </div>
  );
};

export default SingleCardEditor;
