import React, { useEffect, useState, useRef } from "react";
import { Empty } from "antd";
import {
  useCreation,
  useMemoizedFn,
  useDebounceFn,
  useRafInterval,
  useUnmount,
} from "ahooks";
import { LoadingOutlined } from "@ant-design/icons";

import Editor, { EditorRef } from "@editor/index.tsx";
import EditText, { EditTextHandle } from "@/components/EditText";

import {
  fileAttachmentExtension,
  cardLinkExtension,
  documentCardListExtension,
} from "@/editor-extensions";

import { IDocumentItem } from "@/types/document";
import { getDocumentItem, updateDocumentItem } from "@/commands";
import { Descendant } from "slate";
import { defaultDocumentItemEventBus } from "@/utils";
import { useRightSidebarContext } from "../../../RightSidebarContext";
import { useWindowFocus } from "@/hooks/useWindowFocus";

import styles from "./index.module.less";

interface DocumentItemViewerProps {
  documentItemId: string;
  onTitleChange?: (title: string) => void;
}

const customExtensions = [
  fileAttachmentExtension,
  cardLinkExtension,
  documentCardListExtension,
];

const DocumentItemViewer: React.FC<DocumentItemViewerProps> = ({
  documentItemId,
  onTitleChange,
}) => {
  const documentItemEventBus = useCreation(
    () => defaultDocumentItemEventBus.createEditor(),
    [],
  );
  const [documentItem, setDocumentItem] = useState<IDocumentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const editorRef = useRef<EditorRef>(null);
  const titleRef = useRef<EditTextHandle>(null);
  const prevDocumentItem = useRef<IDocumentItem | null>(null);
  const { visible, isConnected } = useRightSidebarContext();
  const isWindowFocused = useWindowFocus();
  const fetchDocumentItem = useMemoizedFn(async () => {
    setLoading(true);
    try {
      const fetchedDocumentItem = await getDocumentItem(Number(documentItemId));
      setDocumentItem(fetchedDocumentItem);
      prevDocumentItem.current = fetchedDocumentItem;
      if (onTitleChange) {
        onTitleChange(fetchedDocumentItem.title);
      }
    } catch (error) {
      console.error("Error fetching document item:", error);
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    const unsubscribe = documentItemEventBus.subscribeToDocumentItemWithId(
      "document-item:updated",
      Number(documentItemId),
      (data) => {
        editorRef.current?.setEditorValue(data.documentItem.content);
        titleRef.current?.setValue(data.documentItem.title);
        prevDocumentItem.current = data.documentItem;
        setDocumentItem(data.documentItem);
      },
    );
    return () => {
      unsubscribe();
    };
  }, [documentItemId, documentItemEventBus]);

  useEffect(() => {
    if (visible && isConnected) {
      fetchDocumentItem();
    }
  }, [documentItemId, fetchDocumentItem, visible, isConnected]);

  const handleSaveDocumentItem = useMemoizedFn(async () => {
    if (!documentItem) return null;
    const changed =
      JSON.stringify(documentItem) !== JSON.stringify(prevDocumentItem.current);
    if (!changed) return null;
    const updatedDocumentItem = await updateDocumentItem(documentItem);
    prevDocumentItem.current = updatedDocumentItem;
    setDocumentItem(updatedDocumentItem);
    return updatedDocumentItem;
  });

  const { run: handleTitleChange } = useDebounceFn(
    async (title: string) => {
      if (
        !documentItem ||
        title === documentItem.title ||
        !titleRef.current?.isFocus() ||
        !isWindowFocused
      )
        return;

      try {
        setDocumentItem({
          ...documentItem,
          title,
        });

        if (onTitleChange) {
          onTitleChange(title);
        }
      } catch (error) {
        console.error("Error updating document item title:", error);
      }
    },
    { wait: 200 },
  );

  const { run: handleContentChange } = useDebounceFn(
    async (content: Descendant[]) => {
      if (!documentItem || !editorRef.current?.isFocus() || !isWindowFocused)
        return;

      try {
        setDocumentItem({
          ...documentItem,
          content,
        });
      } catch (error) {
        console.error("Error updating document item content:", error);
      }
    },
    { wait: 200 },
  );

  useRafInterval(async () => {
    if (
      !documentItem ||
      !isWindowFocused ||
      (!titleRef.current?.isFocus() && !editorRef.current?.isFocus())
    )
      return;
    const changed =
      JSON.stringify(documentItem) !== JSON.stringify(prevDocumentItem.current);
    if (!changed) return;
    const updatedDocumentItem = await handleSaveDocumentItem();
    if (updatedDocumentItem) {
      documentItemEventBus.publishDocumentItemEvent(
        "document-item:updated",
        updatedDocumentItem,
      );
    }
  }, 3000);

  useUnmount(async () => {
    handleTitleChange.flush();
    handleContentChange.flush();
    setTimeout(async () => {
      const updatedDocumentItem = await handleSaveDocumentItem();
      if (updatedDocumentItem) {
        documentItemEventBus.publishDocumentItemEvent(
          "document-item:updated",
          updatedDocumentItem,
        );
      }
    }, 200);
  });

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <LoadingOutlined />
      </div>
    );
  }

  if (!documentItem) {
    return (
      <div className={styles.errorContainer}>
        <Empty description="文档不存在或已被删除" />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleContainer}>
        <EditText
          ref={titleRef}
          defaultValue={documentItem.title}
          className={styles.title}
          contentEditable={true}
          onChange={handleTitleChange}
        />
      </div>
      <div className={styles.contentContainer}>
        <Editor
          ref={editorRef}
          initValue={documentItem.content}
          onChange={handleContentChange}
          readonly={false}
          extensions={customExtensions}
        />
      </div>
    </div>
  );
};

export default DocumentItemViewer;
