import { useEffect, useRef, useState } from "react";
import { Descendant } from "slate";
import { useSearchParams } from "react-router-dom";

import Editor, { EditorRef } from "@/components/Editor";
import EditText, { EditTextHandle } from "@/components/EditText";
import ErrorBoundary from "@/components/ErrorBoundary";
import EditorOutline from "@/components/EditorOutline";

import useUploadResource from "@/hooks/useUploadResource.ts";
import {
  cardLinkExtension,
  fileAttachmentExtension,
  documentCardListExtension,
  questionCardExtension,
} from "@/editor-extensions";
import {
  getDocumentItem,
  updateDocumentItem,
  connectDatabaseByName,
  closeDatabase,
} from "@/commands";
import { defaultDocumentItemEventBus } from "@/utils/event-bus";
import { formatDate, getContentLength } from "@/utils";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";

import styles from "./index.module.less";
import { EditCardContext } from "@/context";
import { IDocumentItem } from "@/types";
import { useWindowFocus } from "@/hooks/useWindowFocus";

const customExtensions = [
  cardLinkExtension,
  fileAttachmentExtension,
  documentCardListExtension,
  questionCardExtension,
];
const editorContextValue = {
  cardId: -1,
};

const SingleDocumentItemEditor = () => {
  const documentItemEventBus = useCreation(
    () => defaultDocumentItemEventBus.createEditor(),
    [],
  );
  const [searchParams] = useSearchParams();
  const documentItemId = Number(searchParams.get("documentItemId"));
  const databaseName = searchParams.get("databaseName");

  const isWindowFocused = useWindowFocus();
  const titleRef = useRef<EditTextHandle>(null);
  const [editingDocumentItem, setEditingDocumentItem] =
    useState<IDocumentItem | null>(null);

  const editorRef = useRef<EditorRef>(null);
  const uploadResource = useUploadResource();
  const prevDocumentItemRef = useRef<IDocumentItem | null>(null);

  useEffect(() => {
    const unsubscribe = documentItemEventBus.subscribeToDocumentItemWithId(
      "document-item:updated",
      documentItemId,
      (data) => {
        setEditingDocumentItem(data.documentItem);
        editorRef.current?.setEditorValue(data.documentItem.content);
        titleRef.current?.setValue(data.documentItem.title);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [documentItemId]);

  useEffect(() => {
    if (!databaseName || !documentItemId) {
      return;
    }

    const loadDocumentItem = async (documentItemId: number) => {
      try {
        const documentItem = await getDocumentItem(documentItemId);
        setEditingDocumentItem(documentItem);
        prevDocumentItemRef.current = documentItem;
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
    if (
      !editingDocumentItem ||
      !editorRef.current?.isFocus() ||
      !isWindowFocused
    )
      return;
    const newDocumentItem = {
      ...editingDocumentItem,
      content: value,
    };
    setEditingDocumentItem(newDocumentItem);
  });

  const onTitleChange = useMemoizedFn((value: string) => {
    if (
      !editingDocumentItem ||
      !titleRef.current?.isFocus() ||
      !isWindowFocused
    )
      return;

    const newDocumentItem = {
      ...editingDocumentItem,
      title: value,
    };
    setEditingDocumentItem(newDocumentItem);
  });

  const saveDocumentItem = useMemoizedFn(async (forceSave = false) => {
    if (!editingDocumentItem) return;

    const changed =
      JSON.stringify(editingDocumentItem) !==
      JSON.stringify(prevDocumentItemRef.current);
    if (
      ((!editorRef.current?.isFocus() && !titleRef.current?.isFocus()) ||
        !isWindowFocused ||
        !changed) &&
      !forceSave
    )
      return;

    try {
      const wordsCount = getContentLength(editingDocumentItem.content);
      const updatedDocumentItem = await updateDocumentItem({
        ...editingDocumentItem,
        count: wordsCount,
      });

      setEditingDocumentItem(updatedDocumentItem);
      prevDocumentItemRef.current = updatedDocumentItem;
    } catch (error) {
      console.error("Failed to save document item:", error);
    }
  });

  useRafInterval(() => {
    saveDocumentItem();
  }, 3000);

  useUnmount(() => {
    saveDocumentItem(true);
  });

  const onPressEnter = useMemoizedFn(() => {
    editorRef.current?.focus();
  });

  const onClickHeader = useMemoizedFn((index: number) => {
    if (!editorRef.current) return;
    editorRef.current.scrollHeaderIntoView(index);
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
          defaultValue={editingDocumentItem.title}
          onChange={onTitleChange}
          onPressEnter={onPressEnter}
          contentEditable={true}
        />
      </div>
      <div className={styles.editorContainer}>
        <div className={styles.editor}>
          <EditCardContext.Provider value={editorContextValue}>
            <ErrorBoundary>
              <Editor
                ref={editorRef}
                initValue={editingDocumentItem.content}
                onChange={onContentChange}
                extensions={customExtensions}
                readonly={false}
                uploadResource={uploadResource}
              />
            </ErrorBoundary>
          </EditCardContext.Provider>
        </div>
        <div className={styles.outlineContainer}>
          <EditorOutline
            className={styles.outline}
            content={editingDocumentItem.content}
            show={true}
            onClickHeader={onClickHeader}
          />
        </div>
      </div>
    </div>
  );
};

export default SingleDocumentItemEditor;
