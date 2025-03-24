import React, { useEffect, useState, useRef } from "react";
import { Empty } from "antd";
import { useMemoizedFn } from "ahooks";
import { LoadingOutlined } from "@ant-design/icons";

import Editor from "@editor/index.tsx";
import EditText, { EditTextHandle } from "@/components/EditText";

import {
  fileAttachmentExtension,
  cardLinkExtension,
} from "@/editor-extensions";

import { IArticle } from "@/types";
import { findOneArticle, updateArticle } from "@/commands";
import { Descendant } from "slate";

import styles from "./index.module.less";

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
  const titleRef = useRef<EditTextHandle>(null);

  const fetchArticle = useMemoizedFn(async () => {
    setLoading(true);
    try {
      const fetchedArticle = await findOneArticle(Number(articleId));
      setArticle(fetchedArticle);
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
    fetchArticle();
  }, [articleId, fetchArticle]);

  const handleTitleChange = useMemoizedFn(async (title: string) => {
    if (!article || title === article.title) return;

    try {
      const updatedArticle = await updateArticle({
        ...article,
        title,
      });
      setArticle(updatedArticle);

      if (onTitleChange) {
        onTitleChange(title);
      }
    } catch (error) {
      console.error("Error updating article title:", error);
    }
  });

  const handleContentChange = useMemoizedFn(async (content: Descendant[]) => {
    if (!article) return;

    try {
      const updatedArticle = await updateArticle({
        ...article,
        content,
      });
      setArticle(updatedArticle);
    } catch (error) {
      console.error("Error updating article content:", error);
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
