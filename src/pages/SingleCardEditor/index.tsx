import { useEffect, useRef, useState } from "react";
import { Descendant } from "slate";
import { useSearchParams } from "react-router-dom";

import Editor, { EditorRef } from "@/components/Editor";
import AddTag from "@/components/AddTag";
import ErrorBoundary from "@/components/ErrorBoundary";

import useUploadResource from "@/hooks/useUploadResource.ts";
import {
  cardLinkExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";
import {
  getCardById,
  updateCard,
  connectDatabaseByName,
  closeDatabase,
} from "@/commands";
import { ICard } from "@/types";
import { formatDate } from "@/utils";
import { useRafInterval, useUnmount } from "ahooks";

import styles from "./index.module.less";

const customExtensions = [cardLinkExtension, fileAttachmentExtension];

const SingleCardEditor = () => {
  const [searchParams] = useSearchParams();
  const cardId = Number(searchParams.get("cardId"));
  const databaseName = searchParams.get("databaseName");

  const [editingCard, setEditingCard] = useState<ICard | null>(null);
  const [content, setContent] = useState<Descendant[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  const editorRef = useRef<EditorRef>(null);
  const uploadResource = useUploadResource();

  useEffect(() => {
    if (!databaseName || !cardId) {
      return;
    }

    const loadCard = async (cardId: number) => {
      try {
        const card = await getCardById(cardId);
        setEditingCard(card);
        setContent(card.content);
        setTags(card.tags);
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

  const onContentChange = (value: Descendant[]) => {
    setContent(value);
  };

  const onAddTag = (tag: string) => {
    if (tags.includes(tag)) {
      return;
    }
    setTags([...tags, tag]);
  };

  const onDeleteTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const saveCard = async () => {
    if (!editingCard) return;

    try {
      await updateCard({
        ...editingCard,
        content,
        tags,
      });
    } catch (error) {
      console.error("Failed to save card:", error);
    }
  };

  useRafInterval(() => {
    saveCard();
  }, 1000);

  useUnmount(() => {
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
      <div className={styles.editor}>
        <ErrorBoundary>
          <Editor
            ref={editorRef}
            initValue={content}
            onChange={onContentChange}
            extensions={customExtensions}
            readonly={false}
            uploadResource={uploadResource}
          />
        </ErrorBoundary>
      </div>
      <div className={styles.addTag}>
        <AddTag
          tags={tags}
          addTag={onAddTag}
          removeTag={onDeleteTag}
          readonly={false}
        />
      </div>
    </div>
  );
};

export default SingleCardEditor;
