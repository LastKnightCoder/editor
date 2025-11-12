import DocumentList from "./DocumentList";
import EditDocumentItem from "./EditDocumentItem";
import DocumentContext from "./DocumentContext";

import styles from "./index.module.less";
import { Empty, Button } from "antd";
import { useState, useEffect } from "react";
import { IDocument } from "@/types";
import { getDocument } from "@/commands";
import { LoadingOutlined } from "@ant-design/icons";
import useTabParams from "@/hooks/useTabParams";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";

const DocumentView = () => {
  const { id, itemId } = useTabParams(TabType.DocumentDetail);

  const documentId = Number(id);
  const [document, setDocument] = useState<IDocument | null>(null);
  const [loading, setLoading] = useState(true);

  const navigateTo = useTabStore((state) => state.navigateTo);

  useEffect(() => {
    setLoading(true);
    getDocument(documentId)
      .then((document) => {
        setDocument(document);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [documentId]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <LoadingOutlined />
      </div>
    );
  }

  if (!document) {
    return (
      <div className={styles.empty}>
        <Empty
          description="知识库不存在或已被删除"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button
            type="primary"
            onClick={() => navigateTo(TabType.DocumentList)}
          >
            返回知识库列表
          </Button>
        </Empty>
      </div>
    );
  }

  if (!document) return null;

  return (
    <DocumentContext.Provider
      value={{
        documentId: document.id,
        itemId: itemId,
      }}
    >
      <div className={styles.viewContainer}>
        <div className={styles.sidebar}>
          <DocumentList />
        </div>
        <div className={styles.edit}>
          <div className={styles.editorContainer}>
            <EditDocumentItem
              key={itemId ?? document.id}
              documentItemId={itemId ?? 0}
            />
          </div>
        </div>
      </div>
    </DocumentContext.Provider>
  );
};

export default DocumentView;
