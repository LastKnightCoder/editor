import React, { useRef } from "react";
import { Card, App, Dropdown, MenuItemProps } from "antd";
import { DeleteOutlined, MoreOutlined } from "@ant-design/icons";
import { IAnswer } from "@/types";
import Editor, { EditorRef } from "@/components/Editor";
import useEditContent from "@/hooks/useEditContent";

import styles from "./index.module.less";
import useDynamicExtensions from "@/hooks/useDynamicExtensions";
interface AnswerCardProps {
  answer: IAnswer;
  readOnly?: boolean;
  onDeleteAnswer?: (answerId: number) => void;
  onViewAnswer?: (answerId: number) => void;
  contentId?: number;
}

const AnswerCard: React.FC<AnswerCardProps> = ({
  answer,
  readOnly = false,
  onDeleteAnswer,
  onViewAnswer,
  contentId,
}) => {
  const { modal } = App.useApp();

  const editorRef = useRef<EditorRef>(null);
  const extensions = useDynamicExtensions();

  useEditContent(contentId, (data) => {
    editorRef.current?.setEditorValue(data.slice(0, 3));
  });

  const handleDeleteAnswer: MenuItemProps["onClick"] = () => {
    if (!onDeleteAnswer) return;

    modal.confirm({
      title: "删除答案",
      content: "确定删除该答案吗？",
      okText: "确定",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
      onOk: () => onDeleteAnswer(answer.id),
    });
  };

  const handleClick = () => {
    if (onViewAnswer) {
      onViewAnswer(answer.id);
    }
  };

  return (
    <Card
      key={answer.id}
      style={{
        boxSizing: "border-box",
        position: "relative",
        cursor: onViewAnswer ? "pointer" : "default",
      }}
    >
      <div className={styles.answerContent} onClick={handleClick}>
        <Editor
          initValue={answer.content.slice(0, 3)}
          readonly={readOnly}
          extensions={extensions}
          className={styles.editor}
        />
      </div>
      {!readOnly && (
        <Dropdown
          menu={{
            items: [
              {
                key: "delete",
                label: "删除",
                icon: <DeleteOutlined />,
                onClick: handleDeleteAnswer,
              },
            ],
          }}
        >
          <div className={styles.moreIcon} onClick={(e) => e.stopPropagation()}>
            <MoreOutlined />
          </div>
        </Dropdown>
      )}
    </Card>
  );
};

export default AnswerCard;
