import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import For from "@/components/For";
import DocumentCard from "./DocumentCard";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FloatButton } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import EditDocumentModal from "./EditDocumentModal";

import styles from "./index.module.less";
import { ICreateDocument, IDocument } from "@/types";
import useGridLayout from "@/hooks/useGridLayout";

const DocumentsView = () => {
  const { gridContainerRef, itemWidth, gap } = useGridLayout();
  const [createOpen, setCreateOpen] = useState(false);

  const navigate = useNavigate();

  const { documents, createDocument } = useDocumentsStore((state) => ({
    documents: state.documents,
    createDocument: state.createDocument,
  }));

  const sortedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => {
      if (a.isTop && !b.isTop) return -1;
      if (!a.isTop && b.isTop) return 1;
      return 0;
    });
  }, [documents]);

  return (
    <div className={styles.container} ref={gridContainerRef} style={{ gap }}>
      <For
        data={sortedDocuments}
        renderItem={(document: IDocument) => (
          <DocumentCard
            style={{ width: itemWidth, height: 160 }}
            key={document.id}
            document={document}
          />
        )}
      />
      <FloatButton
        icon={<PlusOutlined />}
        tooltip={"新建知识库"}
        onClick={() => {
          setCreateOpen(true);
        }}
      />
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
            tags: [],
            links: [],
            children: [],
            authors: [],
            icon: "",
            bannerBg: "",
            isTop: false,
            isDelete: false,
          };
          const createdDocument = await createDocument(newDocument);
          setCreateOpen(false);
          useDocumentsStore.setState({
            activeDocumentId: createdDocument.id,
            activeDocumentItem: null,
          });
          navigate(`/documents/${createdDocument.id}`);
        }}
        defaultTitle={""}
        defaultDesc={""}
      />
    </div>
  );
};

export default DocumentsView;
