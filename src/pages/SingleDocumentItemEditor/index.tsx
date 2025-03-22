import { useEffect, useRef, useState } from "react";
import { Descendant } from "slate";
import { useSearchParams } from "react-router-dom";

import Editor, { EditorRef } from "@/components/Editor";
import EditText, { EditTextHandle } from "@/components/EditText";
import ErrorBoundary from "@/components/ErrorBoundary";

import useUploadResource from "@/hooks/useUploadResource.ts";
import {
  cardLinkExtension,
  fileAttachmentExtension,
  documentCardListExtension,
} from "@/editor-extensions";
import {
  getDocumentItem,
  updateDocumentItem,
  connectDatabaseByName,
  closeDatabase,
} from "@/commands";
import { formatDate, getContentLength } from "@/utils";
import { useMemoizedFn, useRafInterval, useUnmount } from "ahooks";

import styles from "./index.module.less";
import { EditCardContext } from "@/context";
import { IDocumentItem } from "@/types";

const customExtensions = [
  cardLinkExtension,
  fileAttachmentExtension,
  documentCardListExtension,
];
const editorContextValue = {
  cardId: -1,
};

const SingleDocumentItemEditor = () => {
  const [searchParams] = useSearchParams();
  const documentItemId = Number(searchParams.get("documentItemId"));
  const databaseName = searchParams.get("databaseName");

  const titleRef = useRef<EditTextHandle>(null);
  const [editingDocumentItem, setEditingDocumentItem] =
    useState<IDocumentItem | null>(null);
  const [content, setContent] = useState<Descendant[]>([]);
  const [title, setTitle] = useState<string>("");

  const editorRef = useRef<EditorRef>(null);
  const uploadResource = useUploadResource();

  useEffect(() => {
    if (!databaseName || !documentItemId) {
      return;
    }

    const loadDocumentItem = async (documentItemId: number) => {
      try {
        const documentItem = await getDocumentItem(documentItemId);
        setEditingDocumentItem(documentItem);
        setContent(documentItem.content);
        setTitle(documentItem.title);
      } catch (error) {
        console.error("Failed to load document item:", error);
      }
    };

    connectDatabaseByName(databaseName).then(() => {
      loadDocumentItem(documentItemId);
    });

    return () => {
      closeDatabase(databaseName);
    };
  }, [databaseName, documentItemId]);

  const onContentChange = useMemoizedFn((value: Descendant[]) => {
    setContent(value);
  });

  const onTitleChange = useMemoizedFn((value: string) => {
    setTitle(value);
  });

  const saveDocumentItem = useMemoizedFn(async () => {
    if (!editingDocumentItem) return;

    try {
      const wordsCount = getContentLength(content);
      await updateDocumentItem({
        ...editingDocumentItem,
        title,
        content,
        count: wordsCount,
      });
    } catch (error) {
      console.error("Failed to save document item:", error);
    }
  });

  useRafInterval(() => {
    saveDocumentItem();
  }, 2000);

  useUnmount(() => {
    saveDocumentItem();
  });

  const onPressEnter = useMemoizedFn(() => {
    editorRef.current?.focus();
  });

  if (!editingDocumentItem) {
    return <div className={styles.loading}>Loading document item...</div>;
  }

  return (
    <div className={styles.singleDocumentItemEditorContainer}>
      <div className={styles.time}>
        <div>
          <span>创建于 {formatDate(editingDocumentItem.createTime, true)}</span>
        </div>
        <div>
          <span>
            最后修改于 {formatDate(editingDocumentItem.updateTime, true)}
          </span>
        </div>
      </div>
      <div className={styles.title}>
        <EditText
          ref={titleRef}
          defaultValue={title}
          onChange={onTitleChange}
          onPressEnter={onPressEnter}
          contentEditable={true}
        />
      </div>
      <div className={styles.editor}>
        <EditCardContext.Provider value={editorContextValue}>
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
    </div>
  );
};

export default SingleDocumentItemEditor;
