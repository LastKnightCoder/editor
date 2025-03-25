import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { App } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { ICreateDocument, IDocument } from "@/types";
import { DEFAULT_CREATE_DOCUMENT } from "@/constants";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";

import DocumentItem from "./DocumentItem";
import EditDocumentModal from "../EditDocumentModal";

import styles from "./index.module.less";

interface IDocumentListProps {
  documents: IDocument[];
}

const DocumentList = (props: IDocumentListProps) => {
  const { documents } = props;

  const navigate = useNavigate();

  const { createDocument, updateDocument, deleteDocument } = useDocumentsStore(
    useShallow((state) => ({
      createDocument: state.createDocument,
      updateDocument: state.updateDocument,
      deleteDocument: state.deleteDocument,
    })),
  );

  const [editDocumentModalOpen, setEditDocumentModalOpen] =
    useState<boolean>(false);
  const [editingDocument, setEditingDocument] =
    useState<ICreateDocument | null>(null);

  const { modal } = App.useApp();

  const onEditFinish = async (document: any) => {
    if (document.id) {
      await updateDocument(document);
    } else {
      await createDocument(document);
    }

    setEditDocumentModalOpen(false);
  };

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.title}>文档</div>
        <div
          className={styles.icon}
          onClick={() => {
            setEditDocumentModalOpen(true);
            setEditingDocument(DEFAULT_CREATE_DOCUMENT);
          }}
        >
          <PlusOutlined />
        </div>
      </div>
      <div className={styles.listContainer}>
        {documents.map((document) => (
          <DocumentItem
            key={document.id}
            document={document}
            onClick={(document) => {
              navigate(`/documents/detail/${document.id}`);
            }}
            onEdit={() => {
              setEditingDocument(document);
              setEditDocumentModalOpen(true);
            }}
            onDelete={async () => {
              modal.confirm({
                title: "确认删除该文档吗？",
                onOk: async () => {
                  await deleteDocument(document);
                  setEditDocumentModalOpen(false);
                  setEditingDocument(null);
                },
                onCancel: () => {
                  setEditDocumentModalOpen(false);
                },
                okText: "确认",
                cancelText: "取消",
                okButtonProps: {
                  danger: true,
                },
              });
            }}
          />
        ))}
        {editingDocument && (
          <EditDocumentModal
            // @ts-ignore
            key={editingDocument?.id}
            open={editDocumentModalOpen}
            onOk={onEditFinish}
            onCancel={() => {
              setEditDocumentModalOpen(false);
            }}
            document={editingDocument}
          />
        )}
      </div>
    </div>
  );
};

export default DocumentList;
