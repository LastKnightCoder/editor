import React, { useEffect, useState, useRef } from "react";
import { Empty } from "antd";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";
import { LoadingOutlined } from "@ant-design/icons";

import Editor, { EditorRef } from "@editor/index.tsx";
import EditText, { EditTextHandle } from "@/components/EditText";

import {
  fileAttachmentExtension,
  contentLinkExtension,
  documentCardListExtension,
  questionCardExtension,
} from "@/editor-extensions";

import { IDocumentItem } from "@/types/document";
import { getDocumentItem, updateDocumentItem } from "@/commands";
import { Descendant } from "slate";
import { defaultDocumentItemEventBus } from "@/utils";
import { useRightSidebarContext } from "../../../RightSidebarContext";
import { useWindowFocus } from "@/hooks/useWindowFocus";
import useEditContent from "@/hooks/useEditContent";

import styles from "./index.module.less";

interface DocumentItemViewerProps {
  documentItemId: string;
  onTitleChange?: (title: string) => void;
}

const customExtensions = [
  fileAttachmentExtension,
  contentLinkExtension,
  documentCardListExtension,
  questionCardExtension,
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
      if (!fetchedDocumentItem) return;
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

  const { throttleHandleEditorContentChange } = useEditContent(
    documentItem?.contentId,
    (content) => {
      editorRef.current?.setEditorValue(content);
    },
  );

  useEffect(() => {
    const unsubscribe = documentItemEventBus.subscribeToDocumentItemWithId(
      "document-item:updated",
      Number(documentItemId),
      (data) => {
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
      JSON.stringify({
        ...documentItem,
        content: undefined,
        count: undefined,
      }) !==
      JSON.stringify({
        ...prevDocumentItem.current,
        content: undefined,
        count: undefined,
      });
    if (!changed) return null;
    const updatedDocumentItem = await updateDocumentItem(documentItem);
    prevDocumentItem.current = updatedDocumentItem;
    setDocumentItem(updatedDocumentItem);
    return updatedDocumentItem;
  });

  const handleTitleChange = useMemoizedFn(async (title: string) => {
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
  });

  const handleContentChange = useMemoizedFn(async (content: Descendant[]) => {
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
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    if (isWindowFocused && editorRef.current?.isFocus()) {
      throttleHandleEditorContentChange(content);
    }
    handleContentChange(content);
  });

  useRafInterval(async () => {
    if (!documentItem || !isWindowFocused || !titleRef.current?.isFocus())
      return;
    const updatedDocumentItem = await handleSaveDocumentItem();
    if (updatedDocumentItem) {
      documentItemEventBus.publishDocumentItemEvent(
        "document-item:updated",
        updatedDocumentItem,
      );
    }
  }, 500);

  useUnmount(async () => {
    throttleHandleEditorContentChange.flush();
    const updatedDocumentItem = await handleSaveDocumentItem();
    if (updatedDocumentItem) {
      documentItemEventBus.publishDocumentItemEvent(
        "document-item:updated",
        updatedDocumentItem,
      );
    }
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
          onChange={onContentChange}
          readonly={false}
          extensions={customExtensions}
        />
      </div>
    </div>
  );
};

export default DocumentItemViewer;
