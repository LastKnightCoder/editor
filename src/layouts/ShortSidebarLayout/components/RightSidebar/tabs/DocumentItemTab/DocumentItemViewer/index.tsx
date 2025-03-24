import React, { useEffect, useState, useRef } from "react";
import { Empty } from "antd";
import { useCreation, useMemoizedFn } from "ahooks";
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
  const { visible } = useRightSidebarContext();
  const fetchDocumentItem = useMemoizedFn(async () => {
    setLoading(true);
    try {
      const fetchedDocumentItem = await getDocumentItem(Number(documentItemId));
      setDocumentItem(fetchedDocumentItem);
      if (onTitleChange) {
        onTitleChange(fetchedDocumentItem.title);
      }
      console.log(fetchedDocumentItem);
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
        console.log("viewerreceive document-item:updated", data);
        editorRef.current?.setEditorValue(data.documentItem.content);
        titleRef.current?.setValue(data.documentItem.title);
        setDocumentItem(data.documentItem);
      },
    );
    return () => {
      unsubscribe();
    };
  }, [documentItemId, documentItemEventBus]);

  useEffect(() => {
    if (visible) {
      fetchDocumentItem();
    }
  }, [documentItemId, fetchDocumentItem, visible]);

  const handleTitleChange = useMemoizedFn(async (title: string) => {
    if (
      !documentItem ||
      title === documentItem.title ||
      !titleRef.current?.isFocus()
    )
      return;

    try {
      const updatedDocumentItem = await updateDocumentItem({
        ...documentItem,
        title,
      });
      setDocumentItem(updatedDocumentItem);

      if (onTitleChange) {
        onTitleChange(title);
      }
      documentItemEventBus.publishDocumentItemEvent(
        "document-item:updated",
        updatedDocumentItem,
      );
    } catch (error) {
      console.error("Error updating document item title:", error);
    }
  });

  const handleContentChange = useMemoizedFn(async (content: Descendant[]) => {
    if (!documentItem || !editorRef.current?.isFocus()) return;

    try {
      const updatedDocumentItem = await updateDocumentItem({
        ...documentItem,
        content,
      });
      setDocumentItem(updatedDocumentItem);
      documentItemEventBus.publishDocumentItemEvent(
        "document-item:updated",
        updatedDocumentItem,
      );
    } catch (error) {
      console.error("Error updating document item content:", error);
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
          onChange={handleContentChange}
          readonly={false}
          extensions={customExtensions}
        />
      </div>
    </div>
  );
};

export default DocumentItemViewer;
