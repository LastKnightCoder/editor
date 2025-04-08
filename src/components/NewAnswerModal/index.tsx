import React from "react";
import { Modal } from "antd";
import { Descendant } from "slate";
import classnames from "classnames";
import Editor, { IExtension } from "@/components/Editor";
import styles from "./index.module.less";

interface NewAnswerModalProps {
  visible: boolean;
  defaultContent: Descendant[];
  extensions: IExtension[];
  onCancel: () => void;
  onOk: () => void;
  onChange: (value: Descendant[]) => void;
  customTitle?: string;
}

const NewAnswerModal: React.FC<NewAnswerModalProps> = ({
  visible,
  defaultContent,
  extensions,
  onCancel,
  onOk,
  onChange,
  customTitle = "新建答案",
}) => {
  return (
    <Modal
      title={customTitle}
      open={visible}
      onCancel={onCancel}
      onOk={onOk}
      width={800}
      destroyOnClose
    >
      <div className={classnames(styles.newAnswerEditor)}>
        <Editor
          initValue={defaultContent}
          onChange={onChange}
          readonly={false}
          extensions={extensions}
          style={{ maxHeight: 600, overflow: "auto", padding: 20 }}
        />
      </div>
    </Modal>
  );
};

export default NewAnswerModal;
