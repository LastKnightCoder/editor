import React from "react";
import { Modal } from "antd";
import classnames from "classnames";
import { IAnswer } from "@/types";
import Editor from "@/components/Editor";
import { updateContent } from "@/commands";
import { IExtension } from "@/components/Editor";
import useTheme from "@/components/Editor/hooks/useTheme.ts";
import styles from "./index.module.less";
import { Descendant } from "slate";
import { useThrottleFn } from "ahooks";

interface AnswerModalProps {
  visible: boolean;
  selectedAnswer: IAnswer | null;
  extensions: IExtension[];
  onClose: () => void;
  onAnswerChange: (answer: IAnswer) => void;
  readOnly: boolean;
}

const AnswerModal: React.FC<AnswerModalProps> = ({
  visible,
  selectedAnswer,
  extensions,
  onClose,
  onAnswerChange,
  readOnly,
}) => {
  const { isDark } = useTheme();

  const { run: handleAnswerContentChange } = useThrottleFn(
    async (content: Descendant[]) => {
      if (!selectedAnswer) return;
      const answer = await updateContent(selectedAnswer.id, content);
      if (answer) {
        onAnswerChange(answer);
      }
    },
    { wait: 1000 },
  );

  if (!selectedAnswer) return null;

  return (
    <Modal
      title="答案详情"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnClose
    >
      <div
        className={classnames(styles.newAnswerEditor, {
          [styles.dark]: isDark,
        })}
      >
        <Editor
          style={{ maxHeight: 600, overflow: "auto", padding: 20 }}
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
