import { useEffect, useRef, useState } from "react";
import { Descendant } from "slate";
import { useSearchParams } from "react-router-dom";

import Editor, { EditorRef } from "@/components/Editor";
import AddTag from "@/components/AddTag";
import EditText from "@/components/EditText";
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
import { useRafInterval, useUnmount } from "ahooks";

import styles from "./index.module.less";
import { EditCardContext } from "@/context";

const customExtensions = [cardLinkExtension, fileAttachmentExtension];

const SingleArticleEditor = () => {
  const [searchParams] = useSearchParams();
  const articleId = Number(searchParams.get("articleId"));
  const databaseName = searchParams.get("databaseName");

  const [editingArticle, setEditingArticle] = useState<any | null>(null);
  const [content, setContent] = useState<Descendant[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [title, setTitle] = useState<string>("");

  const editorRef = useRef<EditorRef>(null);
  const uploadResource = useUploadResource();

  useEffect(() => {
    if (!databaseName || !articleId) {
      return;
    }

    const loadArticle = async (articleId: number) => {
      try {
        const article = await findOneArticle(articleId);
        console.log("article", article, articleId);
        setEditingArticle(article);
        setContent(article.content);
        setTags(article.tags);
        setTitle(article.title);
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

  const onContentChange = (value: Descendant[]) => {
    setContent(value);
  };

  const onTitleChange = (value: string) => {
    setTitle(value);
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

  const saveArticle = async () => {
    if (!editingArticle) return;

    try {
      await updateArticle({
        ...editingArticle,
        title,
        content,
        tags,
      });
    } catch (error) {
      console.error("Failed to save article:", error);
    }
  };

  useRafInterval(() => {
    saveArticle();
  }, 1000);

  useUnmount(() => {
    saveArticle();
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
          defaultValue={title}
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
              initValue={content}
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
          tags={tags}
          addTag={onAddTag}
          removeTag={onDeleteTag}
          readonly={false}
        />
      </div>
    </div>
  );
};

export default SingleArticleEditor;
