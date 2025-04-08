import React, { useRef } from "react";
import { Modal } from "antd";
import { Descendant } from "slate";
import classnames from "classnames";
import Editor, { EditorRef, IExtension } from "@/components/Editor";
import useTheme from "@/components/Editor/hooks/useTheme.ts";
import styles from "./index.module.less";

interface NewAnswerModalProps {
  visible: boolean;
  defaultContent: Descendant[];
  extensions: IExtension[];
  onCancel: () => void;
  onOk: () => void;
  onChange: (value: Descendant[]) => void;
}

const NewAnswerModal: React.FC<NewAnswerModalProps> = ({
  visible,
  defaultContent,
  extensions,
  onCancel,
  onOk,
  onChange,
}) => {
  const { isDark } = useTheme();
  const editorRef = useRef<EditorRef>(null);

  return (
    <Modal
      title="新建答案"
      open={visible}
      onCancel={onCancel}
      onOk={onOk}
      width={800}
      destroyOnClose
    >
      <div
        className={classnames(styles.newAnswerEditor, {
          [styles.dark]: isDark,
        })}
      >
        <Editor
          ref={editorRef}
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
