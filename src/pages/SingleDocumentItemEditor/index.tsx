import { useEffect, useRef, useState } from "react";
import { Descendant } from "slate";
import { useSearchParams } from "react-router-dom";

import Editor, { EditorRef } from "@/components/Editor";
import EditText, { EditTextHandle } from "@/components/EditText";
import ErrorBoundary from "@/components/ErrorBoundary";
import EditorOutline from "@/components/EditorOutline";

import useUploadResource from "@/hooks/useUploadResource.ts";
import {
  contentLinkExtension,
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
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";
import useEditContent from "@/hooks/useEditContent";

import styles from "./index.module.less";
import { EditCardContext } from "@/context";
import { IDocumentItem } from "@/types";
import { useWindowFocus } from "@/hooks/useWindowFocus";

const customExtensions = [
  contentLinkExtension,
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

  const { throttleHandleEditorContentChange } = useEditContent(
    editingDocumentItem?.contentId,
    (data) => {
      editorRef.current?.setEditorValue(data);
    },
  );

  useEffect(() => {
    const unsubscribe = documentItemEventBus.subscribeToDocumentItemWithId(
      "document-item:updated",
      documentItemId,
      (data) => {
        setEditingDocumentItem(data.documentItem);
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

  const onDocumentItemContentChange = useMemoizedFn((value: Descendant[]) => {
    if (!editingDocumentItem) return;
    const newDocumentItem = {
      ...editingDocumentItem,
      content: value,
    };
    setEditingDocumentItem(newDocumentItem);
  });

  const onTitleChange = useMemoizedFn((value: string) => {
    if (!editingDocumentItem) return;

    const newDocumentItem = {
      ...editingDocumentItem,
      title: value,
    };
    setEditingDocumentItem(newDocumentItem);
  });

  const saveDocumentItem = useMemoizedFn(async () => {
    if (!editingDocumentItem) return;

    const changed =
      JSON.stringify({
        ...editingDocumentItem,
        content: undefined,
        count: undefined,
      }) !==
      JSON.stringify({
        ...prevDocumentItemRef.current,
        content: undefined,
        count: undefined,
      });
    if (!titleRef.current?.isFocus() || !isWindowFocused || !changed) return;

    try {
      const updatedDocumentItem = await updateDocumentItem(editingDocumentItem);

      setEditingDocumentItem(updatedDocumentItem);
      prevDocumentItemRef.current = updatedDocumentItem;
    } catch (error) {
      console.error("Failed to save document item:", error);
    }
  });

  const onContentChange = useMemoizedFn((value: Descendant[]) => {
    if (isWindowFocused && editorRef.current?.isFocus()) {
      throttleHandleEditorContentChange(value);
    }
    onDocumentItemContentChange(value);
  });

  useRafInterval(() => {
    saveDocumentItem();
  }, 500);

  useUnmount(() => {
    throttleHandleEditorContentChange.flush();
    saveDocumentItem();
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
        <div className={styles.contentEditor}>
          <EditCardContext.Provider value={editorContextValue}>
            <ErrorBoundary>
              <Editor
                className={styles.editor}
                ref={editorRef}
                initValue={editingDocumentItem.content}
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
              content={editingDocumentItem.content}
              show={true}
              onClickHeader={onClickHeader}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SingleDocumentItemEditor;
