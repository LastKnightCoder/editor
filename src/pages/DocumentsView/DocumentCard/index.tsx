import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { produce } from "immer";
import classnames from "classnames";
import { Modal, Dropdown, MenuProps } from "antd";
import EditDocumentModal from "../EditDocumentModal";

import { MdMoreVert } from "react-icons/md";
import { AiFillPushpin } from "react-icons/ai";
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
  const [editOpen, setEditOpen] = useState(false);

  const navigate = useNavigate();

  const { deleteDocument, updateDocument } = useDocumentsStore(
    useShallow((state) => ({
      deleteDocument: state.deleteDocument,
      updateDocument: state.updateDocument,
    })),
  );

  const handleDeleteDocument = () => {
    Modal.confirm({
      title: "确定删除该知识库？",
      onOk: async () => {
        await deleteDocument({ id: document.id });
      },
      okText: "确定",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
    });
  };

  const handleTogglePin = async () => {
    const newDocument = produce(document, (draft) => {
      draft.isTop = !draft.isTop;
    });
    await updateDocument(newDocument);
  };

  const onClick = () => {
    useDocumentsStore.setState({
      activeDocumentItemId: null,
    });
    navigate(`/documents/detail/${document.id}`);
  };

  const items: MenuProps["items"] = [
    {
      key: "pin",
      label: document.isTop ? "取消置顶" : "置顶知识库",
      onClick: () => {
        handleTogglePin();
      },
    },
    {
      key: "edit",
      label: "编辑知识库",
      onClick: () => {
        setEditOpen(true);
      },
    },
    {
      key: "delete",
      label: "删除知识库",
      onClick: () => {
        handleDeleteDocument();
      },
    },
  ];

  return (
    <div
      className={classnames(
        styles.cardContainer,
        { [styles.dark]: isDark },
        { [styles.pinned]: document.isTop },
        className,
      )}
      style={style}
    >
      {document.isTop && (
        <div className={styles.pinnedFlag}>
          <AiFillPushpin />
        </div>
      )}
      <div className={styles.title} onClick={onClick}>
        {document.title}
      </div>
      <div className={styles.desc}>{document.desc}</div>
      <div
        className={classnames(styles.operate)}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <Dropdown menu={{ items }} trigger={["hover"]} placement="bottomRight">
          <MdMoreVert />
        </Dropdown>
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
