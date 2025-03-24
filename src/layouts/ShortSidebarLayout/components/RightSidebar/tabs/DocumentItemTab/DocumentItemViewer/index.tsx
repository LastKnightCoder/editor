import React, { useEffect, useState, useRef } from "react";
import { Empty } from "antd";
import { useMemoizedFn } from "ahooks";
import { LoadingOutlined } from "@ant-design/icons";

import Editor from "@editor/index.tsx";
import EditText, { EditTextHandle } from "@/components/EditText";

import {
  fileAttachmentExtension,
  cardLinkExtension,
  documentCardListExtension,
} from "@/editor-extensions";

import { IDocumentItem } from "@/types/document";
import { getDocumentItem, updateDocumentItem } from "@/commands";
import { Descendant } from "slate";

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
  const [documentItem, setDocumentItem] = useState<IDocumentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const titleRef = useRef<EditTextHandle>(null);

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
    fetchDocumentItem();
  }, [documentItemId, fetchDocumentItem]);

  const handleTitleChange = useMemoizedFn(async (title: string) => {
    if (!documentItem || title === documentItem.title) return;

    try {
      const updatedDocumentItem = await updateDocumentItem({
        ...documentItem,
        title,
      });
      setDocumentItem(updatedDocumentItem);

      if (onTitleChange) {
        onTitleChange(title);
      }
    } catch (error) {
      console.error("Error updating document item title:", error);
    }
  });

  const handleContentChange = useMemoizedFn(async (content: Descendant[]) => {
    if (!documentItem) return;

    try {
      const updatedDocumentItem = await updateDocumentItem({
        ...documentItem,
        content,
      });
      console.log("updatedDocumentItem", updatedDocumentItem);
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
