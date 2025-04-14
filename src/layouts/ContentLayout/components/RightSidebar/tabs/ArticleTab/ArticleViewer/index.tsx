import React, { useEffect, useState, useRef } from "react";
import { Empty } from "antd";
import { useMemoizedFn, useCreation, useRafInterval, useUnmount } from "ahooks";
import { LoadingOutlined } from "@ant-design/icons";

import Editor, { EditorRef } from "@editor/index.tsx";
import EditText, { EditTextHandle } from "@/components/EditText";

import {
  fileAttachmentExtension,
  contentLinkExtension,
  questionCardExtension,
} from "@/editor-extensions";

import { IArticle } from "@/types";
import { findOneArticle, updateArticle } from "@/commands";
import { Descendant } from "slate";
import { defaultArticleEventBus } from "@/utils/event-bus/article-event-bus";
import { useRightSidebarContext } from "../../../RightSidebarContext";

import styles from "./index.module.less";
import { useWindowFocus } from "@/hooks/useWindowFocus";
import useEditContent from "@/hooks/useEditContent";

interface ArticleViewerProps {
  articleId: string;
  onTitleChange?: (title: string) => void;
}

const customExtensions = [
  fileAttachmentExtension,
  contentLinkExtension,
  questionCardExtension,
];

const ArticleViewer: React.FC<ArticleViewerProps> = ({
  articleId,
  onTitleChange,
}) => {
  const [article, setArticle] = useState<IArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const editorRef = useRef<EditorRef>(null);
  const titleRef = useRef<EditTextHandle>(null);
  const prevArticle = useRef<IArticle | null>(null);
  const { visible, isConnected } = useRightSidebarContext();
  const isWindowFocused = useWindowFocus();
  const { throttleHandleEditorContentChange } = useEditContent(
    article?.contentId,
    (content) => {
      editorRef.current?.setEditorValue(content);
    },
  );

  const articleEventBus = useCreation(
    () => defaultArticleEventBus.createEditor(),
    [],
  );

  const fetchArticle = useMemoizedFn(async () => {
    setLoading(true);
    try {
      const fetchedArticle = await findOneArticle(Number(articleId));
      setArticle(fetchedArticle);
      prevArticle.current = fetchedArticle;
      if (onTitleChange) {
        onTitleChange(fetchedArticle.title);
      }
    } catch (error) {
      console.error("Error fetching article:", error);
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (visible && isConnected) {
      fetchArticle();
    }
  }, [articleId, fetchArticle, visible, isConnected]);

  useEffect(() => {
    const unsubscribe = articleEventBus.subscribeToArticleWithId(
      "article:updated",
      Number(articleId),
      (data) => {
        setArticle(data.article);
        prevArticle.current = data.article;
        titleRef.current?.setValue(data.article.title);
        if (onTitleChange) {
          onTitleChange(data.article.title);
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [articleId, onTitleChange, articleEventBus]);

  const handleSaveArticle = useMemoizedFn(async () => {
    if (!article) return null;
    const changed =
      JSON.stringify({
        ...article,
        content: undefined,
        count: undefined,
      }) !==
      JSON.stringify({
        ...prevArticle.current,
        content: undefined,
        count: undefined,
      });
    if (!changed) return null;
    const updatedArticle = await updateArticle(article);
    prevArticle.current = updatedArticle;
    setArticle(updatedArticle);
    return updatedArticle;
  });

  useRafInterval(async () => {
    if (!article || !isWindowFocused || !titleRef.current?.isFocus()) return;
    const updatedArticle = await handleSaveArticle();
    if (updatedArticle) {
      articleEventBus.publishArticleEvent("article:updated", updatedArticle);
    }
  }, 500);

  useUnmount(async () => {
    throttleHandleEditorContentChange.flush();
    const updatedArticle = await handleSaveArticle();
    if (updatedArticle) {
      articleEventBus.publishArticleEvent("article:updated", updatedArticle);
    }
  });

  const handleTitleChange = useMemoizedFn(async (title: string) => {
    if (!article) return;
    setArticle({
      ...article,
      title,
    });
    if (onTitleChange) {
      onTitleChange(title);
    }
  });

  const handleContentChange = useMemoizedFn((content: Descendant[]) => {
    if (isWindowFocused && editorRef.current?.isFocus()) {
      throttleHandleEditorContentChange(content);
    }
  });

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <LoadingOutlined />
      </div>
    );
  }

  if (!article) {
    return (
      <div className={styles.errorContainer}>
        <Empty description="文章不存在或已被删除" />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleContainer}>
        <EditText
          ref={titleRef}
          defaultValue={article.title}
          className={styles.title}
          contentEditable={true}
          onChange={handleTitleChange}
        />
      </div>
      <div className={styles.contentContainer}>
        <Editor
          ref={editorRef}
          initValue={article.content}
          onChange={handleContentChange}
          readonly={false}
          extensions={customExtensions}
        />
      </div>
    </div>
  );
};

export default ArticleViewer;
