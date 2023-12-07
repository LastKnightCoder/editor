import { useState } from 'react';
import { Button, Empty, message, Skeleton } from "antd";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";

import { DEFAULT_CREATE_DOCUMENT } from "@/constants/document.ts";
import { ICreateDocument } from "@/types";

import EditDocumentModal from "./EditDocumentModal";
import DocumentList from "./DocumentList";
import Document from "./Document";
import styles from './index.module.less';
import { useMemoizedFn, useWhyDidYouUpdate } from "ahooks";

const Sidebar = () => {
  const [editDocumentModalOpen, setEditDocumentModalOpen] = useState<boolean>(false);

  const {
    documents,
    loading,
    createDocument,
    activeDocumentId
  } = useDocumentsStore(state => ({
    documents: state.documents,
    loading: state.loading,
    createDocument: state.createDocument,
    activeDocumentId: state.activeDocumentId,
  }));

  const activeDocument = documents.find(document => document.id === activeDocumentId);

  const onEditFinish = useMemoizedFn(async (document: ICreateDocument) => {
    if (!document.title) {
      message.error('请输入标题');
      return;
    }
    await createDocument(document);
    setEditDocumentModalOpen(false);
  });

  useWhyDidYouUpdate('Sidebar', {
    documents,
    loading,
    activeDocumentId,
    onEditFinish,
  })

  if (loading) {
    return (
      <Skeleton active />
    )
  }

  if (documents.length === 0) {
    return (
      <div className={styles.empty}>
        <Empty description={'暂无文档'} />
        <Button type={'primary'} onClick={() => { setEditDocumentModalOpen(true) }}>新建文档</Button>
        <EditDocumentModal
          open={editDocumentModalOpen}
          onOk={onEditFinish}
          onCancel={() => {
            setEditDocumentModalOpen(false);
          }}
          document={DEFAULT_CREATE_DOCUMENT}
        />
      </div>
    )
  }

  return (
    <div className={styles.sidebarContainer}>
      {
        activeDocument ? (
          <Document document={activeDocument} />
        ) : (
          <DocumentList documents={documents} />
        )
      }
    </div>
  )
}

export default Sidebar;