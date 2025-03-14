import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { produce } from "immer";
import classnames from "classnames";
import { Modal, Popover } from "antd";
import EditDocumentModal from "../EditDocumentModal";

import { MdMoreVert } from "react-icons/md";
import useTheme from "@/hooks/useTheme.ts";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";

import { IDocument } from "@/types";

import styles from "./index.module.less";

interface DocumentCardProps {
  document: IDocument;
  className?: string;
  style?: React.CSSProperties;
}

const DocumentCard = (props: DocumentCardProps) => {
  const { document, className, style } = props;

  const { isDark } = useTheme();
  const [settingOpen, setSettingOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const navigate = useNavigate();

  const { deleteDocument, updateDocument } = useDocumentsStore((state) => ({
    deleteDocument: state.deleteDocument,
    updateDocument: state.updateDocument,
  }));

  const handleDeleteDocument = () => {
    Modal.confirm({
      title: "确定删除该知识库？",
      onOk: async () => {
        await deleteDocument({ id: document.id });
      },
      okText: "确定",
      cancelText: "取消",
    });
    setSettingOpen(false);
  };

  const onClick = () => {
    useDocumentsStore.setState({
      activeDocumentId: document.id,
      activeDocumentItem: null,
    });
    navigate(`/documents/${document.id}`);
  };

  return (
    <div
      className={classnames(
        styles.cardContainer,
        { [styles.dark]: isDark },
        className,
      )}
      style={style}
    >
      <div className={styles.title} onClick={onClick}>
        {document.title}
      </div>
      <div className={styles.desc}>{document.desc}</div>
      <div className={classnames(styles.operate)}>
        <Popover
          open={settingOpen}
          onOpenChange={setSettingOpen}
          placement={"bottomRight"}
          trigger={"click"}
          styles={{
            body: {
              padding: 4,
            },
          }}
          content={
            <div className={styles.settings}>
              <div
                className={styles.settingItem}
                onClick={handleDeleteDocument}
              >
                删除知识库
              </div>
              <div
                className={styles.settingItem}
                onClick={() => {
                  setEditOpen(true);
                  setSettingOpen(false);
                }}
              >
                编辑知识库
              </div>
            </div>
          }
        >
          <MdMoreVert />
        </Popover>
      </div>
      <EditDocumentModal
        open={editOpen}
        title={"编辑知识库"}
        onCancel={() => {
          setEditOpen(false);
        }}
        onOk={async (title, desc) => {
          const newDocument = produce(document, (draft) => {
            draft.title = title;
            draft.desc = desc;
          });
          await updateDocument(newDocument);
          setEditOpen(false);
        }}
        defaultTitle={document.title}
        defaultDesc={document.desc}
      />
    </div>
  );
};

export default DocumentCard;
