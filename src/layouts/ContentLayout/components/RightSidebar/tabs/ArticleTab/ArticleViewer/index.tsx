import React, { useEffect, useState, useRef } from "react";
import { Empty } from "antd";
import {
  useMemoizedFn,
  useCreation,
  useRafInterval,
  useDebounceFn,
  useUnmount,
} from "ahooks";
import { LoadingOutlined } from "@ant-design/icons";

import Editor, { EditorRef } from "@editor/index.tsx";
import EditText, { EditTextHandle } from "@/components/EditText";

import {
  fileAttachmentExtension,
  cardLinkExtension,
} from "@/editor-extensions";

import { IArticle } from "@/types";
import { findOneArticle, updateArticle } from "@/commands";
import { Descendant } from "slate";
import { defaultArticleEventBus } from "@/utils/event-bus/article-event-bus";
import { useRightSidebarContext } from "../../../RightSidebarContext";

import styles from "./index.module.less";
import { useWindowFocus } from "@/hooks/useWindowFocus";

interface ArticleViewerProps {
  articleId: string;
  onTitleChange?: (title: string) => void;
}

const customExtensions = [fileAttachmentExtension, cardLinkExtension];

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
        editorRef.current?.setEditorValue(data.article.content);
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
      JSON.stringify(article) !== JSON.stringify(prevArticle.current);
    if (!changed) return null;
    const updatedArticle = await updateArticle(article);
    prevArticle.current = updatedArticle;
    setArticle(updatedArticle);
    return updatedArticle;
  });

  useRafInterval(async () => {
    if (
      !article ||
      !isWindowFocused ||
      (!titleRef.current?.isFocus() && !editorRef.current?.isFocus())
    )
      return;
    const changed =
      JSON.stringify(article) !== JSON.stringify(prevArticle.current);
    if (!changed) return;
    const updatedArticle = await handleSaveArticle();
    if (updatedArticle) {
      articleEventBus.publishArticleEvent("article:updated", updatedArticle);
    }
  }, 3000);

  useUnmount(async () => {
    handleTitleChange.flush();
    handleContentChange.flush();
    setTimeout(async () => {
      const updatedArticle = await handleSaveArticle();
      if (updatedArticle) {
        articleEventBus.publishArticleEvent("article:updated", updatedArticle);
      }
    }, 200);
  });

  const { run: handleTitleChange } = useDebounceFn(
    async (title: string) => {
      if (!article) return;
      setArticle({
        ...article,
        title,
      });
      if (onTitleChange) {
        onTitleChange(title);
      }
    },
    { wait: 200 },
  );

  const { run: handleContentChange } = useDebounceFn(
    async (content: Descendant[]) => {
      if (!article) return;
      setArticle({
        ...article,
        content,
      });
    },
    { wait: 200 },
  );

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
