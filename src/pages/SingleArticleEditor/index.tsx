import { useEffect, useRef, useState } from "react";
import { Descendant } from "slate";
import { useSearchParams } from "react-router-dom";

import Editor, { EditorRef } from "@/components/Editor";
import AddTag from "@/components/AddTag";
import EditText, { EditTextHandle } from "@/components/EditText";
import ErrorBoundary from "@/components/ErrorBoundary";
import EditorOutline from "@/components/EditorOutline";

import useUploadResource from "@/hooks/useUploadResource.ts";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";
import {
  findOneArticle,
  updateArticle,
  connectDatabaseByName,
  closeDatabase,
} from "@/commands";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";

import styles from "./index.module.less";
import { EditCardContext } from "@/context";
import { IArticle } from "@/types";
import { defaultArticleEventBus } from "@/utils";
import useEditContent from "@/hooks/useEditContent";

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
];

const SingleArticleEditor = () => {
  const articleEventBus = useCreation(
    () => defaultArticleEventBus.createEditor(),
    [],
  );
  const [searchParams] = useSearchParams();
  const articleId = Number(searchParams.get("articleId"));
  const databaseName = searchParams.get("databaseName");

  const [editingArticle, setEditingArticle] = useState<IArticle | null>(null);

  const editorRef = useRef<EditorRef>(null);
  const titleRef = useRef<EditTextHandle>(null);
  const prevArticleRef = useRef<IArticle | null>(null);
  const uploadResource = useUploadResource();

  const { throttleHandleEditorContentChange } = useEditContent(
    editingArticle?.contentId,
    (content) => {
      editorRef.current?.setEditorValue(content);
    },
  );

  const onClickHeader = useMemoizedFn((index: number) => {
    if (!editorRef.current) return;
    editorRef.current.scrollHeaderIntoView(index);
  });

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
        titleRef.current?.setValue(data.article.title);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [articleId, articleEventBus]);

  const handleArticleContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!editingArticle) return;
    setEditingArticle({
      ...editingArticle,
      content,
    });
  });

  const onTitleChange = useMemoizedFn((value: string) => {
    if (!editingArticle) return;
    setEditingArticle({
      ...editingArticle,
      title: value,
    });
  });

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

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    throttleHandleEditorContentChange(content);
    handleArticleContentChange(content);
  });

  const saveArticle = useMemoizedFn(async () => {
    if (!editingArticle) return;
    const changed =
      JSON.stringify({
        ...editingArticle,
        content: undefined,
        count: undefined,
      }) !==
      JSON.stringify({
        ...prevArticleRef.current,
        content: undefined,
        count: undefined,
      });
    if (!changed) return;

    try {
      const updatedArticle = await updateArticle(editingArticle);
      setEditingArticle(updatedArticle);
      prevArticleRef.current = updatedArticle;
    } catch (error) {
      console.error("Failed to save article:", error);
    }
  });

  useRafInterval(() => {
    saveArticle();
  }, 500);

  useUnmount(() => {
    throttleHandleEditorContentChange.flush();
    saveArticle();
  });

  if (!editingArticle) {
    return <div className={styles.loading}>Loading article...</div>;
  }

  return (
    <div className={styles.singleArticleEditorContainer}>
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
      <div className={styles.editorContainer}>
        <div className={styles.contentEditor}>
          <EditCardContext.Provider
            value={{
              cardId: -1,
            }}
          >
            <ErrorBoundary>
              <Editor
                className={styles.editor}
                ref={editorRef}
                initValue={editingArticle.content}
                onChange={onContentChange}
                extensions={customExtensions}
                readonly={false}
                uploadResource={uploadResource}
              />
            </ErrorBoundary>
          </EditCardContext.Provider>
          <div className={styles.outlineContainer}>
            <EditorOutline
              className={styles.outline}
              content={editingArticle.content}
              show={true}
              onClickHeader={onClickHeader}
            />
          </div>
        </div>
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
