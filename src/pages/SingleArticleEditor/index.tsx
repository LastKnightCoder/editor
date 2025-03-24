import { useEffect, useRef, useState } from "react";
import { Descendant } from "slate";
import { useSearchParams } from "react-router-dom";

import Editor, { EditorRef } from "@/components/Editor";
import AddTag from "@/components/AddTag";
import EditText, { EditTextHandle } from "@/components/EditText";
import ErrorBoundary from "@/components/ErrorBoundary";

import useUploadResource from "@/hooks/useUploadResource.ts";
import {
  cardLinkExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";
import {
  findOneArticle,
  updateArticle,
  connectDatabaseByName,
  closeDatabase,
} from "@/commands";
import { formatDate } from "@/utils";
import { useCreation, useRafInterval, useUnmount } from "ahooks";

import styles from "./index.module.less";
import { EditCardContext } from "@/context";
import { IArticle } from "@/types";
import { defaultArticleEventBus } from "@/utils";
import { useWindowFocus } from "@/hooks/useWindowFocus";

const customExtensions = [cardLinkExtension, fileAttachmentExtension];

const SingleArticleEditor = () => {
  const articleEventBus = useCreation(
    () => defaultArticleEventBus.createEditor(),
    [],
  );
  const [searchParams] = useSearchParams();
  const articleId = Number(searchParams.get("articleId"));
  const databaseName = searchParams.get("databaseName");

  const [editingArticle, setEditingArticle] = useState<IArticle | null>(null);
  const isWindowFocused = useWindowFocus();

  const editorRef = useRef<EditorRef>(null);
  const titleRef = useRef<EditTextHandle>(null);
  const prevArticleRef = useRef<IArticle | null>(null);
  const uploadResource = useUploadResource();

  useEffect(() => {
    if (!databaseName || !articleId) {
      return;
    }

    const loadArticle = async (articleId: number) => {
      try {
        const article = await findOneArticle(articleId);
        setEditingArticle(article);
        prevArticleRef.current = article;
      } catch (error) {
        console.error("Failed to load article:", error);
      }
    };

    connectDatabaseByName(databaseName).then(() => {
      loadArticle(articleId);
    });

    return () => {
      closeDatabase(databaseName);
    };
  }, [databaseName, articleId]);

  useEffect(() => {
    const unsubscribe = articleEventBus.subscribeToArticleWithId(
      "article:updated",
      articleId,
      (data) => {
        setEditingArticle(data.article);
        editorRef.current?.setEditorValue(data.article.content);
        titleRef.current?.setValue(data.article.title);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [articleId]);

  const onContentChange = (value: Descendant[]) => {
    if (
      !editingArticle ||
      !editorRef.current ||
      !editorRef.current.isFocus() ||
      !isWindowFocused
    )
      return;
    setEditingArticle({
      ...editingArticle,
      content: value,
    });
  };

  const onTitleChange = (value: string) => {
    if (
      !editingArticle ||
      !titleRef.current ||
      !titleRef.current.isFocus() ||
      !isWindowFocused
    )
      return;
    setEditingArticle({
      ...editingArticle,
      title: value,
    });
  };

  const onAddTag = (tag: string) => {
    if (!editingArticle) return;
    if (editingArticle.tags.includes(tag)) {
      return;
    }
    setEditingArticle({
      ...editingArticle,
      tags: [...editingArticle.tags, tag],
    });
  };

  const onDeleteTag = (tag: string) => {
    if (!editingArticle) return;
    setEditingArticle({
      ...editingArticle,
      tags: editingArticle.tags.filter((t) => t !== tag),
    });
  };

  const saveArticle = async (forceSave = false) => {
    if (!editingArticle) return;
    const changed =
      JSON.stringify(editingArticle) !== JSON.stringify(prevArticleRef.current);
    if (
      ((!editorRef.current?.isFocus() && !titleRef.current?.isFocus()) ||
        !isWindowFocused ||
        !changed) &&
      !forceSave
    )
      return;

    try {
      const updatedArticle = await updateArticle(editingArticle);
      setEditingArticle(updatedArticle);
      prevArticleRef.current = updatedArticle;
    } catch (error) {
      console.error("Failed to save article:", error);
    }
  };

  useRafInterval(() => {
    saveArticle();
  }, 3000);

  useUnmount(() => {
    saveArticle(true);
  });

  if (!editingArticle) {
    return <div className={styles.loading}>Loading article...</div>;
  }

  return (
    <div className={styles.singleArticleEditorContainer}>
      <div className={styles.time}>
        <div>
          <span>创建于 {formatDate(editingArticle.create_time, true)}</span>
        </div>
        <div>
          <span>最后修改于 {formatDate(editingArticle.update_time, true)}</span>
        </div>
      </div>
      <div className={styles.title}>
        <EditText
          ref={titleRef}
          defaultValue={editingArticle.title}
          onChange={onTitleChange}
          onPressEnter={() => {
            editorRef.current?.focus();
          }}
          contentEditable={true}
        />
      </div>
      <div className={styles.editor}>
        <EditCardContext.Provider
          value={{
            cardId: -1,
          }}
        >
          <ErrorBoundary>
            <Editor
              ref={editorRef}
              initValue={editingArticle.content}
              onChange={onContentChange}
              extensions={customExtensions}
              readonly={false}
              uploadResource={uploadResource}
            />
          </ErrorBoundary>
        </EditCardContext.Provider>
      </div>
      <div className={styles.addTag}>
        <AddTag
          tags={editingArticle.tags}
          addTag={onAddTag}
          removeTag={onDeleteTag}
          readonly={false}
        />
      </div>
    </div>
  );
};

export default SingleArticleEditor;
