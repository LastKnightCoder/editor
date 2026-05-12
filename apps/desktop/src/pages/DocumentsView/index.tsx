import { useShallow } from "zustand/react/shallow";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import { useState, useMemo } from "react";
import { LoadingOutlined, PlusOutlined } from "@ant-design/icons";
import EditDocumentModal from "./EditDocumentModal";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";

import styles from "./index.module.less";
import { ICreateDocument } from "@/types";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import DocumentList from "./DocumentList";

const DocumentsView = () => {
  const [createOpen, setCreateOpen] = useState(false);

  const navigateTo = useTabStore((state) => state.navigateTo);

  const { documents, createDocument, init, loading } = useDocumentsStore(
    useShallow((state) => ({
      init: state.init,
      documents: state.documents,
      createDocument: state.createDocument,
      loading: state.loading,
    })),
  );

  // 在数据库连接或切换时加载知识库列表
  useDatabaseChangeEffect(() => {
    init();
  });

  const sortedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => {
      if (a.isTop && !b.isTop) return -1;
      if (!a.isTop && b.isTop) return 1;
      return 0;
    });
  }, [documents]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <LoadingOutlined spin />
      </div>
    );
  }

  return (
    <div className={styles.documentsView}>
      <DocumentList
        documents={sortedDocuments}
        addDocument={() => {
          setCreateOpen(true);
        }}
      />
      <button
        type="button"
        className={styles.addActionButton}
        aria-label="新建知识库"
        onClick={() => {
          setCreateOpen(true);
        }}
      >
        <PlusOutlined />
      </button>
      <EditDocumentModal
        open={createOpen}
        title={"创建知识库"}
        onCancel={() => {
          setCreateOpen(false);
        }}
        onOk={async (title, desc) => {
          const newDocument: ICreateDocument = {
            title,
            desc,
            content: [],
            children: [],
            isTop: false,
          };
          const createdDocument = await createDocument(newDocument);
          setCreateOpen(false);
          navigateTo(
            TabType.DocumentDetail,
            { id: createdDocument.id },
            `知识库 - ${createdDocument.title || `#${createdDocument.id}`}`,
          );
        }}
        defaultTitle={""}
        defaultDesc={""}
      />
    </div>
  );
};

export default DocumentsView;
