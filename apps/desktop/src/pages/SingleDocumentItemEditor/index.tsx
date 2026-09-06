import { useEffect, useRef, useState } from "react";
import { Descendant } from "slate";
import { useSearchParams } from "react-router-dom";
import classnames from "classnames";

import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import { EditTextHandle } from "@/components/EditText";
import EditText from "@/components/CollaborativeTitle";
import ErrorBoundary from "@/components/ErrorBoundary";
import EditorOutline from "@/components/EditorOutline";
import useTheme from "@/hooks/useTheme";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";

import { createDocumentCardListExtension } from "@/editor-extensions";
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

const editorContextValue = {
  cardId: -1,
};

const SingleDocumentItemEditor = () => {
  const { isDark } = useTheme();
  const documentItemEventBus = useCreation(() => defaultDocumentItemEventBus.createEditor(), []);
  const [searchParams] = useSearchParams();
  const documentItemId = Number(searchParams.get("documentItemId"));
  const databaseName = searchParams.get("databaseName");
  const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);

  const extensions = useCreation(() => {
    return [...dynamicExtensions, createDocumentCardListExtension(documentItemId)];
  }, [documentItemId, dynamicExtensions]);

  const titleRef = useRef<EditTextHandle>(null);
  const [editingDocumentItem, setEditingDocumentItem] = useState<IDocumentItem | null>(null);

  const editorRef = useRef<EditorRef>(null);
  const prevDocumentItemRef = useRef<IDocumentItem | null>(null);

  const { throttleHandleEditorContentChange } = useEditContent(
    editingDocumentItem?.contentId,
    data => {
      editorRef.current?.setEditorValue(data);
    }
  );

  useEffect(() => {
    const unsubscribe = documentItemEventBus.subscribeToDocumentItemWithId(
      "document-item:updated",
      documentItemId,
      data => {
        setEditingDocumentItem(data.documentItem);
        titleRef.current?.setValue(data.documentItem.title);
      }
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
    if (!changed) return;

    try {
      const updatedDocumentItem = await updateDocumentItem(editingDocumentItem);

      setEditingDocumentItem(updatedDocumentItem);
      prevDocumentItemRef.current = updatedDocumentItem;
    } catch (error) {
      console.error("Failed to save document item:", error);
    }
  });

  const onContentChange = useMemoizedFn((value: Descendant[]) => {
    throttleHandleEditorContentChange(value);
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
    <div
      className={classnames(styles.singleDocumentItemEditorContainer, {
        [styles.dark]: isDark,
      })}
    >
      <div className={styles.title}>
        <EditText
          contentId={editingDocumentItem.contentId}
          source={{
            sourceType: "document-item",
            sourceId: editingDocumentItem.id,
            sourceTitle: editingDocumentItem.title,
          }}
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
                contentId={editingDocumentItem?.contentId}
                className={styles.editor}
                ref={editorRef}
                initValue={editingDocumentItem.content}
                onChange={onContentChange}
                extensions={extensions}
                readonly={false}
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
