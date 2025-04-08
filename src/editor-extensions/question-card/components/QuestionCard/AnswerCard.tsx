import React from "react";
import { Button, Typography, Card, App } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { IAnswer } from "@/types";
import { getEditorText } from "@/utils/editor";
import styles from "./index.module.less";

const { Paragraph } = Typography;

interface AnswerCardProps {
  answer: IAnswer;
  itemWidth: number;
  readOnly: boolean;
  onDeleteAnswer: (answerId: number) => void;
  onViewAnswer: (answerId: number) => void;
}

const AnswerCard: React.FC<AnswerCardProps> = ({
  answer,
  itemWidth,
  readOnly,
  onDeleteAnswer,
  onViewAnswer,
}) => {
  const answerText = getEditorText(answer.content, 200);
  const { modal } = App.useApp();

  const handleDeleteAnswer = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
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

  return (
    <Card
      key={answer.id}
      style={{ width: itemWidth, position: "relative", cursor: "pointer" }}
      onClick={() => onViewAnswer(answer.id)}
    >
      <div className={styles.answerContent}>
        <Paragraph ellipsis={{ rows: 6 }}>{answerText}</Paragraph>
      </div>
      {!readOnly && (
        <div className={styles.btn}>
          <Button
            type="text"
            icon={<DeleteOutlined />}
            onClick={handleDeleteAnswer}
          >
            删除
          </Button>
        </div>
      )}
    </Card>
  );
};

export default AnswerCard;
