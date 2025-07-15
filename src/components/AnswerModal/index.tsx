import React, { useRef } from "react";
import { Modal } from "antd";
import classnames from "classnames";
import { IAnswer } from "@/types";
import Editor, { IExtension, EditorRef } from "@/components/Editor";
import styles from "./index.module.less";
import { Descendant } from "slate";
import { useMemoizedFn, useUnmount } from "ahooks";
import useEditContent from "@/hooks/useEditContent";

interface AnswerModalProps {
  visible: boolean;
  selectedAnswer: IAnswer | null;
  extensions: IExtension[];
  onClose: () => void;
  onAnswerChange?: (answer: IAnswer) => void;
  readOnly?: boolean;
  customTitle?: string;
}

const AnswerModal: React.FC<AnswerModalProps> = ({
  visible,
  selectedAnswer,
  extensions,
  onClose,
  onAnswerChange,
  readOnly = false,
  customTitle = "答案详情",
}) => {
  const editorRef = useRef<EditorRef>(null);
  const { throttleHandleEditorContentChange } = useEditContent(
    selectedAnswer?.id,
    (data) => {
      editorRef.current?.setEditorValue(data);
    },
  );

  const handleAnswerContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!selectedAnswer) {
      return;
    }
    throttleHandleEditorContentChange(content);
    const newAnswer = {
      ...selectedAnswer,
      content,
    };
    onAnswerChange?.(newAnswer);
  });

  useUnmount(() => {
    throttleHandleEditorContentChange.flush();
  });

  if (!selectedAnswer) return null;

  return (
    <Modal
      title={customTitle}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnClose
      keyboard={false}
    >
      <div className={classnames(styles.answerEditor)}>
        <Editor
          style={{ maxHeight: 600, overflow: "auto", padding: 20 }}
          ref={editorRef}
          readonly={readOnly}
          initValue={selectedAnswer.content}
          extensions={extensions}
          onChange={handleAnswerContentChange}
        />
      </div>
    </Modal>
  );
};

export default AnswerModal;
