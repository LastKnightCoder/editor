import React from "react";
import { IAnswer } from "@/types";
import AnswerCard from "../AnswerCard";
import { Empty } from "antd";

import styles from "./index.module.less";

interface AnswerCardListProps {
  answers: IAnswer[];
  readOnly?: boolean;
  onDeleteAnswer?: (answerId: number) => void;
  onViewAnswer?: (answerId: number) => void;
}

const AnswerCardList: React.FC<AnswerCardListProps> = ({
  answers,
  readOnly = false,
  onDeleteAnswer,
  onViewAnswer,
}) => {
  if (answers.length === 0) {
    return (
      <div className={styles.empty}>
        <Empty description="暂无答案" />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {answers.map((answer) => (
        <AnswerCard
          key={answer.id}
          answer={answer}
          readOnly={readOnly}
          onDeleteAnswer={onDeleteAnswer}
          onViewAnswer={onViewAnswer}
        />
      ))}
    </div>
  );
};

export default AnswerCardList;
